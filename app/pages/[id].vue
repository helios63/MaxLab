<template>
  <div class="relative w-screen h-dvh bg-black">
    <div class="size-full overflow-hidden">
      <P5Sketch ref="sketch" :sketch-factory="activeSketch.factory" />
    </div>

    <div v-if="id === 'cam-random' && isMobile" class="absolute bottom-4 left-1/2 -translate-x-1/2">
      <button
        class="px-6 py-2 bg-white text-black font-mono text-sm hover:bg-gray-200 active:bg-gray-400 transition-colors"
        @click="sketch?.switchCamera()"
      >
        flip camera
      </button>
    </div>

    <div v-if="id === 'bouncing-squares'" class="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4">
      <button
        class="px-6 py-2 bg-white text-black font-mono text-sm hover:bg-gray-200 active:bg-gray-400 transition-colors"
        @click="sketch?.reset()"
      >
        reset
      </button>
      <label class="flex items-center gap-2 font-mono text-sm text-white">
        color
        <input
          type="color"
          :value="pickedColor"
          class="w-8 h-8 cursor-pointer bg-transparent border-0 p-0"
          @input="onColorPick"
        />
      </label>
    </div>
  </div>

  <button
    class="fixed bottom-6 left-6 w-8 h-8 flex items-center justify-center bg-black/60 text-white font-mono text-sm transition-colors hover:bg-black/80"
    aria-label="Save screenshot"
    @click="sketch?.screenshot(activeSketch.name)"
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  </button>

  <nav class="fixed bottom-6 right-6 flex flex-col items-end gap-2 font-mono text-sm">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div v-if="menuOpen" class="flex flex-col items-end gap-1 mb-1">
        <NuxtLink
          v-for="(s, i) in sketches"
          :key="s.slug"
          :to="`/${s.slug}`"
          class="px-3 py-1.5 transition-colors rounded-full"
          :class="s.slug === id ? 'bg-white text-black' : 'bg-black/60 text-white'"
          @click="menuOpen = false"
        >
          {{ i + 1 }}. {{ s.name }}
        </NuxtLink>
      </div>
    </Transition>
    <button
      class="w-8 h-8 flex flex-col justify-center items-center gap-1.5 transition-colors bg-black/60"
      aria-label="Toggle sketch menu"
      @click="menuOpen = !menuOpen"
    >
      <span
        v-for="n in 3"
        :key="n"
        class="block w-4 h-px bg-white transition-all duration-200"
        :class="menuOpen && n === 2 ? 'opacity-0' : ''"
      />
    </button>
  </nav>
</template>

<script setup lang="ts">
import { sketches } from '~/composables/useSketches'

const route = useRoute()
const id = computed(() => route.params.id as string)

const activeSketch = computed(
  () => sketches.find(s => s.slug === id.value) ?? sketches[0]!
)

const isMobile = ref(false)
onMounted(() => { isMobile.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0 })

const sketch = ref<{ reset: () => void; setHue: (h: number) => void; switchCamera: () => void; screenshot: (filename?: string) => void } | null>(null)
const pickedColor = ref('#4466cc')
const menuOpen = ref(false)

function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0)
        : max === g ? (b - r) / d + 2
        :             (r - g) / d + 4
  return h * 60
}

function onColorPick(e: Event) {
  const hex = (e.target as HTMLInputElement).value
  pickedColor.value = hex
  sketch.value?.setHue(hexToHue(hex))
}
</script>
