// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"
import { execSync } from "node:child_process"
import type { TestProject } from "vitest/node"
import { resolveBrowserKind } from "./fixtures/browser/selection"

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

/**
 * Kill orphan Chrome test processes started by THIS extension build only.
 *
 * Scoping by extension path lets a parallel impl in a different folder run its
 * own Chromes without us murdering each other's test runs.
 */
function cleanupOrphanChromeProcesses() {
	try {
		execSync(`pkill -f "chrome.*--load-extension=${EXTENSION_PATH}" 2>/dev/null || true`, { stdio: "ignore" })
	} catch {
		// Ignore errors — processes may not exist
	}
}

const ARMED_BUILD = `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:${BROWSER}`

/**
 * Outside artifact runs the guard refuses every outside host, and an unarmed dist would seed the
 * shipped Testnet tokens on every profile against a node it refuses. The token-seed stamp is what
 * `_extension-smoke-e2e.yml` greps for after its armed build.
 */
function assertArmedSmokeBuild(): void {
	const scripts = fs.readdirSync(EXTENSION_PATH, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".js"))
	const stamped = scripts.some((file) =>
		fs.readFileSync(path.join(EXTENSION_PATH, file), "utf8").includes("NULO_E2E_TOKEN_SEEDS_BUILD_STAMP"),
	)
	if (stamped) return
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

export async function setup(project: TestProject) {
	cleanupOrphanChromeProcesses()

	const manifest = path.join(EXTENSION_PATH, "manifest.json")
	if (!fs.existsSync(manifest)) {
		throw new Error(`No ${BROWSER} extension at ${EXTENSION_PATH}\nBuild the armed smoke build first: ${ARMED_BUILD}`)
	}
	// An artifact run keeps its documented live leg, the shipped token list against the live chain.
	const egressGuard = process.env.NULO_E2E_ARTIFACT_RUN !== "1"
	if (egressGuard) assertArmedSmokeBuild()
	project.provide("extensionPath", EXTENSION_PATH)
	project.provide("egressGuard", egressGuard)
}

export async function teardown() {
	cleanupOrphanChromeProcesses()
}

declare module "vitest" {
	export interface ProvidedContext {
		extensionPath: string
		/** Only the smoke setup provides it; elsewhere it is undefined and launches are unguarded. */
		egressGuard?: boolean
	}
}
