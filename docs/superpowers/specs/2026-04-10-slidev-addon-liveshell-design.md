# slidev-addon-liveshell — Design Spec

A Slidev addon that embeds live terminal sessions in slides using native xterm.js connected to ttyd via WebSocket.

## Goals

- Provide a `<Terminal />` component for embedding live, interactive terminal sessions in Slidev presentations
- Support named sessions, persistence across slides, and multiple terminals per slide
- Two operation modes: manual (user runs ttyd) and auto-managed (plugin spawns ttyd)
- Full xterm.js options passthrough with sensible defaults
- Community-facing: polished DX, clear errors, cross-platform

## Package Structure

```
slidev-addon-liveshell/
├── package.json
├── components/
│   └── Terminal.vue              # Main public component
├── composables/
│   ├── useTerminalSession.ts     # Session registry & lifecycle
│   └── useTerminalOptions.ts     # Options merging (defaults + user)
├── setup/
│   └── main.ts                   # Global plugin state initialization
├── vite.config.ts                # Auto-managed mode (ttyd spawning)
├── styles/
│   └── index.css                 # xterm.js base styles + slide integration
├── global-bottom.vue             # Renders persistent sessions off-screen
├── types.ts                      # Public TypeScript interfaces
└── README.md
```

### package.json

```json
{
  "name": "slidev-addon-liveshell",
  "keywords": ["slidev-addon", "slidev"],
  "engines": { "slidev": ">=0.50.0" },
  "slidev": {
    "defaults": {
      "terminal": {
        "autoManage": false,
        "defaultShell": "zsh",
        "defaultPort": 8085,
        "ttydPath": "ttyd"
      }
    }
  },
  "dependencies": {
    "@xterm/xterm": "5.5.0",
    "@xterm/addon-fit": "0.10.0",
    "@xterm/addon-web-links": "0.11.0",
    "@xterm/addon-webgl": "0.18.0"
  }
}
```

### User consumption

```markdown
---
addons:
  - liveshell
terminal:
  autoManage: true
  defaultShell: bash
  defaultPort: 9000
---
```

## Component API

Single public component: `<Terminal />`.

### Props

```typescript
interface TerminalProps {
  // Session identity
  session?: string        // Named session key. Default: auto-generated from slide page + port
  persist?: boolean       // Keep alive across slide navigation. Default: false

  // Connection
  host?: string           // ttyd host. Default: 'localhost'
  port?: number           // ttyd port. Default: from deck config (8085)
  path?: string           // ttyd WebSocket path. Default: '/ws'

  // Sizing
  rows?: number           // Fixed row count. Default: auto-fit to container
  cols?: number           // Fixed col count. Default: auto-fit to container

  // xterm.js passthrough
  options?: object        // Merged over defaults, passed to xterm.js Terminal constructor
}
```

### Options merge order (lowest to highest priority)

1. Plugin built-in defaults (dark theme, fit addon, web links)
2. Deck-level `terminal.options` from frontmatter
3. Per-component `:options` prop

### Usage examples

```markdown
<!-- Simplest: connects to default ttyd at localhost:8085 -->
<Terminal />

<!-- Named persistent session -->
<Terminal session="api-server" persist />

<!-- Full customization -->
<Terminal
  session="demo"
  port="9001"
  :rows="30"
  :cols="120"
  :options="{ fontSize: 16, cursorBlink: true, fontFamily: 'Fira Code' }"
/>

<!-- Multiple terminals on one slide -->
<div class="grid grid-cols-2 gap-4 h-full">
  <Terminal session="server" persist />
  <Terminal session="client" persist />
</div>
```

## Session Registry & Lifecycle

### State machine

```
IDLE → CONNECTING → CONNECTED
                        ↓
                   (navigate away)
                        ↓
              persist=true  persist=false
                   ↓            ↓
            CONNECTED(kept)   DESTROYED
         (socket stays open,
          DOM stays in slide
          container hidden by
          Slidev's v-show)

CONNECTING → DISCONNECTED (WebSocket failed)
                   ↓
              Error overlay with Retry button
                   ↓ (user clicks Retry)
              IDLE → CONNECTING → ...
```

### Registry (singleton via provide/inject)

```typescript
interface SessionEntry {
  id: string
  state: SessionState   // IDLE | CONNECTING | CONNECTED | DISCONNECTED | DESTROYED
  persist: boolean
  terminal: Terminal | null
  socket: WebSocket | null
  config: ResolvedTerminalConfig
  mountTarget: HTMLElement | null
  refCount: number
}

// Plain Map with reactive() per entry for Vue tracking
const sessions = new Map<string, SessionEntry>()
```

### Lifecycle rules

1. **First `<Terminal session="X">` mounts** — creates entry, instantiates xterm.js, opens WebSocket, renders into container.
2. **Same `session="X"` on different slide with `persist`** — on leave, the socket stays open and the DOM stays in the (now v-show-hidden) slide container. On enter, the xterm DOM element is moved to the new slide's container. WebSocket stays open throughout.
3. **Navigate away, `persist=false`** — WebSocket closed, xterm.js disposed, session removed.
4. **Navigate away, `persist=true`** — nothing. Socket and terminal stay alive inside the hidden slide container.
5. **WebSocket fails** — state → DISCONNECTED. Error overlay shows with ttyd command hint and a Retry button. No automatic retry (keeps it simple and avoids infinite reconnect loops).
6. **Deck teardown** — all sessions destroyed. Normal browser cleanup.

### Why DOM-move for persistence

xterm.js doesn't handle DOM detach/reattach cleanly. Slidev keeps all preloaded slide components mounted simultaneously (hidden via `v-show`), so the xterm DOM element survives in the hidden slide's container between visits. On slide enter, the element is physically moved (`appendChild`) into the newly active slide's container so it becomes visible.

## Auto-Managed Mode (Vite Plugin)

When `terminal.autoManage: true`, the `vite.config.ts` plugin manages ttyd process lifecycle.

### Eager session discovery

At `slidev dev` startup, the Vite plugin:
1. Parses all slide source files
2. Finds every `<Terminal>` component usage
3. Extracts `session` and `port` props
4. Spawns one ttyd process per unique session+port combo

### ttyd spawning

```typescript
spawn(ttydPath, [
  '-W',                           // Writable (interactive)
  '-p', String(port),
  '-t', 'disableReconnect=true',  // Plugin handles reconnect
  shell
])
```

### Port allocation

- Default port from deck config (8085), auto-incremented per additional session
- Explicit `port` prop overrides auto-allocation
- Port conflicts detected at startup with clear error

### Client-server communication

Via Vite's built-in HMR WebSocket:

```typescript
// Server → Client
server.ws.send('terminal:status', {
  sessions: {
    'api-server': { port: 8085, pid: 12345, state: 'running' },
    'client': { port: 8086, pid: 12346, state: 'running' }
  }
})

// Client listens
import.meta.hot.on('terminal:status', (data) => { ... })
```

### Process cleanup

On Vite dev server shutdown: `SIGKILL` all child processes immediately via `process.on('exit')` (most reliable hook — always fires). SIGINT/SIGTERM handlers call `process.exit()` to ensure the exit hook runs. No PID file or external state — cleanup is purely in-memory.

**Note:** `defineVitePluginsSetup` from `@slidev/types` does not exist in Slidev 0.50. The plugin runs as a standard Vite plugin via the addon's `vite.config.ts`, which Slidev auto-loads. It reads slide markdown directly from disk (Slidev does not expose its parsed config to addon Vite plugins).

## ttyd WebSocket Protocol

See [docs/ttyd-websocket-protocol.md](../../ttyd-websocket-protocol.md) for the full protocol reference.

Key points:
- Type bytes are ASCII characters (`'0'`=0x30, `'1'`=0x31, `'2'`=0x32), not binary (0x00, 0x01, 0x02)
- Connection requires `['tty']` WebSocket subprotocol
- Client must send `{"AuthToken":""}` immediately on connect (even without auth configured)
- Client must send initial RESIZE before ttyd will spawn the PTY
- Protocol is implemented in `useTerminalSession.ts` — thin enough to not warrant a separate abstraction

## Styling & Theme Integration

### CSS variables

The plugin exposes custom properties for container styling:

```css
:root {
  --slidev-terminal-bg: #1e1e1e;
  --slidev-terminal-fg: #d4d4d4;
  --slidev-terminal-cursor: #aeafad;
  --slidev-terminal-selection: rgba(255, 255, 255, 0.3);
  --slidev-terminal-border: none;
  --slidev-terminal-border-radius: 8px;
  --slidev-terminal-font-family: 'Fira Code', 'Cascadia Code', monospace;
  --slidev-terminal-font-size: 14px;
}
```

### Responsibilities split

- **CSS variables** → container (background, border, radius)
- **xterm.js `options`** → terminal canvas (font, cursor, colors)
- Plugin defaults read CSS variable values and pass them into xterm.js at init, keeping them in sync unless explicitly overridden via `options` prop

### Dark/light mode

Reads Slidev's `useDarkMode()` and swaps between two built-in color palettes. Users can override via CSS variables or `options` prop.

### Sizing

`@xterm/addon-fit` handles responsive auto-sizing. Terminal fills its container. Users control size via container CSS (e.g., Tailwind/UnoCSS classes). `rows`/`cols` props override auto-fit when set.

## Error Handling

**Principle:** A broken terminal never breaks a slide. Every error is contained within the component container with a clear message and actionable next step.

| Scenario | User sees |
|---|---|
| ttyd not running (manual mode) | Overlay: "Cannot connect to terminal at localhost:8085" + `ttyd -W -p 8085 zsh` command + Retry button |
| ttyd binary not found (auto mode) | Console: per-OS install instructions (brew, apt, pacman, scoop) |
| Port conflict (auto mode) | Console: error from ttyd stderr |
| WebSocket drops mid-session | State → DISCONNECTED, error overlay with Retry |

### Server-side logging (auto-managed mode)

- Session start: `[liveshell] Session "name" running on port N (PID: N)`
- Session stop: `[liveshell] Session "name" exited (code: N)`
- ttyd not found: install instructions for each OS
- ttyd stderr errors logged with session name prefix

## Scope Boundaries (NOT in v1)

- No Docker/SSH/remote host support
- No tmux/screen persistence across dev server restarts
- No recording/playback (separate concern, see slidev-addon-asciinema)
- No node-pty alternative backend (ttyd binary is a prerequisite)
- No lazy session spawning (eager only)
