import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { createConnection } from 'net'

import { defineConfig } from 'vite'

import type { SpawnedEvent, SpawnRequest } from './types'

let previousSigintHandler: (() => void) | null = null
let previousSigtermHandler: (() => void) | null = null
let previousExitHandler: (() => void) | null = null

const DEFAULT_PORT = 8085
const DEFAULT_SHELL = process.env.SHELL || (process.platform === 'win32' ? 'powershell' : 'sh')
const DEFAULT_TTYD_PATH = 'ttyd'

export function resolvePort(usedPorts: Set<number>, requestedPort: number | undefined, defaultPort: number): number {
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

function spawnTtyd(ttydPath: string, port: number, shell: string, cwd: string): ChildProcess {
  return spawn(ttydPath, [
    '-W',
    '-w', cwd,
    '-p', String(port),
    '-t', 'disableReconnect=true',
    shell,
  ], { stdio: 'pipe' })
}

export default defineConfig({
  plugins: [
    {
      name: 'slidev-addon-liveshell',

      configureServer(server) {
        const root = server.config.root
        const processes = new Map<string, { port: number; process: ChildProcess }>()
        const usedPorts = new Set<number>()

        const releaseSession = (session: string, port: number): void => {
          processes.delete(session)
          usedPorts.delete(port)
        }
        const sendSpawnedEvent = (session: string, port: number, state: 'running' | 'error'): void => {
          server.ws.send('liveshell:spawned', { port, session, state } satisfies SpawnedEvent)
        }

        server.ws.on('liveshell:spawn', (request: SpawnRequest) => {
          const { defaultPort = DEFAULT_PORT,  port: requestedPort,  session,  shell = DEFAULT_SHELL,  ttydPath = DEFAULT_TTYD_PATH } = request
          const existingSession = processes.get(session)

          if (existingSession) {
            sendSpawnedEvent(session, existingSession.port, 'running')
            return
          }

          const port = resolvePort(usedPorts, requestedPort, defaultPort)
          usedPorts.add(port)

          const child = spawnTtyd(ttydPath, port, shell, root)
          processes.set(session, { port, process: child })

          function exitHandler() {
            console.log(`[liveshell] Session "${session}" exited`)
            releaseSession(session, port)
          }

          child
            .on('exit', exitHandler)
            .once('spawn', () => {
              console.log(`[liveshell] Session "${session}" running on port ${port} (PID: ${child.pid})`)
              waitForPort(port, 5_000)
                .then(() => sendSpawnedEvent(session, port, 'running'))
                .catch(() => {
                  sendSpawnedEvent(session, port, 'error')
                  releaseSession(session, port)
                })
            })
            .once('error', (err: NodeJS.ErrnoException) => {
              if (err.code === 'ENOENT') {
                console.error(`[liveshell] ttyd not found at "${ttydPath}". Install: brew/apt/pacman/scoop`)
              } else {
                console.error(`[liveshell] Failed to start ttyd for "${session}":`, err.message)
              }
              child.off('exit', exitHandler)
              sendSpawnedEvent(session, port, 'error')
              releaseSession(session, port)
            })

          child.stderr?.on('data', (data: Buffer) => {
            const msg = data.toString().trim()
            if (msg.includes('ERROR') || msg.includes('error')) {
              console.error(`[liveshell] [${session}]`, msg)
            }
          })
        })

        server.ws.on('liveshell:kill', ({ session }: { session: string }) => {
          const entry = processes.get(session)
          if (!entry) return
          if (!entry.process.killed) entry.process.kill()
          releaseSession(session, entry.port)
        })

        const cleanup = () => {
          for (const [, { process: child }] of processes) {
            if (!child.killed) child.kill('SIGKILL')
          }
          processes.clear()
          usedPorts.clear()
        }

        const sigintHandler = () => { cleanup(); process.exit(0) }
        const sigtermHandler = () => { cleanup(); process.exit(0) }

        // Remove only our own stale listeners from previous configureServer calls (HMR restart)
        if (previousSigintHandler) process.off('SIGINT', previousSigintHandler)
        if (previousSigtermHandler) process.off('SIGTERM', previousSigtermHandler)
        if (previousExitHandler) process.off('exit', previousExitHandler)

        previousSigintHandler = sigintHandler
        previousSigtermHandler = sigtermHandler
        previousExitHandler = cleanup

        process.on('exit', cleanup)
        process.on('SIGINT', sigintHandler)
        process.on('SIGTERM', sigtermHandler)
        server.httpServer?.on('close', cleanup)
      },
    },
  ],
})
