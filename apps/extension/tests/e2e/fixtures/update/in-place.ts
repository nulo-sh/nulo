import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"
import type { Page } from "puppeteer"
import { BROWSER, openScratchPage, reinstallExtension } from "../browser"
import { type ExtensionContext, launchExtension } from "../extension"
import { pollUntil } from "../poll"
import { E2E_STATE_DIR } from "../../lockfile"
import { releaseBuild } from "./release"
import { FIXTURE_PREFIX } from "./stored-rows"

/**
 * The opt-in pair of builds the update scenarios run: `NULO_E2E_UPDATE_FROM` names a release tag,
 * `NULO_E2E_UPDATE_TO` the candidate `build-update-candidate.sh` wrote. Undefined when the run did
 * not opt in; a half-given pair or a candidate that does not rise above the release throws.
 */
export function updateBuilds(): { tag: string; from: string; to: string } | undefined {
	const tag = process.env.NULO_E2E_UPDATE_FROM
	if (!tag) return undefined
	const to = process.env.NULO_E2E_UPDATE_TO
	if (!to || !existsSync(path.join(to, "manifest.json"))) {
		throw new Error(
			`NULO_E2E_UPDATE_FROM=${tag} needs NULO_E2E_UPDATE_TO, a ${BROWSER} candidate from scripts/e2e/build-update-candidate.sh`,
		)
	}
	const from = releaseBuild(tag, BROWSER)
	if (compareVersions(manifestVersion(to), manifestVersion(from)) <= 0) {
		throw new Error(`the candidate at ${to} (${manifestVersion(to)}) does not rise above ${tag} (${manifestVersion(from)})`)
	}
	return { tag, from, to }
}

export const manifestVersion = (dir: string): string =>
	(JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as { version: string }).version

function compareVersions(a: string, b: string): number {
	const [x, y] = [a, b].map((v) => v.split(".").map(Number))
	for (let i = 0; i < 4; i++) {
		const d = (x?.[i] ?? 0) - (y?.[i] ?? 0)
		if (d !== 0) return d
	}
	return 0
}

const UPDATE_DIR = path.join(E2E_STATE_DIR, "update", BROWSER)
/** One fixed path for every build: Chrome derives the extension id from it, and the update keeps the id. */
const EXTENSION_DIR = path.join(UPDATE_DIR, "extension")
const PROFILE_DIR = path.join(UPDATE_DIR, "profile")

function stage(build: string): void {
	mkdirSync(EXTENSION_DIR, { recursive: true })
	for (const entry of readdirSync(EXTENSION_DIR)) rmSync(path.join(EXTENSION_DIR, entry), { recursive: true, force: true })
	cpSync(build, EXTENSION_DIR, { recursive: true })
}

/** A fresh profile with `build` installed in session, so {@link updateInPlace} can swap it. */
export async function installForUpdate(build: string): Promise<ExtensionContext> {
	rmSync(PROFILE_DIR, { recursive: true, force: true })
	stage(build)
	return launchExtension({ extensionPath: EXTENSION_DIR, userDataDir: PROFILE_DIR, installInSession: true, cspRecorder: false })
}

type Running = { version: string; live: boolean; installTab: boolean }

/** The running build's manifest version, whether its background has written its liveness, and
 *  whether it opened the onboarding tab it opens only when the browser reports an install. */
async function runningBuild(page: Page): Promise<Running> {
	return page.evaluate(async () => {
		const session = await chrome.storage.session.get(["nulo:liveness", "nulo:onboarding:tab-id"])
		return {
			version: chrome.runtime.getManifest().version,
			live: Boolean(session["nulo:liveness"]),
			installTab: session["nulo:onboarding:tab-id"] !== undefined,
		}
	})
}

/**
 * Replace the installed build with `to` in the running browser, as the store updates it, and
 * resolve once `to` runs and its background is live. The extension's own pages close on the way.
 */
export async function updateInPlace(ctx: ExtensionContext, to: string): Promise<void> {
	const version = manifestVersion(to)
	const swapping: Running = { version: "", live: false, installTab: false }
	stage(to)
	await reinstallExtension(ctx.browser, EXTENSION_DIR)
	const running = await pollUntil(
		async () => {
			// The extension's pages refuse to open while the browser swaps it.
			const page = await openScratchPage(ctx.browser, ctx.extensionId).catch(() => undefined)
			if (!page) return swapping
			try {
				return await runningBuild(page)
			} catch {
				return swapping
			} finally {
				await page.close().catch(() => {})
			}
		},
		(state) => state.version === version && state.live,
		{ label: `${version} running with a live background after the update`, timeoutMs: 60_000, intervalMs: 500 },
	)
	if (running.installTab) throw new Error(`the browser reported the swap to ${version} as an install, not an update`)
}

/**
 * Install `from` on a fresh profile, `populate` it, update it in place to `to`, then `verify` with
 * what `populate` returned. The launch closes on every path.
 */
export async function inPlaceUpdate<T>(opts: {
	from: string
	to: string
	populate: (ctx: ExtensionContext) => Promise<T>
	verify: (ctx: ExtensionContext, populated: T) => Promise<void>
}): Promise<void> {
	const ctx = await installForUpdate(opts.from)
	try {
		const populated = await opts.populate(ctx)
		await updateInPlace(ctx, opts.to)
		await opts.verify(ctx, populated)
	} finally {
		await ctx.close()
	}
}

/** Every `chrome.storage.local` entry, as the browser holds it. */
export async function readLocalStorage(ctx: ExtensionContext): Promise<Record<string, unknown>> {
	const page = await openScratchPage(ctx.browser, ctx.extensionId)
	try {
		return await page.evaluate(() => chrome.storage.local.get(null))
	} finally {
		await page.close().catch(() => {})
	}
}

/** Replace what `chrome.storage.local` holds, but the launch's fixture keys, with `entries`. */
export async function writeLocalStorage(ctx: ExtensionContext, entries: Record<string, unknown>): Promise<void> {
	const page = await openScratchPage(ctx.browser, ctx.extensionId)
	try {
		await page.evaluate(
			async (all: Record<string, unknown>, fixturePrefix: string) => {
				const held = Object.keys(await chrome.storage.local.get(null)).filter((key) => !key.startsWith(fixturePrefix))
				await chrome.storage.local.remove(held)
				await chrome.storage.local.set(all)
			},
			entries,
			FIXTURE_PREFIX,
		)
	} finally {
		await page.close().catch(() => {})
	}
}
