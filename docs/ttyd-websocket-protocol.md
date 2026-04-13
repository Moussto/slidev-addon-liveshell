# ttyd WebSocket Protocol

How the browser talks to a terminal session through ttyd.

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Slidev)                         │
│                                                                 │
│  ┌──────────────┐    WebSocket (binary)    ┌─────────────────┐  │
│  │              │ ◄──────────────────────► │                 │  │
│  │   xterm.js   │   port 8085, path /ws    │   ttyd server   │  │
│  │  (renderer)  │   subprotocol: 'tty'     │  (C binary)     │  │
│  │              │                          │                 │  │
│  └──────────────┘                          └────────┬────────┘  │
│    Renders terminal                                 │           │
│    output as a canvas                               │           │
│                                                     │           │
│                                              ┌──────┴───────┐  │
│                                              │   PTY (zsh)  │  │
│                                              │  Real shell  │  │
│                                              └──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

When you type in a terminal, here's what happens:

1. **xterm.js** captures your keystrokes in the browser
2. Our code wraps them in ttyd's binary protocol and sends them over **WebSocket**
3. **ttyd** receives the bytes and writes them to a **PTY** (pseudo-terminal)
4. The **shell** (zsh/bash) running inside the PTY processes the input
5. The shell's output flows back: PTY → ttyd → WebSocket → our code → xterm.js renders it

Without ttyd, there's no way to bridge a browser to a real terminal. xterm.js is just a renderer — it doesn't know how to talk to a shell. ttyd provides the bridge via WebSocket.

## Why We Need a Protocol at All

WebSocket is a raw bidirectional byte pipe. Both sides need to agree on how to interpret the bytes. You can't just dump raw terminal data into the WebSocket because:

- **The server needs to distinguish input types**: Is the client sending keystrokes? Or telling the server to resize the terminal? These are fundamentally different operations.
- **The client needs to distinguish output types**: Is the server sending terminal output? Or metadata like a window title?

ttyd solves this with a minimal framing protocol: **the first byte of every message is a type tag**.

## The Protocol

Every WebSocket message is a binary frame. The first byte identifies the message type. The rest is the payload.

### Connection Handshake

The handshake has three mandatory steps. Skip any of them and the terminal won't work.

```
Browser                                          ttyd
   │                                               │
   │  1. WebSocket handshake                       │
   │     URL: ws://localhost:8085/ws               │
   │     Subprotocol: 'tty'  ◄── REQUIRED          │
   │──────────────────────────────────────────────►│
   │                                               │
   │     Connection established                    │
   │◄──────────────────────────────────────────────│
   │                                               │
   │  2. Auth token (even if auth is disabled)     │
   │     {"AuthToken": ""}   ◄── REQUIRED          │
   │──────────────────────────────────────────────►│
   │                                               │
   │     '1' + window title  (SET_WINDOW_TITLE)    │
   │◄──────────────────────────────────────────────│
   │                                               │
   │     '2' + JSON prefs    (SET_PREFERENCES)     │
   │◄──────────────────────────────────────────────│
   │                                               │
   │  3. Initial resize                            │
   │     '1' + {"columns":N,"rows":N}  ◄── REQUIRED│
   │──────────────────────────────────────────────►│
   │                                               │
   │     ttyd spawns PTY with given dimensions     │
   │                                               │
   │     '0' + shell prompt  (OUTPUT)              │
   │◄──────────────────────────────────────────────│
   │                                               │
   │  Ready for interaction                        │
   │                                               │
```

#### Step 1: WebSocket Subprotocol

```javascript
new WebSocket('ws://localhost:8085/ws', ['tty'])
```

The `'tty'` subprotocol is mandatory. Without it, ttyd accepts the TCP connection but ignores all messages. This was our first bug — the connection appeared to work but nothing happened.

#### Step 2: Auth Token

```javascript
socket.send(JSON.stringify({ AuthToken: '' }))
```

Immediately after the socket opens, the client must send a JSON auth message. This is required **even when ttyd has no authentication configured** (the `-W` flag enables write access, not auth). ttyd's server-side state machine waits for this message before proceeding. Without it, ttyd sends the initial title/preferences but never spawns the PTY — so you get metadata but zero terminal output. This was our hardest bug to find: the WebSocket connected, we received config messages, but the terminal was completely unresponsive.

Note: This is sent as a **text frame** (a JSON string), not a binary frame. It's the only text message in the entire protocol.

#### Step 3: Initial Resize

```javascript
socket.send(encodeTtydResize(terminal.cols, terminal.rows))
```

ttyd needs to know the terminal dimensions before spawning the PTY. The shell needs to know how wide the terminal is for line wrapping, how tall for paging, etc. Without this message, ttyd has no PTY to attach — no output, no input processing.

This must be sent **after** the auth token and **after** the socket is open. In our implementation, we send both in the `onopen` handler:

```javascript
socket.onopen = () => {
  socket.send(JSON.stringify({ AuthToken: '' }))  // step 2
  socket.send(encodeTtydResize(cols, rows))        // step 3
}
```

### Server → Client Messages

| First byte | ASCII | Name             | Payload                           | Purpose                              |
|------------|-------|------------------|-----------------------------------|--------------------------------------|
| `0x30`     | `'0'` | OUTPUT           | Raw terminal bytes (Uint8Array)   | Shell output to render in xterm.js   |
| `0x31`     | `'1'` | SET_WINDOW_TITLE | UTF-8 string                      | Update the terminal window title     |
| `0x32`     | `'2'` | SET_PREFERENCES  | JSON string                       | Terminal config (sent once on connect)|

#### OUTPUT (`'0'`)

This is 99% of the traffic. Every byte the shell writes to stdout/stderr gets wrapped in this message type and sent to the browser.

```
Message:  [ 0x30 | 0x1B 0x5B 0x33 0x32 0x6D 0x68 0x65 0x6C 0x6C 0x6F ]
           type    └──── payload: ESC[32mhello (green "hello") ────────┘
```

The payload contains raw terminal escape sequences (ANSI codes for colors, cursor movement, etc.). xterm.js knows how to interpret these — we just pass the bytes through.

#### SET_WINDOW_TITLE (`'1'`)

Sent when the shell updates its title (e.g., showing the current directory in the title bar).

```
Message:  [ 0x31 | 0x7A 0x73 0x68 ]
           type    └── payload: "zsh" ──┘
```

#### SET_PREFERENCES (`'2'`)

Sent once during the handshake. Contains ttyd's client-side configuration as JSON.

```
Message:  [ 0x32 | {"fontSize":14} ]
           type    └── JSON config ──┘
```

### Client → Server Messages

| First byte | ASCII | Name    | Payload                              | Purpose                        |
|------------|-------|---------|--------------------------------------|--------------------------------|
| `0x30`     | `'0'` | INPUT   | Raw keystroke bytes (UTF-8 encoded)  | User typing in the terminal    |
| `0x31`     | `'1'` | RESIZE  | JSON: `{"columns":N,"rows":N}`       | Terminal window was resized    |

Note: INPUT and OUTPUT share the same type byte (`'0'` / `0x30`). This is not a collision — the direction of the message disambiguates. Client→Server `'0'` is always input; Server→Client `'0'` is always output.

#### INPUT (`'0'`)

Every keystroke gets sent as an INPUT message.

```
Typing "ls" + Enter:

Message 1: [ 0x30 | 0x6C ]         → 'l'
Message 2: [ 0x30 | 0x73 ]         → 's'
Message 3: [ 0x30 | 0x0D ]         → Enter (carriage return)
```

Note: xterm.js batches keystrokes via its `onData` callback, so you might see `[ 0x30 | 0x6C 0x73 0x0D ]` as a single message.

#### RESIZE (`'1'`)

Sent when the terminal container changes size (e.g., browser window resize, slide layout change). ttyd forwards this to the PTY so the shell adjusts its line wrapping.

```
Message:  [ 0x31 | {"columns":120,"rows":30} ]
           type    └──── JSON payload ────────┘
```

## A Complete Interaction

```
Browser                                          ttyd / PTY
   │                                               │
   │  ─── WS Connect (subprotocol: 'tty') ──────► │
   │                                               │
   │  ─── {"AuthToken":""}  (auth handshake) ────► │  client authenticates
   │                                               │
   │  ◄─── '1' + "zsh"  (window title) ────────── │  ttyd sends title
   │  ◄─── '2' + {"fontSize":14}  (preferences) ─ │  ttyd sends config
   │                                               │
   │  ─── '1' + {"columns":99,"rows":24} ────────► │  client sends dimensions
   │                                               │
   │  ◄─── '0' + "user@host:~$ "  (output) ────── │  PTY spawned, prompt appears
   │                                               │
   │  ─── '0' + "l"  (input) ────────────────────► │  user types 'l'
   │  ◄─── '0' + "l"  (echo) ─────────────────── │  shell echoes back
   │                                               │
   │  ─── '0' + "s"  (input) ────────────────────► │  user types 's'
   │  ◄─── '0' + "s"  (echo) ─────────────────── │  shell echoes back
   │                                               │
   │  ─── '0' + "\r" (input) ────────────────────► │  user presses Enter
   │  ◄─── '0' + "\r\nfile1  file2\r\n"  ──────── │  ls output
   │  ◄─── '0' + "user@host:~$ "  ─────────────── │  new prompt
   │                                               │
```

## Pitfalls We Hit During Implementation

### Pitfall 1: ASCII vs Binary Type Bytes

ttyd uses ASCII character codes for message types:

```
'0' = 0x30 = 48 in decimal
'1' = 0x31 = 49 in decimal
'2' = 0x32 = 50 in decimal
```

NOT:

```
0x00 = 0 in decimal  ← WRONG
0x01 = 1 in decimal  ← WRONG
0x02 = 2 in decimal  ← WRONG
```

**Symptom:** WebSocket connected, messages arrived, but `decodeTtydMessage` returned `type: "unknown"` for every message. Terminal rendered but showed nothing.

**Root cause:** We implemented the protocol using binary values (0x00, 0x01, 0x02) instead of ASCII characters (0x30, 0x31, 0x32). The ttyd documentation in `protocol.h` uses C character literals (`'0'`, `'1'`, `'2'`), which are ASCII codes.

### Pitfall 2: Missing Auth Token

**Symptom:** WebSocket connected, received SET_WINDOW_TITLE and SET_PREFERENCES messages, but zero OUTPUT messages. Terminal stayed blank — no shell prompt, no response to keystrokes.

**Root cause:** ttyd requires `{"AuthToken":""}` as the first client message, even with no authentication configured. Without it, ttyd's state machine stays in the "waiting for auth" phase. It sends metadata (title/preferences are sent before auth is validated) but never spawns the PTY.

**Why it's non-obvious:** The WebSocket connection succeeds. You receive messages. There are no errors. Everything looks healthy — except the terminal does nothing. The only clue is the absence of OUTPUT messages.

### Pitfall 3: Missing Initial Resize

**Symptom:** Even after sending the auth token, no OUTPUT messages appeared.

**Root cause:** ttyd defers PTY creation until it knows the terminal dimensions. It needs a RESIZE message from the client to set the PTY's rows and columns. Our code set up the `terminal.onResize` handler, but that only fires on **changes** — the initial size was already set before the WebSocket was open.

**Fix:** Explicitly send the current dimensions in `onopen`, right after the auth token.

### Pitfall 4: WebSocket Subprotocol

**Symptom:** WebSocket connected but ttyd ignored all messages. No output, no response, no errors.

**Root cause:** `new WebSocket(url)` without the `['tty']` subprotocol. ttyd accepts the connection at the TCP level but doesn't activate its terminal protocol handler.

**Fix:** `new WebSocket(url, ['tty'])`

## Our Implementation

The protocol implementation lives in `composables/useTerminalSession.ts`:

```
encodeTtydInput(input)       →  Prepend 0x30 ('0') + UTF-8 encoded input
encodeTtydResize(cols, rows) →  Prepend 0x31 ('1') + JSON {"columns":N,"rows":N}
decodeTtydMessage(data)      →  Read first byte, dispatch to output/title/config
```

The connection handshake (auth + initial resize) lives in the `connectSession` function's `onopen` handler.

These are the only places in the codebase that know about ttyd's protocol. Everything else works with higher-level abstractions (xterm.js Terminal instances, session state machines).

## What ttyd Handles For Us

ttyd does a lot of heavy lifting that we don't need to implement:

- **PTY management**: Creating, resizing, and destroying pseudo-terminals
- **Shell lifecycle**: Starting the shell process, handling signals (SIGHUP on disconnect)
- **Authentication**: Optional token-based auth (we disable this with `-W`)
- **Multiple clients**: ttyd can serve multiple WebSocket clients to the same PTY
- **HTTP serving**: The built-in web UI at `http://localhost:PORT`
- **Terminal type**: Sets `TERM=xterm-256color` for proper color support

## Reference

- ttyd source: https://github.com/tsl0922/ttyd
- Protocol definition: `src/protocol.h` in the ttyd repo
- ttyd's own client: `html/src/components/terminal/index.tsx`
- xterm.js API: https://xtermjs.org/docs/api/terminal/classes/Terminal/
