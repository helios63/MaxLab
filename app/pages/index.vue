<script setup lang="ts">
import { sketches } from '~/composables/useSketches'
await navigateTo(`/${sketches[0]!.slug}`, { replace: true })
</script>
