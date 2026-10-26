/**
 * An agent chaos session: one launch that serves its directory's command queue in order, drives the
 * wallet by testid, and after every command runs the checks that need no model (D8) into
 * `findings.jsonl`. `actions.jsonl` keeps every served command as sent, so a replay sends the same.
 *
 * Serving ends on `end`, at the session's deadline, or when a command passes its own: then the test
 * returns at once and the launch closes under whatever the late command still runs, so nothing it
 * does lands after the next command.
 */
import { createHash } from "node:crypto"
import { appendFileSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { gunzipSync } from "node:zlib"
import type { Page } from "puppeteer"
import { getEntropy } from "@nulo/wallet-core/utils"
import { prng } from "../../fixtures/chaos-seed"
import {
	backgroundOrigin,
	credentialOutlivesPage,
	extensionUrl,
	gotoExtensionPage,
	newPage,
	prepareKeys,
	residentCredentialSlots,
	stopsBackgroundUnderOpenPage,
} from "../../fixtures/browser"
import { clickSelector, patchPagePolling, pickFileByTestId, replaceInputValue } from "../../fixtures/dom"
import type { ExtensionContext } from "../../fixtures/extension"
import { callService } from "../../fixtures/session"
import { openPopup } from "../../fixtures/wallet-pages"
import { checkLeaks, checkSettle, findNeedles, type LeakHit, type SettleReading, type Violation } from "../profile-chaos/checkers"
import { drainLogs, readProfiles, readSession, scanStorage } from "../profile-chaos/collect"
import { DRIVERS } from "../profile-chaos/drivers"
import {
	ACTIONS,
	type ActionName,
	type Caps,
	endsOf,
	type ListedStep,
	planFromList,
	type StepEnd,
	startWorld,
	type World,
} from "../profile-chaos/model"
import { RESTART_MS, replaceBackground } from "../profile-chaos/restart"
import { checkStepLogs, mask, needlesOf } from "../profile-chaos/run"
import { startRun } from "../profile-chaos/start"
import type { Drive, RunState } from "../profile-chaos/state"
import { backgroundServing } from "../profile-chaos/ui"
import {
	type ActionRecord,
	type Binding,
	bindingOf,
	checkRowsAgree,
	checkSessionRelation,
	type EndState,
	findingKey,
	phraseWords,
	secretFieldKind,
	type Shown,
	stableTestids,
} from "./checks"
import { PasskeyFaults } from "./faults"
import { SessionPages } from "./pages"
import {
	ACTIONS_FILE,
	type Command,
	CommandRefused,
	DeadlineExceeded,
	damaged,
	ENDED_FILE,
	FINDINGS_FILE,
	type PageId,
	publishFile,
	READ_VERBS,
	READY_FILE,
	readCommand,
	readInside,
	readSessionInfo,
	resFile,
	type Result,
	type SessionInfo,
	SUMMARY_FILE,
	type Status,
	takenFile,
	withDeadline,
	QUEUE_DIR,
	writeOwn,
} from "./protocol"

/** How long a page may take to hold still after a command, and how long it must hold. */
const SETTLE_MS = 30_000
const QUIET_MS = 800
/** The checks after a command; past it the session can no longer vouch for what it saw, and ends. */
const CHECKS_MS = 120_000
const POLL_MS = 100
/** A download larger than this is recorded, not kept. */
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024
/** How long the launch waits, once serving ended past a bound, for the late work to stop: a launch
 *  closed under a half-done step (a background restart's interceptions let go, say) fails its own
 *  close for the harness's state, not the wallet's. */
const LATE_MS = 180_000
/** The last command's deadline, its checks, the late work and the launch's teardown, on top of the
 *  session's own. */
const TAIL_MS = 300_000 + CHECKS_MS + LATE_MS + 120_000

/** The test's timeout for the session in `dir`: its time left, and the longest command after it. */
export function sessionTimeoutMs(dir: string): number {
	const info = readSessionInfo(dir)
	return Math.max(info.deadlineAt - Date.now(), 0) + TAIL_MS
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const CAPS: Caps = {
	ceremonyOffAnchor: credentialOutlivesPage,
	restartUnderOpenPage: stopsBackgroundUnderOpenPage,
	network: false,
	restoreGate: false,
	credentialSlots: residentCredentialSlots,
}

/** What a verb hands back: its data for the agent, the command as resolved (a `do`'s drawn params),
 *  and what it ended on purpose. */
interface Done {
	data?: unknown
	resolved?: Command
	ends?: StepEnd[]
	/** The wallet went on working after the dispatch; the next settled command checks it. */
	unsettled?: true
	settle?: SettleReading
}

/** A finding line: an oracle's violation, a check the session could not complete, or the agent's. */
type FindingLine =
	| ({ kind: "violation"; n: number; verb: string } & Violation)
	| { kind: "incomplete"; n: number; verb: string; reason: string }
	| { kind: "agent"; n: number; text: string }

interface SavedFile {
	rel: string
	text: string
}

/** Serves the session in `dir` on the launch `ctx` until it ends; returns when serving is over. */
export async function serveSession(ctx: ExtensionContext, dir: string): Promise<void> {
	const info = readSessionInfo(dir)
	const run = await startRun(ctx, CAPS, join(dir, "files"))
	const session = new Session(dir, info, run)
	try {
		await session.serve()
	} finally {
		await session.drainLate()
		await session.close(await run.stop().catch(() => ["the stand-in's misses could not be read"]))
	}
}

class Session {
	private readonly pages: SessionPages
	private readonly faults: PasskeyFaults
	private readonly rng: () => number
	private endReason = "serving stopped"
	/** Set once a command or its checks passed their bound: nothing more is served. */
	private over = false
	private served = 0
	/** The command or checks that passed their bound, still running. */
	private late: Promise<unknown> | undefined
	/** `do` reaches a starting point: it runs from `empty` through the catalog until a command drives
	 *  the wallet directly, and stops once a `do` ends outside the model's outcomes. */
	private doWorld: World | undefined = startWorld("empty")
	private doOpen = true
	private readonly doList: ListedStep[] = []
	private readonly shown: Shown[] = []
	private readonly saved: SavedFile[] = []
	private downloadSeq = 0
	private readonly unfiled: string[] = []
	private readonly incomplete: string[] = []
	private readonly filed = new Set<number>()
	private reports = 0

	public constructor(
		private readonly dir: string,
		private readonly info: SessionInfo,
		private readonly s: RunState & { stop(): Promise<string[]> },
	) {
		this.pages = new SessionPages(s)
		this.faults = new PasskeyFaults(s)
		this.rng = prng(info.seed)
	}

	public async serve(): Promise<void> {
		this.pages.start()
		await this.pages.armDownloads()
		// A background clears its ring once its config loads, so the continuity check starts after
		// the last line present now, and the first command's checks read those lines (D25).
		this.s.logs.carried = await drainLogs(this.s.anchor, 0)
		this.s.logs.lastId = this.s.logs.carried.at(-1)?.id ?? 0
		this.s.origin = await backgroundOrigin(this.s.ctx)
		publishFile(join(this.dir, READY_FILE), JSON.stringify({ at: Date.now(), browser: await this.s.ctx.browser.version() }))
		for (let n = 1; ; n++) {
			const got = await this.waitFor(n)
			if (!got) {
				this.endReason = "the session's deadline passed"
				return
			}
			writeFileSync(join(this.dir, QUEUE_DIR, takenFile(n)), "", { flag: "wx" })
			if ("refused" in got) this.record(n, undefined, this.refusal(n, got.refused))
			else await this.serveOne(n, got.cmd)
			this.served = n
			if (this.over) return
			if ("cmd" in got && got.cmd.verb === "end") {
				this.endReason = "end"
				return
			}
		}
	}

	/** Waits, up to `LATE_MS`, for the work that passed its bound; nothing is served meanwhile. */
	public async drainLate(): Promise<void> {
		if (!this.late) return
		let timer: ReturnType<typeof setTimeout> | undefined
		const bound = new Promise<void>((resolve) => {
			timer = setTimeout(resolve, LATE_MS)
		})
		await Promise.race([this.late.catch(() => {}), bound])
		clearTimeout(timer)
	}

	/** Writes the summary and the end of serving; the launcher records the runner's exit apart. */
	public async close(standInMissed: string[]): Promise<void> {
		this.pages.stop()
		const end = await this.endState().catch((err: unknown) => ({ unreadable: String(err) }))
		const summary = {
			id: this.info.id,
			charter: this.info.charter,
			browser: this.info.browser,
			seed: this.info.seed,
			revision: this.info.revision,
			served: this.served,
			endReason: this.endReason,
			end,
			reports: this.reports,
			standInMissed,
		}
		publishFile(join(this.dir, SUMMARY_FILE), `${JSON.stringify(summary, null, 2)}\n`)
		publishFile(join(this.dir, ENDED_FILE), JSON.stringify({ reason: this.endReason, served: this.served, at: Date.now() }))
	}

	private async waitFor(n: number): Promise<ReturnType<typeof readCommand>> {
		for (;;) {
			const got = readCommand(this.dir, n)
			if (got) return got
			if (Date.now() >= this.info.deadlineAt) return undefined
			await sleep(POLL_MS)
		}
	}

	private refusal(n: number, reason: string): Result {
		return { n, verb: "?", status: "refused", reason, elapsedMs: 0, findings: 0 }
	}

	/** Runs the command within its deadline: what it did, or why it was refused or failed. */
	private async attempt(n: number, cmd: Command): Promise<{ done: Done; status: Status; reason?: string } | { late: true }> {
		const work = this.dispatch(n, cmd)
		try {
			return { done: await withDeadline(work, cmd.deadlineMs), status: "ok" }
		} catch (err) {
			if (err instanceof DeadlineExceeded) {
				this.late = work
				return { late: true }
			}
			const status = err instanceof CommandRefused ? "refused" : "failed"
			return { done: {}, status, reason: mask(firstLine(err), await needlesOf(this.s)) }
		}
	}

	private async serveOne(n: number, cmd: Command): Promise<Result> {
		const t0 = Date.now()
		const tried = await this.attempt(n, cmd)
		if ("late" in tried) return this.cutShort(n, cmd, t0, `passed its ${cmd.deadlineMs} ms deadline`, "timeout")
		const { done, status, reason } = tried
		if (drives(cmd, status) && cmd.verb !== "do") this.doOpen = false
		let lines: FindingLine[] = []
		if (!done.unsettled) {
			const checks = this.afterCommand(n, cmd, done, status)
			try {
				lines = await withDeadline(checks, CHECKS_MS)
			} catch (err) {
				if (err instanceof DeadlineExceeded) {
					this.late = checks
					return this.cutShort(n, cmd, t0, `its checks passed their ${CHECKS_MS} ms bound`, "timeout")
				}
				return this.cutShort(n, cmd, t0, `its checks threw: ${mask(firstLine(err), await needlesOf(this.s))}`, "failed")
			}
		}
		const data = cmd.verb === "oracle" ? { violations: lines } : done.data
		const result: Result = { n, verb: cmd.verb, status, elapsedMs: Date.now() - t0, findings: lines.length }
		if (reason) result.reason = reason
		if (data !== undefined) result.data = data
		return this.record(n, done.resolved ?? cmd, result)
	}

	/** A command or its checks past their bound, or checks that threw, end the session: what the
	 *  wallet holds can no longer be vouched for, and the step stays incomplete. */
	private cutShort(n: number, cmd: Command, t0: number, why: string, status: Status): Result {
		this.over = true
		this.endReason = `command ${n} (${cmd.verb}) ${why}`
		this.writeFindings([{ kind: "incomplete", n, verb: cmd.verb, reason: `${why}; the session ends` }])
		return this.record(n, cmd, {
			n,
			verb: cmd.verb,
			status,
			reason: `${why}; the session ends`,
			elapsedMs: Date.now() - t0,
			findings: 1,
		})
	}

	/** Settles a command that drove the wallet, lifts the faults it carried, and runs the checks. */
	private async afterCommand(n: number, cmd: Command, done: Done, status: Status): Promise<FindingLine[]> {
		const lines: FindingLine[] = []
		if (drives(cmd, status)) {
			const settle = done.settle ?? (await this.settle())
			for (const v of checkSettle(cmd.verb, settle)) lines.push({ kind: "violation", n, verb: cmd.verb, ...v })
			if (cmd.verb !== "passkey") await this.faults.lift()
		}
		if (cmd.verb === "report") lines.push({ kind: "agent", n, text: mask(cmd.text, await needlesOf(this.s)) })
		else lines.push(...(await this.check(n, cmd.verb, done.ends ?? [])))
		this.writeFindings(lines)
		return lines
	}

	private record(n: number, cmd: Command | undefined, result: Result): Result {
		publishFile(join(this.dir, QUEUE_DIR, resFile(n)), `${JSON.stringify(result)}\n`)
		const entry: ActionRecord & Record<string, unknown> = {
			n,
			command: (cmd ?? {}) as Record<string, unknown>,
			status: result.status,
			...(result.reason ? { reason: result.reason } : {}),
			elapsedMs: result.elapsedMs,
			at: Date.now(),
			...this.provenance(n, cmd, result),
		}
		appendFileSync(join(this.dir, ACTIONS_FILE), `${JSON.stringify(entry)}\n`)
		return result
	}

	/** What a replay needs beyond the command: a snapshot's route and stable testids, and where a
	 *  filled value came from. */
	private provenance(n: number, cmd: Command | undefined, result: Result): { seen?: ActionRecord["seen"]; bound?: Binding } {
		if (cmd?.verb === "snapshot" && result.status === "ok") {
			const data = result.data as { route: string; items: Shown["items"] }
			this.shown.push({ n, page: cmd.page, items: data.items })
			return { seen: { route: data.route, testids: stableTestids(data.items.map((i) => i.testid)) } }
		}
		if (cmd?.verb === "fill") {
			const bound = bindingOf(cmd.value, this.shown)
			return bound ? { bound } : {}
		}
		return {}
	}

	private writeFindings(lines: readonly FindingLine[]): void {
		for (const line of lines) {
			if (line.kind === "violation") {
				if (line.known === undefined) this.unfiled.push(findingKey(line.oracle, line.message))
				else this.filed.add(line.known)
			} else if (line.kind === "incomplete") this.incomplete.push(findingKey("incomplete", line.reason))
			else this.reports++
			appendFileSync(join(this.dir, FINDINGS_FILE), `${JSON.stringify({ ...line, at: Date.now() })}\n`)
		}
	}

	// ── verbs ───────────────────────────────────────────────────────────

	private page(id: PageId): Page {
		const page = this.pages.get(id)
		if (!page) throw new CommandRefused(`${id} is not an open page; snapshot lists the pages`)
		return page
	}

	private async dispatch(n: number, cmd: Command): Promise<Done> {
		await this.pages.armDownloads()
		switch (cmd.verb) {
			case "snapshot":
				return { data: await this.snapshot(cmd.page) }
			case "click":
				return this.click(cmd)
			case "fill":
				return this.fill(n, cmd)
			case "press":
				return this.press(cmd)
			case "open":
				return { data: await this.open(cmd) }
			case "close":
				return { data: await this.closePage(cmd.page) }
			case "screenshot":
				return { data: { file: writeOwn(this.dir, "screenshots", `${n}-${cmd.page}.png`, await this.page(cmd.page).screenshot()) } }
			case "pick-file":
				return { data: await this.pickFile(n, cmd) }
			case "downloads":
				return { data: { files: this.saved.map((f) => f.rel) } }
			case "passkey":
				return { data: { fault: await this.faults.apply(cmd.page, this.page(cmd.page), cmd.fault, cmd.profile) } }
			case "bg-restart":
				return this.restart()
			case "do":
				return this.doAction(cmd)
			default:
				return {}
		}
	}

	private async snapshot(id: PageId): Promise<unknown> {
		const read = await this.page(id).evaluate(readScreen)
		return { page: id, ...read, pages: await this.routes() }
	}

	private async routes(): Promise<{ id: PageId; route: string }[]> {
		return Promise.all(
			this.pages
				.list()
				.map(async ({ id, page }) => ({ id, route: await page.evaluate(() => location.hash).catch(() => "<closed>") })),
		)
	}

	/** The selector for the `nth` visible match of `testid`, marked in the page so the suite's own
	 *  click and fill reach exactly it; the last visible match when `nth` is unset. */
	private async target(page: Page, testid: string, nth: number | undefined): Promise<string> {
		const selector = `[data-testid="${testid}"]`
		if (nth === undefined) return selector
		const mark = `chaos-${Date.now().toString(36)}`
		const visible = await page.evaluate(markNth, selector, nth, mark)
		if (visible <= nth) throw new Error(`${testid} has ${visible} visible matches, no #${nth}`)
		return `[data-chaos-pick="${mark}"]`
	}

	private async click(cmd: Extract<Command, { verb: "click" }>): Promise<Done> {
		const page = this.page(cmd.page)
		const wait = elementWait(cmd.deadlineMs)
		const selector = await this.target(page, cmd.testid, cmd.nth)
		await clickSelector(page, selector, { timeout: wait }).catch(() => {
			throw new Error(`no visible, enabled ${cmd.testid}${cmd.nth === undefined ? "" : ` #${cmd.nth}`} to click within ${wait} ms`)
		})
		return cmd.now ? { unsettled: true } : {}
	}

	private async fill(n: number, cmd: Extract<Command, { verb: "fill" }>): Promise<Done> {
		const page = this.page(cmd.page)
		const selector = await this.target(page, cmd.testid, cmd.nth)
		await page.waitForSelector(selector, { visible: true, timeout: elementWait(cmd.deadlineMs) })
		const type = await page.evaluate(inputTypeOf, selector)
		// A value typed into a secret field is a needle from now on, whatever the fill does.
		this.learnSecret(n, secretFieldKind(cmd.testid, type), cmd.value)
		await replaceInputValue(page, selector, cmd.value)
		return {}
	}

	private learnSecret(n: number, kind: "password" | "phrase" | undefined, value: string): void {
		if (!kind) return
		const ref = 1_000_000 + n
		const words = phraseWords(value)
		if (kind === "phrase") {
			try {
				getEntropy(words)
				this.s.phrases.set(`W${ref}`, words)
				return
			} catch {
				// Not a valid phrase: what was typed is still a needle, as text.
			}
		}
		this.s.secrets.set(`S${ref}`, value)
	}

	private async press(cmd: Extract<Command, { verb: "press" }>): Promise<Done> {
		const page = this.page(cmd.page)
		await prepareKeys(page)
		if (cmd.key === "Shift+Tab") {
			await page.keyboard.down("Shift")
			await page.keyboard.press("Tab")
			await page.keyboard.up("Shift")
		} else await page.keyboard.press(cmd.key)
		return cmd.now ? { unsettled: true } : {}
	}

	/** Opens a page loaded on `route`, and hands back the route it shows once loaded: the popup
	 *  starts behind its lock and sends an open session's page Home, so a route may not hold, which is
	 *  the wallet's call, not a failure. */
	private async open(cmd: Extract<Command, { verb: "open" }>): Promise<unknown> {
		const popup = cmd.surface === "popup"
		let page: Page
		if (popup && !cmd.route) page = await openPopup(this.s.ctx)
		else {
			page = await newPage(this.s.ctx.browser)
			patchPagePolling(page)
		}
		const id = this.pages.add(page)
		if (!popup || cmd.route) {
			const path = popup ? "/src/popup/index.html" : "/src/onboarding/index.html"
			await gotoExtensionPage(page, extensionUrl(this.s.ctx.extensionId, `${path}#${cmd.route ?? "/onboarding/welcome"}`))
		}
		await this.pages.armDownloads()
		return { page: id, route: await page.evaluate(() => location.hash).catch(() => "<closed>") }
	}

	/** Closes a page. The anchor holds every passkey where a credential lives on its page, so it
	 *  never closes there; elsewhere a fresh anchor replaces it, which the checks read through. */
	private async closePage(id: PageId): Promise<unknown> {
		const page = this.page(id)
		if (id !== "p0") {
			await page.close()
			return { closed: id }
		}
		if (!this.s.caps.ceremonyOffAnchor) throw new CommandRefused("the anchor holds every passkey on this browser, so it never closes")
		await page.close()
		this.s.anchor = await openPopup(this.s.ctx)
		this.s.errors.watch(this.s.anchor, "anchor")
		return { closed: id, reopened: "p0" }
	}

	private async pickFile(n: number, cmd: Extract<Command, { verb: "pick-file" }>): Promise<unknown> {
		const copy = damaged(readInside(this.dir, cmd.file), cmd.truncate, cmd.flip)
		const rel = writeOwn(this.dir, "files", `${n}-${basename(cmd.file)}`, copy)
		await pickFileByTestId(this.page(cmd.page), cmd.testid, join(this.dir, rel))
		return { picked: rel, bytes: copy.length }
	}

	private async restart(): Promise<Done> {
		await replaceBackground(this.s)
		await backgroundServing(this.s.anchor, RESTART_MS)
		return { ends: ["background"] }
	}

	/** A catalog action, from where the `do` steps so far leave the model: params drawn with the
	 *  session's seed when not given, and its secrets derived from the seed, so a replay types the
	 *  same. */
	private async doAction(cmd: Extract<Command, { verb: "do" }>): Promise<Done> {
		if (!this.doOpen)
			throw new CommandRefused("do reaches a starting point: it runs only before the first command that drives the wallet directly")
		const before = this.doWorld
		if (!before) throw new CommandRefused("an earlier do ended outside the model's outcomes, so where do would start is unknown")
		const spec = Object.hasOwn(ACTIONS, cmd.action) ? ACTIONS[cmd.action as ActionName] : undefined
		if (!spec) throw new CommandRefused(`unknown catalog action ${cmd.action}`)
		const params = cmd.params ?? spec.params(this.rng, before, CAPS)
		if (!params) throw new CommandRefused(`${cmd.action} cannot run from where the do steps leave the wallet`)
		const listed = { action: cmd.action, params } as ListedStep
		let step: ReturnType<typeof planFromList>["steps"][number]
		try {
			step = planFromList([...this.doList, listed], "empty", CAPS).steps.at(-1) as typeof step
		} catch (err) {
			throw new CommandRefused(firstLine(err))
		}
		const refs = this.seedSecrets(params)
		const driven = await (DRIVERS[step.action] as Drive)(this.s, step.params, step, before)
		const allowed = step.expect.outcomes.includes(driven.outcome)
		this.doWorld = allowed ? step.expect.next : undefined
		if (allowed) this.doList.push(listed)
		const secrets = Object.fromEntries(refs.map((ref) => [ref, this.s.secrets.get(ref as never)]))
		return {
			resolved: { ...cmd, params: params as Record<string, unknown> },
			data: { action: cmd.action, params, outcome: driven.outcome, allowed: step.expect.outcomes, secrets },
			ends: endsOf(listed, before),
			settle: driven.settle,
		}
	}

	/** The secrets `params` names, each derived from the session's seed unless already known. */
	private seedSecrets(params: unknown): string[] {
		const refs =
			JSON.stringify(params)
				.match(/"S\d+"/g)
				?.map((r) => r.slice(1, -1)) ?? []
		for (const ref of refs) {
			if (this.s.secrets.has(ref as never)) continue
			const tail = createHash("sha256").update(`${this.info.seed}:${ref}`).digest("base64url").slice(0, 12)
			this.s.secrets.set(ref as never, `Chaos-${ref}-${tail}`)
		}
		return refs
	}

	// ── after a command ─────────────────────────────────────────────────

	/** Waits until every page's route, visible testids and disabled controls hold still for
	 *  `QUIET_MS` with no loading mark showing, a page whose held assertion is pending excepted. */
	private async settle(): Promise<SettleReading> {
		const t0 = Date.now()
		let last = ""
		let since = t0
		for (;;) {
			const held = await this.faults.held()
			const reads = await Promise.all(
				this.pages.list().map(async ({ id, page }) => ({ id, read: await page.evaluate(readQuiet).catch(() => undefined) })),
			)
			const key = JSON.stringify(reads.map((r) => [r.id, r.read?.key]))
			const loading = reads.flatMap((r) => (held.has(r.id) ? [] : (r.read?.loading ?? [])))
			const now = Date.now()
			if (key !== last) {
				last = key
				since = now
			} else if (now - since >= QUIET_MS && !loading.length) return { reached: true, elapsedMs: now - t0, boundMs: SETTLE_MS }
			if (now - t0 > SETTLE_MS) {
				const anchor = reads.find((r) => r.id === "p0")?.read
				return {
					reached: false,
					elapsedMs: now - t0,
					boundMs: SETTLE_MS,
					loading,
					route: anchor?.route,
					visible: anchor?.ids.slice(0, 60),
				}
			}
			await sleep(200)
		}
	}

	/** Every model-free check over what the wallet holds now. */
	private async check(n: number, verb: string, ends: StepEnd[]): Promise<FindingLine[]> {
		const s = this.s
		const lines: FindingLine[] = []
		const incomplete = (reason: string) => lines.push({ kind: "incomplete", n, verb, reason })
		await this.saveDownloads(incomplete)
		const needles = await needlesOf(s)
		let restarted = ends.includes("background")
		const origin = await backgroundOrigin(s.ctx)
		if (!restarted && s.origin !== undefined && origin !== s.origin) {
			incomplete("the background restarted unplanned: its last lines are unread")
			restarted = true
		}
		if (restarted) s.logs.lastId = 0
		const logs = await checkStepLogs(s, ends, restarted, needles)
		for (const why of logs.incomplete) incomplete(why)
		const active = await callService<{ id: string } | undefined>(s.anchor, "profile", "getActiveProfile")
		const session = await readSession(s.anchor, this.pages.runPages(), active === undefined)
		const profiles = await readProfiles(s.anchor)
		const strict = await callService<boolean>(s.anchor, "config", "getValue", ["strictSecurityMode"])
		const storage = await scanStorage(s.anchor, needles)
		const files = this.scanFiles(needles)
		const passkeyIds = new Set(profiles.listed.filter((p) => p.type === "passkey").map((p) => p.id))
		const structure = { ...storage.structure, prfSalt: [...storage.structure.prfSalt, ...files.prfSalt], exports: [] }
		const violations = [
			...checkSessionRelation(session, profiles, strict),
			...checkRowsAgree(profiles),
			...logs.violations,
			...checkLeaks([...storage.hits, ...logs.hits, ...files.hits], structure, passkeyIds),
		]
		for (const v of violations)
			lines.push({ kind: "violation", n, verb, ...v, ...(v.detail ? { detail: mask(v.detail, needles) } : {}) })
		s.origin = await backgroundOrigin(s.ctx)
		return lines
	}

	/** Keeps every download the pages captured, under a name the session chose. */
	private async saveDownloads(incomplete: (reason: string) => void): Promise<void> {
		for (const d of await this.pages.drainDownloads()) {
			const seq = ++this.downloadSeq
			if (!d.bytes) {
				incomplete(`download ${seq} (${basename(d.name)}) could not be captured`)
				continue
			}
			if (d.bytes.length > MAX_DOWNLOAD_BYTES) {
				incomplete(`download ${seq} is larger than ${MAX_DOWNLOAD_BYTES} bytes and was not kept`)
				continue
			}
			const rel = writeOwn(this.dir, "downloads", `${seq}-${basename(d.name)}`, d.bytes)
			this.saved.push({ rel, text: readableText(d.bytes) })
		}
	}

	/** Every needle in every kept download and every file a `do` exported, read again each time,
	 *  since a needle learnt later may sit in a file kept earlier. */
	private scanFiles(needles: Parameters<typeof findNeedles>[1]): { hits: LeakHit[]; prfSalt: string[] } {
		const files = [...this.saved, ...[...this.s.files].map(([ref, f]) => ({ rel: `do:${ref}`, text: readFileSync(f.path, "utf8") }))]
		const hits = files.flatMap((f) => findNeedles(f.text, needles).map((needle) => ({ where: `file:${f.rel}`, needle })))
		return { hits, prfSalt: files.filter((f) => f.text.includes("prfSalt")).map((f) => `file:${f.rel}`) }
	}

	private async endState(): Promise<EndState> {
		const pages = await Promise.all(
			this.pages.list().map(async ({ id, page }) => {
				const read = await page.evaluate(readQuiet).catch(() => undefined)
				return { id, route: read?.route ?? "<closed>", testids: stableTestids(read?.ids ?? []) }
			}),
		)
		const listed = await callService<{ id: string; name: string; type: string }[]>(this.s.anchor, "profile", "getProfiles")
		const active = await callService<{ id: string } | undefined>(this.s.anchor, "profile", "getActiveProfile")
		const open = listed.find((p) => p.id === active?.id)
		return {
			pages,
			profiles: listed.map(({ name, type }) => ({ name, type })),
			session: open ? { open: true, profile: open.name } : { open: false },
			unfiled: this.unfiled,
			incomplete: this.incomplete,
			filed: [...this.filed].sort((a, b) => a - b),
		}
	}
}

/** Whether the command acted on the wallet: a refused one never reached it. */
const drives = (cmd: Command, status: Status): boolean => status !== "refused" && !READ_VERBS.has(cmd.verb) && cmd.verb !== "end"

const firstLine = (err: unknown): string => (err instanceof Error ? err.message : String(err)).split("\n")[0].slice(0, 300)

/** An element wait inside a command's deadline, so a control that never shows is the browser's
 *  refusal, not the deadline's. */
const elementWait = (deadlineMs: number): number => Math.max(Math.min(10_000, deadlineMs - 500), 100)

/** A download's text for the leak scan: gunzipped when it is a gzip stream, as a full backup is. */
function readableText(bytes: Buffer): string {
	if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
		try {
			return gunzipSync(bytes, { maxOutputLength: 4 * MAX_DOWNLOAD_BYTES }).toString("utf8")
		} catch {
			// A truncated stream is scanned as it is.
		}
	}
	return bytes.toString("utf8")
}

// ── in the page ─────────────────────────────────────────────────────────

/** Every visible testid with its index among the visible matches of its testid, its own text when
 *  it holds no other testid, an input's type and value (a password field's length only), and its
 *  state. Names no hidden element. */
function readScreen(): { route: string; title: string; items: { testid: string; nth: number; [k: string]: unknown }[] } {
	const isShown = (el: HTMLElement) => {
		const style = window.getComputedStyle(el)
		const rect = el.getBoundingClientRect()
		return style.display !== "none" && style.visibility !== "hidden" && rect.width !== 0 && rect.height !== 0
	}
	const ownText = (el: HTMLElement) => (el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || undefined
	// A field's own input, or the one inside a wrapper that holds no other testid.
	const inputOf = (el: HTMLElement, leaf: boolean) =>
		el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
			? el
			: leaf
				? el.querySelector<HTMLInputElement>("input, textarea")
				: null
	const describe = (el: HTMLElement, testid: string, nth: number) => {
		const leaf = !el.querySelector("[data-testid]")
		const input = inputOf(el, leaf)
		const checked = el.getAttribute("aria-checked") ?? el.getAttribute("aria-selected")
		const item: { testid: string; nth: number; [k: string]: unknown } = {
			testid,
			nth,
			tag: el.tagName.toLowerCase(),
			text: leaf ? ownText(el) : undefined,
			type: input?.type,
			value: input ? (input.type === "password" ? `<${input.value.length} characters>` : input.value.slice(0, 200)) : undefined,
			disabled: (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true" || undefined,
			checked: checked === null ? undefined : checked === "true",
			focused: document.activeElement === el || (!!input && document.activeElement === input) || undefined,
		}
		// The page hands back JSON, which drops every field left undefined.
		return item
	}
	const counts = new Map<string, number>()
	const items: { testid: string; nth: number; [k: string]: unknown }[] = []
	for (const el of document.querySelectorAll<HTMLElement>("[data-testid]")) {
		if (items.length >= 600) break
		if (!isShown(el)) continue
		const testid = el.dataset.testid ?? ""
		const nth = counts.get(testid) ?? 0
		counts.set(testid, nth + 1)
		items.push(describe(el, testid, nth))
	}
	return { route: location.hash, title: document.title, items }
}

/** The page's route, its visible testids with their disabled state, and the loading marks among them. */
function readQuiet(): { route: string; ids: string[]; key: string; loading: string[] } {
	const ids: string[] = []
	const keyParts: string[] = []
	for (const el of document.querySelectorAll<HTMLElement>("[data-testid]")) {
		const style = window.getComputedStyle(el)
		if (style.display === "none" || style.visibility === "hidden") continue
		const rect = el.getBoundingClientRect()
		if (rect.width === 0 || rect.height === 0) continue
		const id = el.dataset.testid ?? ""
		ids.push(id)
		keyParts.push((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true" ? `${id}!` : id)
	}
	return {
		route: location.hash,
		ids,
		key: `${location.hash}|${keyParts.join(",")}`,
		loading: ids.filter((id) => /pending|loading|spinner|progress/.test(id)),
	}
}

/** Marks the `nth` visible match of `selector` with `data-chaos-pick`; returns how many are visible. */
function markNth(selector: string, nth: number, mark: string): number {
	const isShown = (el: HTMLElement) => {
		const style = window.getComputedStyle(el)
		if (style.display === "none" || style.visibility === "hidden") return false
		const rect = el.getBoundingClientRect()
		return rect.width !== 0 && rect.height !== 0
	}
	const visible = [...document.querySelectorAll<HTMLElement>(selector)].filter(isShown)
	visible[nth]?.setAttribute("data-chaos-pick", mark)
	return visible.length
}

/** The type of the input `selector` names, or of the input inside it. */
function inputTypeOf(selector: string): string | undefined {
	const els = [...document.querySelectorAll<HTMLElement>(selector)]
	const el = els[els.length - 1]
	const input = el instanceof HTMLInputElement ? el : el?.querySelector("input")
	return input?.type
}
