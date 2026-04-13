# Simplification & Persistent Session Fix — Design Spec

Targeted refactoring of `slidev-addon-liveshell` to reduce complexity and fix the backward-navigation bug in persistent terminal sessions.

## Goals

- Fix `persist` backward navigation (slide N → slide N-1) reliably
- Remove the BACKGROUND state and its associated methods from `SessionRegistry`
- Remove dead code: re-exports in `useTerminalSession.ts`, `parseFrontmatter` wrapper
- Replace two-hook navigation logic with a single watcher per component

## What's NOT changing

- Public API (`<Terminal />` props, deck config shape, CSS variables)
- `SessionRegistry` core structure (Map, `getOrCreate`, `release`, `destroy`)
- ttyd protocol, Vite plugin, option resolution, tests for those layers
- `refCount` — still needed for named `persist` sessions appearing on multiple slides

---

## Change 1: Replace `onSlideEnter`/`onSlideLeave` with `watch(isActive)`

### Root cause of the bug

`onSlideEnter` and `onSlideLeave` are implemented with different watch primitives (`watchEffect` vs `watch`) on the same `isActive` computed. When two slide instances both react to a `currentSlideNo` change, there is no guaranteed flush ordering between the two separate watchers. The leave of one slide and the enter of the next can interleave.

### Fix

Replace both hooks with a single `watch(isActive, ...)` per `Terminal.vue` instance. Since `isActive` is `computed(() => $page === currentSlideNo)` and `$page` is a fixed constant per slide, exactly one slide can have `isActive = true` at any time — making ordering irrelevant.

```ts
// Terminal.vue — BEFORE
onSlideEnter(() => {
  if (!containerRef.value || !isActive.value) return
  // ... DOM move + connect/foreground
})
onSlideLeave(() => {
  if (props.persist) registry.background(sessionId)
  else registry.disconnectSession(sessionId)
})

// Terminal.vue — AFTER
const isActive = useIsSlideActive()
watch(isActive, (active) => {
  if (active) {
    if (!containerRef.value) return
    // Move DOM if persistent terminal lives in another slide's container
    const el = sessionEntry.terminal?.element
    if (el && el.parentElement !== containerRef.value) {
      containerRef.value.appendChild(el.parentElement!)
    }
    if (sessionEntry.state === 'IDLE') {
      registry.connectSession(sessionId, containerRef.value)
    }
    // If CONNECTED: socket still open, just the DOM moved — nothing else needed
  } else {
    if (!props.persist) registry.disconnectSession(sessionId)
    // persist=true: do nothing — socket stays open, DOM stays in hidden container
  }
}, { immediate: true })
```

`{ immediate: true }` ensures the initial mount case fires correctly (when the slide is already active at mount time).

---

## Change 2: Remove BACKGROUND state

`BACKGROUND` only existed as a label for "persist=true, slide left". Now that the watcher does nothing on leave for persist sessions, no state transition is needed. On re-enter, the session is already `CONNECTED` and the socket is open — the watcher just moves the DOM.

### State machine after

```
IDLE → CONNECTING → CONNECTED
                        ↓ (navigate away, persist=false)
                     DESTROYED

CONNECTING → DISCONNECTED (WebSocket failed)
CONNECTED  → DISCONNECTED (WebSocket dropped)
                   ↓
              Error overlay + Retry button
```

### Changes in `SessionRegistry`

- Remove `background()` method
- Remove `foreground()` method  
- Remove `BACKGROUND` from `SessionState` type in `types.ts`
- `connectSession` already guards against `CONNECTING | CONNECTED` — no change needed

---

## Change 3: Remove `parseFrontmatter` from `slide-parser.ts`

`parseFrontmatter` is a one-liner wrapper:

```ts
export function parseFrontmatter(markdown: string): Record<string, unknown> {
  const { data } = matter(markdown)
  return data
}
```

It adds a named export that re-exports `vite.config.ts` (and is tested in `vitePlugin.spec.ts`). Inline the call at the one use site in `vite.config.ts`:

```ts
// BEFORE
const terminalConfig = (parseFrontmatter(markdown).terminal ?? {}) as TerminalDeckConfig

// AFTER
const terminalConfig = ((matter(markdown).data.terminal) ?? {}) as TerminalDeckConfig
```

Remove `parseFrontmatter` from `slide-parser.ts`, its export from `vite.config.ts`, and its test in `vitePlugin.spec.ts`.

---

## Change 4: Remove dead re-exports from `useTerminalSession.ts`

These exports at the top of `useTerminalSession.ts` are unused outside the file:

```ts
export { decodeTtydMessage, encodeTtydInput, encodeTtydResize }
export type { TtydMessage } from './ttyd-protocol'
```

Nothing in the codebase imports these from `useTerminalSession`. Remove them. Consumers who need the protocol functions import directly from `./ttyd-protocol`.

---

## Change 5: Fix `global-bottom.vue` comment

The comment currently says:
> "Persistent terminal sessions survive navigation because Slidev keeps component instances alive — no DOM manipulation needed."

This is incorrect — DOM manipulation IS used (xterm element is moved between slide containers). Replace with an accurate comment explaining the file's actual role (satisfying the Slidev addon convention; the element is a required stub).

---

## File-by-file summary

| File | Change |
|------|--------|
| `components/Terminal.vue` | Replace `onSlideEnter`/`onSlideLeave` with single `watch(isActive)` |
| `composables/useTerminalSession.ts` | Remove `background()`, `foreground()`, dead re-exports |
| `types.ts` | Remove `BACKGROUND` from `SessionState` |
| `composables/slide-parser.ts` | Remove `parseFrontmatter` function |
| `vite.config.ts` | Inline `matter(markdown).data`, remove `parseFrontmatter` re-export |
| `global-bottom.vue` | Fix comment |
| `__tests__/vitePlugin.spec.ts` | Remove `parseFrontmatter` tests |
| `__tests__/useTerminalSession.spec.ts` | Remove `background`/`foreground` state tests |
