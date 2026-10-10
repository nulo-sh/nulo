import { defineConfig } from "vitest/config"
import { sharedTest } from "../../vitest.base.mts"

export default defineConfig({
	test: {
		...sharedTest,
		environment: "node",
	},
})
