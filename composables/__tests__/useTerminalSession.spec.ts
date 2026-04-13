import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionRegistry } from '../useTerminalSession'
import type { ResolvedTerminalConfig } from '../../types'

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(() => ({
    attachCustomKeyEventHandler: vi.fn(),
    cols: 80,
    dispose: vi.fn(),
    loadAddon: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onResize: vi.fn(() => ({ dispose: vi.fn() })),
    open: vi.fn(),
    rows: 24,
  })),
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(() => ({ fit: vi.fn() })),
}))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: vi.fn() }))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

globalThis.ResizeObserver = vi.fn(() => ({
  disconnect: vi.fn(),
  observe: vi.fn(),
  unobserve: vi.fn(),
})) as unknown as typeof ResizeObserver

globalThis.WebSocket = vi.fn(() => ({
  binaryType: 'arraybuffer',
  close: vi.fn(),
  readyState: 1,
  send: vi.fn(),
})) as unknown as typeof WebSocket

function makeConfig(overrides?: Partial<ResolvedTerminalConfig>): ResolvedTerminalConfig {
  return {
    host: 'localhost',
    options: {},
    path: '/ws',
    port: 8085,
    ...overrides,
  }
}

function stubContainer(): HTMLElement {
  return {} as HTMLElement
}

describe('SessionRegistry', () => {
  let registry: SessionRegistry

  beforeEach(() => {
    vi.clearAllMocks()
    registry = new SessionRegistry()
  })

  describe('create', () => {
    it('creates a new session in IDLE state', () => {
      const entry = registry.create('demo', makeConfig())

      expect(entry.id).toBe('demo')
      expect(entry.state).toBe('IDLE')
      expect(registry.get('demo')).toBe(entry)
    })

    it('returns existing entry without overwriting state', () => {
      const first = registry.create('demo', makeConfig())
      first.state = 'CONNECTED'

      const second = registry.create('demo', makeConfig())
      expect(second).toBe(first)
      expect(second.state).toBe('CONNECTED')
    })

    it('updates config on existing entry', () => {
      registry.create('demo', makeConfig({ port: 8085 }))
      registry.create('demo', makeConfig({ port: 9999 }))

      expect(registry.get('demo')?.config.port).toBe(9999)
    })
  })

  describe('connect', () => {
    it('is a no-op when entry does not exist', () => {
      expect(() => registry.connect('unknown', stubContainer())).not.toThrow()
    })

    it('is a no-op when already CONNECTED', () => {
      const entry = registry.create('demo', makeConfig())
      entry.state = 'CONNECTED'

      registry.connect('demo', stubContainer())
      expect(entry.state).toBe('CONNECTED')
    })

    it('is a no-op when already CONNECTING', () => {
      const entry = registry.create('demo', makeConfig())
      entry.state = 'CONNECTING'

      registry.connect('demo', stubContainer())
      expect(entry.state).toBe('CONNECTING')
    })

    it('transitions IDLE to CONNECTING', () => {
      registry.create('demo', makeConfig())

      registry.connect('demo', stubContainer())
      expect(registry.get('demo')?.state).toBe('CONNECTING')
    })

    it('transitions DISCONNECTED to CONNECTING', () => {
      const entry = registry.create('demo', makeConfig())
      entry.state = 'DISCONNECTED'

      registry.connect('demo', stubContainer())
      expect(entry.state).toBe('CONNECTING')
    })
  })

  describe('teardown', () => {
    it('removes session from map', () => {
      registry.create('demo', makeConfig())
      registry.teardown('demo')

      expect(registry.get('demo')).toBeUndefined()
    })

    it('sets state to DESTROYED', () => {
      const entry = registry.create('demo', makeConfig())
      registry.teardown('demo')

      expect(entry.state).toBe('DESTROYED')
    })

    it('is a no-op for unknown id', () => {
      expect(() => registry.teardown('unknown')).not.toThrow()
    })

    it('disposes terminal, socket, and observers', () => {
      const entry = registry.create('demo', makeConfig())
      entry.socket = { close: vi.fn() } as unknown as WebSocket
      entry.terminal = { dispose: vi.fn() } as unknown as import('@xterm/xterm').Terminal
      entry.inputDisposable = { dispose: vi.fn() } as unknown as import('@xterm/xterm').IDisposable
      entry.resizeDisposable = { dispose: vi.fn() } as unknown as import('@xterm/xterm').IDisposable
      entry.resizeObserver = { disconnect: vi.fn() } as unknown as ResizeObserver

      registry.teardown('demo')

      expect(entry.socket!.close).toHaveBeenCalled()
      expect(entry.terminal!.dispose).toHaveBeenCalled()
      expect(entry.inputDisposable!.dispose).toHaveBeenCalled()
      expect(entry.resizeDisposable!.dispose).toHaveBeenCalled()
      expect(entry.resizeObserver!.disconnect).toHaveBeenCalled()
    })
  })

})
