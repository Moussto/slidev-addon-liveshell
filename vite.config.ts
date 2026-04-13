import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { createConnection } from 'net'

import { defineConfig } from 'vite'

import type { SpawnedEvent, SpawnRequest, SpawnTarget } from './types'

const DEFAULT_PORT = 8085
const DEFAULT_SHELL = 'zsh'
const DEFAULT_TTYD_PATH = 'ttyd'

export function resolvePort(
  usedPorts: Set<number>,
  requestedPort: number | undefined,
  defaultPort: number,
): number {
  if (requestedPort !== undefined) return requestedPort
  let port = defaultPort
  while (usedPorts.has(port)) port++
  return port
}

export function waitForPort(port: number, timeout: number): Promise<void> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    function attempt() {
      const socket = createConnection({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - start >= timeout) {
          reject(new Error(`[liveshell] Port ${port} not ready after ${timeout}ms`))
        } else {
          setTimeout(attempt, 100)
        }
      })
    }
    attempt()
  })
}

function spawnTtydSession(
  session: SpawnTarget,
  ttydPath: string,
  shell: string,
  cwd: string,
): ChildProcess {
  const child = spawn(ttydPath, [
    '-W',
    '-w', cwd,
    '-p', String(session.port),
    '-t', 'disableReconnect=true',
    shell,
  ], { stdio: 'pipe' })

  child.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') {
      console.error(`[liveshell] ttyd not found at "${ttydPath}". Install it:`)
      console.error('  macOS:   brew install ttyd')
      console.error('  Ubuntu:  apt install ttyd')
      console.error('  Arch:    pacman -S ttyd')
      console.error('  Windows: scoop install ttyd')
    } else {
      console.error(`[liveshell] Failed to start ttyd for session "${session.session}":`, err.message)
    }
  })

  child.on('spawn', () => {
    const pid = child.pid ?? 0
    console.log(`[liveshell] Session "${session.session}" running on port ${session.port} (PID: ${pid})`)
  })

  child.on('exit', (code) => {
    console.log(`[liveshell] Session "${session.session}" exited (code: ${code})`)
  })

  child.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim()
    if (msg.includes('ERROR') || msg.includes('error')) {
      console.error(`[liveshell] [${session.session}]`, msg)
    }
  })

  return child
}

export default defineConfig({
  plugins: [
    {
      name: 'slidev-addon-liveshell',

      configureServer(server) {
        const root = server.config.root
        const processes = new Map<string, { port: number; process: ChildProcess }>()
        const usedPorts = new Set<number>()

        server.ws.on('liveshell:spawn', (request: SpawnRequest) => {
          const {
            defaultPort = DEFAULT_PORT,
            port: requestedPort,
            session,
            shell = DEFAULT_SHELL,
            ttydPath = DEFAULT_TTYD_PATH,
          } = request
          const existing = processes.get(session)

          if (existing) {
            server.ws.send('liveshell:spawned', {
              session,
              port: existing.port,
              state: 'running',
            } satisfies SpawnedEvent)
            return
          }

          const port = resolvePort(usedPorts, requestedPort, defaultPort)
          usedPorts.add(port)

          const child = spawnTtydSession({ session, port }, ttydPath, shell, root)
          processes.set(session, { port, process: child })

          function exitHandler() {
            processes.delete(session)
            usedPorts.delete(port)
          }
          child.on('exit', exitHandler)

          child.once('spawn', () => {
            waitForPort(port, 5_000).then(() => {
              server.ws.send('liveshell:spawned', {
                session,
                port,
                state: 'running',
              } satisfies SpawnedEvent)
            }).catch(() => {
              server.ws.send('liveshell:spawned', {
                session,
                port,
                state: 'error',
              } satisfies SpawnedEvent)
              processes.delete(session)
              usedPorts.delete(port)
            })
          })

          child.once('error', () => {
            child.off('exit', exitHandler)
            server.ws.send('liveshell:spawned', {
              session,
              port,
              state: 'error',
            } satisfies SpawnedEvent)
            processes.delete(session)
            usedPorts.delete(port)
          })
        })

        const cleanup = () => {
          for (const [, { process: child }] of processes) {
            if (!child.killed) child.kill('SIGKILL')
          }
          processes.clear()
          usedPorts.clear()
        }

        process.on('exit', cleanup)
        process.on('SIGINT', () => { cleanup(); process.exit(0) })
        process.on('SIGTERM', () => { cleanup(); process.exit(0) })
        server.httpServer?.on('close', cleanup)
      },
    },
  ],
})
