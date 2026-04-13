# Lazy ttyd HMR Spawning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace eager regex-based session discovery with on-demand ttyd spawning triggered by each `<Terminal>` component over Vite's HMR WebSocket channel.

**Architecture:** The Vite plugin becomes a reactive session manager — it does nothing at server start, then listens for `liveshell:spawn` requests from components. Port assignment moves into a pure `resolvePort` function (testable in isolation). Terminal.vue gains a `requestSpawn` async step that runs before `connectSession`, gated on `state === 'IDLE'` so persist sessions never re-request a spawn. A `manual` prop opts a terminal out of auto-spawning entirely.

**Tech Stack:** TypeScript, Vue 3, Vite HMR WebSocket (`server.ws.on` / `import.meta.hot`), xterm.js, Vitest

**Coding style:** Follow cognitive-load principles throughout — named booleans over inline conditions, early returns over nesting, no gratuitous helpers.

---

## File Map

| File | Change |
|---|---|
| `types.ts` | Remove `autoManage`; add `manual` to `TerminalProps`; add `SpawnRequest` and `SpawnedEvent` |
| `vite.config.ts` | Add exported `resolvePort`; replace eager startup with `server.ws.on('liveshell:spawn')` handler |
| `composables/slide-parser.ts` | **Deleted** |
| `components/Terminal.vue` | Add `manual` prop; add `requestSpawn`; make `watch(isActive)` async with spawn step |
| `__tests__/vitePlugin.spec.ts` | Replace all `discoverSessions` tests with `resolvePort` tests |
| `__tests__/useTerminalSession.spec.ts` | No changes |

---

## Task 1: Update types

**Files:**
- Modify: `types.ts`

- [ ] **Step 1: Apply changes to `types.ts`**

Replace the entire file:

```ts
import type { ITerminalOptions } from '@xterm/xterm'

export type SessionState =
  | 'IDLE'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'DESTROYED'

export interface TerminalProps {
  cols?: number
  host?: string
  manual?: boolean
  options?: ITerminalOptions
  path?: string
  persist?: boolean
  port?: number
  rows?: number
  session?: string
}

export interface SessionEntry {
  config: ResolvedTerminalConfig
  fitAddon: import('@xterm/addon-fit').FitAddon | null
  id: string
  inputDisposable: import('@xterm/xterm').IDisposable | null
  persist: boolean
  refCount: number
  resizeDisposable: import('@xterm/xterm').IDisposable | null
  resizeObserver: ResizeObserver | null
  socket: WebSocket | null
  state: SessionState
  terminal: import('@xterm/xterm').Terminal | null
}

export interface ResolvedTerminalConfig {
  cols?: number
  host: string
  options: ITerminalOptions
  path: string
  port: number
  rows?: number
}

export interface TerminalDeckConfig {
  defaultPort?: number
  defaultShell?: string
  options?: ITerminalOptions
  ttydPath?: string
}

export interface AutoManagedSession {
  port: number
  session: string
}

export interface TerminalStatusEvent {
  sessions: Record<string, {
    pid: number
    port: number
    state: 'running' | 'error' | 'stopped'
  }>
}

export interface SpawnRequest {
  session: string
  port?: number
}

export interface SpawnedEvent {
  session: string
  port: number
  state: 'running' | 'error'
}
```

- [ ] **Step 2: Run tests to confirm nothing broke**

```bash
npx vitest run
```

Expected: all tests pass (type-only change).

- [ ] **Step 3: Commit**

```bash
git add types.ts
git commit -m "feat: add SpawnRequest/SpawnedEvent types, manual prop, remove autoManage"
```

---

## Task 2: Write failing tests for `resolvePort`

`resolvePort` is the only non-trivial logic in the new plugin (everything else is wiring). TDD it in isolation by replacing the now-obsolete `discoverSessions` tests.

**Files:**
- Modify: `__tests__/vitePlugin.spec.ts`

- [ ] **Step 1: Replace `__tests__/vitePlugin.spec.ts` with `resolvePort` tests**

```ts
import { describe, expect, it } from 'vitest'
import { resolvePort } from '../vite.config'

describe('resolvePort', () => {
  it('returns defaultPort when nothing is used and no port requested', () => {
    const used = new Set<number>()
    expect(resolvePort(used, undefined, 8085)).toBe(8085)
  })

  it('returns the explicitly requested port regardless of used set', () => {
    const used = new Set([8085])
    expect(resolvePort(used, 8085, 8085)).toBe(8085)
  })

  it('skips used ports when auto-assigning', () => {
    const used = new Set([8085, 8086])
    expect(resolvePort(used, undefined, 8085)).toBe(8087)
  })

  it('skips a gap in used ports when auto-assigning', () => {
    const used = new Set([8085, 8087])
    expect(resolvePort(used, undefined, 8085)).toBe(8086)
  })

  it('uses a different defaultPort as the starting point', () => {
    const used = new Set<number>()
    expect(resolvePort(used, undefined, 9000)).toBe(9000)
  })
})
```

- [ ] **Step 2: Run to confirm the tests fail**

```bash
npx vitest run __tests__/vitePlugin.spec.ts
```

Expected: FAIL — `resolvePort is not a function` (export doesn't exist yet).

---

## Task 3: Rewrite `vite.config.ts` — add `resolvePort`, replace eager startup with WS handler

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Replace the entire `vite.config.ts`**

```ts
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'

import { defineConfig } from 'vite'
import type { ViteDevServer } from 'vite'
import matter from 'gray-matter'

import type { AutoManagedSession, SpawnedEvent, SpawnRequest, TerminalDeckConfig, TerminalStatusEvent } from './types'

export function resolvePort(
  usedPorts: Set<number>,
  requestedPort: number | undefined,
  defaultPort: number,
): number {
  if (requestedPort !== undefined) return requestedPort
  let port = defaultPort
  while (usedPorts.has(port)) port++
  return port
}

function findSlidesFile(root: string): string | null {
  const candidates = ['slides.md', 'index.md', 'presentation.md']
  for (const name of candidates) {
    const path = join(root, name)
    if (existsSync(path)) return path
  }
  try {
    const files = readdirSync(root).filter(f => f.endsWith('.md'))
    if (files.length === 1) return join(root, files[0])
  } catch {}
  return null
}

function spawnTtydSession(
  session: AutoManagedSession,
  ttydPath: string,
  shell: string,
  server: ViteDevServer,
): ChildProcess {
  const child = spawn(ttydPath, [
    '-W',
    '-p', String(session.port),
    '-t', 'disableReconnect=true',
    shell,
  ], { stdio: 'pipe' })

  child.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') {
      console.error(`[liveshell] ttyd not found at "${ttydPath}". Install it:`)
      console.error('  macOS:   brew install ttyd')
      console.error('  Ubuntu:  apt install ttyd')
      console.error('  Arch:    pacman -S ttyd')
      console.error('  Windows: scoop install ttyd')
    } else {
      console.error(`[liveshell] Failed to start ttyd for session "${session.session}":`, err.message)
    }

    server.ws.send('liveshell:status', {
      sessions: { [session.session]: { pid: 0, port: session.port, state: 'error' } },
    } satisfies TerminalStatusEvent)
  })

  child.on('spawn', () => {
    const pid = child.pid ?? 0
    console.log(`[liveshell] Session "${session.session}" running on port ${session.port} (PID: ${pid})`)

    server.ws.send('liveshell:status', {
      sessions: { [session.session]: { pid, port: session.port, state: 'running' } },
    } satisfies TerminalStatusEvent)
  })

  child.on('exit', (code) => {
    console.log(`[liveshell] Session "${session.session}" exited (code: ${code})`)

    server.ws.send('liveshell:status', {
      sessions: { [session.session]: { pid: 0, port: session.port, state: 'stopped' } },
    } satisfies TerminalStatusEvent)
  })

  child.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim()
    if (msg.includes('ERROR') || msg.includes('error')) {
      console.error(`[liveshell] [${session.session}]`, msg)
    }
  })

  return child
}

export default defineConfig({
  plugins: [
    {
      name: 'slidev-addon-liveshell',

      configureServer(server) {
        const root = server.config.root
        const slidesFile = findSlidesFile(root)
        const terminalConfig = slidesFile
          ? ((matter(readFileSync(slidesFile, 'utf-8')).data.terminal) ?? {}) as TerminalDeckConfig
          : {} as TerminalDeckConfig

        const defaultPort = terminalConfig.defaultPort ?? 8085
        const shell = terminalConfig.defaultShell ?? 'zsh'
        const ttydPath = terminalConfig.ttydPath ?? 'ttyd'

        const processes = new Map<string, { port: number; process: ChildProcess }>()
        const usedPorts = new Set<number>()

        server.ws.on('liveshell:spawn', (request: SpawnRequest) => {
          const { session, port: requestedPort } = request
          const existing = processes.get(session)

          if (existing) {
            server.ws.send('liveshell:spawned', {
              session,
              port: existing.port,
              state: 'running',
            } satisfies SpawnedEvent)
            return
          }

          const port = resolvePort(usedPorts, requestedPort, defaultPort)
          usedPorts.add(port)

          const child = spawnTtydSession({ session, port }, ttydPath, shell, server)
          processes.set(session, { port, process: child })

          child.once('spawn', () => {
            server.ws.send('liveshell:spawned', {
              session,
              port,
              state: 'running',
            } satisfies SpawnedEvent)
          })

          child.once('error', () => {
            server.ws.send('liveshell:spawned', {
              session,
              port,
              state: 'error',
            } satisfies SpawnedEvent)
            processes.delete(session)
            usedPorts.delete(port)
          })
        })

        const cleanup = () => {
          for (const [, { process: child }] of processes) {
            if (!child.killed) child.kill('SIGKILL')
          }
          processes.clear()
          usedPorts.clear()
        }

        process.on('exit', cleanup)
        process.on('SIGINT', () => { cleanup(); process.exit(0) })
        process.on('SIGTERM', () => { cleanup(); process.exit(0) })
        server.httpServer?.on('close', cleanup)
      },
    },
  ],
})
```

- [ ] **Step 2: Run the vitePlugin tests to confirm they pass**

```bash
npx vitest run __tests__/vitePlugin.spec.ts
```

Expected: all 5 `resolvePort` tests pass.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts __tests__/vitePlugin.spec.ts
git commit -m "feat: replace eager session discovery with lazy liveshell:spawn WS handler"
```

---

## Task 4: Delete `slide-parser.ts`

The file is no longer imported by anything.

**Files:**
- Delete: `composables/slide-parser.ts`

- [ ] **Step 1: Delete the file**

```bash
rm composables/slide-parser.ts
```

- [ ] **Step 2: Run all tests to confirm nothing imports it**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: delete slide-parser.ts — session discovery replaced by HMR spawn requests"
```

---

## Task 5: Update `Terminal.vue` — `manual` prop and async spawn flow

**Files:**
- Modify: `components/Terminal.vue`

- [ ] **Step 1: Replace the `<script setup>` block in `components/Terminal.vue`**

```ts
<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { useIsSlideActive, useDarkMode, useNav } from '@slidev/client'

import { resolveTerminalOptions } from '../composables/useTerminalOptions'
import { SessionRegistry } from '../composables/useTerminalSession'
import { REGISTRY_KEY } from '../setup/main'
import type { SpawnedEvent, SpawnRequest, TerminalDeckConfig, TerminalProps } from '../types'

const props = withDefaults(defineProps<TerminalProps>(), {
  host: undefined,
  manual: false,
  options: undefined,
  path: undefined,
  persist: false,
  port: undefined,
  rows: undefined,
  cols: undefined,
  session: undefined,
})

const registry = inject<SessionRegistry>(REGISTRY_KEY)
if (!registry) {
  throw new Error('[liveshell] Session registry not found. Is the addon installed correctly?')
}

// $slidev is auto-injected by Slidev into all component scripts
const deckConfig = computed<TerminalDeckConfig | undefined>(
  () => ($slidev as any)?.configs?.terminal,
)

const { isDark } = useDarkMode()
const { currentPage } = useNav()
const containerRef = ref<HTMLElement | null>(null)

const sessionId = props.session ?? `liveshell-${currentPage}-${props.port ?? 'default'}`

const config = computed(() =>
  resolveTerminalOptions(props, deckConfig.value, isDark.value),
)

const sessionEntry = registry.getOrCreate(sessionId, config.value, props.persist)

const connectionFailed = ref(false)

watch(() => sessionEntry.state, (state) => {
  connectionFailed.value = state === 'DISCONNECTED'
})

watch(config, (newConfig) => {
  sessionEntry.config = newConfig
  if (sessionEntry.terminal) {
    sessionEntry.terminal.options.theme = newConfig.options.theme
  }
})

function retry(): void {
  connectionFailed.value = false
  if (containerRef.value) {
    registry.retry(sessionId, containerRef.value)
  }
}

// Sends liveshell:spawn via Vite HMR WS and waits for the matching liveshell:spawned reply.
// Returns the confirmed port assigned by the plugin.
async function requestSpawn(session: string, port?: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      import.meta.hot?.off('liveshell:spawned', handler)
      reject(new Error(`[liveshell] spawn timeout for session "${session}"`))
    }, 10_000)

    function handler(data: SpawnedEvent): void {
      if (data.session !== session) return
      clearTimeout(timeout)
      import.meta.hot?.off('liveshell:spawned', handler)
      if (data.state === 'error') {
        reject(new Error(`[liveshell] spawn failed for session "${session}"`))
      } else {
        resolve(data.port)
      }
    }

    import.meta.hot?.on('liveshell:spawned', handler)
    import.meta.hot?.send('liveshell:spawn', { session, port } satisfies SpawnRequest)
  })
}

const isActive = useIsSlideActive()
watch(isActive, async (active) => {
  if (!active) {
    if (!props.persist) registry.disconnectSession(sessionId)
    return
  }

  if (!containerRef.value) return

  // Move xterm DOM into this slide's container when returning to a persist session
  const el = sessionEntry.terminal?.element
  if (el && el.parentElement !== containerRef.value) {
    containerRef.value.appendChild(el)
  }

  // Only connect on first activation — persist sessions stay CONNECTED across slides
  if (sessionEntry.state !== 'IDLE') return

  if (props.manual) {
    // manual mode: user runs their own ttyd, connect directly to the configured port
    registry.connectSession(sessionId, containerRef.value)
    return
  }

  // managed mode: ask the plugin to spawn ttyd, wait for the confirmed port
  try {
    const confirmedPort = await requestSpawn(sessionId, props.port)
    if (!containerRef.value) return  // component may have unmounted while awaiting
    sessionEntry.config = { ...sessionEntry.config, port: confirmedPort }
    registry.connectSession(sessionId, containerRef.value)
  } catch {
    sessionEntry.state = 'DISCONNECTED'
  }
}, { immediate: true, flush: 'post' })

onBeforeUnmount(() => {
  registry.release(sessionId)
})
</script>
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add components/Terminal.vue
git commit -m "feat: add manual prop and async requestSpawn flow to Terminal.vue"
```

---

## Self-Review

**Spec coverage:**
- ✅ `autoManage` removed from `TerminalDeckConfig` (Task 1)
- ✅ `manual` prop added (Task 1 types, Task 5 component)
- ✅ `SpawnRequest` / `SpawnedEvent` types defined (Task 1)
- ✅ `resolvePort` pure function — testable, covers explicit port + dynamic assignment + skip-used-ports (Task 2–3)
- ✅ Vite plugin: replaces eager startup with `server.ws.on('liveshell:spawn', ...)` (Task 3)
- ✅ Plugin: deduplicates — existing session gets immediate `liveshell:spawned` response (Task 3)
- ✅ Plugin: broadcasts `liveshell:spawned` on spawn + error (Task 3)
- ✅ `slide-parser.ts` deleted (Task 4)
- ✅ `Terminal.vue`: `requestSpawn` gated on `state === 'IDLE'` — persist sessions skip re-spawn on return (Task 5)
- ✅ `Terminal.vue`: `manual` mode bypasses spawn, connects directly (Task 5)
- ✅ `Terminal.vue`: null-checks `containerRef.value` after async `requestSpawn` (Task 5)
- ✅ `Terminal.vue`: sets `state = 'DISCONNECTED'` on spawn error, shows retry overlay (Task 5)

**Placeholder scan:** No TBDs. All code blocks are complete and runnable.

**Type consistency:**
- `SpawnRequest` / `SpawnedEvent` defined in Task 1, used in Task 3 (`vite.config.ts`) and Task 5 (`Terminal.vue`) — consistent.
- `resolvePort` signature `(usedPorts: Set<number>, requestedPort: number | undefined, defaultPort: number): number` — matches tests in Task 2 and usage in Task 3.
- `manual` added to `TerminalProps` in Task 1, defaulted in Task 5's `withDefaults` — consistent.
- `processes` map in plugin typed as `Map<string, { port: number; process: ChildProcess }>` — destructured consistently in handler and cleanup.
