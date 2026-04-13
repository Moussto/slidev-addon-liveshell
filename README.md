<div align="center">

# slidev-addon-liveshell

**Live terminal sessions in your [Slidev](https://sli.dev) presentations.**<br>
No iframes. No screenshots. Real, interactive shells.

[![npm version](https://img.shields.io/npm/v/slidev-addon-liveshell?color=18181b&label=npm&labelColor=18181b&logo=npm&logoColor=white)](https://www.npmjs.com/package/slidev-addon-liveshell)
[![license](https://img.shields.io/github/license/Moussto/slidev-addon-liveshell?color=18181b&labelColor=18181b)](./LICENSE)
[![slidev](https://img.shields.io/badge/slidev-%3E%3D0.50-18181b?labelColor=18181b&logo=slidev&logoColor=white)](https://sli.dev)

Powered by [ttyd](https://github.com/tsl0922/ttyd) + [xterm.js](https://xtermjs.org/) &mdash; native WebSocket, zero iframes.

<!-- TODO: record ~10s GIF: navigate to slide, terminal spawns, type a command, output appears -->
<!-- ![demo](./docs/assets/demo.gif) -->

</div>

---

## Quick Start

### 1. Install ttyd

<table>
<tr><td><strong>macOS</strong></td><td><code>brew install ttyd</code></td></tr>
<tr><td><strong>Ubuntu / Debian</strong></td><td><code>apt install ttyd</code></td></tr>
<tr><td><strong>Arch</strong></td><td><code>pacman -S ttyd</code></td></tr>
<tr><td><strong>Windows</strong></td><td><code>scoop install ttyd</code></td></tr>
</table>

### 2. Add the addon

```bash
npm install slidev-addon-liveshell
```

### 3. Enable it in your frontmatter

```yaml
---
addons:
  - liveshell
---
```

### 4. Drop a terminal on any slide

```markdown
# Demo

<Terminal />
```

That's it. The plugin spawns ttyd when you navigate to the slide and cleans up on server shutdown.

<!-- TODO: record ~5s GIF: arrive on slide from previous, terminal appears with prompt ready -->
<!-- ![auto-spawn](./docs/assets/auto-spawn.gif) -->

---

## Features

<table>
<tr>
<td width="50%">

### Persistent Sessions

Keep the shell alive across slides. Navigate away and back &mdash; your history survives.

```markdown
<!-- Slide 3 -->
<Terminal session="api" persist />

<!-- Slide 5 — same session -->
<Terminal session="api" persist />
```

The xterm DOM is moved between slides via `appendChild`. No reconnect, no flicker.

</td>
<td width="50%">

<!-- TODO: record ~8s GIF: type in terminal → next slide → back → output still there -->
<!-- ![persist](./docs/assets/persist.gif) -->

</td>
</tr>
<tr>
<td width="50%">

### Multiple Terminals

Any CSS layout works. Each terminal auto-fits its container.

```markdown
<div class="grid grid-cols-2 gap-4 h-80">
  <Terminal session="server" persist />
  <Terminal session="client" persist />
</div>
```

</td>
<td width="50%">

<!-- TODO: record ~6s GIF: two side-by-side terminals, type in each -->
<!-- ![multi](./docs/assets/multi-terminal.gif) -->

</td>
</tr>
<tr>
<td width="50%">

### Manual Mode

Run ttyd yourself when you need custom flags or a remote host.

```bash
ttyd -W -p 9000 bash
```

```markdown
<Terminal manual host="localhost" :port="9000" />
```

</td>
<td width="50%">

### Dark / Light Theme

Follows Slidev's dark mode automatically. Override with CSS variables or a partial theme object:

```markdown
<Terminal :options="{
  theme: {
    background: '#0d1117',
    cursor: '#58a6ff'
  }
}" />
```

</td>
</tr>
</table>

### Error Handling

When ttyd isn't reachable, the component shows a self-contained error overlay with the address, the command to start ttyd, and a **Retry** button. A broken terminal never breaks a slide.

<!-- TODO: screenshot of the error overlay ("Terminal Unavailable", retry button) -->
<!-- ![error-overlay](./docs/assets/error-overlay.png) -->

---

## Component Props

| Prop | Type | Default | Description |
|:-----|:-----|:--------|:------------|
| `session` | `string` | auto | Stable session identifier. Same name = shared connection. |
| `persist` | `boolean` | `false` | Keep WebSocket and shell alive across slide navigation. |
| `manual` | `boolean` | `false` | Skip auto-spawn. Connect directly to a user-managed ttyd. |
| `host` | `string` | `'localhost'` | ttyd hostname. |
| `port` | `number` | from deck config | ttyd port. Auto-assigned in managed mode. |
| `path` | `string` | `'/ws'` | ttyd WebSocket path. |
| `rows` | `number` | auto-fit | Fixed rows. Disables auto-fit when set. |
| `cols` | `number` | auto-fit | Fixed columns. Disables auto-fit when set. |
| `options` | `ITerminalOptions` | `{}` | xterm.js options. Deep-merged over deck defaults. |

---

## Deck Configuration

Set defaults for all terminals in your frontmatter:

```yaml
---
terminal:
  defaultPort: 8085
  defaultShell: zsh
  ttydPath: ttyd
  options:
    fontSize: 16
    cursorBlink: true
    fontFamily: "'JetBrains Mono', monospace"
---
```

<details>
<summary><strong>Configuration reference</strong></summary>

| Key | Type | Default | Description |
|:----|:-----|:--------|:------------|
| `defaultPort` | `number` | `8085` | Starting port for auto-assigned sessions. |
| `defaultShell` | `string` | `'zsh'` | Shell passed to ttyd. |
| `ttydPath` | `string` | `'ttyd'` | Path to ttyd binary. |
| `options` | `ITerminalOptions` | `{}` | Deck-wide xterm.js defaults. |

**Merge order** (later wins): built-in defaults + dark/light theme &rarr; deck `terminal.options` &rarr; per-component `options` prop. Theme colors are deep-merged separately &mdash; partial overrides won't wipe the base palette.

</details>

---

## Theming

### CSS Variables

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

### xterm.js Theme Object

For full color control, pass a theme via the `options` prop:

<details>
<summary><strong>Example: GitHub Dark theme</strong></summary>

```markdown
<Terminal :options="{
  theme: {
    background: '#0d1117',
    foreground: '#e6edf3',
    cursor: '#58a6ff',
    selectionBackground: 'rgba(88,166,255,0.2)',
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
  }
}" />
```

</details>

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Browser                                             │
│                                                      │
│  Terminal.vue ──requestSpawn()──→ Vite HMR WebSocket │
│       │                               │              │
│       │  ◄──liveshell:spawned─────────┘              │
│       │       (confirmed port)                       │
│       ▼                                              │
│  xterm.js ◄──WebSocket ('tty')──→ ttyd :8085         │
│              binary protocol        │                │
│                                     ▼                │
│                                   zsh / bash         │
└──────────────────────────────────────────────────────┘
```

1. Slide becomes active &rarr; `<Terminal>` sends `liveshell:spawn` over Vite HMR
2. Vite plugin spawns ttyd, probes the port until ready, replies with confirmed port
3. Component opens a direct WebSocket to ttyd using the [ttyd binary protocol](docs/ttyd-websocket-protocol.md)
4. `persist` sessions keep the socket open across slides; the xterm DOM is reparented on navigation
5. All ttyd processes are killed on dev server shutdown

---

## Known Issues

> **Workaround for most issues below:** always set an explicit `session` prop.

| Issue | Impact | Workaround |
|:------|:-------|:-----------|
| Session ID collision | Two `<Terminal />` on the same slide share one connection | Pass unique `session` props |
| `currentPage` ref unwrap | Auto-generated IDs are identical across slides | Use explicit `session` prop |
| `disconnectSession` state race | `socket.onclose` overwrites state after disconnect | Reconnect via Retry button |
| `connectSession` error handling | If xterm.js import fails, state stuck at CONNECTING | Reload the page |
| `waitForPort` timeout orphans ttyd | Timed-out processes not killed | Restart dev server |
| Silent `socket.onerror` | Connection errors not logged | Check ttyd is running |
| `retry` unhandled rejection | Retry can fail silently | Click Retry again |

---

## Roadmap

### Next up
- [ ] Fix session ID generation (collision + ref unwrap)
- [ ] "Connecting" spinner state
- [ ] Client-side connection timeout (3s)
- [ ] Socket error logging
- [ ] Retry backoff with button disable

### Planned
- [ ] Terminal height in flow layouts
- [ ] `command` prop &mdash; auto-type on connect
- [ ] Copy/paste and search via xterm.js addons

### Future
- [ ] **Standalone spawn server** &mdash; Terminals in `slidev build` SPAs and Docker deployments
- [ ] **Export/PDF fallback** &mdash; `#fallback` slot or asciicast replay for non-dev modes
- [ ] **Node.js PTY backend** &mdash; Replace ttyd with `node-pty`
- [ ] **Session recording** &mdash; Asciicast capture for sharing

---

<div align="center">

MIT License

</div>
