# Lazy ttyd Spawning via HMR — Design Spec

Replace the eager regex-based session discovery in the Vite plugin with on-demand spawning triggered by the Terminal component via the Vite HMR WebSocket channel.

## Goals

- Eliminate `slide-parser.ts`, `discoverSessions`, and all markdown regex parsing
- Make auto-management the default for every `<Terminal>` component (no opt-in flag)
- Introduce a `manual` prop to opt a single terminal out of auto-spawning
- Port assignment stays server-authoritative; the plugin assigns lazily per request
- Persistent shells work correctly: one spawn request per session lifetime, not per slide visit

## What's NOT changing

- `SessionRegistry` structure and state machine (`IDLE → CONNECTING → CONNECTED → DISCONNECTED`)
- xterm.js init flow and WebSocket connection logic inside `SessionRegistry`
- `persist` prop semantics and DOM-move behavior
- `liveshell:status` broadcast for general status display
- `defaultShell`, `ttydPath`, `defaultPort` config keys (rename of `defaultPort` is deferred)
- Public CSS variables and theming

---

## Change 1: Plugin becomes a reactive session manager

### Before

On server start the plugin:
1. Reads `slides.md` from disk
2. Parses frontmatter with `gray-matter` (checks `autoManage: true`)
3. Regex-scans for `<Terminal>` tags via `discoverSessions`
4. Spawns one ttyd process per unique session, assigning ports sequentially

### After

The plugin does nothing at server start. It maintains a server-side session map:

```ts
Map<sessionId, { port: number, process: ChildProcess | null }>
```

When a `liveshell:spawn` request arrives, the plugin:
1. Checks if the session is already in the map → if yes, responds immediately with existing port
2. If not, assigns a port (explicit port from request, or next free from `defaultPort` counter)
3. Spawns ttyd, adds to map, responds with `liveshell:spawned`

On server shutdown, kills all tracked processes (same cleanup as today).

### Deletions

- `composables/slide-parser.ts` — entire file removed
- `discoverSessions` export from `vite.config.ts`
- `autoManage` field from `TerminalDeckConfig` in `types.ts`
- `findSlidesFile` function in `vite.config.ts` (no longer needed)
- `gray-matter` import and frontmatter parsing from `vite.config.ts`

---

## Change 2: HMR message protocol

Two new message types on the existing Vite WS channel.

### `liveshell:spawn` (component → plugin)

Sent by `Terminal.vue` when a terminal becomes active for the first time (state is `IDLE` and `manual` is not set).

```ts
interface SpawnRequest {
  session: string   // session ID
  port?: number     // explicit port if prop is set; omit for dynamic assignment
  shell?: string    // optional shell override
}
```

### `liveshell:spawned` (plugin → component)

Sent by the plugin after spawn succeeds, or immediately if the session is already running.

```ts
interface SpawnedEvent {
  session: string
  port: number              // confirmed port (assigned or explicit)
  state: 'running' | 'error'
}
```

On `state: 'error'`, the component sets `entry.state = 'DISCONNECTED'` directly, showing the retry overlay without attempting a WebSocket connection.

The existing `liveshell:status` broadcast is unchanged — it continues to report process state for any status UI.

---

## Change 3: `manual` prop replaces `autoManage` opt-in

### `TerminalDeckConfig` (deck-level, `types.ts`)

Remove `autoManage`. Remaining fields: `defaultPort`, `defaultShell`, `ttydPath`, `options`.

### `TerminalProps` (`types.ts`)

Add `manual?: boolean`. When `manual={true}`:
- Component skips sending `liveshell:spawn`
- Connects directly to the configured port (same as today's non-autoManage behavior)
- User is responsible for running their own ttyd process

### Port resolution for managed terminals

| Scenario | Behavior |
|---|---|
| `port` prop set, `manual` not set | Port sent in spawn request; plugin uses it, skips counter |
| `port` prop not set, `manual` not set | Plugin assigns next free port from `defaultPort` counter; component updates `entry.config.port` from `liveshell:spawned` before connecting |
| `manual={true}` | No spawn request; component uses configured port directly |

---

## Change 4: Component spawn flow

`Terminal.vue`'s `watch(isActive)` gains an async spawn step before `connectSession`, gated on `state === 'IDLE'` and `!props.manual`.

### Full flow per scenario

**First visit — managed terminal, no explicit port:**
```
isActive → true
state === IDLE, manual !== true
→ send liveshell:spawn { session, port: undefined }
→ await liveshell:spawned { session, port: 8085, state: 'running' }
→ update sessionEntry.config.port = 8085
→ registry.connectSession() → xterm init → WebSocket → CONNECTED
```

**First visit — managed terminal, explicit port:**
```
isActive → true
state === IDLE, manual !== true
→ send liveshell:spawn { session, port: 9000 }
→ await liveshell:spawned { session, port: 9000, state: 'running' }
→ registry.connectSession() → WebSocket → CONNECTED
```

**Navigate away — persist=true:**
```
isActive → false
state stays CONNECTED, socket stays open
(no action — spawn not re-sent on return because state !== IDLE)
```

**Return to slide — persist=true:**
```
isActive → true
state === CONNECTED → skip spawn, skip connect
→ move terminal DOM element into this slide's container
```

**Navigate away — persist=false:**
```
isActive → false
→ registry.disconnectSession() → socket closed, xterm disposed → state → IDLE
```

**Return to slide — persist=false:**
```
isActive → true
state === IDLE → send liveshell:spawn { session }
Plugin: session already in map → responds immediately with existing port
→ registry.connectSession() → fresh WebSocket → CONNECTED
(ttyd process was never killed; only the WebSocket was closed)
```

**Spawn error:**
```
→ liveshell:spawned { state: 'error' }
→ sessionEntry.state = 'DISCONNECTED'
→ retry overlay shown
```

### Implementation note

The `requestSpawn` helper lives in `Terminal.vue` (or a small composable it imports). It sends the HMR message and returns a `Promise<SpawnedEvent>` that resolves when `liveshell:spawned` arrives for the matching session ID. `SessionRegistry` gains no HMR dependency — it remains a pure client-side state manager.

---

## File-by-file summary

| File | Change |
|---|---|
| `composables/slide-parser.ts` | **Deleted** |
| `vite.config.ts` | Replace eager startup logic with `server.ws.on('liveshell:spawn', ...)` handler; remove `findSlidesFile`, `gray-matter`, `discoverSessions` |
| `types.ts` | Remove `autoManage` from `TerminalDeckConfig`; add `manual` to `TerminalProps` |
| `components/Terminal.vue` | Add `requestSpawn` step in `watch(isActive)` before `connectSession`; add `manual` prop |
| `__tests__/vitePlugin.spec.ts` | Remove `discoverSessions` tests; add spawn-request handler tests |
| `composables/useTerminalSession.ts` | No structural changes; `connectSession` receives a confirmed port |
