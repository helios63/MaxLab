<template>
  <div class="relative w-screen h-dvh bg-black flex flex-col items-center justify-center gap-4">
    <div class="size-full overflow-hidden">
      <P5Sketch ref="sketch" :sketch-factory="activeSketch.factory" />
    </div>
    <div v-if="activeIndex === 0" class="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4">
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
        <button
          v-for="(s, i) in sketches"
          :key="i"
          class="px-3 py-1.5 transition-colors rounded-full"
          :class="
            activeIndex === i
              ? 'bg-white text-black'
              : 'bg-black/60 text-white'
          "
          @click="activeIndex = i; menuOpen = false"
        >
          {{ i + 1 }}. {{ s.name }}
        </button>
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
import bouncingSquare from '~/sketches/bouncingSquare'
import camRandom from '~/sketches/camRandom'
import timeFlowers from '~/sketches/timeFlowers'
import timeGrid from '~/sketches/timeGrid'
import timePhysics from '~/sketches/timePhysics'

const sketches = [
  { name: 'BouncingSquares', factory: bouncingSquare },
  { name: 'Time Flowers', factory: timeFlowers },
  { name: 'Time Grid', factory: timeGrid },
  { name: 'Time Physics', factory: timePhysics },
  { name: 'Cam Random', factory: camRandom },
]

const activeIndex = ref(0)
const activeSketch = computed(() => sketches[activeIndex.value]!)

const sketch = ref<{ reset: () => void; setHue: (h: number) => void } | null>(null)
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
