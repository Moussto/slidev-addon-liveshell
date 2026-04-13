# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run all tests
npx vitest run

# Run a single test file
npx vitest run __tests__/useTerminalSession.spec.ts

# Watch mode during development
npx vitest
```

There is no build step — this is a Slidev addon consumed directly from source. No lint script is configured.

## Architecture

This is a [Slidev](https://sli.dev) addon that embeds live ttyd terminal sessions in presentations using xterm.js over WebSocket, without iframes.

### Addon entry points (Slidev conventions)

| File | Role |
|------|------|
| `setup/main.ts` | App-level setup — creates a singleton `SessionRegistry` and provides it via Vue's injection system (`REGISTRY_KEY`) |
| `components/Terminal.vue` | The `<Terminal>` component users place in slides |
| `vite.config.ts` | Vite plugin that spawns ttyd on demand via HMR `liveshell:spawn` requests |
| `styles/index.css` | CSS custom properties for theming |

### Session lifecycle

`SessionRegistry` (`composables/useTerminalSession.ts`) is the core state machine. It owns all `SessionEntry` objects, each with a `SessionState`:

```
IDLE → CONNECTING → CONNECTED → DISCONNECTED
                              → DESTROYED (non-persist, slide left or unmount)
```

For `persist=true` sessions, CONNECTED is kept indefinitely — the socket stays open when a slide is left. The xterm DOM element is moved (`appendChild`) into the active slide's container on each re-entry.

`Terminal.vue` drives state transitions via a single `watch(isActive, ..., { immediate: true })`:
- `isActive` is `computed(() => $page === currentSlideNo)` from Slidev's `useIsSlideActive()` — `$page` is a fixed constant per slide, so it's true for exactly one component at a time
- When `active=true`: moves the xterm DOM into this slide's container (if persist), then calls `connectSession` if state is `IDLE`
- When `active=false`: calls `disconnectSession` for non-persist; does nothing for persist (socket stays open)
- `onBeforeUnmount`: calls `release()` which destroys the session if `refCount` reaches 0 and it's non-persistent

### ttyd WebSocket protocol

The connection uses WebSocket subprotocol `'tty'` (binary `ArrayBuffer`). After `onopen`, the client sends:
1. JSON `{ AuthToken: '' }` (even when auth is disabled)
2. A resize frame (`encodeTtydResize`)

See `composables/ttyd-protocol.ts` and `docs/ttyd-websocket-protocol.md` for frame encoding details.

### Option resolution priority

`resolveTerminalOptions()` (`composables/useTerminalOptions.ts`) merges in this order (later wins):
1. `DEFAULT_TERMINAL_OPTIONS` + dark/light base theme (`composables/themes.ts`)
2. Deck-level `terminal.options` from slide frontmatter
3. Per-component `options` prop

The `theme` sub-object is deep-merged separately so partial theme overrides don't wipe the base palette.

### Lazy spawn via HMR (Vite plugin)

The Vite plugin spawns ttyd processes on demand — no upfront markdown parsing or component discovery.

1. Listens for `liveshell:spawn` HMR messages from `Terminal.vue` (via `composables/useSpawnRequest.ts`)
2. Each `SpawnRequest` carries `defaultPort`, `shell`, `ttydPath` from the client's deck config (`$slidev.configs.terminal`) — the plugin does no file I/O
3. Spawns one ttyd per unique session, replies with `liveshell:spawned` containing the confirmed port
4. Tracks used ports in a `Set` to avoid collisions; cleans up on process exit
5. Kills all processes on server shutdown

The `manual` prop on `<Terminal>` bypasses the HMR spawn flow — the user runs ttyd themselves and the component connects directly.
