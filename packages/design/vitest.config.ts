import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vitest/config"
import { sharedTest } from "../../vitest.base.mts"

export default defineConfig({
	plugins: [vue()],
	test: {
		...sharedTest,
		globals: true,
		environment: "jsdom",
		// `Button.test.ts` reads the type its variants declare; every other module's CSS stays stubbed.
		css: { include: [/\/src\/ui\/Button\.vue/] },
	},
})
