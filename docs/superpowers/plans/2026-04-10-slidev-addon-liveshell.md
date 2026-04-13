# slidev-addon-liveshell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Slidev addon that embeds live terminal sessions in slides via native xterm.js connected to ttyd over WebSocket.

**Architecture:** A single `<Terminal />` Vue component backed by two composables (`useTerminalSession` for lifecycle/registry, `useTerminalOptions` for config merging). A Vite plugin provides optional auto-managed ttyd process spawning. Persistent sessions survive slide navigation by keeping their DOM in the (v-show-hidden) slide container and moving the xterm element to the active slide's container on navigation.

**Tech Stack:** Vue 3 (Composition API), xterm.js 5.x, Slidev addon API, Vite plugin API, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-10-slidev-addon-liveshell-design.md`

---

## File Structure

```
slidev-addon-liveshell/
├── package.json                      # Addon metadata, deps, slidev defaults
├── types.ts                          # Public interfaces (TerminalProps, SessionEntry, etc.)
├── composables/
│   ├── useTerminalOptions.ts         # 3-layer options merge
│   └── useTerminalSession.ts         # Session registry, WebSocket, lifecycle
├── components/
│   └── Terminal.vue                  # Public component
├── vite.config.ts                    # Auto-managed mode (ttyd spawning)
├── setup/
│   └── main.ts                       # Provide session registry via Vue app
├── styles/
│   └── index.css                     # CSS variables + xterm.js base
├── global-bottom.vue                 # Hidden container for persistent sessions
├── __tests__/
│   ├── useTerminalOptions.spec.ts    # Options merging tests
│   ├── useTerminalSession.spec.ts    # Session lifecycle tests
│   └── vitePlugin.spec.ts           # Vite plugin tests (session discovery, spawn)
└── README.md
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `types.ts`
- Create: `tsconfig.json`

- [ ] **Step 1: Initialize package.json**

```bash
cd /Users/magack/Documents/perso/slidev-plugin
```

Create `package.json`:

```json
{
  "name": "slidev-addon-liveshell",
  "version": "0.1.0",
  "type": "module",
  "keywords": [
    "slidev",
    "slidev-addon"
  ],
  "license": "MIT",
  "engines": {
    "slidev": ">=0.50.0"
  },
  "slidev": {
    "defaults": {
      "terminal": {
        "autoManage": false,
        "defaultPort": 8085,
        "defaultShell": "zsh",
        "ttydPath": "ttyd"
      }
    }
  },
  "files": [
    "components",
    "composables",
    "global-bottom.vue",
    "setup",
    "styles",
    "types.ts",
    "vite.config.ts"
  ],
  "peerDependencies": {
    "@slidev/client": ">=0.50.0",
    "@slidev/types": ">=0.50.0",
    "vue": "^3.4.0"
  },
  "dependencies": {
    "@xterm/addon-fit": "0.10.0",
    "@xterm/addon-web-links": "0.11.0",
    "@xterm/addon-webgl": "0.18.0",
    "@xterm/xterm": "5.5.0"
  },
  "devDependencies": {
    "@slidev/client": "0.50.0",
    "@slidev/types": "0.50.0",
    "typescript": "5.7.3",
    "vitest": "3.0.4",
    "vue": "3.5.13"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["**/*.ts", "**/*.vue"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create types.ts with all public interfaces**

```typescript
import type { ITerminalOptions, ITheme } from '@xterm/xterm'

export type SessionState =
  | 'IDLE'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'BACKGROUND'
  | 'DESTROYED'

export interface TerminalProps {
  cols?: number
  host?: string
  options?: ITerminalOptions
  path?: string
  persist?: boolean
  port?: number
  reconnect?: boolean
  reconnectDelay?: number
  rows?: number
  session?: string
}

export interface SessionEntry {
  config: ResolvedTerminalConfig
  id: string
  mountTarget: HTMLElement | null
  persist: boolean
  refCount: number
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
  reconnect: boolean
  reconnectDelay: number
  rows?: number
}

export interface TerminalDeckConfig {
  autoManage?: boolean
  defaultPort?: number
  defaultShell?: string
  options?: ITerminalOptions
  ttydPath?: string
}

export interface AutoManagedSession {
  port: number
  session: string
  shell?: string
}

export interface TerminalStatusEvent {
  sessions: Record<string, {
    pid: number
    port: number
    state: 'running' | 'error' | 'stopped'
  }>
}

export const DARK_THEME: ITheme = {
  background: '#1e1e1e',
  black: '#000000',
  blue: '#569cd6',
  brightBlack: '#666666',
  brightBlue: '#9cdcfe',
  brightCyan: '#9cdcfe',
  brightGreen: '#b5cea8',
  brightMagenta: '#d8a0df',
  brightRed: '#f44747',
  brightWhite: '#ffffff',
  brightYellow: '#dcdcaa',
  cursor: '#aeafad',
  cyan: '#4ec9b0',
  foreground: '#d4d4d4',
  green: '#6a9955',
  magenta: '#c586c0',
  red: '#f44747',
  selectionBackground: 'rgba(255, 255, 255, 0.3)',
  white: '#d4d4d4',
  yellow: '#dcdcaa',
}

export const LIGHT_THEME: ITheme = {
  background: '#ffffff',
  black: '#000000',
  blue: '#0451a5',
  brightBlack: '#666666',
  brightBlue: '#0451a5',
  brightCyan: '#0598bc',
  brightGreen: '#14ce14',
  brightMagenta: '#bc05bc',
  brightRed: '#cd3131',
  brightWhite: '#a5a5a5',
  brightYellow: '#b5ba00',
  cursor: '#000000',
  cyan: '#0598bc',
  foreground: '#383a42',
  green: '#008000',
  magenta: '#bc05bc',
  red: '#cd3131',
  selectionBackground: 'rgba(0, 0, 0, 0.15)',
  white: '#e5e5e5',
  yellow: '#795e26',
}

export const DEFAULT_TERMINAL_OPTIONS: ITerminalOptions = {
  cursorBlink: true,
  cursorStyle: 'bar',
  fontFamily: "'Fira Code', 'Cascadia Code', 'Menlo', monospace",
  fontSize: 14,
  scrollback: 5000,
}
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json types.ts
git commit -m "feat: scaffold slidev-addon-liveshell package"
```

---

### Task 2: Options Merging Composable

**Files:**
- Create: `composables/useTerminalOptions.ts`
- Create: `__tests__/useTerminalOptions.spec.ts`

- [ ] **Step 1: Write failing tests for options merging**

Create `__tests__/useTerminalOptions.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { resolveTerminalOptions } from '../composables/useTerminalOptions'
import { DARK_THEME, DEFAULT_TERMINAL_OPTIONS, LIGHT_THEME } from '../types'
import type { ITerminalOptions } from '@xterm/xterm'
import type { TerminalDeckConfig } from '../types'

describe('resolveTerminalOptions', () => {
  it('returns defaults when no overrides provided', () => {
    const result = resolveTerminalOptions({}, undefined, true)

    expect(result.options.fontSize).toBe(DEFAULT_TERMINAL_OPTIONS.fontSize)
    expect(result.options.cursorBlink).toBe(DEFAULT_TERMINAL_OPTIONS.cursorBlink)
    expect(result.options.theme).toEqual(DARK_THEME)
    expect(result.host).toBe('localhost')
    expect(result.port).toBe(8085)
    expect(result.path).toBe('/ws')
    expect(result.reconnect).toBe(true)
    expect(result.reconnectDelay).toBe(1000)
  })

  it('uses light theme when isDark is false', () => {
    const result = resolveTerminalOptions({}, undefined, false)

    expect(result.options.theme).toEqual(LIGHT_THEME)
  })

  it('merges deck-level config over defaults', () => {
    const deckConfig: TerminalDeckConfig = {
      defaultPort: 9000,
      options: { fontSize: 18 },
    }

    const result = resolveTerminalOptions({}, deckConfig, true)

    expect(result.port).toBe(9000)
    expect(result.options.fontSize).toBe(18)
    expect(result.options.cursorBlink).toBe(true) // default preserved
  })

  it('merges component props over deck config', () => {
    const deckConfig: TerminalDeckConfig = {
      defaultPort: 9000,
      options: { fontSize: 18 },
    }
    const componentProps = {
      options: { fontSize: 22, cursorStyle: 'block' as const },
      port: 7777,
    }

    const result = resolveTerminalOptions(componentProps, deckConfig, true)

    expect(result.port).toBe(7777)
    expect(result.options.fontSize).toBe(22)
    expect(result.options.cursorStyle).toBe('block')
    expect(result.options.cursorBlink).toBe(true) // still preserved from default
  })

  it('passes rows and cols through to config', () => {
    const result = resolveTerminalOptions({ cols: 120, rows: 30 }, undefined, true)

    expect(result.rows).toBe(30)
    expect(result.cols).toBe(120)
  })

  it('leaves rows and cols undefined when not set', () => {
    const result = resolveTerminalOptions({}, undefined, true)

    expect(result.rows).toBeUndefined()
    expect(result.cols).toBeUndefined()
  })

  it('component theme overrides dark/light theme', () => {
    const componentProps = {
      options: { theme: { background: '#ff0000' } },
    }

    const result = resolveTerminalOptions(componentProps, undefined, true)

    expect(result.options.theme?.background).toBe('#ff0000')
    expect(result.options.theme?.foreground).toBe(DARK_THEME.foreground) // rest merged
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run __tests__/useTerminalOptions.spec.ts
```

Expected: FAIL — module `../composables/useTerminalOptions` not found.

- [ ] **Step 3: Implement useTerminalOptions**

Create `composables/useTerminalOptions.ts`:

```typescript
import type { ITerminalOptions } from '@xterm/xterm'

import {
  DARK_THEME,
  DEFAULT_TERMINAL_OPTIONS,
  LIGHT_THEME,
} from '../types'
import type { ResolvedTerminalConfig, TerminalDeckConfig, TerminalProps } from '../types'

export function resolveTerminalOptions(
  props: Partial<TerminalProps>,
  deckConfig: TerminalDeckConfig | undefined,
  isDark: boolean,
): ResolvedTerminalConfig {
  const themeBase = isDark ? DARK_THEME : LIGHT_THEME

  const mergedOptions: ITerminalOptions = {
    ...DEFAULT_TERMINAL_OPTIONS,
    theme: { ...themeBase },
    ...(deckConfig?.options ?? {}),
    ...(props.options ?? {}),
  }

  // Deep merge theme separately so partial theme overrides don't wipe the base
  if (props.options?.theme || deckConfig?.options?.theme) {
    mergedOptions.theme = {
      ...themeBase,
      ...(deckConfig?.options?.theme ?? {}),
      ...(props.options?.theme ?? {}),
    }
  }

  return {
    cols: props.cols,
    host: props.host ?? 'localhost',
    options: mergedOptions,
    path: props.path ?? '/ws',
    port: props.port ?? deckConfig?.defaultPort ?? 8085,
    reconnect: props.reconnect ?? true,
    reconnectDelay: props.reconnectDelay ?? 1000,
    rows: props.rows,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run __tests__/useTerminalOptions.spec.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add composables/useTerminalOptions.ts __tests__/useTerminalOptions.spec.ts
git commit -m "feat: add options merging composable with 3-layer merge"
```

---

### Task 3: Session Registry Composable

**Files:**
- Create: `composables/useTerminalSession.ts`
- Create: `__tests__/useTerminalSession.spec.ts`

- [ ] **Step 1: Write failing tests for session registry**

Create `__tests__/useTerminalSession.spec.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createSessionRegistry } from '../composables/useTerminalSession'
import type { ResolvedTerminalConfig } from '../types'

function makeConfig(overrides?: Partial<ResolvedTerminalConfig>): ResolvedTerminalConfig {
  return {
    host: 'localhost',
    options: {},
    path: '/ws',
    port: 8085,
    reconnect: true,
    reconnectDelay: 1000,
    ...overrides,
  }
}

describe('createSessionRegistry', () => {
  let registry: ReturnType<typeof createSessionRegistry>

  beforeEach(() => {
    registry = createSessionRegistry()
  })

  it('creates a new session', () => {
    const session = registry.getOrCreate('demo', makeConfig(), true)

    expect(session.id).toBe('demo')
    expect(session.state).toBe('IDLE')
    expect(session.persist).toBe(true)
    expect(session.refCount).toBe(1)
  })

  it('returns existing session and increments refCount', () => {
    const first = registry.getOrCreate('demo', makeConfig(), false)
    const second = registry.getOrCreate('demo', makeConfig(), false)

    expect(first).toBe(second)
    expect(first.refCount).toBe(2)
  })

  it('removes a non-persistent session when refCount hits 0', () => {
    registry.getOrCreate('ephemeral', makeConfig(), false)
    registry.getOrCreate('ephemeral', makeConfig(), false)

    registry.release('ephemeral')
    expect(registry.get('ephemeral')?.refCount).toBe(1)

    registry.release('ephemeral')
    expect(registry.get('ephemeral')).toBeUndefined()
  })

  it('keeps persistent session alive when refCount hits 0', () => {
    registry.getOrCreate('sticky', makeConfig(), true)
    registry.release('sticky')

    const session = registry.get('sticky')
    expect(session).toBeDefined()
    expect(session?.refCount).toBe(0)
    expect(session?.state).toBe('IDLE')
  })

  it('transitions session to BACKGROUND state', () => {
    const session = registry.getOrCreate('bg', makeConfig(), true)
    session.state = 'CONNECTED'

    registry.background('bg')

    expect(session.state).toBe('BACKGROUND')
  })

  it('transitions session from BACKGROUND to CONNECTED', () => {
    const session = registry.getOrCreate('bg', makeConfig(), true)
    session.state = 'BACKGROUND'

    registry.foreground('bg')

    expect(session.state).toBe('CONNECTED')
  })

  it('destroys all sessions', () => {
    registry.getOrCreate('a', makeConfig(), true)
    registry.getOrCreate('b', makeConfig(), false)

    registry.destroyAll()

    expect(registry.get('a')).toBeUndefined()
    expect(registry.get('b')).toBeUndefined()
  })

  it('lists all sessions', () => {
    registry.getOrCreate('a', makeConfig(), false)
    registry.getOrCreate('b', makeConfig(), true)

    const all = registry.all()
    expect(all.map(s => s.id).sort()).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run __tests__/useTerminalSession.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement session registry**

Create `composables/useTerminalSession.ts`:

```typescript
import { reactive } from 'vue'

import type { ResolvedTerminalConfig, SessionEntry, SessionState } from '../types'

export function createSessionRegistry() {
  const sessions = reactive(new Map<string, SessionEntry>())

  function getOrCreate(
    id: string,
    config: ResolvedTerminalConfig,
    persist: boolean,
  ): SessionEntry {
    const existing = sessions.get(id)
    if (existing) {
      existing.refCount++
      return existing
    }

    const entry: SessionEntry = {
      config,
      id,
      mountTarget: null,
      persist,
      refCount: 1,
      socket: null,
      state: 'IDLE',
      terminal: null,
    }
    sessions.set(id, entry)
    return entry
  }

  function get(id: string): SessionEntry | undefined {
    return sessions.get(id)
  }

  function release(id: string): void {
    const entry = sessions.get(id)
    if (!entry) return

    entry.refCount = Math.max(0, entry.refCount - 1)

    if (entry.refCount === 0 && !entry.persist) {
      destroy(id)
    }
  }

  function destroy(id: string): void {
    const entry = sessions.get(id)
    if (!entry) return

    entry.socket?.close()
    entry.terminal?.dispose()
    entry.state = 'DESTROYED'
    sessions.delete(id)
  }

  function background(id: string): void {
    const entry = sessions.get(id)
    if (!entry) return
    entry.state = 'BACKGROUND'
  }

  function foreground(id: string): void {
    const entry = sessions.get(id)
    if (!entry) return
    if (entry.state === 'BACKGROUND') {
      entry.state = entry.socket?.readyState === WebSocket.OPEN ? 'CONNECTED' : 'DISCONNECTED'
    }
  }

  function destroyAll(): void {
    for (const id of [...sessions.keys()]) {
      destroy(id)
    }
  }

  function all(): SessionEntry[] {
    return [...sessions.values()]
  }

  return {
    all,
    background,
    destroy,
    destroyAll,
    foreground,
    get,
    getOrCreate,
    release,
  }
}

export type SessionRegistry = ReturnType<typeof createSessionRegistry>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run __tests__/useTerminalSession.spec.ts
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add composables/useTerminalSession.ts __tests__/useTerminalSession.spec.ts
git commit -m "feat: add session registry with lifecycle management"
```

---

### Task 4: ttyd WebSocket Protocol

**Files:**
- Modify: `composables/useTerminalSession.ts`
- Create: `__tests__/ttydProtocol.spec.ts`

This adds the `connect()` and `disconnect()` functions to the session registry, implementing the ttyd binary framing protocol.

**Protocol reference:** https://github.com/tsl0922/ttyd — see `src/protocol.h` and the wiki.

- [ ] **Step 1: Write failing tests for ttyd protocol encoding/decoding**

Create `__tests__/ttydProtocol.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { encodeTtydInput, encodeTtydResize, decodeTtydMessage } from '../composables/useTerminalSession'

describe('ttyd protocol', () => {
  describe('encodeTtydInput', () => {
    it('prepends 0x00 type byte to input string', () => {
      const result = encodeTtydInput('ls\n')
      const view = new Uint8Array(result)

      expect(view[0]).toBe(0x00)
      expect(new TextDecoder().decode(view.slice(1))).toBe('ls\n')
    })
  })

  describe('encodeTtydResize', () => {
    it('prepends 0x01 type byte to JSON resize payload', () => {
      const result = encodeTtydResize(80, 24)
      const view = new Uint8Array(result)

      expect(view[0]).toBe(0x01)
      const json = JSON.parse(new TextDecoder().decode(view.slice(1)))
      expect(json).toEqual({ columns: 80, rows: 24 })
    })
  })

  describe('decodeTtydMessage', () => {
    it('decodes output message (type 0x00)', () => {
      const payload = new TextEncoder().encode('hello')
      const msg = new Uint8Array(payload.length + 1)
      msg[0] = 0x00
      msg.set(payload, 1)

      const result = decodeTtydMessage(msg.buffer)

      expect(result.type).toBe('output')
      expect(new TextDecoder().decode(result.data as Uint8Array)).toBe('hello')
    })

    it('decodes title message (type 0x01)', () => {
      const payload = new TextEncoder().encode('my-terminal')
      const msg = new Uint8Array(payload.length + 1)
      msg[0] = 0x01
      msg.set(payload, 1)

      const result = decodeTtydMessage(msg.buffer)

      expect(result.type).toBe('title')
      expect(result.data).toBe('my-terminal')
    })

    it('decodes config message (type 0x02)', () => {
      const msg = new Uint8Array(1)
      msg[0] = 0x02

      const result = decodeTtydMessage(msg.buffer)

      expect(result.type).toBe('config')
    })

    it('returns unknown for unexpected type bytes', () => {
      const msg = new Uint8Array([0xFF])

      const result = decodeTtydMessage(msg.buffer)

      expect(result.type).toBe('unknown')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run __tests__/ttydProtocol.spec.ts
```

Expected: FAIL — functions not exported.

- [ ] **Step 3: Add protocol functions to useTerminalSession**

Add the following exported functions to `composables/useTerminalSession.ts`, before the `createSessionRegistry` function:

```typescript
export interface TtydMessage {
  data?: string | Uint8Array
  type: 'config' | 'output' | 'title' | 'unknown'
}

export function encodeTtydInput(input: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(input)
  const buffer = new Uint8Array(encoded.length + 1)
  buffer[0] = 0x00
  buffer.set(encoded, 1)
  return buffer.buffer
}

export function encodeTtydResize(cols: number, rows: number): ArrayBuffer {
  const json = JSON.stringify({ columns: cols, rows })
  const encoded = new TextEncoder().encode(json)
  const buffer = new Uint8Array(encoded.length + 1)
  buffer[0] = 0x01
  buffer.set(encoded, 1)
  return buffer.buffer
}

export function decodeTtydMessage(data: ArrayBuffer): TtydMessage {
  const view = new Uint8Array(data)
  const type = view[0]
  const payload = view.slice(1)

  switch (type) {
    case 0x00:
      return { data: payload, type: 'output' }
    case 0x01:
      return { data: new TextDecoder().decode(payload), type: 'title' }
    case 0x02:
      return { type: 'config' }
    default:
      return { type: 'unknown' }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run __tests__/ttydProtocol.spec.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add composables/useTerminalSession.ts __tests__/ttydProtocol.spec.ts
git commit -m "feat: implement ttyd WebSocket binary protocol"
```

---

### Task 5: Terminal Connection Logic

**Files:**
- Modify: `composables/useTerminalSession.ts`

This adds the `connectSession()` and `disconnectSession()` functions that wire xterm.js to a ttyd WebSocket using the protocol from Task 4. These functions are not easily unit-testable (they depend on real WebSocket and xterm.js DOM), so they will be validated via manual integration testing in Task 10.

- [ ] **Step 1: Add connection functions to useTerminalSession**

Add the following inside `createSessionRegistry()`, after the existing functions:

```typescript
  function connectSession(id: string, container: HTMLElement): void {
    const entry = sessions.get(id)
    if (!entry) return
    if (entry.state === 'CONNECTING' || entry.state === 'CONNECTED') return

    entry.state = 'CONNECTING'
    entry.mountTarget = container

    // Initialize xterm.js if not already created
    if (!entry.terminal) {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { WebLinksAddon } = await import('@xterm/addon-web-links')

      const opts = { ...entry.config.options }
      // Apply fixed rows/cols if set (overrides auto-fit)
      if (entry.config.rows) opts.rows = entry.config.rows
      if (entry.config.cols) opts.cols = entry.config.cols

      const terminal = new Terminal(opts)
      const fitAddon = new FitAddon()
      const useAutoFit = !entry.config.rows && !entry.config.cols

      terminal.loadAddon(fitAddon)
      terminal.loadAddon(new WebLinksAddon())
      terminal.open(container)

      if (useAutoFit) {
        fitAddon.fit()
        // Refit on container resize only when auto-fitting
        const resizeObserver = new ResizeObserver(() => fitAddon.fit())
        resizeObserver.observe(container)
        ;(entry as any)._resizeObserver = resizeObserver
      }

      entry.terminal = terminal
      ;(entry as any)._fitAddon = fitAddon
    }

    // Open WebSocket to ttyd
    const url = `ws://${entry.config.host}:${entry.config.port}${entry.config.path}`
    const socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    entry.socket = socket

    socket.onopen = () => {
      entry.state = 'CONNECTED'
    }

    socket.onmessage = (event: MessageEvent) => {
      const msg = decodeTtydMessage(event.data)
      switch (msg.type) {
        case 'output':
          entry.terminal?.write(msg.data as Uint8Array)
          break
        case 'title':
          // Could emit an event, for now just ignore
          break
        case 'config':
          break
      }
    }

    socket.onclose = () => {
      if (entry.state === 'DESTROYED') return
      entry.state = 'DISCONNECTED'

      if (entry.config.reconnect) {
        scheduleReconnect(id)
      }
    }

    socket.onerror = () => {
      entry.state = 'DISCONNECTED'
    }

    // Wire terminal input → ttyd
    entry.terminal.onData((input: string) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(encodeTtydInput(input))
      }
    })

    // Wire terminal resize → ttyd
    entry.terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(encodeTtydResize(cols, rows))
      }
    })
  }

  function disconnectSession(id: string): void {
    const entry = sessions.get(id)
    if (!entry) return

    entry.socket?.close()
    entry.socket = null

    if (!entry.persist) {
      ;(entry as any)._resizeObserver?.disconnect()
      entry.terminal?.dispose()
      entry.terminal = null
      entry.mountTarget = null
    }
  }

  const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const reconnectAttempts = new Map<string, number>()

  function scheduleReconnect(id: string): void {
    const entry = sessions.get(id)
    if (!entry || entry.state === 'DESTROYED') return

    const attempts = reconnectAttempts.get(id) ?? 0
    if (attempts >= 5) {
      reconnectAttempts.delete(id)
      return
    }

    const delay = Math.min(entry.config.reconnectDelay * Math.pow(2, attempts), 10000)
    reconnectAttempts.set(id, attempts + 1)

    const timer = setTimeout(() => {
      reconnectTimers.delete(id)
      if (entry.mountTarget && entry.state === 'DISCONNECTED') {
        connectSession(id, entry.mountTarget)
      }
    }, delay)

    reconnectTimers.set(id, timer)
  }

  function cancelReconnect(id: string): void {
    const timer = reconnectTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      reconnectTimers.delete(id)
    }
    reconnectAttempts.delete(id)
  }
```

**Important:** The `connectSession` function uses dynamic `await import()` for xterm.js — this means it must be `async`. Update its signature:

```typescript
async function connectSession(id: string, container: HTMLElement): Promise<void> {
```

Also add `cancelReconnect`, `connectSession`, and `disconnectSession` to the returned object:

```typescript
  return {
    all,
    background,
    cancelReconnect,
    connectSession,
    destroy,
    destroyAll,
    disconnectSession,
    foreground,
    get,
    getOrCreate,
    release,
  }
```

- [ ] **Step 2: Commit**

```bash
git add composables/useTerminalSession.ts
git commit -m "feat: add terminal connection logic with reconnect"
```

---

### Task 6: Styles

**Files:**
- Create: `styles/index.css`

- [ ] **Step 1: Create base styles**

Create `styles/index.css`:

```css
@import '@xterm/xterm/css/xterm.css';

:root {
  --slidev-terminal-bg: #1e1e1e;
  --slidev-terminal-border: none;
  --slidev-terminal-border-radius: 8px;
  --slidev-terminal-cursor: #aeafad;
  --slidev-terminal-fg: #d4d4d4;
  --slidev-terminal-font-family: 'Fira Code', 'Cascadia Code', 'Menlo', monospace;
  --slidev-terminal-font-size: 14px;
  --slidev-terminal-selection: rgba(255, 255, 255, 0.3);
}

.dark {
  --slidev-terminal-bg: #1e1e1e;
  --slidev-terminal-cursor: #aeafad;
  --slidev-terminal-fg: #d4d4d4;
  --slidev-terminal-selection: rgba(255, 255, 255, 0.3);
}

:root:not(.dark) {
  --slidev-terminal-bg: #ffffff;
  --slidev-terminal-cursor: #000000;
  --slidev-terminal-fg: #383a42;
  --slidev-terminal-selection: rgba(0, 0, 0, 0.15);
}

.slidev-terminal {
  background: var(--slidev-terminal-bg);
  border: var(--slidev-terminal-border);
  border-radius: var(--slidev-terminal-border-radius);
  height: 100%;
  overflow: hidden;
  position: relative;
  width: 100%;
}

.slidev-terminal .xterm {
  height: 100%;
  padding: 8px;
}

.slidev-terminal-overlay {
  align-items: center;
  background: var(--slidev-terminal-bg);
  bottom: 0;
  color: var(--slidev-terminal-fg);
  display: flex;
  flex-direction: column;
  font-family: var(--slidev-terminal-font-family);
  font-size: var(--slidev-terminal-font-size);
  gap: 12px;
  justify-content: center;
  left: 0;
  position: absolute;
  right: 0;
  top: 0;
  z-index: 10;
}

.slidev-terminal-overlay-title {
  font-size: 1.1em;
  font-weight: 600;
}

.slidev-terminal-overlay-detail {
  background: rgba(128, 128, 128, 0.2);
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.9em;
  padding: 4px 8px;
}

.slidev-terminal-overlay-retry {
  background: rgba(128, 128, 128, 0.3);
  border: none;
  border-radius: 4px;
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.9em;
  padding: 6px 16px;
}

.slidev-terminal-overlay-retry:hover {
  background: rgba(128, 128, 128, 0.5);
}

.slidev-terminal-reconnecting {
  background: rgba(255, 165, 0, 0.9);
  color: #000;
  font-family: var(--slidev-terminal-font-family);
  font-size: 12px;
  left: 0;
  padding: 2px 8px;
  position: absolute;
  right: 0;
  text-align: center;
  top: 0;
  z-index: 11;
}

.slidev-terminal-hidden {
  height: 0;
  overflow: hidden;
  pointer-events: none;
  position: fixed;
  visibility: hidden;
  width: 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles/index.css
git commit -m "feat: add terminal CSS with theme integration variables"
```

---

### Task 7: Setup (Provide Registry)

**Files:**
- Create: `setup/main.ts`

- [ ] **Step 1: Create app setup that provides the session registry**

Create `setup/main.ts`:

```typescript
import { defineAppSetup } from '@slidev/types'

import { createSessionRegistry } from '../composables/useTerminalSession'

export const REGISTRY_KEY = Symbol('liveshell-registry')

export default defineAppSetup(({ app }) => {
  const registry = createSessionRegistry()
  app.provide(REGISTRY_KEY, registry)
})
```

- [ ] **Step 2: Commit**

```bash
git add setup/main.ts
git commit -m "feat: provide session registry via Vue app setup"
```

---

### Task 8: Terminal.vue Component

**Files:**
- Create: `components/Terminal.vue`

- [ ] **Step 1: Create the Terminal component**

Create `components/Terminal.vue`:

```vue
<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { onSlideEnter, onSlideLeave, useDarkMode } from '@slidev/client'

import { resolveTerminalOptions } from '../composables/useTerminalOptions'
import type { SessionRegistry } from '../composables/useTerminalSession'
import { REGISTRY_KEY } from '../setup/main'
import type { TerminalDeckConfig, TerminalProps } from '../types'

const props = withDefaults(defineProps<TerminalProps>(), {
  host: undefined,
  options: undefined,
  path: undefined,
  persist: false,
  port: undefined,
  reconnect: true,
  reconnectDelay: 1000,
  rows: undefined,
  cols: undefined,
  session: undefined,
})

const registry = inject<SessionRegistry>(REGISTRY_KEY)
if (!registry) {
  throw new Error('[liveshell] Session registry not found. Is the addon installed correctly?')
}

// Read deck-level terminal config from $slidev.configs
const { $slidev } = window as any
const deckConfig = computed<TerminalDeckConfig | undefined>(
  () => ($slidev?.configs as any)?.terminal,
)

const { isDark } = useDarkMode()
const containerRef = ref<HTMLElement | null>(null)

// Generate a stable session ID if none provided
const sessionId = props.session ?? `liveshell-${Math.random().toString(36).slice(2, 9)}`

const config = computed(() =>
  resolveTerminalOptions(props, deckConfig.value, isDark.value),
)

const sessionEntry = registry.getOrCreate(sessionId, config.value, props.persist)

// Error state for the overlay
const errorMessage = ref<string | null>(null)
const isReconnecting = ref(false)

// Watch session state for error/reconnect UI
watch(
  () => sessionEntry.state,
  (state) => {
    if (state === 'DISCONNECTED' && !sessionEntry.config.reconnect) {
      errorMessage.value = `Cannot connect to terminal at ${sessionEntry.config.host}:${sessionEntry.config.port}`
    } else if (state === 'DISCONNECTED' && sessionEntry.config.reconnect) {
      isReconnecting.value = true
      errorMessage.value = null
    } else if (state === 'CONNECTED') {
      errorMessage.value = null
      isReconnecting.value = false
    } else if (state === 'CONNECTING') {
      isReconnecting.value = false
      errorMessage.value = null
    }
  },
)

function retry(): void {
  errorMessage.value = null
  if (containerRef.value) {
    registry.connectSession(sessionId, containerRef.value)
  }
}

onSlideEnter(() => {
  if (!containerRef.value) return

  if (sessionEntry.state === 'BACKGROUND') {
    // Move terminal DOM back from global-bottom
    if (sessionEntry.terminal?.element?.parentElement) {
      containerRef.value.appendChild(sessionEntry.terminal.element.parentElement)
    }
    registry.foreground(sessionId)
  } else if (sessionEntry.state === 'IDLE' || sessionEntry.state === 'DISCONNECTED') {
    registry.connectSession(sessionId, containerRef.value)
  }
})

onSlideLeave(() => {
  if (props.persist) {
    registry.background(sessionId)
  } else {
    registry.disconnectSession(sessionId)
  }
})

onBeforeUnmount(() => {
  registry.cancelReconnect(sessionId)
  registry.release(sessionId)
})
</script>

<template>
  <div class="slidev-terminal">
    <div ref="containerRef" class="slidev-terminal-inner" style="width: 100%; height: 100%;" />

    <!-- Reconnecting banner -->
    <div v-if="isReconnecting" class="slidev-terminal-reconnecting">
      Reconnecting...
    </div>

    <!-- Error overlay -->
    <div v-if="errorMessage" class="slidev-terminal-overlay">
      <div class="slidev-terminal-overlay-title">
        Terminal Unavailable
      </div>
      <div>{{ errorMessage }}</div>
      <div class="slidev-terminal-overlay-detail">
        ttyd -W -p {{ config.port }} {{ deckConfig?.defaultShell ?? 'zsh' }}
      </div>
      <button class="slidev-terminal-overlay-retry" @click="retry">
        Retry
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add components/Terminal.vue
git commit -m "feat: add Terminal.vue component with error overlays"
```

---

### Task 9: Global Bottom Layer (Persistent Sessions)

**Files:**
- Create: `global-bottom.vue`

- [ ] **Step 1: Create the hidden container for persistent sessions**

Create `global-bottom.vue`:

```vue
<script setup lang="ts">
import { computed, inject } from 'vue'

import type { SessionRegistry } from './composables/useTerminalSession'
import { REGISTRY_KEY } from './setup/main'

const registry = inject<SessionRegistry>(REGISTRY_KEY)

const backgroundSessions = computed(() =>
  registry?.all().filter(s => s.state === 'BACKGROUND') ?? [],
)
</script>

<template>
  <div class="slidev-terminal-hidden">
    <div
      v-for="session in backgroundSessions"
      :key="session.id"
      :data-session="session.id"
    />
  </div>
</template>
```

Note: The actual terminal DOM element is managed by xterm.js and moved between the slide container and this hidden container via direct DOM manipulation in `Terminal.vue`'s `onSlideEnter`/`onSlideLeave` handlers. This component provides the hidden mount point.

- [ ] **Step 2: Commit**

```bash
git add global-bottom.vue
git commit -m "feat: add global-bottom layer for persistent sessions"
```

---

### Task 10: Vite Plugin (Auto-Managed Mode)

**Files:**
- Create: `vite.config.ts`
- Create: `__tests__/vitePlugin.spec.ts`

- [ ] **Step 1: Write failing tests for session discovery**

Create `__tests__/vitePlugin.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { discoverSessions } from '../vite.config'

describe('discoverSessions', () => {
  it('extracts default session from bare <Terminal />', () => {
    const markdown = '<Terminal />'
    const result = discoverSessions(markdown, 8085)

    expect(result).toEqual([
      { port: 8085, session: 'default' },
    ])
  })

  it('extracts named session', () => {
    const markdown = '<Terminal session="api-server" />'
    const result = discoverSessions(markdown, 8085)

    expect(result).toEqual([
      { port: 8085, session: 'api-server' },
    ])
  })

  it('extracts session with explicit port', () => {
    const markdown = '<Terminal session="demo" port="9001" />'
    const result = discoverSessions(markdown, 8085)

    expect(result).toEqual([
      { port: 9001, session: 'demo' },
    ])
  })

  it('extracts multiple sessions from one slide', () => {
    const markdown = `
<Terminal session="server" persist />
<Terminal session="client" persist />
`
    const result = discoverSessions(markdown, 8085)

    expect(result).toEqual([
      { port: 8085, session: 'server' },
      { port: 8086, session: 'client' },
    ])
  })

  it('deduplicates same session across slides', () => {
    const markdown = `
<Terminal session="demo" />
<Terminal session="demo" />
`
    const result = discoverSessions(markdown, 8085)

    expect(result).toEqual([
      { port: 8085, session: 'demo' },
    ])
  })

  it('handles bound port syntax :port="9001"', () => {
    const markdown = '<Terminal session="x" :port="9001" />'
    const result = discoverSessions(markdown, 8085)

    expect(result).toEqual([
      { port: 9001, session: 'x' },
    ])
  })

  it('returns empty array when no Terminal components found', () => {
    const markdown = '# Just a title\n\nSome text'
    const result = discoverSessions(markdown, 8085)

    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run __tests__/vitePlugin.spec.ts
```

Expected: FAIL — `discoverSessions` not found.

- [ ] **Step 3: Implement vite.config.ts**

Create `vite.config.ts`:

```typescript
import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'

import { defineConfig } from 'vite'

import type { AutoManagedSession, TerminalDeckConfig, TerminalStatusEvent } from './types'

export function discoverSessions(
  markdown: string,
  defaultPort: number,
): AutoManagedSession[] {
  const results: AutoManagedSession[] = []
  const seen = new Set<string>()
  let nextPort = defaultPort

  // Match <Terminal ... /> and <Terminal ...>...</Terminal>
  const regex = /<Terminal\b([^/>]*)\/?>/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(markdown)) !== null) {
    const attrs = match[1]

    // Extract session name
    const sessionMatch = attrs.match(/session=["']([^"']+)["']/)
    const session = sessionMatch?.[1] ?? 'default'

    if (seen.has(session)) continue
    seen.add(session)

    // Extract port (supports port="N" and :port="N")
    const portMatch = attrs.match(/:?port=["'](\d+)["']/)
    const port = portMatch ? parseInt(portMatch[1], 10) : nextPort++

    results.push({ port, session })
  }

  return results
}

export default defineConfig({
  plugins: [
    {
      name: 'slidev-addon-liveshell',

      configureServer(server) {
        const processes = new Map<string, ChildProcess>()

        // Read terminal config from Slidev's resolved config
        // This runs after Slidev has parsed the frontmatter
        server.httpServer?.once('listening', () => {
          const slidevConfig = (server.config as any)?.slidev
          const terminalConfig: TerminalDeckConfig = slidevConfig?.data?.config?.terminal ?? {}

          if (!terminalConfig.autoManage) return

          const defaultPort = terminalConfig.defaultPort ?? 8085
          const shell = terminalConfig.defaultShell ?? 'zsh'
          const ttydPath = terminalConfig.ttydPath ?? 'ttyd'

          // Read all slide markdown to discover sessions
          const slides = slidevConfig?.data?.slides ?? []
          const allMarkdown = slides.map((s: any) => s.source?.raw ?? s.content ?? '').join('\n')
          const sessions = discoverSessions(allMarkdown, defaultPort)

          if (sessions.length === 0) {
            console.log('[liveshell] autoManage enabled but no <Terminal> components found')
            return
          }

          console.log(`[liveshell] Auto-managing ${sessions.length} terminal session(s)`)

          for (const session of sessions) {
            try {
              const child = spawn(ttydPath, [
                '-W',
                '-p', String(session.port),
                '-t', 'disableReconnect=true',
                session.shell ?? shell,
              ], { stdio: 'pipe' })

              child.on('error', (err) => {
                if ((err as any).code === 'ENOENT') {
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
                console.log(`[liveshell] Session "${session.session}" running on port ${session.port} (PID: ${child.pid})`)
                processes.set(session.session, child)

                server.ws.send('liveshell:status', {
                  sessions: { [session.session]: { pid: child.pid!, port: session.port, state: 'running' } },
                } satisfies TerminalStatusEvent)
              })

              child.on('exit', (code) => {
                console.log(`[liveshell] Session "${session.session}" exited (code: ${code})`)
                processes.delete(session.session)

                server.ws.send('liveshell:status', {
                  sessions: { [session.session]: { pid: 0, port: session.port, state: 'stopped' } },
                } satisfies TerminalStatusEvent)
              })

              child.stderr?.on('data', (data: Buffer) => {
                const msg = data.toString().trim()
                if (msg.includes('bindlisten')) {
                  console.error(`[liveshell] Port ${session.port} already in use for session "${session.session}"`)
                }
              })
            } catch (err) {
              console.error(`[liveshell] Error spawning ttyd for session "${session.session}":`, err)
            }
          }

          // Cleanup on server close
          const cleanup = () => {
            for (const [name, child] of processes) {
              console.log(`[liveshell] Stopping session "${name}" (PID: ${child.pid})`)
              child.kill('SIGTERM')

              // Force kill after 3 seconds
              setTimeout(() => {
                if (!child.killed) {
                  child.kill('SIGKILL')
                }
              }, 3000)
            }
            processes.clear()
          }

          server.httpServer?.on('close', cleanup)
          process.on('SIGINT', cleanup)
          process.on('SIGTERM', cleanup)
        })
      },
    },
  ],
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run __tests__/vitePlugin.spec.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts __tests__/vitePlugin.spec.ts
git commit -m "feat: add Vite plugin for auto-managed ttyd sessions"
```

---

### Task 11: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README with usage documentation**

Create `README.md`:

```markdown
# slidev-addon-liveshell

Embed live, interactive terminal sessions in your [Slidev](https://sli.dev) presentations using [ttyd](https://github.com/tsl0922/ttyd) and [xterm.js](https://xtermjs.org/).

## Prerequisites

You need [ttyd](https://github.com/tsl0922/ttyd) installed on your machine:

| OS | Command |
|----|---------|
| macOS | `brew install ttyd` |
| Ubuntu/Debian | `apt install ttyd` |
| Arch | `pacman -S ttyd` |
| Windows | `scoop install ttyd` |

## Install

```bash
npm install slidev-addon-liveshell
```

Add it to your slides frontmatter:

```yaml
---
addons:
  - liveshell
---
```

## Usage

### Manual Mode (default)

Start ttyd yourself, then use the component:

```bash
ttyd -W -p 8085 zsh
```

```markdown
---
layout: default
---

# Demo

<Terminal />
```

### Auto-Managed Mode

Let the plugin start ttyd for you:

```yaml
---
addons:
  - liveshell
terminal:
  autoManage: true
  defaultShell: bash
  defaultPort: 8085
---
```

The plugin discovers all `<Terminal>` components at startup and spawns ttyd processes automatically.

## Component Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `session` | `string` | auto-generated | Named session identifier |
| `persist` | `boolean` | `false` | Keep session alive across slide navigation |
| `host` | `string` | `'localhost'` | ttyd host |
| `port` | `number` | `8085` | ttyd port |
| `path` | `string` | `'/ws'` | ttyd WebSocket path |
| `rows` | `number` | auto-fit | Fixed terminal rows |
| `cols` | `number` | auto-fit | Fixed terminal columns |
| `options` | `ITerminalOptions` | `{}` | xterm.js options passthrough |
| `reconnect` | `boolean` | `true` | Auto-reconnect on disconnect |
| `reconnectDelay` | `number` | `1000` | Base delay (ms) between reconnect attempts |

## Examples

### Named persistent session

```markdown
<Terminal session="api-server" persist />
```

### Multiple terminals on one slide

```markdown
<div class="grid grid-cols-2 gap-4 h-full">
  <Terminal session="server" persist />
  <Terminal session="client" persist />
</div>
```

### Custom xterm.js options

```markdown
<Terminal
  session="demo"
  :options="{ fontSize: 18, cursorBlink: false, fontFamily: 'JetBrains Mono' }"
/>
```

## Deck-Level Configuration

```yaml
---
terminal:
  autoManage: false       # Auto-start ttyd processes
  defaultPort: 8085       # Default ttyd port
  defaultShell: zsh       # Shell to use in auto mode
  ttydPath: ttyd          # Path to ttyd binary
  options:                # Default xterm.js options for all terminals
    fontSize: 16
---
```

## Theming

Override CSS variables to match your slide theme:

```css
:root {
  --slidev-terminal-bg: #282c34;
  --slidev-terminal-fg: #abb2bf;
  --slidev-terminal-border-radius: 12px;
  --slidev-terminal-font-family: 'JetBrains Mono', monospace;
}
```

## How It Works

The addon connects directly to ttyd's WebSocket using the [ttyd binary protocol](https://github.com/tsl0922/ttyd) and renders output with a native xterm.js instance (no iframes). Persistent sessions survive slide navigation by parking their DOM in a hidden layer.

## License

MIT
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with usage and configuration guide"
```

---

### Task 12: Integration Testing (Manual)

**Files:** None — this is a manual verification task using a test Slidev project.

- [ ] **Step 1: Create a test slides project**

Create a directory `test-slides/` (gitignored) with a minimal Slidev presentation:

```bash
mkdir -p test-slides
```

Create `test-slides/slides.md`:

```markdown
---
addons:
  - ../
terminal:
  autoManage: true
  defaultShell: zsh
  defaultPort: 8085
---

# Slide 1: Single Terminal

<Terminal />

---

# Slide 2: Named Persistent

<Terminal session="demo" persist />

---

# Slide 3: Same Persistent Session

<Terminal session="demo" persist />

---

# Slide 4: Multiple Terminals

<div class="grid grid-cols-2 gap-4 h-full">
  <Terminal session="left" />
  <Terminal session="right" />
</div>

---

# Slide 5: No Terminal

Just a regular slide. Session "demo" should still be alive if you go back to slide 2 or 3.
```

Add `test-slides/` to `.gitignore`:

```
test-slides/
node_modules/
```

- [ ] **Step 2: Run the test presentation**

```bash
cd test-slides && npx slidev slides.md
```

- [ ] **Step 3: Verify manual test cases**

1. Slide 1: Terminal connects and is interactive (type commands, see output)
2. Slide 2 → 3: Navigate forward, same "demo" session persists (scroll history preserved)
3. Slide 3 → 5 → 2: Navigate away and back, "demo" session still alive
4. Slide 4: Both terminals work independently
5. Slide 1 → 2 → 1: Ephemeral session on slide 1 is fresh each visit
6. Kill ttyd manually: terminal shows error overlay with retry button
7. Click retry: terminal reconnects
8. Dark/light mode toggle: terminal theme updates

- [ ] **Step 4: Commit .gitignore**

```bash
git add .gitignore
git commit -m "chore: add gitignore"
```
