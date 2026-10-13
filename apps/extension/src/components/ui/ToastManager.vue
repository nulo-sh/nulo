<script setup>
// The bare <ToastManager> tag resolves here, not through the design resolver: the inset comes from
// the route, the page's footers and the open sheets, which the package cannot read.
import { ToastManagerBase } from "@nulo/design"

/** Composables */
import { SNACK_GAP, useSnackInset } from "@/composables/snackInset"

const NAV_HEIGHT = 64
// The dApp windows centre the 360px column in a wider window; these two, and a route that fills
// its window, span the window instead.
const FULL_WIDTH_WINDOWS = new Set(["windows-json", "windows-logger"])

const route = useRoute()
const snack = useTemplateRef("snack")
const bottomInset = useSnackInset(
	() => (route.meta.showBottomNav ? NAV_HEIGHT + SNACK_GAP : SNACK_GAP),
	() => snack.value?.snackHeight() ?? 0,
)
const inColumn = computed(() => {
	const name = typeof route.name === "string" ? route.name : ""
	return name.startsWith("windows-") && !FULL_WIDTH_WINDOWS.has(name) && !route.meta.fillsWindow
})
</script>

<template>
	<ToastManagerBase ref="snack" :bottomInset="bottomInset" :inColumn="inColumn" />
</template>
