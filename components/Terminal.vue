<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useIsSlideActive, useDarkMode, useNav, useSlideContext } from '@slidev/client'

import { resolveTerminalOptions } from '../composables/useTerminalOptions'
import { requestKill, requestSpawn } from '../composables/useSpawnRequest'
import { SessionRegistry } from '../composables/useTerminalSession'
import { REGISTRY_KEY } from '../setup/main'
import type { SessionEntry, TerminalDeckConfig, TerminalProps } from '../types'

const props = withDefaults(defineProps<TerminalProps>(), {
  host: undefined,
  manual: false,
  options: undefined,
  path: undefined,
  persist: false,
  port: undefined,
  rows: undefined,
  cols: undefined,
  session: undefined,
})

const registry = inject<SessionRegistry>(REGISTRY_KEY)!
if (!registry) {
  throw new Error('[liveshell] Session registry not found. Is the addon installed correctly?')
}

const { $slidev } = useSlideContext()
const deckConfig = computed<TerminalDeckConfig | undefined>(
  () => ($slidev.configs as { terminal?: TerminalDeckConfig }).terminal,
)

const { isDark } = useDarkMode()
const { currentPage } = useNav()
const containerRef = ref<HTMLElement | null>(null)

const sessionId = props.session ?? `liveshell-${currentPage}-${props.port ?? 'default'}`

const config = computed(() =>
  resolveTerminalOptions(props, deckConfig.value, isDark.value),
)

// SessionEntry is reactive (from SessionRegistry.create), so .state access is tracked through the shallowRef
const session = shallowRef<SessionEntry | null>(registry.get(sessionId) ?? null)

const isConnecting = computed(() => session.value?.state === 'IDLE' || session.value?.state === 'CONNECTING')
const connectionFailed = computed(() => session.value?.state === 'DISCONNECTED')

watch(config, (newConfig) => {
  if (session.value?.terminal) {
    session.value.terminal.options.theme = newConfig.options.theme
  }
})

async function spawnAndConnect(container: HTMLElement, entry: SessionEntry): Promise<void> {
  const confirmedPort = await requestSpawn({
    defaultPort: deckConfig.value?.defaultPort,
    port: props.port,
    session: sessionId,
    shell: deckConfig.value?.defaultShell,
    ttydPath: deckConfig.value?.ttydPath,
  })
  if (!containerRef.value || entry.state === 'DESTROYED') return
  entry.config = { ...entry.config, port: confirmedPort }
  registry.connect(sessionId, container)
}

async function retry(): Promise<void> {
  if (!containerRef.value) return
  registry.teardown(sessionId)
  if (!props.manual) requestKill(sessionId)

  const entry = registry.create(sessionId, config.value)
  session.value = entry

  if (props.manual) {
    registry.connect(sessionId, containerRef.value)
    return
  }

  try {
    await spawnAndConnect(containerRef.value, entry)
  } catch {
    if (entry.state !== 'DESTROYED') entry.state = 'DISCONNECTED'
  }
}

const isActive = useIsSlideActive()

watch(isActive, async (active) => {
  if (active) {
    const container = containerRef.value
    if (!container) return

    const existingSession = registry.get(sessionId)

    if (existingSession) {
      session.value = existingSession

      if (existingSession.state === 'CONNECTED' && existingSession.terminal?.element) {
        container.appendChild(existingSession.terminal.element)

        if (existingSession.resizeObserver && existingSession.fitAddon) {
          existingSession.resizeObserver.disconnect()
          existingSession.resizeObserver = new ResizeObserver(() => {
            try { existingSession.fitAddon!.fit() } catch {}
          })
          existingSession.resizeObserver.observe(container)
          try { existingSession.fitAddon.fit() } catch { }
        }
      }

      return
    }

    const entry = registry.create(sessionId, config.value)
    session.value = entry

    if (props.manual) {
      registry.connect(sessionId, container)
      return
    }

    try {
      await spawnAndConnect(container, entry)
    } catch {
      if (entry.state !== 'DESTROYED') entry.state = 'DISCONNECTED'
    }
  } else if (!props.persist) {
    registry.teardown(sessionId)
    requestKill(sessionId)
    session.value = null
  }
}, { immediate: true, flush: 'post' })
  //post, because i need the container ref to actually be mounted

onBeforeUnmount(() => {
  if (!props.persist) {
    registry.teardown(sessionId)
    requestKill(sessionId)
  }
})
</script>

<template>
  <div class="slidev-terminal" @mouseleave="session?.terminal?.blur()">
    <div ref="containerRef" class="slidev-terminal-inner" style="width: 100%; height: 100%;" />

    <div v-if="isConnecting" class="slidev-terminal-overlay">
      <div class="slidev-terminal-spinner" />
      <div>Connecting...</div>
    </div>

    <div v-else-if="connectionFailed" class="slidev-terminal-overlay">
      <div class="slidev-terminal-overlay-title">
        Terminal Unavailable
      </div>
      <div>Cannot connect to terminal at {{ config.host }}:{{ config.port }}</div>
      <div class="slidev-terminal-overlay-detail">
        ttyd -W -p {{ config.port }} {{ deckConfig?.defaultShell ?? '$SHELL' }}
      </div>
      <button class="slidev-terminal-overlay-retry" @click="retry">
        Retry
      </button>
    </div>
  </div>
</template>
