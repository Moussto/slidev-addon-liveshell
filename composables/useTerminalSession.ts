import { reactive } from 'vue'

import { decodeTtydMessage, encodeTtydInput, encodeTtydResize } from './ttyd-protocol'
import type { ResolvedTerminalConfig, SessionEntry } from '../types'
import {ITerminalInitOnlyOptions, ITerminalOptions} from "@xterm/xterm";

export class SessionRegistry {
  private sessions = new Map<string, SessionEntry>()

  getOrCreate(id: string, config: ResolvedTerminalConfig, persist: boolean): SessionEntry {
    const existing = this.sessions.get(id)
    if (existing) {
      existing.refCount++
      existing.config = config
      return existing
    }

    const entry = reactive<SessionEntry>({
      config,
      fitAddon: null,
      id,
      inputDisposable: null,
      persist,
      refCount: 1,
      resizeDisposable: null,
      resizeObserver: null,
      socket: null,
      state: 'IDLE',
      terminal: null,
    })
    this.sessions.set(id, entry)
    return entry
  }

  get(id: string): SessionEntry | undefined {
    return this.sessions.get(id)
  }

  all(): SessionEntry[] {
    return [...this.sessions.values()]
  }

  release(id: string): void {
    const entry = this.sessions.get(id)
    if (!entry) return

    entry.refCount = Math.max(0, entry.refCount - 1)

    if (entry.refCount === 0 && !entry.persist) {
      this.destroy(id)
    }
  }

  destroy(id: string): void {
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
      this.destroy(id)
    }
  }

  async connectSession(id: string, container: HTMLElement): Promise<void> {
    const entry = this.sessions.get(id)
    if (!entry) return
    if (entry.state === 'CONNECTING' || entry.state === 'CONNECTED') return

    entry.state = 'CONNECTING'

    if (!entry.terminal) {
      await this.initTerminal(entry, container)
    }

    const terminal = entry.terminal!
    this.openSocket(entry, terminal)
  }

  retry(id: string, container: HTMLElement): void {
    const entry = this.sessions.get(id)
    if (!entry) return
    entry.state = 'IDLE'
    this.connectSession(id, container)
  }

  disconnectSession(id: string): void {
    const entry = this.sessions.get(id)
    if (!entry) return

    entry.socket?.close()
    entry.socket = null

    if (!entry.persist) {
      entry.resizeObserver?.disconnect()
      entry.terminal?.dispose()
      entry.terminal = null
      entry.fitAddon = null
      entry.resizeObserver = null
      entry.state = 'IDLE'
    }
  }

  // -- Private helpers --

  private async initTerminal(entry: SessionEntry, container: HTMLElement): Promise<void> {
    const { Terminal } = await import('@xterm/xterm')
    const { FitAddon } = await import('@xterm/addon-fit')
    const { WebLinksAddon } = await import('@xterm/addon-web-links')

    const opts: ITerminalOptions & ITerminalInitOnlyOptions = { ...entry.config.options }
    if (entry.config.rows) opts.rows = entry.config.rows
    if (entry.config.cols) opts.cols = entry.config.cols

    const terminal = new Terminal(opts)
    const fitAddon = new FitAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())
    terminal.open(container)

    entry.terminal = terminal
    entry.fitAddon = fitAddon

    const autoFit = !entry.config.rows && !entry.config.cols
    if (autoFit) {
      fitAddon.fit()
      const resizeObserver = new ResizeObserver(() => fitAddon.fit())
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

      // ttyd handshake (see docs/ttyd-websocket-protocol.md)
      socket.send(JSON.stringify({ AuthToken: '' }))
      socket.send(encodeTtydResize(terminal.cols, terminal.rows))
    }

    // Xterm <- TTYD <- Shell (Outputed stuff)
    socket.onmessage = (event: MessageEvent) => {
      const msg = decodeTtydMessage(event.data)
      if (msg.type === 'output' && msg.data) {
        terminal.write(msg.data as Uint8Array)
      }
    }
    socket.onclose = () => {
      if (entry.state === 'DESTROYED') return
      entry.state = 'DISCONNECTED'
    }
    socket.onerror = () => {}

    // Xterm -> TTYD -> Shell (Input handling)
    // Dispose previous listeners before re-registering — persist sessions call openSocket
    // again on retry without reinitialising the terminal, which would stack up listeners
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
