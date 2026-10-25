// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { defineConfig } from "vitest/config"
import { e2eIsolation, e2eRetry, networkRunner, noirAliases, srcDir } from "./vite.shared.ts"

export default defineConfig({
	resolve: {
		alias: {
			"@": srcDir,
			// This runner includes tests/e2e/network/**, so it needs the same
			// node-variant noir aliases as vitest.e2e.network (single-owned in
			// vite.shared.ts). Their absence here was a "keep in sync" drift that
			// broke `e2e:all` on darwin with `__wbindgen_malloc undefined`.
			...noirAliases,
		},
	},
	test: {
		...e2eIsolation,
		...networkRunner(),
		include: ["tests/e2e/**/*.test.ts"],
		globalSetup: "./tests/e2e/global-setup.ts",
		setupFiles: ["./tests/e2e/network-setup.ts"],
		retry: e2eRetry(2),
	},
})
