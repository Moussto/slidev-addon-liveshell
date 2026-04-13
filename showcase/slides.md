---
theme: default
colorSchema: light
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

<div class="mt-8 text-sm text-gray-400">
  Terminal sessions are spawned on demand when you navigate to a slide.
</div>

---
class: flex flex-col
---

# Full-Slide Terminal

<p class="text-gray-500">Sometimes you just need a terminal</p>

<div class="flex-1 min-h-0 mt-3 rounded-xl shadow-lg border border-gray-200 overflow-hidden">
  <Terminal session="fullscreen" />
</div>

---
class: flex flex-col
---

# Side by Side

<p class="text-gray-500">Run two processes in parallel — a server and a client, build and tests, anything.</p>

<div class="grid grid-cols-2 gap-4 flex-1 min-h-0 mt-3">
  <div class="flex flex-col gap-2 min-h-0">
    <span class="text-xs font-semibold tracking-wide uppercase text-blue-500">Server</span>
    <div class="flex-1 min-h-0 rounded-xl shadow-lg border border-gray-200 overflow-hidden"><Terminal session="side-server" persist /></div>
  </div>
  <div class="flex flex-col gap-2 min-h-0">
    <span class="text-xs font-semibold tracking-wide uppercase text-violet-500">Client</span>
    <div class="flex-1 min-h-0 rounded-xl shadow-lg border border-gray-200 overflow-hidden"><Terminal session="side-client" persist /></div>
  </div>
</div>

---
layout: two-cols
layoutClass: gap-8
transition: slide-left
---

# Persistent — Page 1

<p class="text-gray-500">Type something in the terminal, then go to the next slide.</p>

```html
<Terminal session="persist-demo" persist />
```

The WebSocket stays open. The shell keeps running. Your scrollback survives.


::right::

<div class="h-full overflow-hidden py-4">
  <div class="h-full rounded-xl shadow-lg border border-gray-200 overflow-hidden">
    <Terminal session="persist-demo" persist />
  </div>
</div>

---
layout: two-cols
layoutClass: gap-8
transition: slide-left
---

# Persistent — Page 2

<p class="text-gray-500">Same <code>session="persist-demo"</code>. The xterm DOM was moved via <code>appendChild</code> — no reconnect, no flicker.</p>

```html
<!-- slide 1 -->
<Terminal session="persist-demo" persist />

<!-- slide 2 — same session -->
<Terminal session="persist-demo" persist />
```

::right::

<div class="h-full overflow-hidden py-4">
  <div class="h-full rounded-xl shadow-lg border border-gray-200 overflow-hidden">
    <Terminal session="persist-demo" persist />
  </div>
</div>


---
dragPos:
  floatingTerminal: 147,179,779,312
---

# Draggable Terminal

<p class="text-gray-500">Paired with Slidev's <code>VDrag</code> you can grab and reposition the terminal. Double-click to start dragging. ()</p>

<div class="text-lg leading-relaxed mt-4">

- **Drag the terminal** wherever you need it

</div>

<VDrag pos="floatingTerminal">
  <div class="h-full rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
    <Terminal session="floating" />
  </div>
</VDrag>

---
class: flex flex-col
---

# Toggle Terminal

<div class="flex flex-col items-center gap-4 flex-1 min-h-0">
  <p class="text-gray-500">Show or hide the terminal on demand. The session stays alive in the background.</p>

  <button @click="showTerminal = !showTerminal" class="px-5 py-2.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors cursor-pointer font-medium text-sm shadow-sm">{{ showTerminal ? 'Hide Terminal' : 'Show Terminal' }}</button>

  <div v-show="showTerminal" class="w-full flex-1 min-h-0 rounded-xl shadow-lg border border-gray-200 overflow-hidden">
    <Terminal session="reveal" />
  </div>
</div>

<script setup>
import { ref } from 'vue'
const showTerminal = ref(false)
</script>


---
class: flex flex-col
---

# Theme Gallery (Xterm Options)

<p class="text-gray-500 mb-3">Pass a <code>theme</code> object to restyle any terminal. Each one deep-merges over the base palette.</p>

<div class="grid grid-cols-2 gap-4 flex-1 min-h-0">
  <div class="flex flex-col gap-2 min-h-0">
    <span class="text-xs font-semibold tracking-wide uppercase text-gray-800">GitHub Dark</span>
    <div class="flex-1 min-h-0 rounded-xl shadow-lg border border-gray-200 overflow-hidden"><Terminal session="theme-github" :options="githubDark" /></div>
  </div>
  <div class="flex flex-col gap-2 min-h-0">
    <span class="text-xs font-semibold tracking-wide uppercase text-purple-600">Dracula</span>
    <div class="flex-1 min-h-0 rounded-xl shadow-lg border border-gray-200 overflow-hidden"><Terminal session="theme-dracula" :options="dracula" /></div>
  </div>
  <div class="flex flex-col gap-2 min-h-0">
    <span class="text-xs font-semibold tracking-wide uppercase text-yellow-700">Solarized Light</span>
    <div class="flex-1 min-h-0 rounded-xl shadow-lg border border-gray-200 overflow-hidden"><Terminal session="theme-solarized" :options="solarizedLight" /></div>
  </div>
  <div class="flex flex-col gap-2 min-h-0">
    <span class="text-xs font-semibold tracking-wide uppercase text-cyan-700">Nord</span>
    <div class="flex-1 min-h-0 rounded-xl shadow-lg border border-gray-200 overflow-hidden"><Terminal session="theme-nord" :options="nord" /></div>
  </div>
</div>

<script setup>
const githubDark = {
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  theme: {
    background: '#0d1117',
    black: '#484f58',
    blue: '#58a6ff',
    cursor: '#58a6ff',
    cyan: '#39c5cf',
    foreground: '#e6edf3',
    green: '#3fb950',
    magenta: '#bc8cff',
    red: '#ff7b72',
    selectionBackground: 'rgba(88,166,255,0.2)',
    white: '#b1bac4',
    yellow: '#d29922',
  },
}

const dracula = {
  fontSize: 13,
  fontFamily: "'Fira Code', monospace",
  theme: {
    background: '#282a36',
    black: '#21222c',
    blue: '#bd93f9',
    cursor: '#f8f8f2',
    cyan: '#8be9fd',
    foreground: '#f8f8f2',
    green: '#50fa7b',
    magenta: '#ff79c6',
    red: '#ff5555',
    selectionBackground: 'rgba(68,71,90,0.5)',
    white: '#f8f8f2',
    yellow: '#f1fa8c',
  },
}

const solarizedLight = {
  fontSize: 13,
  fontFamily: "'Menlo', 'Consolas', monospace",
  theme: {
    background: '#fdf6e3',
    black: '#073642',
    blue: '#268bd2',
    cursor: '#657b83',
    cyan: '#2aa198',
    foreground: '#657b83',
    green: '#859900',
    magenta: '#d33682',
    red: '#dc322f',
    selectionBackground: 'rgba(7,54,66,0.1)',
    white: '#eee8d5',
    yellow: '#b58900',
  },
}

const nord = {
  fontSize: 13,
  fontFamily: "'Cascadia Code', 'Fira Code', monospace",
  theme: {
    background: '#2e3440',
    black: '#3b4252',
    blue: '#81a1c1',
    cursor: '#d8dee9',
    cyan: '#88c0d0',
    foreground: '#d8dee9',
    green: '#a3be8c',
    magenta: '#b48ead',
    red: '#bf616a',
    selectionBackground: 'rgba(136,192,208,0.2)',
    white: '#e5e9f0',
    yellow: '#ebcb8b',
  },
}
</script>


---
layout: center
class: text-center
---

```bash
npm install slidev-addon-liveshell
```
