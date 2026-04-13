// ttyd communicates over a binary WebSocket (subprotocol 'tty').
// Every frame is: [1-byte type tag] + [payload bytes].
// Type tags are ASCII character codes ('0', '1', '2'), not raw binary values.
// The same tag means different things depending on direction:
//   0x30 ('0')  client→server: keyboard input    server→client: terminal output
//   0x31 ('1')  client→server: PTY resize         server→client: set window title
//   0x32 ('2')  server→client only: preferences/config push
// On connect, the client must send an auth token first (empty string if auth is disabled),
// then an initial resize frame so the PTY dimensions are set before any output arrives.

export interface TtydMessage {
  data?: string | Uint8Array
  type: 'config' | 'output' | 'title' | 'unknown'
}

const TTYD_DATA = 0x30              // '0' — input (client→server) or output (server→client)
const TTYD_TITLE_OR_RESIZE = 0x31   // '1' — set title (server→client) or resize (client→server)
const TTYD_SET_PREFERENCES = 0x32   // '2' — server→client only

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function encodeTtydInput(input: string): ArrayBuffer {
  const encoded = encoder.encode(input)
  const buffer = new Uint8Array(encoded.length + 1)
  buffer[0] = TTYD_DATA
  buffer.set(encoded, 1)
  return buffer.buffer
}

export function encodeTtydResize(cols: number, rows: number): ArrayBuffer {
  const json = JSON.stringify({ columns: cols, rows })
  const encoded = encoder.encode(json)
  const buffer = new Uint8Array(encoded.length + 1)
  buffer[0] = TTYD_TITLE_OR_RESIZE
  buffer.set(encoded, 1)
  return buffer.buffer
}

export function decodeTtydMessage(data: ArrayBuffer): TtydMessage {
  const view = new Uint8Array(data)
  const type = view[0]
  const payload = view.subarray(1)

  switch (type) {
    case TTYD_DATA:
      return { data: payload, type: 'output' }
    case TTYD_TITLE_OR_RESIZE:
      return { data: decoder.decode(payload), type: 'title' }
    case TTYD_SET_PREFERENCES:
      return { type: 'config' }
    default:
      return { type: 'unknown' }
  }
}
