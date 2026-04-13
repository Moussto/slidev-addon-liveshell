import { describe, expect, it } from 'vitest'
import { decodeTtydMessage, encodeTtydInput, encodeTtydResize } from '../ttyd-protocol'

// ttyd uses ASCII chars '0'=0x30, '1'=0x31, '2'=0x32 as type bytes
describe('ttyd protocol', () => {
  describe('encodeTtydInput', () => {
    it('prepends ASCII "0" (0x30) type byte to input string', () => {
      const result = encodeTtydInput('ls\n')
      const view = new Uint8Array(result)

      expect(view[0]).toBe(0x30)
      expect(new TextDecoder().decode(view.slice(1))).toBe('ls\n')
    })
  })

  describe('encodeTtydResize', () => {
    it('prepends ASCII "1" (0x31) type byte to JSON resize payload', () => {
      const result = encodeTtydResize(80, 24)
      const view = new Uint8Array(result)

      expect(view[0]).toBe(0x31)
      const json = JSON.parse(new TextDecoder().decode(view.slice(1)))
      expect(json).toEqual({ columns: 80, rows: 24 })
    })
  })

  describe('decodeTtydMessage', () => {
    it('decodes output message (ASCII "0" = 0x30)', () => {
      const payload = new TextEncoder().encode('hello')
      const msg = new Uint8Array(payload.length + 1)
      msg[0] = 0x30
      msg.set(payload, 1)

      const result = decodeTtydMessage(msg.buffer)

      expect(result.type).toBe('output')
      expect(new TextDecoder().decode(result.data as Uint8Array)).toBe('hello')
    })

    it('decodes title message (ASCII "1" = 0x31)', () => {
      const payload = new TextEncoder().encode('my-terminal')
      const msg = new Uint8Array(payload.length + 1)
      msg[0] = 0x31
      msg.set(payload, 1)

      const result = decodeTtydMessage(msg.buffer)

      expect(result.type).toBe('title')
      expect(result.data).toBe('my-terminal')
    })

    it('decodes config message (ASCII "2" = 0x32)', () => {
      const msg = new Uint8Array(1)
      msg[0] = 0x32

      const result = decodeTtydMessage(msg.buffer)

      expect(result.type).toBe('config')
    })

    it('returns unknown for unexpected type bytes', () => {
      const msg = new Uint8Array([0xFF])

      const result = decodeTtydMessage(msg.buffer)

      expect(result.type).toBe('unknown')
    })
  })
})
