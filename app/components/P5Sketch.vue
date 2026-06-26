<template>
  <div ref="canvasContainer" class="w-full h-full" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

type SketchFactory = (container: HTMLElement) => (p: any) => void

const props = defineProps<{ sketchFactory: SketchFactory }>()

const canvasContainer = ref<HTMLDivElement | null>(null)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let p5Instance: any = null

async function createInstance(factory: SketchFactory) {
  p5Instance?.remove()
  p5Instance = null
  const { default: P5 } = await import('p5')
  const container = canvasContainer.value!
  p5Instance = new P5(factory(container), container)
}

onMounted(() => createInstance(props.sketchFactory))

watch(() => props.sketchFactory, (factory) => createInstance(factory))

onUnmounted(() => {
  p5Instance?.remove()
})

function reset() {
  p5Instance?.resetDrawings()
}

function setHue(hue: number) {
  p5Instance?.setHue(hue)
}

function switchCamera() {
  p5Instance?.switchCamera()
}

function screenshot(filename = 'sketch') {
  const canvas = canvasContainer.value?.querySelector('canvas')
  if (!canvas) return
  const link = document.createElement('a')
  link.download = `${filename}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

defineExpose({ reset, setHue, switchCamera, screenshot })
</script>
