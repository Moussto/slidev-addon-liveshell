import type { ITerminalOptions } from '@xterm/xterm'

import type { ResolvedTerminalConfig, TerminalDeckConfig, TerminalProps } from '../types'
import { DARK_THEME, DEFAULT_TERMINAL_OPTIONS, LIGHT_THEME } from './themes'

export function resolveTerminalOptions(
  props: Partial<TerminalProps>,
  deckConfig: TerminalDeckConfig | undefined,
  isDark: boolean,
): ResolvedTerminalConfig {
  const themeBase = isDark ? DARK_THEME : LIGHT_THEME

  const mergedOptions: ITerminalOptions = {
    ...DEFAULT_TERMINAL_OPTIONS,
    theme: { ...themeBase },
    ...(deckConfig?.options ?? {}),
    ...(props.options ?? {}),
  }

  // Deep merge theme separately so partial theme overrides don't wipe the base
  if (props.options?.theme || deckConfig?.options?.theme) {
    mergedOptions.theme = {
      ...themeBase,
      ...(deckConfig?.options?.theme ?? {}),
      ...(props.options?.theme ?? {}),
    }
  }

  return {
    cols: props.cols,
    host: props.host ?? 'localhost',
    options: mergedOptions,
    path: props.path ?? '/ws',
    port: props.port ?? deckConfig?.defaultPort ?? 8085,
    rows: props.rows,
  }
}
