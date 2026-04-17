import type { ITerminalOptions } from '@xterm/xterm'

export type SessionState =
  | 'IDLE'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'DESTROYED'

export interface TerminalProps {
  cols?: number
  host?: string
  manual?: boolean
  options?: ITerminalOptions
  path?: string
  persist?: boolean
  port?: number
  rows?: number
  session?: string
}

export interface SessionEntry {
  config: ResolvedTerminalConfig
  fitAddon: import('@xterm/addon-fit').FitAddon | null
  id: string
  inputDisposable: import('@xterm/xterm').IDisposable | null
  resizeDisposable: import('@xterm/xterm').IDisposable | null
  resizeObserver: ResizeObserver | null
  socket: WebSocket | null
  state: SessionState
  terminal: import('@xterm/xterm').Terminal | null
}

export interface ResolvedTerminalConfig {
  cols?: number
  host: string
  options: ITerminalOptions
  path: string
  port: number
  rows?: number
}

export interface TerminalDeckConfig {
  defaultPort?: number
  defaultShell?: string
  options?: ITerminalOptions
  ttydPath?: string
}

export interface SpawnTarget {
  port: number
  session: string
}

export interface SpawnRequest {
  defaultPort?: number
  port?: number
  session: string
  shell?: string
  ttydPath?: string
}

export interface SpawnedEvent {
  port: number
  session: string
  state: 'running' | 'error'
}
