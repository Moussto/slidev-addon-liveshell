import { defineAppSetup } from '@slidev/types'

import { SessionRegistry } from '../composables/useTerminalSession'

export const REGISTRY_KEY = Symbol('liveshell-registry')

export default defineAppSetup(({ app }) => {
  const registry = new SessionRegistry()
  app.provide(REGISTRY_KEY, registry)
})
