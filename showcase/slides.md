---
theme: default
addons:
  - liveshell
terminal:
  defaultPort: 8085
  defaultShell: zsh
  options:
    fontSize: 14
title: slidev-addon-liveshell
---

# slidev-addon-liveshell

Embed live, interactive terminal sessions in your Slidev presentations.

Powered by **ttyd** + **xterm.js** — native WebSocket, no iframes.

<div class="mt-6 text-sm opacity-50">
  Terminal sessions are spawned on demand when you navigate to a slide.
</div>

---
layout: two-cols
layoutClass: gap-8
---

# Getting Started

Add to your slides frontmatter:

```yaml
---
addons:
  - liveshell
terminal:
  defaultShell: zsh
---
```

Then place `<Terminal />` anywhere on a slide. The plugin spawns ttyd on demand when you navigate to the slide.

::right::

<div class="h-72 mt-8">
  <Terminal session="basic" persist />
</div>

---
layout: two-cols
layoutClass: gap-8
---

# Named Sessions

Use `session` to give a terminal a stable identity:

```markdown
<Terminal session="api-server" />
```

- Two components with the same name **share one connection**
- Each unique session gets its own ttyd process
- Omit `session` and it's auto-generated from slide number + port

Use `persist` to keep the connection alive when you leave the slide:

```markdown
<Terminal session="api-server" persist />
```

::right::

<div class="h-72 mt-8">
  <Terminal session="named-demo" persist />
</div>

---
layout: two-cols
layoutClass: gap-8
---

# Persistent Sessions — Slide 1

Type something in the terminal, then navigate to the next slide and come back.

```markdown
<Terminal session="persist-demo" persist />
```

The WebSocket stays open. The shell process keeps running. Your history survives.

<div class="mt-4 text-sm px-3 py-2 rounded bg-green-500 bg-opacity-15 border border-green-500 border-opacity-40">
  → Navigate to the next slide, then come back.
</div>

::right::

<div class="h-72 mt-8">
  <Terminal session="persist-demo" persist />
</div>

---
layout: two-cols
layoutClass: gap-8
---

# Persistent Sessions — Slide 2

Same `session="persist-demo"`. The terminal moved seamlessly between containers.

```markdown
<!-- slide 1 -->
<Terminal session="persist-demo" persist />

<!-- slide 2 — same session, different slide -->
<Terminal session="persist-demo" persist />
```

Under the hood: the xterm DOM element is moved via `appendChild` into the active slide's container on each navigation. No reconnect, no flicker.

::right::

<div class="h-72 mt-8">
  <Terminal session="persist-demo" persist />
</div>

---

# Multiple Terminals

Any CSS layout works. Terminals auto-fit to their container.

```markdown
<div class="grid grid-cols-2 gap-4 h-72">
  <Terminal session="server" persist />
  <Terminal session="client" persist />
</div>
```

<div class="grid grid-cols-2 gap-4 h-64 mt-4">
  <Terminal session="server" persist />
  <Terminal session="client" persist />
</div>

---
layout: two-cols
layoutClass: gap-8
---

# xterm.js Options

Pass any xterm.js constructor option via the `options` prop. It deep-merges over the built-in defaults and deck-level config.

```markdown
<Terminal
  session="custom"
  :options="opts"
/>
```

Set deck-wide defaults in frontmatter — all terminals inherit them:

```yaml
terminal:
  options:
    fontSize: 15
    cursorBlink: true
```

<script setup>
const opts = {
  fontSize: 16,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
  cursorStyle: 'block',
  cursorBlink: true,
}
</script>

::right::

<div class="h-72 mt-8">
  <Terminal session="custom-opts" persist :options="opts" />
</div>

---
layout: two-cols
layoutClass: gap-8
---

# CSS Theming

Override CSS variables to match your slide theme:

```css
:root {
  --slidev-terminal-bg: #0d1117;
  --slidev-terminal-fg: #e6edf3;
  --slidev-terminal-border-radius: 12px;
  --slidev-terminal-font-family:
    'JetBrains Mono', monospace;
}
```

Or pass a partial `theme` object — it deep-merges over the built-in dark/light palette so unset colors fall back gracefully:

```markdown
<Terminal :options="{ theme: { background: '#0d1117' } }" />
```

<script setup>
const themedOpts = {
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
  },
}
</script>

::right::

<div class="h-72 mt-8" style="--slidev-terminal-border-radius: 12px;">
  <Terminal session="themed" persist :options="themedOpts" />
</div>

---
layout: two-cols
layoutClass: gap-8
---

# Error Handling

When ttyd isn't reachable, the terminal shows a contained error overlay — the rest of the slide is unaffected.

- Shows the address it tried to connect to
- Shows the exact `ttyd` command to start a session
- **Retry** button — no automatic reconnect loop

```markdown
<!-- manual mode: user starts ttyd themselves -->
<Terminal manual host="localhost" port="9001" />
```

<div class="text-sm opacity-60 mt-4">
  This state appears when ttyd isn't installed, crashes, or exits unexpectedly.
</div>

::right::

<!-- Visual replica of the error overlay -->
<div class="h-72 mt-8 rounded-lg overflow-hidden relative" style="background: #1e1e1e; font-family: 'Fira Code', monospace; font-size: 14px; color: #d4d4d4;">
  <div class="absolute inset-0 flex flex-col items-center justify-center gap-3">
    <div class="font-semibold" style="font-size: 1.1em;">Terminal Unavailable</div>
    <div class="opacity-80">Cannot connect to terminal at localhost:9001</div>
    <div class="px-2 py-1 rounded text-sm" style="background: rgba(128,128,128,0.25); font-family: monospace;">
      ttyd -W -p 9001 zsh
    </div>
    <div class="px-4 py-1 rounded text-sm cursor-default" style="background: rgba(128,128,128,0.35); border-radius: 4px;">
      Retry
    </div>
  </div>
</div>

---
layout: center
class: text-center
---

# Full Configuration

```yaml
---
addons:
  - liveshell
terminal:
  defaultPort: 8085      # first port assigned
  defaultShell: zsh      # shell for spawned sessions
  ttydPath: ttyd         # path to ttyd binary
  options:               # deck-wide xterm.js defaults
    fontSize: 14
    cursorBlink: true
---
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `session` | `string` | auto | Session identifier |
| `persist` | `boolean` | `false` | Keep alive across navigation |
| `manual` | `boolean` | `false` | Skip auto-spawn, connect to user-managed ttyd |
| `host` | `string` | `'localhost'` | ttyd host |
| `port` | `number` | `8085` | ttyd port |
| `path` | `string` | `'/ws'` | WebSocket path |
| `rows` / `cols` | `number` | auto-fit | Fixed terminal dimensions |
| `options` | `ITerminalOptions` | `{}` | xterm.js passthrough |
