import { beforeEach, describe, expect, it } from 'vitest'

import { SessionRegistry } from '../composables/useTerminalSession'
import type { ResolvedTerminalConfig } from '../types'

function makeConfig(overrides?: Partial<ResolvedTerminalConfig>): ResolvedTerminalConfig {
  return {
    host: 'localhost',
    options: {},
    path: '/ws',
    port: 8085,
    ...overrides,
  }
}

describe('SessionRegistry', () => {
  let registry: SessionRegistry

  beforeEach(() => {
    registry = new SessionRegistry()
  })

  it('creates a new session', () => {
    const session = registry.getOrCreate('demo', makeConfig(), true)

    expect(session.id).toBe('demo')
    expect(session.state).toBe('IDLE')
    expect(session.persist).toBe(true)
    expect(session.refCount).toBe(1)
  })

  it('returns existing session and increments refCount', () => {
    const first = registry.getOrCreate('demo', makeConfig(), false)
    const second = registry.getOrCreate('demo', makeConfig(), false)

    expect(first).toBe(second)
    expect(first.refCount).toBe(2)
  })

  it('removes a non-persistent session when refCount hits 0', () => {
    registry.getOrCreate('ephemeral', makeConfig(), false)
    registry.getOrCreate('ephemeral', makeConfig(), false)

    registry.release('ephemeral')
    expect(registry.get('ephemeral')?.refCount).toBe(1)

    registry.release('ephemeral')
    expect(registry.get('ephemeral')).toBeUndefined()
  })

  it('keeps persistent session alive when refCount hits 0', () => {
    registry.getOrCreate('sticky', makeConfig(), true)
    registry.release('sticky')

    const session = registry.get('sticky')
    expect(session).toBeDefined()
    expect(session?.refCount).toBe(0)
    expect(session?.state).toBe('IDLE')
  })

  it('destroys all sessions', () => {
    registry.getOrCreate('a', makeConfig(), true)
    registry.getOrCreate('b', makeConfig(), false)

    registry.destroyAll()

    expect(registry.get('a')).toBeUndefined()
    expect(registry.get('b')).toBeUndefined()
  })

  it('lists all sessions', () => {
    registry.getOrCreate('a', makeConfig(), false)
    registry.getOrCreate('b', makeConfig(), true)

    const all = registry.all()
    expect(all.map(s => s.id).sort()).toEqual(['a', 'b'])
  })

  it('updates config on an existing session when getOrCreate is called again', () => {
    registry.getOrCreate('demo', makeConfig({ port: 8085 }), false)
    registry.getOrCreate('demo', makeConfig({ port: 9999 }), false)

    const session = registry.get('demo')
    expect(session?.config.port).toBe(9999)
  })
})
