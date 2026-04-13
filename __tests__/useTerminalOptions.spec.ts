import { describe, expect, it } from 'vitest'
import { resolveTerminalOptions } from '../composables/useTerminalOptions'
import { DARK_THEME, DEFAULT_TERMINAL_OPTIONS, LIGHT_THEME } from '../composables/themes'
import type { ITerminalOptions } from '@xterm/xterm'
import type { TerminalDeckConfig } from '../types'

describe('resolveTerminalOptions', () => {
  it('returns defaults when no overrides provided', () => {
    const result = resolveTerminalOptions({}, undefined, true)

    expect(result.options.fontSize).toBe(DEFAULT_TERMINAL_OPTIONS.fontSize)
    expect(result.options.cursorBlink).toBe(DEFAULT_TERMINAL_OPTIONS.cursorBlink)
    expect(result.options.theme).toEqual(DARK_THEME)
    expect(result.host).toBe('localhost')
    expect(result.port).toBe(8085)
    expect(result.path).toBe('/ws')
  })

  it('uses light theme when isDark is false', () => {
    const result = resolveTerminalOptions({}, undefined, false)

    expect(result.options.theme).toEqual(LIGHT_THEME)
  })

  it('merges deck-level config over defaults', () => {
    const deckConfig: TerminalDeckConfig = {
      defaultPort: 9000,
      options: { fontSize: 18 },
    }

    const result = resolveTerminalOptions({}, deckConfig, true)

    expect(result.port).toBe(9000)
    expect(result.options.fontSize).toBe(18)
    expect(result.options.cursorBlink).toBe(true) // default preserved
  })

  it('merges component props over deck config', () => {
    const deckConfig: TerminalDeckConfig = {
      defaultPort: 9000,
      options: { fontSize: 18 },
    }
    const componentProps = {
      options: { fontSize: 22, cursorStyle: 'block' as const },
      port: 7777,
    }

    const result = resolveTerminalOptions(componentProps, deckConfig, true)

    expect(result.port).toBe(7777)
    expect(result.options.fontSize).toBe(22)
    expect(result.options.cursorStyle).toBe('block')
    expect(result.options.cursorBlink).toBe(true) // still preserved from default
  })

  it('passes rows and cols through to config', () => {
    const result = resolveTerminalOptions({ cols: 120, rows: 30 }, undefined, true)

    expect(result.rows).toBe(30)
    expect(result.cols).toBe(120)
  })

  it('leaves rows and cols undefined when not set', () => {
    const result = resolveTerminalOptions({}, undefined, true)

    expect(result.rows).toBeUndefined()
    expect(result.cols).toBeUndefined()
  })

  it('component theme overrides dark/light theme', () => {
    const componentProps = {
      options: { theme: { background: '#ff0000' } },
    }

    const result = resolveTerminalOptions(componentProps, undefined, true)

    expect(result.options.theme?.background).toBe('#ff0000')
    expect(result.options.theme?.foreground).toBe(DARK_THEME.foreground) // rest merged
  })
})
