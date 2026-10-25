import { defineConfig } from "vitest/config"
import { shardSequencer } from "./tests/e2e/shard-sequencer.ts"
import { e2eIsolation, e2eRetry, networkRunner, noirAliases, srcDir } from "./vite.shared.ts"

export default defineConfig({
	resolve: {
		alias: {
			"@": srcDir,
			// The noir-wasm node-variant aliases (+ the why) are single-owned in
			// vite.shared.ts so this config and vitest.e2e.all stay in sync.
			...noirAliases,
		},
	},
	test: {
		...e2eIsolation,
		...networkRunner(),
		// The guard's control spec runs here too, so the network lane proves its own launches refuse
		// an outside host.
		include: ["tests/e2e/network/**/*.test.ts", "tests/e2e/egress-guard.test.ts"],
		globalSetup: "./tests/e2e/global-setup.ts",
		// `--shard=i/n` splits by each file's recorded time, not by vitest's path hash.
		sequence: { sequencer: shardSequencer("network") },
		// Per-worker: marks `.e2e-state/tests-started` so the boot-failure
		// classifier never misclassifies a run that reached test execution as an
		// infra-boot failure (exit 86).
		setupFiles: ["./tests/e2e/network-setup.ts"],
		// Two retries unless NULO_E2E_RETRY says otherwise: the PR gates and the soak pass 0, so a
		// test that passes only on a retry fails there. The rotating popup timeouts retries once
		// absorbed were a popup race, fixed at the source
		// (see implementations-plan/archive/e2e-network-recovery/plan.md, Slow test investigation).
		retry: e2eRetry(2),
	},
})
