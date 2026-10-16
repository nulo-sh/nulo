import { fileURLToPath, URL } from "node:url"
import { resolvePackageAsset } from "@nulo/resolve-asset"
import type { InlineConfig } from "vitest/node"
import packageJson from "./package.json" with { type: "json" }

/**
 * Shared building blocks for the vite/vitest config family
 * (`vite.config.ts`, `vite.{chrome,firefox}.config.mts`, `vitest.config.ts`,
 * `vitest.e2e*.config.ts`). These used to be copy-pasted under "Keep in sync"
 * comments — the sync drifted (the e2e:all config silently lost the noir
 * aliases). Single-owning them here is the fix.
 */
import RetryErrorReporter from "./tests/e2e/retry-error-reporter.ts"
import { FORK_HEAP_MIB, STALL_MS } from "./tests/e2e/run-limits.ts"
import StallWatchdog, { type StallWatchdogOptions } from "./tests/e2e/stall-watchdog.ts"

/**
 * Resolve a file inside an npm package, bypassing its `exports` field.
 * Anchored at this workspace via @nulo/resolve-asset, so it holds under both
 * the hoisted and the isolated linker — the package must be a DECLARED
 * dependency of apps/extension (the identity test enforces the sensitive ones).
 */
export function resolvePackageFile(pkg: string, file: string): string {
	return resolvePackageAsset(pkg, file, { from: import.meta.url })
}

/** Absolute path to `apps/extension/src`. */
export const srcDir = fileURLToPath(new URL("./src", import.meta.url))

/** The Aztec line the wallet is built against, as About and full backups name it. */
function aztecVersion(): string {
	const version: string | undefined = (packageJson.dependencies as Record<string, string | undefined>)["@aztec-labs/pxe"]
	if (!version) throw new Error('apps/extension/package.json declares no "@aztec-labs/pxe", so __AZTEC_VERSION__ has no value')
	return version
}

/** The barretenberg release the Presto SDK proves with, sent as `x-aztec-version`: the exact
 *  `@aztec-foundation/bb.js` pin, numbered apart from the labs line since 6.0.0-rc.3. Presto compares
 *  it by exact string equality, so a missing pin fails the build instead of a status that never
 *  matches. */
function bbVersion(): string {
	const version: string | undefined = (packageJson.dependencies as Record<string, string | undefined>)["@aztec-foundation/bb.js"]
	if (!version) throw new Error('apps/extension/package.json declares no "@aztec-foundation/bb.js", so __BB_VERSION__ has no value')
	return version
}

/** The minimum level of every Aztec dependency logger in the bundle, read from `process.env.LOG_LEVEL`. */
export const DEPENDENCY_LOG_LEVEL = "warn"

export const processEnvDefine = JSON.stringify({ LOG_LEVEL: DEPENDENCY_LOG_LEVEL, BB_WASM_PATH: "/assets/barretenberg.wasm.gz" })

/** Compile-time `define` constants shared by the build + unit configs. */
export const sharedDefine: Record<string, string> = {
	__VERSION__: JSON.stringify(packageJson.version),
	__AZTEC_VERSION__: JSON.stringify(aztecVersion()),
	__BB_VERSION__: JSON.stringify(bbVersion()),
	__NAME__: JSON.stringify(packageJson.name),
	__DISPLAY_NAME__: JSON.stringify(packageJson.displayName),
}

/** Contract-artifact aliases (bypass each package's `exports`), shared by the
 *  build + unit configs. */
export const artifactAliases: Record<string, string> = {
	"@private-fpc-artifact": resolvePackageFile("@alejoamiras/private-fee-juice", "target/private_contract-PrivateFPC.json"),
	"@wonderland-token-artifact": resolvePackageFile("@aztec-foundation/aztec-standards", "artifacts/target/token_contract-Token.json"),
}

/** The artifacts the build ships without debug info — see `scripts/strip-artifact-debug-info.ts`. */
export const debugStrippedArtifacts: readonly string[] = [
	...Object.values(artifactAliases),
	resolvePackageFile("@aztec-labs/noir-contracts.js", "artifacts/token_contract-Token.json"),
]

/**
 * Force the node variant of the noir wasm wrappers. The patched `exports.node`
 * field works for Node's native resolver but vite's SSR bundler picks the
 * `module: "./web/..."` field on darwin arm64 hosts, which throws
 * `__wbindgen_malloc undefined` the first time the simulator runs a private
 * circuit. Direct alias to the nodejs entry sidesteps vite's resolution
 * entirely; on hosts where vite's resolver works (the CI Linux runners) this is
 * a no-op (alias points to the same file the resolver would have picked anyway).
 *
 * Required by every config that runs network e2e (`vitest.e2e.network` +
 * `vitest.e2e.all`); the build config keeps these in `dedupe` instead.
 */
export const noirAliases: Record<string, string> = {
	"@aztec-foundation/noir-acvm_js": resolvePackageFile("@aztec-foundation/noir-acvm_js", "nodejs/acvm_js.js"),
	"@aztec-foundation/noir-noirc_abi": resolvePackageFile("@aztec-foundation/noir-noirc_abi", "nodejs/noirc_abi_wasm.js"),
}

/**
 * Reporter set for every e2e config. Explicit `reporters` SUPPRESSES vitest's
 * auto-added `github-actions` annotation reporter (it is only appended when the
 * resolved list is empty), so it must be re-added by hand on CI or PR
 * annotations silently disappear. RetryErrorReporter surfaces the retained
 * first-attempt errors of retried passes. `NULO_E2E_RESULTS_FILE` adds the `json`
 * report a canary or chaos lane is asserted on (`scripts/ci-cd/assert-canary-results.ts`).
 */
export function e2eReporters(
	options: { stall?: StallWatchdogOptions } = {},
): ("default" | "github-actions" | ["json", { outputFile: string }] | RetryErrorReporter | StallWatchdog)[] {
	const resultsFile = process.env.NULO_E2E_RESULTS_FILE
	return [
		"default",
		...(process.env.GITHUB_ACTIONS ? (["github-actions"] as const) : []),
		...(resultsFile ? [["json", { outputFile: resultsFile }] as ["json", { outputFile: string }]] : []),
		new RetryErrorReporter(),
		...(options.stall ? [new StallWatchdog(options.stall)] : []),
	]
}

/**
 * The vitest `retry` count from `NULO_E2E_RETRY`, `fallback` when unset or empty. Anything but a
 * nonnegative decimal safe integer throws, where `Number()` would hand vitest `NaN` or accept a
 * spelling such as `" 2"` or `"1e1"`.
 */
export function e2eRetry(fallback: number): number {
	const raw = process.env.NULO_E2E_RETRY
	if (!raw) return fallback
	const retry = Number(raw)
	if (!/^\d+$/.test(raw) || !Number.isSafeInteger(retry)) {
		throw new Error(`NULO_E2E_RETRY=${JSON.stringify(raw)} is not a non-negative integer`)
	}
	return retry
}

/**
 * One forked worker per e2e file, files in sequence, so an earlier file's orphan processes cannot
 * break the next file's browser launch (seen after ~17 files as cascading `Connection closed`).
 * `pool` and `isolate` are vitest 4's defaults, written out so a changed default cannot drop them.
 */
export const e2eIsolation = {
	environment: "node",
	fileParallelism: false,
	pool: "forks",
	isolate: true,
} satisfies InlineConfig

/**
 * Runner options shared by every config that runs the network suite (`vitest.e2e.network`,
 * `vitest.e2e.all`). A function, so each config gets its own stateful reporters and no other
 * importer of this module builds them.
 */
export const networkRunner = () =>
	({
		testTimeout: 30_000,
		// `tokenReadyExtension` (and global-setup's contract deploy) creates an EmbeddedWallet and mints
		// tokens; 120 s timed out during the deploy on slower machines.
		hookTimeout: 300_000,
		execArgv: [`--max-old-space-size=${FORK_HEAP_MIB}`],
		reporters: e2eReporters({ stall: { stallMs: STALL_MS } }),
		// Node 24 enforces JSON import attributes, and `@aztec-labs/accounts`' lazy loaders import their
		// .json artifacts without `with: { type: "json" }`, so plain Node refuses them in global-setup
		// (`ERR_IMPORT_ATTRIBUTE_MISSING`). Inlining the `@aztec` packages routes them through vitest's
		// own transformer, which does not enforce the attribute.
		server: {
			deps: {
				inline: [/@aztec(-labs|-foundation)?\//],
			},
		},
	}) satisfies InlineConfig
