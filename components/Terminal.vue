<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { useIsSlideActive, useDarkMode, useNav } from '@slidev/client'

import { resolveTerminalOptions } from '../composables/useTerminalOptions'
import { requestSpawn } from '../composables/useSpawnRequest'
import { SessionRegistry } from '../composables/useTerminalSession'
import { REGISTRY_KEY } from '../setup/main'
import type { TerminalDeckConfig, TerminalProps } from '../types'

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

const registry = inject<SessionRegistry>(REGISTRY_KEY)
if (!registry) {
  throw new Error('[liveshell] Session registry not found. Is the addon installed correctly?')
}

// $slidev is auto-injected by Slidev into all component scripts
const deckConfig = computed<TerminalDeckConfig | undefined>(
  () => ($slidev as any)?.configs?.terminal,
)

const { isDark } = useDarkMode()
const { currentPage } = useNav()
const containerRef = ref<HTMLElement | null>(null)

const sessionId = props.session ?? `liveshell-${currentPage}-${props.port ?? 'default'}`

const config = computed(() =>
  resolveTerminalOptions(props, deckConfig.value, isDark.value),
)

const sessionEntry = registry.getOrCreate(sessionId, config.value, props.persist)

const connectionFailed = ref(false)

watch(() => sessionEntry.state, (state) => {
  connectionFailed.value = state === 'DISCONNECTED'
})

watch(config, (newConfig) => {
  sessionEntry.config = newConfig
  if (sessionEntry.terminal) {
    sessionEntry.terminal.options.theme = newConfig.options.theme
  }
})

async function retry(): Promise<void> {
  connectionFailed.value = false
  if (!containerRef.value) return

  if (props.manual) {
    registry.retry(sessionId, containerRef.value)
    return
  }

  // managed: re-request spawn in case ttyd crashed, then reconnect
  sessionEntry.state = 'IDLE'
  try {
    const confirmedPort = await requestSpawn({
      defaultPort: deckConfig.value?.defaultPort,
      port: props.port,
      session: sessionId,
      shell: deckConfig.value?.defaultShell,
      ttydPath: deckConfig.value?.ttydPath,
    })
    if (!containerRef.value) return
    sessionEntry.config = { ...sessionEntry.config, port: confirmedPort }
    registry.connectSession(sessionId, containerRef.value)
  } catch {
    sessionEntry.state = 'DISCONNECTED'
  }
}

const isActive = useIsSlideActive()
let spawning = false
watch(isActive, async (active) => {
  if (!active) {
    if (!props.persist) registry.disconnectSession(sessionId)
    return
  }

  if (!containerRef.value) return

  // Move xterm DOM into this slide's container when returning to a persist session
  const el = sessionEntry.terminal?.element
  if (el && el.parentElement !== containerRef.value) {
    containerRef.value.appendChild(el)
  }

  // Only connect on first activation — persist sessions stay CONNECTED across slides
  if (sessionEntry.state !== 'IDLE') return
  if (spawning) return

  if (props.manual) {
    // manual mode: user runs their own ttyd, connect directly to the configured port
    registry.connectSession(sessionId, containerRef.value)
    return
  }

  // managed mode: ask the plugin to spawn ttyd, wait for the confirmed port
  spawning = true
  try {
    const confirmedPort = await requestSpawn({
      defaultPort: deckConfig.value?.defaultPort,
      port: props.port,
      session: sessionId,
      shell: deckConfig.value?.defaultShell,
      ttydPath: deckConfig.value?.ttydPath,
    })
    if (!containerRef.value) return  // component may have unmounted while awaiting
    sessionEntry.config = { ...sessionEntry.config, port: confirmedPort }
    registry.connectSession(sessionId, containerRef.value)
  } catch {
    sessionEntry.state = 'DISCONNECTED'
  } finally {
    spawning = false
  }
}, { immediate: true, flush: 'post' })

onBeforeUnmount(() => {
  registry.release(sessionId)
})
</script>

<template>
  <div class="slidev-terminal">
    <div ref="containerRef" class="slidev-terminal-inner" style="width: 100%; height: 100%;" />

    <div v-if="connectionFailed" class="slidev-terminal-overlay">
      <div class="slidev-terminal-overlay-title">
        Terminal Unavailable
      </div>
      <div>Cannot connect to terminal at {{ config.host }}:{{ config.port }}</div>
      <div class="slidev-terminal-overlay-detail">
        ttyd -W -p {{ config.port }} {{ deckConfig?.defaultShell ?? 'zsh' }}
      </div>
      <button class="slidev-terminal-overlay-retry" @click="retry">
        Retry
      </button>
    </div>
  </div>
</template>
