# Slidev-addon-liveshell

Live terminal sessions in your [Slidev](https://sli.dev) presentations -- powered by [ttyd](https://github.com/tsl0922/ttyd) + [xterm.js](https://xtermjs.org/), native WebSocket, no iframes.

I often do live presentations where I need to run commands or demo software from my terminal, alt-tabbing out of Slidev breaks the flow. This addon embeds a real shell directly in your slides.

[![npm version](https://img.shields.io/npm/v/slidev-addon-liveshell?style=for-the-badge&logo=npm&logoColor=white&labelColor=cb0000&color=18181b)](https://www.npmjs.com/package/slidev-addon-liveshell)
[![license](https://img.shields.io/github/license/Moussto/slidev-addon-liveshell?style=for-the-badge&labelColor=3da639&color=18181b)](./LICENSE)
[![slidev](https://img.shields.io/badge/slidev-%3E%3D0.50-18181b?style=for-the-badge&logo=slidev&logoColor=white&labelColor=2b90b6&color=18181b)](https://sli.dev)

![demo](https://raw.githubusercontent.com/Moussto/slidev-addon-liveshell/main/assets/main.gif)

## Getting started

```bash
# 1. Install ttyd (or with apt, pacman or scoop)
brew install ttyd

# 2. Add the addon
npm install slidev-addon-liveshell
```

```markdown
---
addons:
  - liveshell
---

# Demo

<Terminal />
```

The plugin spawns a ttyd process when you navigate to the slide and cleans it up on server shutdown.


## Features

### Persistent Sessions

Keep the shell alive across slides. Navigate away and back -- your history survives.

```markdown
<!-- Slide 3 -->
<Terminal session="api" persist />

<!-- Slide 5 — same session -->
<Terminal session="api" persist />
```

xterm DOM is moved between slides and the socket connection is kept.

![persist](https://raw.githubusercontent.com/Moussto/slidev-addon-liveshell/main/assets/persist.gif)

### Multiple Terminals

Any CSS layout works. Each terminal auto-fits its container.

```markdown
<div class="grid grid-cols-2 gap-4 h-80">
  <Terminal session="server" persist />
  <Terminal session="client" persist />
</div>
```

![side by side](https://raw.githubusercontent.com/Moussto/slidev-addon-liveshell/main/assets/sidebyside.gif)

### Slidev VDrag + Liveshell

Works with Slidev's [draggable](https://sli.dev/features/draggable) feature. Move terminals anywhere on your slide.

```markdown
<v-drag>
  <Terminal session="demo" persist />
</v-drag>
```

![drag](https://raw.githubusercontent.com/Moussto/slidev-addon-liveshell/main/assets/drag.gif)

### Themes

Follows Slidev's dark mode automatically. Override with CSS variables or a partial theme object:

```markdown
<Terminal :options="{
  theme: {
    background: '#0d1117',
    cursor: '#58a6ff'
  }
}" />
```

![themes](https://raw.githubusercontent.com/Moussto/slidev-addon-liveshell/main/assets/themes.png)

### Also

**Manual mode** -- skip auto-spawn and connect to your own ttyd instance. Useful for custom flags or remote hosts.

```bash
ttyd -W -p 9000 bash
```

```markdown
<Terminal manual host="localhost" :port="9000" />
```

**Ephemeral sessions** (default) -- the ttyd process is killed when you leave the slide. A fresh shell spawns when you return.

```markdown
<Terminal />
```

## API

```markdown
<Terminal
  session="api"                    <!-- shared session id -->
  persist                          <!-- survive slide navigation -->
  host="localhost"                 <!-- ttyd host -->
  :port="9000"                     <!-- ttyd port -->
  :options="{ fontSize: 16 }"     <!-- xterm.js overrides -->
/>
```

> [!TIP]
> **Merge order** (later wins): built-in defaults + dark/light theme &rarr; deck `terminal.options` &rarr; per-component `options` prop. Theme colors are deep-merged separately -- partial overrides won't wipe the base palette.

<details>
<summary><strong>Component Props reference</strong></summary>

| Prop | Type | Default | Description |
|:-----|:-----|:--------|:------------|
| `session` | `string` | auto | Stable session identifier. Same name = shared connection. |
| `persist` | `boolean` | `false` | Keep WebSocket and shell alive across slide navigation. |
| `manual` | `boolean` | `false` | Skip auto-spawn. Connect to a user-managed ttyd. |
| `host` | `string` | `'localhost'` | ttyd hostname. |
| `port` | `number` | from deck config | ttyd port. Auto-assigned in managed mode. |
| `path` | `string` | `'/ws'` | ttyd WebSocket path. |
| `options` | `ITerminalOptions` | `{}` | [xterm.js options](https://xtermjs.org/docs/api/terminal/interfaces/iterminaloptions/). Deep-merged over deck defaults. |

</details>

<details>
<summary><strong>Deck Configuration reference</strong></summary>

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

| Key | Type | Default | Description |
|:----|:-----|:--------|:------------|
| `defaultPort` | `number` | `8085` | Starting port for auto-assigned sessions. |
| `defaultShell` | `string` | `process.env.SHELL` | Shell passed to ttyd. |
| `ttydPath` | `string` | `'ttyd'` | Path to ttyd binary. |
| `options` | `ITerminalOptions` | `{}` | Deck-wide xterm.js defaults. |

</details>

<details>
<summary><strong>CSS Variables reference</strong></summary>

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

For full color control, pass a theme via the `options` prop:

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

## Showcase

A demo deck lives in [`showcase/`](./showcase/slides.md). Run it with:

```bash
npm run dev
```

## Known Issues & Ideas

- **No build/PDF export** -- terminals rely on Vite HMR, so they won't work in `slidev build` or `slidev export`. Looking into fallback options (`#fallback` slot? asciicast replay?)
- **Resize artifacts** -- small visual glitches can appear when resizing persisted sessions
- **Replace ttyd with node-pty?** -- removing the ttyd dependency would simplify install
- **Remote sessions** -- could this support remote shells or multiple presenters?

## License

[MIT](./LICENSE)
