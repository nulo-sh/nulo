import { defineConfig } from "vitest/config"
import { shardSequencer } from "./tests/e2e/shard-sequencer.ts"
import { e2eIsolation, e2eReporters, e2eRetry, srcDir } from "./vite.shared.ts"

export default defineConfig({
	resolve: {
		alias: {
			"@": srcDir,
		},
	},
	test: {
		...e2eIsolation,
		include: ["tests/e2e/*.test.ts"],
		exclude: ["tests/e2e/network/**"],
		globalSetup: "./tests/e2e/global-setup-smoke.ts",
		// `--shard=i/n` splits by each file's recorded time, not by vitest's path hash.
		sequence: { sequencer: shardSequencer("smoke") },
		// Hosted GitHub Actions runners are consistently 3-5x slower than local
		// for multi-step user flows (change-password, backup-export, etc.).
		// 60s lets those breathe without masking real bugs (a deadlock will
		// still hit the ceiling). Locally these all finish in <10s anyway.
		testTimeout: 60_000,
		hookTimeout: 90_000,
		// Two retries on top of process isolation. Real bugs fail three times
		// in a row deterministically; flakes generally don't. The cost is at
		// most 2× run time on the failing test (per the retry semantics).
		// Empirical: dropping to retry:1 surfaced 4 fresh failures per run
		// against the documented "~17 sequential files Chrome cascade" path.
		// The second retry is doing real work, not masking.
		retry: e2eRetry(2),
		reporters: e2eReporters(),
	},
})
