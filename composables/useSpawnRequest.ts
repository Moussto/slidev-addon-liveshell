import type { SpawnedEvent, SpawnRequest } from '../types'

const SPAWN_TIMEOUT_MS = 10_000

/**
 * Sends a liveshell:spawn request via Vite HMR WebSocket and waits for the
 * matching liveshell:spawned reply. Returns the confirmed port assigned by the plugin.
 */
export function requestSpawn(request: SpawnRequest): Promise<number> {
  if (!import.meta.hot) {
    throw new Error('[liveshell] requestSpawn requires Vite HMR (import.meta.hot is unavailable)')
  }

  const { session } = request

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      import.meta.hot!.off('liveshell:spawned', handler)
      reject(new Error(`[liveshell] spawn timeout for session "${session}"`))
    }, SPAWN_TIMEOUT_MS)

    function handler(data: SpawnedEvent): void {
      if (data.session !== session) return
      clearTimeout(timeout)
      import.meta.hot!.off('liveshell:spawned', handler)
      if (data.state === 'error') {
        reject(new Error(`[liveshell] spawn failed for session "${session}"`))
      } else {
        resolve(data.port)
      }
    }

    import.meta.hot!.on('liveshell:spawned', handler)
    import.meta.hot!.send('liveshell:spawn', request)
  })
}

export function requestKill(session: string): void {
  import.meta.hot?.send('liveshell:kill', { session })
}
