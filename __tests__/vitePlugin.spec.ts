import { describe, expect, it } from 'vitest'
import { resolvePort } from '../vite.config'

describe('resolvePort', () => {
  it('returns defaultPort when nothing is used and no port requested', () => {
    const used = new Set<number>()
    expect(resolvePort(used, undefined, 8085)).toBe(8085)
  })

  it('returns the explicitly requested port regardless of used set', () => {
    const used = new Set([8085])
    expect(resolvePort(used, 8085, 8085)).toBe(8085)
  })

  it('skips used ports when auto-assigning', () => {
    const used = new Set([8085, 8086])
    expect(resolvePort(used, undefined, 8085)).toBe(8087)
  })

  it('skips a gap in used ports when auto-assigning', () => {
    const used = new Set([8085, 8087])
    expect(resolvePort(used, undefined, 8085)).toBe(8086)
  })

  it('uses a different defaultPort as the starting point', () => {
    const used = new Set<number>()
    expect(resolvePort(used, undefined, 9000)).toBe(9000)
  })
})
