import { reactive } from 'vue'

import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { ITerminalInitOnlyOptions, ITerminalOptions } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import { decodeTtydMessage, encodeTtydInput, encodeTtydResize } from './ttyd-protocol'
import type { ResolvedTerminalConfig, SessionEntry } from '../types'

export class SessionRegistry {
  private sessions = new Map<string, SessionEntry>()

  create(id: string, config: ResolvedTerminalConfig): SessionEntry {
    const existing = this.sessions.get(id)
    if (existing) {
      existing.config = config
      return existing
    }

    const entry = reactive<SessionEntry>({
      config,
      fitAddon: null,
      id,
      inputDisposable: null,
      resizeDisposable: null,
      resizeObserver: null,
      socket: null,
      state: 'IDLE',
      terminal: null,
    })
    this.sessions.set(id, entry)
    return entry
  }

  connect(id: string, container: HTMLElement): void {
    const entry = this.sessions.get(id)
    if (!entry) return
    if (entry.state === 'CONNECTING' || entry.state === 'CONNECTED') return

    entry.state = 'CONNECTING'

    if (entry.terminal) {
      this.openSocket(entry, entry.terminal)
    } else {
      this.initAndConnect(entry, container)
    }
  }

  get(id: string): SessionEntry | undefined {
    return this.sessions.get(id)
  }

  all(): SessionEntry[] {
    return [...this.sessions.values()]
  }

  teardown(id: string): void {
    const entry = this.sessions.get(id)
    if (!entry) return

    entry.inputDisposable?.dispose()
    entry.resizeDisposable?.dispose()
    entry.socket?.close()
    entry.terminal?.dispose()
    entry.resizeObserver?.disconnect()
    entry.state = 'DESTROYED'
    this.sessions.delete(id)
  }

  destroyAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.teardown(id)
    }
  }

  private async initAndConnect(entry: SessionEntry, container: HTMLElement): Promise<void> {
    try {
      this.initTerminal(entry, container)
      if (entry.state === 'DESTROYED' || !entry.terminal) return
      this.openSocket(entry, entry.terminal)
    } catch {
      if (entry.state !== 'DESTROYED') {
        entry.state = 'DISCONNECTED'
      }
    }
  }

  private initTerminal(entry: SessionEntry, container: HTMLElement): void {
    const opts: ITerminalOptions & ITerminalInitOnlyOptions = { ...entry.config.options }
    if (entry.config.rows) opts.rows = entry.config.rows
    if (entry.config.cols) opts.cols = entry.config.cols

    const terminal = new Terminal(opts)
    const fitAddon = new FitAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())
    terminal.attachCustomKeyEventHandler((event) => {

      // otherwise, slidev cant listen to arrow keys for next slides stuff
      if (event.key === 'Escape' && event.type === 'keydown') {
        terminal.blur()
        return false
      }
      return true
    })
    terminal.open(container)

    entry.terminal = terminal
    entry.fitAddon = fitAddon

    const autoFit = !entry.config.rows && !entry.config.cols
    if (autoFit) {
      try { fitAddon.fit() } catch { /* container not visible */ }
      const resizeObserver = new ResizeObserver(() => {
        try { fitAddon.fit() } catch { /* container not visible */ }
      })
      resizeObserver.observe(container)
      entry.resizeObserver = resizeObserver
    }
  }

  private openSocket(entry: SessionEntry, terminal: import('@xterm/xterm').Terminal): void {
    const url = `ws://${entry.config.host}:${entry.config.port}${entry.config.path}`
    const socket = new WebSocket(url, ['tty'])
    socket.binaryType = 'arraybuffer'
    entry.socket = socket

    socket.onopen = () => {
      entry.state = 'CONNECTED'
      socket.send(JSON.stringify({ AuthToken: '' }))
      socket.send(encodeTtydResize(terminal.cols, terminal.rows))
    }

    socket.onmessage = (event: MessageEvent) => {
      const msg = decodeTtydMessage(event.data)
      if (msg.type === 'output' && msg.data) {
        terminal.write(msg.data as Uint8Array)
      }
    }

    socket.onclose = () => {
      if (entry.state === 'DESTROYED') return
      if (entry.socket !== socket) return
      entry.state = 'DISCONNECTED'
    }

    socket.onerror = () => {
      console.warn(`[liveshell] WebSocket error for session "${entry.id}"`)
    }

    entry.inputDisposable?.dispose()
    entry.resizeDisposable?.dispose()
    entry.inputDisposable = terminal.onData((input: string) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(encodeTtydInput(input))
      }
    })
    entry.resizeDisposable = terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(encodeTtydResize(cols, rows))
      }
    })
  }
}
