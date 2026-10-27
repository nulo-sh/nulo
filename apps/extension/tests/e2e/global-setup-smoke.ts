// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"
import type { TestProject } from "vitest/node"
import { resolveBrowserKind } from "./fixtures/browser/selection"
import { killChromesLoading } from "./sandbox-ownership"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Resolved before setup runs, so an unusable selector fails ahead of the orphan sweep rather than
// after it — the workers would otherwise reject it only once the suite was already underway.
const BROWSER = resolveBrowserKind()
// `EXTENSION_PATH` env var lets the release workflow point the smoke suite at a
// freshly-unzipped artifact instead of the repo's `dist/<browser>/`. Falls back to
// the local build for ordinary `bun run test:e2e` runs.
const EXTENSION_PATH = process.env.EXTENSION_PATH
	? path.resolve(process.env.EXTENSION_PATH)
	: path.resolve(__dirname, "../../dist", BROWSER)

const ARMED_BUILD = `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:${BROWSER}`

/**
 * A source run loads the armed build, whose token-list fetcher reads its host and key only from a
 * spec (`fixtures/token-list.ts`), so no source profile holds a list it did not ask for. The
 * token-seed stamp is what `_extension-smoke-e2e.yml` greps for after its armed build.
 */
function assertArmedSmokeBuild(stamped: (stamp: string) => boolean): void {
	if (stamped("NULO_E2E_TOKEN_SEEDS_BUILD_STAMP") && stamped("NULO_E2E_TOKEN_LIST_BUILD_STAMP")) return
	throw new Error(
		[
			`${EXTENSION_PATH} is not the armed smoke build. Build it with:`,
			`  ${ARMED_BUILD}`,
			"and run with NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1, or set NULO_E2E_ARTIFACT_RUN=1 to smoke a release build.",
		].join("\n"),
	)
}

/** Smoke test global setup — validates the extension build and cleans up stale Chrome processes. */
/** Same vitest contract as global-setup.ts: with a default export present, the named `teardown`
 *  is IGNORED - it must be the default's return value. */
export default async function setupWithTeardown(project: TestProject): Promise<() => Promise<void>> {
	await setup(project)
	return teardown
}

/** A chaos session's dist copy is new to its launch, so no stale Chrome can load it, and its
 *  launcher stops the session's own processes by pid. */
const SWEEPS_STALE = !process.env.NULO_E2E_CHAOS_SESSION

export async function setup(project: TestProject) {
	if (SWEEPS_STALE) killChromesLoading(EXTENSION_PATH)

	const manifest = path.join(EXTENSION_PATH, "manifest.json")
	if (!fs.existsSync(manifest)) {
		throw new Error(`No ${BROWSER} extension at ${EXTENSION_PATH}\nBuild the armed smoke build first: ${ARMED_BUILD}`)
	}
	// Every smoke run is guarded. Only a release build pins the production keys, so only an artifact
	// run may start the live spec's launch, which checks the published list against the live chain.
	const liveLeg = process.env.NULO_E2E_ARTIFACT_RUN === "1"
	const scripts = fs.readdirSync(EXTENSION_PATH, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".js"))
	const texts = scripts.map((file) => fs.readFileSync(path.join(EXTENSION_PATH, file), "utf8"))
	const stamped = (stamp: string) => texts.some((text) => text.includes(stamp))
	if (!liveLeg) assertArmedSmokeBuild(stamped)
	project.provide("extensionPath", EXTENSION_PATH)
	project.provide("egressGuard", true)
	project.provide("liveLeg", liveLeg)
}

export async function teardown() {
	if (SWEEPS_STALE) killChromesLoading(EXTENSION_PATH)
}

declare module "vitest" {
	export interface ProvidedContext {
		extensionPath: string
		/** Both e2e setups provide `true`. */
		egressGuard?: boolean
		/** Only the smoke setup provides it: whether a launch may send the Testnet node direct. */
		liveLeg?: boolean
	}
}
