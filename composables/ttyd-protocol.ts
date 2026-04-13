// ttyd uses ASCII character codes as type bytes, not binary values.
// Client↔Server share '0' for input/output (direction disambiguates).
// See: docs/ttyd-websocket-protocol.md

export interface TtydMessage {
  data?: string | Uint8Array
  type: 'config' | 'output' | 'title' | 'unknown'
}

const TTYD_DATA = 0x30              // '0' — input (client→server) or output (server→client)
const TTYD_TITLE_OR_RESIZE = 0x31   // '1' — set title (server→client) or resize (client→server)
const TTYD_SET_PREFERENCES = 0x32   // '2' — server→client only

export function encodeTtydInput(input: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(input)
  const buffer = new Uint8Array(encoded.length + 1)
  buffer[0] = TTYD_DATA
  buffer.set(encoded, 1)
  return buffer.buffer
}

export function encodeTtydResize(cols: number, rows: number): ArrayBuffer {
  const json = JSON.stringify({ columns: cols, rows })
  const encoded = new TextEncoder().encode(json)
  const buffer = new Uint8Array(encoded.length + 1)
  buffer[0] = TTYD_TITLE_OR_RESIZE
  buffer.set(encoded, 1)
  return buffer.buffer
}

export function decodeTtydMessage(data: ArrayBuffer): TtydMessage {
  const view = new Uint8Array(data)
  const type = view[0]
  const payload = view.slice(1)

  switch (type) {
    case TTYD_DATA:
      return { data: payload, type: 'output' }
    case TTYD_TITLE_OR_RESIZE:
      return { data: new TextDecoder().decode(payload), type: 'title' }
    case TTYD_SET_PREFERENCES:
      return { type: 'config' }
    default:
      return { type: 'unknown' }
  }
}
