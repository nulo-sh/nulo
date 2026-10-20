import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { Page } from "puppeteer"
import { type BrowserKind, openScratchPage, reinstallExtension } from "../browser"
import { type ExtensionContext, launchExtension } from "../extension"
import { pollUntil } from "../poll"
import { E2E_STATE_DIR } from "../../lockfile"
import { releaseBuild } from "./release"
import { candidateSource } from "./source"
import { FIXTURE_PREFIX } from "./stored-rows"

export type UpdateBuilds = { tag: string; from: string; to: string }

/**
 * The opt-in pair of builds the update scenarios run: `NULO_E2E_UPDATE_FROM` names a release tag,
 * `NULO_E2E_UPDATE_TO` the candidate `build-update-candidate.sh` wrote. Undefined when the run did
 * not opt in; a half-given pair, a candidate built from another commit than the checkout's, or one
 * that does not rise above the release throws.
 */
export function updateBuilds(browser: BrowserKind): UpdateBuilds | undefined {
	const tag = process.env.NULO_E2E_UPDATE_FROM
	if (!tag) return undefined
	const to = process.env.NULO_E2E_UPDATE_TO
	if (!to || !existsSync(path.join(to, "manifest.json"))) {
		throw new Error(
			`NULO_E2E_UPDATE_FROM=${tag} needs NULO_E2E_UPDATE_TO, a ${browser} candidate from scripts/e2e/build-update-candidate.sh`,
		)
	}
	const built = path.join(to, "update-candidate.json")
	const { commit } = existsSync(built) ? (JSON.parse(readFileSync(built, "utf8")) as { commit?: string }) : { commit: undefined }
	const head = candidateSource().commit
	if (commit !== head) {
		throw new Error(`the candidate at ${to} was built from ${commit ?? "an unknown commit"}, not ${head}: build it again`)
	}
	const from = releaseBuild(tag, browser, path.join(runDir(), "release"))
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

const RUN_PREFIX = "update-"

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM"
	}
}

/** This process's own directory in the checkout's e2e state, so concurrent runs never share a
 *  profile, a staged build or an unpacked release; a dead run's is reaped. */
function runDir(): string {
	mkdirSync(E2E_STATE_DIR, { recursive: true })
	for (const name of readdirSync(E2E_STATE_DIR)) {
		const pid = name.startsWith(RUN_PREFIX) ? Number(name.slice(RUN_PREFIX.length)) : Number.NaN
		if (Number.isInteger(pid) && pid !== process.pid && !alive(pid)) {
			rmSync(path.join(E2E_STATE_DIR, name), { recursive: true, force: true })
		}
	}
	const dir = path.join(E2E_STATE_DIR, `${RUN_PREFIX}${process.pid}`)
	mkdirSync(dir, { recursive: true })
	return dir
}

/** One fixed path for every build of a run: Chrome derives the extension id from it, and the update keeps the id. */
const extensionDir = () => path.join(runDir(), "extension")
const profileDir = () => path.join(runDir(), "profile")

function stage(build: string): string {
	const dir = extensionDir()
	rmSync(dir, { recursive: true, force: true })
	cpSync(build, dir, { recursive: true })
	return dir
}

const UPDATE_PROBE_KEY = "nulo:e2e:update-probe"
const UPDATE_PROBE = "update-probe.js"

/**
 * Stages `build` with one listener, run before the wallet's, that records the browser's
 * `onInstalled` details: the wallet keeps none, and the page its install branch opens closes
 * itself before Firefox's BiDi reports it. Every file of the build is copied unchanged but the
 * background entry, which imports the listener first.
 */
function stageWithProbe(build: string): string {
	const dir = stage(build)
	const { background } = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as {
		background: { service_worker?: string; scripts?: string[]; type?: string }
	}
	const entry = background.service_worker ?? background.scripts?.[0]
	if (!entry || background.type !== "module" || (background.scripts?.length ?? 0) > 1) {
		throw new Error(`the build's background is not one module entry: ${JSON.stringify(background)}`)
	}
	const record = `{ ${JSON.stringify(UPDATE_PROBE_KEY)}: { reason: details.reason, previousVersion: details.previousVersion ?? null } }`
	writeFileSync(
		path.join(dir, UPDATE_PROBE),
		`chrome.runtime.onInstalled.addListener((details) => void chrome.storage.session.set(${record}))\n`,
	)
	const file = path.join(dir, entry)
	writeFileSync(file, `import "./${UPDATE_PROBE}";\n${readFileSync(file, "utf8")}`)
	return dir
}

/** A fresh profile with `build` installed in session, so {@link updateInPlace} can swap it. */
export async function installForUpdate(build: string): Promise<ExtensionContext> {
	rmSync(profileDir(), { recursive: true, force: true })
	return launchExtension({ extensionPath: stage(build), userDataDir: profileDir(), installInSession: true, cspRecorder: false })
}

type Installed = { reason: string; previousVersion: string | null }
type Running = { version: string; live: boolean; installed?: Installed }

async function runningBuild(page: Page): Promise<Running> {
	return page.evaluate(async (probeKey: string) => {
		const session = await chrome.storage.session.get(["nulo:liveness", probeKey])
		return {
			version: chrome.runtime.getManifest().version,
			live: Boolean(session["nulo:liveness"]),
			installed: session[probeKey] as Installed | undefined,
		}
	}, UPDATE_PROBE_KEY)
}

/**
 * Replace the installed build `from` with `to` in the running browser, as the store updates it,
 * and resolve once `to` runs with a live background and the browser has reported an update from
 * `from`. The extension's own pages close on the way.
 */
export async function updateInPlace(ctx: ExtensionContext, from: string, to: string): Promise<void> {
	const version = manifestVersion(to)
	const swapping: Running = { version: "", live: false }
	await reinstallExtension(ctx.browser, stageWithProbe(to))
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
		(state) => state.version === version && state.live && state.installed !== undefined,
		{ label: `${version} running with a live background after the update`, timeoutMs: 60_000, intervalMs: 500 },
	)
	const expected: Installed = { reason: "update", previousVersion: manifestVersion(from) }
	if (running.installed?.reason !== expected.reason || running.installed.previousVersion !== expected.previousVersion) {
		throw new Error(`the browser reported ${JSON.stringify(running.installed)} for the swap, not ${JSON.stringify(expected)}`)
	}
}

export async function inPlaceUpdate<T>(opts: {
	builds: UpdateBuilds
	populate: (ctx: ExtensionContext) => Promise<T>
	verify: (ctx: ExtensionContext, populated: T) => Promise<void>
}): Promise<void> {
	const { from, to } = opts.builds
	try {
		const ctx = await installForUpdate(from)
		try {
			const populated = await opts.populate(ctx)
			await updateInPlace(ctx, from, to)
			await opts.verify(ctx, populated)
		} finally {
			await ctx.close()
		}
	} finally {
		rmSync(runDir(), { recursive: true, force: true })
	}
}

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
