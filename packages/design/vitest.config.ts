import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vitest/config"
import { sharedTest } from "../../vitest.base.mts"

export default defineConfig({
	plugins: [vue()],
	test: {
		...sharedTest,
		globals: true,
		environment: "jsdom",
	},
})
