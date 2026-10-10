import { BaseSequencer, type TestSpecification } from "vitest/node"
import { defineConfig } from "vitest/config"
import StallWatchdog from "../../../../tests/e2e/stall-watchdog"

class ByName extends BaseSequencer {
	override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
		return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId))
	}
}

// The nested run `stall-watchdog.test.ts` drives: its files come from STALL_FIXTURES, its state
// (and vite's cache) goes to STALL_STATE_DIR.
export default defineConfig({
	cacheDir: process.env.STALL_STATE_DIR,
	test: {
		include: (process.env.STALL_FIXTURES ?? "none").split(","),
		environment: "node",
		pool: "forks",
		fileParallelism: false,
		sequence: { sequencer: ByName },
		testTimeout: 600_000,
		globalSetup: "./global-setup.ts",
		reporters: ["default", new StallWatchdog({ stallMs: 3_000, killAfterMs: 5_000, stateDir: process.env.STALL_STATE_DIR })],
	},
})
