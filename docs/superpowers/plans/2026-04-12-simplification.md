# Simplification & Persistent Session Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the codebase by removing dead code and the BACKGROUND state machine, and fix the persistent terminal backward-navigation bug by replacing `onSlideEnter`/`onSlideLeave` with a single `watch(isActive)`.

**Architecture:** Five targeted changes with no public API impact. The core fix replaces two separate reactive hooks (with ambiguous flush ordering) with one `watch(isActive, ..., { immediate: true })` per `Terminal.vue` instance — since `isActive` is a single-winner computed, ordering is irrelevant. BACKGROUND state is eliminated because persist sessions never need to track "left but socket open" as a distinct state: the watcher simply does nothing on leave and moves the DOM on re-enter.

**Tech Stack:** Vue 3 Composition API, Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-12-simplification-design.md`

---

## File Map

| File | Change |
|------|--------|
| `composables/useTerminalSession.ts` | Remove `background()`, `foreground()`, dead re-exports at top |
| `types.ts` | Remove `'BACKGROUND'` from `SessionState` union |
| `components/Terminal.vue` | Replace `onSlideEnter`/`onSlideLeave` with `watch(isActive)` |
| `composables/slide-parser.ts` | Remove `parseFrontmatter` function |
| `vite.config.ts` | Inline `matter(markdown).data`, remove `parseFrontmatter` re-export |
| `global-bottom.vue` | Fix misleading comment |
| `__tests__/useTerminalSession.spec.ts` | Remove two BACKGROUND state tests |
| `__tests__/vitePlugin.spec.ts` | Remove `parseFrontmatter` describe block |

---

## Task 1: Remove dead re-exports from `useTerminalSession.ts`

**Files:**
- Modify: `composables/useTerminalSession.ts`

These four lines at the top of `useTerminalSession.ts` export protocol functions that nothing outside the file imports. They add confusing public surface area with no consumers.

- [ ] **Step 1: Remove the dead re-export lines**

Open `composables/useTerminalSession.ts` and delete lines 7–8:

```ts
// DELETE these two lines:
export { decodeTtydMessage, encodeTtydInput, encodeTtydResize }
export type { TtydMessage } from './ttyd-protocol'
```

The import on line 3 (`import { decodeTtydMessage, encodeTtydInput, encodeTtydResize } from './ttyd-protocol'`) stays — the registry uses these internally.

- [ ] **Step 2: Verify no tests break**

```bash
npx vitest run
```

Expected: all tests pass (nothing imported those re-exports).

- [ ] **Step 3: Commit**

```bash
git add composables/useTerminalSession.ts
git commit -m "refactor: remove unused ttyd protocol re-exports from session registry"
```

---

## Task 2: Remove `parseFrontmatter` and inline it

**Files:**
- Modify: `__tests__/vitePlugin.spec.ts` (remove describe block)
- Modify: `composables/slide-parser.ts` (remove function + import)
- Modify: `vite.config.ts` (inline call, remove re-export)

`parseFrontmatter` is a one-liner wrapper around `gray-matter` with a single call site. It exists only as an abstraction with no benefit.

- [ ] **Step 1: Delete the `parseFrontmatter` test block**

In `__tests__/vitePlugin.spec.ts`, remove the entire `describe('parseFrontmatter', ...)` block (lines 1–33). The file should start directly with `describe('discoverSessions', ...)`:

```ts
import { describe, expect, it } from 'vitest'
import { discoverSessions } from '../composables/slide-parser'

describe('discoverSessions', () => {
  // ... existing tests unchanged
```

- [ ] **Step 2: Run tests to confirm the remaining tests still pass**

```bash
npx vitest run __tests__/vitePlugin.spec.ts
```

Expected: all `discoverSessions` tests pass.

- [ ] **Step 3: Remove `parseFrontmatter` from `slide-parser.ts`**

Delete the `gray-matter` import and the function. The file should become:

```ts
import type { AutoManagedSession } from '../types'

export function discoverSessions(
  markdown: string,
  defaultPort: number,
): AutoManagedSession[] {
  const results: AutoManagedSession[] = []
  const seen = new Set<string>()
  let nextPort = defaultPort

  const regex = /<Terminal\b([^/>]*)\/?>/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(markdown)) !== null) {
    const attrs = match[1]

    const sessionMatch = attrs.match(/session=["']([^"']+)["']/)
    const session = sessionMatch?.[1] ?? 'default'

    if (seen.has(session)) continue
    seen.add(session)

    const portMatch = attrs.match(/:?port=["'](\d+)["']/)
    const port = portMatch ? parseInt(portMatch[1], 10) : nextPort++

    results.push({ port, session })
  }

  return results
}
```

- [ ] **Step 4: Update `vite.config.ts`**

Replace the `parseFrontmatter` import and its one call site with an inline `matter()` call. Also remove `parseFrontmatter` from the re-export line.

Change the imports at the top of `vite.config.ts`:

```ts
// BEFORE
import type { AutoManagedSession, TerminalDeckConfig, TerminalStatusEvent } from './types'
import { discoverSessions, parseFrontmatter } from './composables/slide-parser'

export { discoverSessions, parseFrontmatter }
```

```ts
// AFTER
import matter from 'gray-matter'
import type { AutoManagedSession, TerminalDeckConfig, TerminalStatusEvent } from './types'
import { discoverSessions } from './composables/slide-parser'

export { discoverSessions }
```

Change the call site inside `configureServer` (~line 94):

```ts
// BEFORE
const terminalConfig = (parseFrontmatter(markdown).terminal ?? {}) as TerminalDeckConfig
```

```ts
// AFTER
const terminalConfig = ((matter(markdown).data.terminal) ?? {}) as TerminalDeckConfig
```

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add composables/slide-parser.ts vite.config.ts __tests__/vitePlugin.spec.ts
git commit -m "refactor: inline parseFrontmatter, remove one-liner wrapper"
```

---

## Task 3: Fix `global-bottom.vue` comment

**Files:**
- Modify: `global-bottom.vue`

The existing comment states "no DOM manipulation needed" — the opposite of what actually happens (xterm elements are moved between slide containers via `appendChild`).

- [ ] **Step 1: Replace the comment**

```vue
<!--
  Required Slidev addon convention file — Slidev will not load the addon without it.
  This component renders nothing; persistent terminal DOM lives in each slide's
  own container and is moved between them on navigation.
-->
<template>
  <div />
</template>
```

- [ ] **Step 2: Commit**

```bash
git add global-bottom.vue
git commit -m "docs: fix misleading comment in global-bottom.vue"
```

---

## Task 4: Replace `onSlideEnter`/`onSlideLeave` with `watch(isActive)` in `Terminal.vue`

**Files:**
- Modify: `components/Terminal.vue`

This is the core navigation fix. The two hooks use different watch primitives (`watchEffect` vs `watch`) with no guaranteed ordering between them. A single `watch(isActive, ..., { immediate: true })` eliminates the ambiguity: `isActive` is `computed(() => $page === currentSlideNo)` where `$page` is a fixed constant per slide, so it can be true for only one component at a time.

There are no unit tests for `Terminal.vue` — verification is manual (Step 3).

- [ ] **Step 1: Rewrite `Terminal.vue`**

Replace the entire `<script setup>` block:

```vue
<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { useIsSlideActive, useDarkMode, useNav } from '@slidev/client'

import { resolveTerminalOptions } from '../composables/useTerminalOptions'
import { SessionRegistry } from '../composables/useTerminalSession'
import { REGISTRY_KEY } from '../setup/main'
import type { TerminalDeckConfig, TerminalProps } from '../types'

const props = withDefaults(defineProps<TerminalProps>(), {
  host: undefined,
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

function retry(): void {
  connectionFailed.value = false
  if (containerRef.value) {
    registry.retry(sessionId, containerRef.value)
  }
}

const isActive = useIsSlideActive()
watch(isActive, (active) => {
  if (active) {
    if (!containerRef.value) return

    // For persistent sessions: move the xterm DOM into this slide's container
    const el = sessionEntry.terminal?.element
    if (el && el.parentElement !== containerRef.value) {
      containerRef.value.appendChild(el.parentElement!)
    }

    if (sessionEntry.state === 'IDLE') {
      registry.connectSession(sessionId, containerRef.value)
    }
    // If CONNECTED: socket still open, DOM just moved — nothing else needed
    // If DISCONNECTED: error overlay already visible, user must click Retry
  } else {
    if (!props.persist) {
      registry.disconnectSession(sessionId)
    }
    // persist=true: do nothing — socket stays open in the hidden slide container
  }
}, { immediate: true })

onBeforeUnmount(() => {
  registry.release(sessionId)
})
</script>
```

The `<template>` block is unchanged.

- [ ] **Step 2: Run unit tests (unrelated to Terminal.vue but catches regressions)**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Manual smoke test**

Start a Slidev dev server with a presentation that has `<Terminal session="demo" persist />` on at least two slides. Verify:
- Forward navigation (slide 2 → slide 3): terminal session persists, shell history intact
- Backward navigation (slide 3 → slide 2): terminal session persists, shell history intact
- Non-persist terminal: terminal disconnects on leave, reconnects on re-enter
- Error overlay appears when ttyd is not running; Retry button works

- [ ] **Step 4: Commit**

```bash
git add components/Terminal.vue
git commit -m "fix: replace onSlideEnter/onSlideLeave with watch(isActive) for reliable persist navigation"
```

---

## Task 5: Remove BACKGROUND state from registry and types

**Files:**
- Modify: `__tests__/useTerminalSession.spec.ts` (remove two tests)
- Modify: `composables/useTerminalSession.ts` (remove `background()`, `foreground()`)
- Modify: `types.ts` (remove `'BACKGROUND'` from union)

Now that `Terminal.vue` no longer calls `background()` or `foreground()`, these methods and the state they managed can be removed.

- [ ] **Step 1: Remove the two BACKGROUND tests from `useTerminalSession.spec.ts`**

Delete the following two `it` blocks (currently around lines 61–77):

```ts
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
```

- [ ] **Step 2: Run tests to confirm the remaining registry tests pass**

```bash
npx vitest run __tests__/useTerminalSession.spec.ts
```

Expected: 7 tests pass (the two removed tests are gone, the rest unchanged).

- [ ] **Step 3: Remove `'BACKGROUND'` from `SessionState` in `types.ts`**

```ts
// BEFORE
export type SessionState =
  | 'IDLE'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'BACKGROUND'
  | 'DESTROYED'

// AFTER
export type SessionState =
  | 'IDLE'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'DESTROYED'
```

- [ ] **Step 4: Remove `background()` and `foreground()` from `SessionRegistry`**

In `composables/useTerminalSession.ts`, delete the two methods (currently around lines 72–84):

```ts
// DELETE both of these methods:
background(id: string): void {
  const entry = this.sessions.get(id)
  if (!entry) return
  entry.state = 'BACKGROUND'
}

foreground(id: string): void {
  const entry = this.sessions.get(id)
  if (!entry) return
  if (entry.state === 'BACKGROUND') {
    entry.state = 'CONNECTED'
  }
}
```

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass. TypeScript should also be happy — verify with:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add types.ts composables/useTerminalSession.ts __tests__/useTerminalSession.spec.ts
git commit -m "refactor: remove BACKGROUND state and foreground/background registry methods"
```

---

## Self-Review

**Spec coverage:**
- ✅ Change 1 (watch isActive): Task 4
- ✅ Change 2 (remove BACKGROUND): Task 5
- ✅ Change 3 (parseFrontmatter): Task 2
- ✅ Change 4 (dead re-exports): Task 1
- ✅ Change 5 (global-bottom comment): Task 3

**Placeholder scan:** None found. All steps include exact code.

**Type consistency:** `SessionState` has `'BACKGROUND'` removed in Task 5 Step 3 before the methods are removed in Step 4 — TypeScript will flag any remaining `entry.state = 'BACKGROUND'` assignments, providing a compile-time safety net for Step 4.
