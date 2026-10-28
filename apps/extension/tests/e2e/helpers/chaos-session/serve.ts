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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { gunzipSync } from "node:zlib"
import type { Page } from "puppeteer"
import { getEntropy } from "@nulo/wallet-core/utils"
import { prng } from "../../fixtures/chaos-seed"
import { backgroundOrigin, extensionUrl, gotoExtensionPage, newPage, prepareKeys } from "../../fixtures/browser"
import { clickSelector, patchPagePolling, pickFileByTestId, replaceInputValue } from "../../fixtures/dom"
import type { ExtensionContext } from "../../fixtures/extension"
import { callService } from "../../fixtures/session"
import { openPopup } from "../../fixtures/wallet-pages"
import { checkLeaks, checkSettle, findNeedles, type LeakHit, type SettleReading, type Violation } from "../profile-chaos/checkers"
import { drainLogs, readProfiles, readSession, scanStorage } from "../profile-chaos/collect"
import { beforeDriver, DRIVERS } from "../profile-chaos/drivers"
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
import { checkStepLogs, homesOf, learnPhrases, mask, needlesOf } from "../profile-chaos/run"
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
	maskIds,
	noteProfiles,
	phraseWords,
	secretFieldKind,
	type Shown,
	stableTestids,
} from "./checks"
import { PasskeyFaults } from "./faults"
import { SessionPages } from "./pages"
import { profileDirOf } from "./processes"
import {
	ACTIONS_FILE,
	appendOwn,
	type Command,
	CommandRefused,
	DeadlineExceeded,
	damaged,
	ENDED_FILE,
	FINDINGS_FILE,
	holdSessionDirs,
	nearerEnd,
	type PageId,
	publishFile,
	READ_VERBS,
	READY_FILE,
	readCommand,
	readInside,
	readSessionInfo,
	resFile,
	type Result,
	doDirOf,
	runOf,
	type SessionDirs,
	type SessionInfo,
	SUMMARY_FILE,
	type Status,
	takenFile,
	withDeadline,
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

/** What a verb hands back: its data for the agent, the command as resolved (a `do`'s drawn params),
 *  and what it ended on purpose. */
interface Done {
	data?: unknown
	resolved?: Command
	ends?: StepEnd[]
	/** The wallet went on working after the dispatch; the next settled command checks it. */
	unsettled?: true
	settle?: SettleReading
	/** What the leak scan could not learn from the command, each an incomplete check. */
	gaps?: string[]
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

/** Serves the session in `dir` on the launch `ctx`, whose browser can do what `caps` says, until it
 *  ends; returns when serving is over. */
export async function serveSession(ctx: ExtensionContext, dir: string, caps: Caps): Promise<void> {
	const info = readSessionInfo(dir)
	recordBrowser(ctx, dir, info.id)
	const dirs = holdSessionDirs(dir)
	try {
		// A `do`'s exports stay outside the directory: the browser reads them back by path.
		const run = await startRun(ctx, caps, doDirOf(dirname(dir), info.id))
		const session = new Session(dir, dirs, info, run)
		try {
			await session.serve()
		} finally {
			await session.drainLate()
			await session.close(await run.stop().catch(() => ["the stand-in's misses could not be read"]))
		}
	} finally {
		dirs.close()
	}
}

/** Tells the launcher, outside the directory an agent reads, which profile directory the session's
 *  browser runs on: Chrome's own processes name only that once the browser that loaded the
 *  extension is gone. */
function recordBrowser(ctx: ExtensionContext, dir: string, id: string): void {
	const userDataDir = profileDirOf(ctx.browser.process()?.spawnargs ?? [])
	const file = runOf(dirname(dir), id)
	mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
	writeFileSync(file, JSON.stringify({ userDataDir }), { flag: "wx", mode: 0o600 })
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
	/** Set when the late work still ran once the launch closed: the end can no longer be read. */
	private lateOutlived = false
	/** A `--now` command's work has not been settled and checked since. */
	private unsettled = false
	/** What the last checks saw: each page's route, and the open profile by name, method and the
	 *  order the session first saw it in, which two runs share where its id differs. */
	private after: { open: false | { name: string; type: string; seen: number }; routes: [PageId, string][] } | undefined
	private readonly profileOrder = new Map<string, number>()
	/** `do` reaches a starting point: it runs from `empty` through the catalog until a command drives
	 *  the wallet directly, and stops once a `do` ends outside the model's outcomes. */
	private doWorld: World | undefined = startWorld("empty")
	/** The command being served with a `do`'s drawn params, set before its driver runs, so a run that
	 *  throws or passes its deadline records what it drew and a replay draws nothing in its place. */
	private drawn: Command | undefined
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
		private readonly dirs: SessionDirs,
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
		publishFile(this.dirs.top, READY_FILE, JSON.stringify({ at: Date.now(), browser: await this.s.ctx.browser.version() }))
		for (let n = 1; ; n++) {
			const got = await this.waitFor(n)
			if (!got) {
				this.endReason = "the session's deadline passed"
				await this.finishAtDeadline()
				return
			}
			writeFileSync(this.dirs.q.at(takenFile(n)), "", { flag: "wx" })
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
		const bound = new Promise<"outlived">((resolve) => {
			timer = setTimeout(() => resolve("outlived"), LATE_MS)
		})
		this.lateOutlived = (await Promise.race([this.late.then(noop, noop), bound])) === "outlived"
		clearTimeout(timer)
	}

	/** The checks `end` runs too, at the session's deadline: the last `--now` work settled and
	 *  checked, and every hold never released. */
	private async finishAtDeadline(): Promise<void> {
		const n = this.served
		const work = (async () => {
			const lines = await this.finalLines(n, "deadline")
			this.writeFindings([...lines, ...(await this.check(n, "deadline", []))])
		})()
		try {
			await withDeadline(work, CHECKS_MS)
		} catch (err) {
			if (err instanceof DeadlineExceeded) this.late = work
			const why = err instanceof DeadlineExceeded ? `passed their ${CHECKS_MS} ms bound` : `threw: ${firstLine(err)}`
			this.writeFindings([{ kind: "incomplete", n, verb: "deadline", reason: `the final checks ${why}` }])
		}
	}

	private async finalLines(n: number, verb: string): Promise<FindingLine[]> {
		const lines: FindingLine[] = []
		if (this.unsettled) {
			for (const v of checkSettle(verb, await this.settle())) lines.push({ kind: "violation", n, verb, ...v })
			this.unsettled = false
		}
		for (const reason of await this.faults.outstanding()) lines.push({ kind: "incomplete", n, verb, reason })
		return lines
	}

	/** Writes the summary and the end of serving; the launcher records the runner's exit apart. */
	public async close(standInMissed: string[]): Promise<void> {
		this.pages.stop()
		const end = this.lateOutlived
			? { unreadable: `a command past its bound still ran ${LATE_MS} ms later` }
			: await this.endState().catch((err: unknown) => ({ unreadable: firstLine(err) }))
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
		publishFile(this.dirs.top, SUMMARY_FILE, `${mask(JSON.stringify(summary, null, 2), [])}\n`)
		publishFile(this.dirs.top, ENDED_FILE, JSON.stringify({ reason: this.endReason, served: this.served, at: Date.now() }))
	}

	/** The next command, or undefined once the session's deadline has passed, whatever is queued. */
	private async waitFor(n: number): Promise<ReturnType<typeof readCommand>> {
		for (;;) {
			if (Date.now() >= this.info.deadlineAt) return undefined
			const got = readCommand(this.dirs.q, n)
			if (got) return got
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
		this.drawn = undefined
		const tried = await this.attempt(n, cmd)
		if ("late" in tried) return this.cutShort(n, cmd, t0, `passed its ${cmd.deadlineMs} ms deadline`, "timeout")
		const { done, status, reason } = tried
		if (drives(cmd, status) && cmd.verb !== "do") this.doOpen = false
		if (done.unsettled) this.unsettled = true
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
		const path = { outcome: status === "ok" ? outcomeOf(cmd, data) : undefined, after: this.after }
		this.after = undefined
		return this.record(n, done.resolved ?? this.drawn ?? cmd, result, { path, found: foundKeys(lines) })
	}

	/** A command or its checks past their bound, or checks that threw, end the session: what the
	 *  wallet holds can no longer be vouched for, and the step stays incomplete. */
	private cutShort(n: number, cmd: Command, t0: number, why: string, status: Status): Result {
		this.over = true
		this.endReason = `command ${n} (${cmd.verb}) ${why}`
		this.writeFindings([{ kind: "incomplete", n, verb: cmd.verb, reason: `${why}; the session ends` }])
		return this.record(n, this.drawn ?? cmd, {
			n,
			verb: cmd.verb,
			status,
			reason: `${why}; the session ends`,
			elapsedMs: Date.now() - t0,
			findings: 1,
		})
	}

	/** Settles a command that drove the wallet, lifts the fault armed on the page it drove, and runs
	 *  the checks; `end` first settles and checks the last `--now` work. */
	private async afterCommand(n: number, cmd: Command, done: Done, status: Status): Promise<FindingLine[]> {
		const lines: FindingLine[] = []
		if (drives(cmd, status)) {
			const settle = done.settle ?? (await this.settle())
			for (const v of checkSettle(cmd.verb, settle)) lines.push({ kind: "violation", n, verb: cmd.verb, ...v })
			this.unsettled = false
			const unmet = ACTS_ON_PAGE.has(cmd.verb) ? await this.faults.lift(cmd.page) : undefined
			if (unmet) lines.push({ kind: "incomplete", n, verb: cmd.verb, reason: unmet })
		}
		for (const reason of done.gaps ?? []) lines.push({ kind: "incomplete", n, verb: cmd.verb, reason })
		if (cmd.verb === "end") lines.push(...(await this.finalLines(n, cmd.verb)))
		if (cmd.verb === "report") lines.push({ kind: "agent", n, text: mask(cmd.text, await needlesOf(this.s)) })
		else lines.push(...(await this.check(n, cmd.verb, done.ends ?? [])))
		this.writeFindings(lines)
		return lines
	}

	/** Publishes the result, URLs masked as everywhere an agent reads, and logs the command. */
	private record(n: number, cmd: Command | undefined, result: Result, came?: Pick<ActionRecord, "path" | "found">): Result {
		publishFile(this.dirs.q, resFile(n), `${mask(JSON.stringify(result), [])}\n`)
		const entry: ActionRecord & Record<string, unknown> = {
			n,
			command: (cmd ?? {}) as Record<string, unknown>,
			status: result.status,
			...(result.reason ? { reason: result.reason } : {}),
			elapsedMs: result.elapsedMs,
			at: Date.now(),
			...this.provenance(n, cmd, result),
			...came,
		}
		appendOwn(this.dirs.top, ACTIONS_FILE, `${JSON.stringify(entry)}\n`)
		return result
	}

	/** What a replay needs beyond the command: a snapshot's route and stable testids, and where a
	 *  filled value came from. */
	private provenance(n: number, cmd: Command | undefined, result: Result): { seen?: ActionRecord["seen"]; bound?: Binding } {
		if (cmd?.verb === "snapshot" && result.status === "ok") {
			const data = result.data as { route: string; items: Shown["items"] }
			this.shown.push({ n, page: cmd.page, items: data.items })
			return { seen: { route: maskIds(data.route), testids: stableTestids(data.items.map((i) => i.testid)) } }
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
			appendOwn(this.dirs.top, FINDINGS_FILE, `${mask(JSON.stringify({ ...line, at: Date.now() }), [])}\n`)
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
				return { data: { file: await this.screenshot(n, cmd.page) } }
			case "pick-file":
				return this.pickFile(n, cmd)
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

	/** A screenshot cannot mask what the page shows, so a page that may show a node endpoint is
	 *  refused: the network pages, a page showing a URL, and a page with a shadow root, whose text
	 *  the check cannot read. */
	private async screenshot(n: number, id: PageId): Promise<string> {
		const page = this.page(id)
		const risk = await page.evaluate(screenshotRisk, NETWORK_ROUTE.source)
		if (risk) throw new CommandRefused(`${id} ${risk}, which a screenshot would carry unmasked; snapshot masks it`)
		return writeOwn(this.dirs, "screenshots", `${n}-${id}.png`, await page.screenshot())
	}

	/** The network pages hold node endpoints, which may carry a provider key: a session reads their
	 *  testids but never types or presses keys there, so no endpoint is ever edited into a form
	 *  the masking misses. */
	private async refuseOnNetworkPages(page: Page, id: PageId, verb: string): Promise<void> {
		const route = await page.evaluate(() => location.hash)
		if (new RegExp(NETWORK_ROUTE.source).test(route))
			throw new CommandRefused(`${verb} is refused on ${id}: the network pages hold node endpoints`)
	}

	private async snapshot(id: PageId): Promise<unknown> {
		const page = this.page(id)
		const read = await page.evaluate(readScreen, NETWORK_ROUTE.source, ENDPOINT_FIELD.source)
		const texts = await page.evaluate(readLooseText, NETWORK_ROUTE.source)
		return { page: id, ...read, texts, pages: await this.routes() }
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
		if (new RegExp(ENDPOINT_FIELD.source, "i").test(cmd.testid))
			throw new CommandRefused(`${cmd.testid} holds a node endpoint, which a session never edits`)
		await this.refuseOnNetworkPages(page, cmd.page, "fill")
		const selector = await this.target(page, cmd.testid, cmd.nth)
		await page.waitForSelector(selector, { visible: true, timeout: elementWait(cmd.deadlineMs) })
		const type = await page.evaluate(inputTypeOf, selector)
		// A value typed into a secret field is a needle from now on, whatever the fill does.
		await this.learnSecret(n, secretFieldKind(cmd.testid, type), cmd.value)
		await replaceInputValue(page, selector, cmd.value)
		return {}
	}

	private async learnSecret(n: number, kind: "password" | "phrase" | undefined, value: string): Promise<void> {
		if (!kind) return
		const ref = 1_000_000 + n
		if (kind === "phrase" && (await isPhrase(phraseWords(value)))) {
			this.s.phrases.set(`W${ref}`, phraseWords(value))
			return
		}
		// Not a valid phrase, or a password: what was typed is a needle as text.
		this.s.secrets.set(`S${ref}`, value)
	}

	/** Every recovery phrase a page shows as its words, a needle from the first time it is seen, so
	 *  the leak scan looks for it whether or not anyone typed it. */
	private async learnShownPhrases(): Promise<void> {
		const known = new Set([...this.s.phrases.values()].map((w) => w.join(" ")))
		for (const { page } of this.pages.list()) {
			const runs = await page.evaluate(shownWordRuns).catch(() => [] as string[][])
			for (const words of runs) {
				if (known.has(words.join(" ")) || !(await isPhrase(words))) continue
				known.add(words.join(" "))
				this.s.phrases.set(`W${2_000_000 + known.size}`, words)
			}
		}
	}

	private async press(cmd: Extract<Command, { verb: "press" }>): Promise<Done> {
		const page = this.page(cmd.page)
		await this.refuseOnNetworkPages(page, cmd.page, "press")
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

	private async pickFile(n: number, cmd: Extract<Command, { verb: "pick-file" }>): Promise<Done> {
		const source = readInside(this.dir, cmd.file)
		const copy = damaged(source, cmd.truncate, cmd.flip)
		const rel = writeOwn(this.dirs, "files", `${n}-${basename(cmd.file)}`, copy)
		await pickFileByTestId(this.page(cmd.page), cmd.testid, join(this.dir, rel))
		const kept = cmd.truncate === undefined ? source.length : damaged(source, cmd.truncate).length
		const resolved: Command = { ...cmd, truncate: nearerEnd(source.length, cmd.truncate), flip: nearerEnd(kept, cmd.flip) }
		return { data: { picked: rel, bytes: copy.length }, resolved }
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
		if (!before)
			throw new CommandRefused("an earlier do failed or ended outside the model's outcomes, so where do would start is unknown")
		const spec = Object.hasOwn(ACTIONS, cmd.action) ? ACTIONS[cmd.action as ActionName] : undefined
		if (!spec) throw new CommandRefused(`unknown catalog action ${cmd.action}`)
		const params = cmd.params ?? spec.params(this.rng, before, this.s.caps)
		if (!params) throw new CommandRefused(`${cmd.action} cannot run from where the do steps leave the wallet`)
		this.drawn = { ...cmd, params: params as Record<string, unknown> }
		const listed = { action: cmd.action, params } as ListedStep
		let step: ReturnType<typeof planFromList>["steps"][number]
		try {
			step = planFromList([...this.doList, listed], "empty", this.s.caps).steps.at(-1) as typeof step
		} catch (err) {
			throw new CommandRefused(firstLine(err))
		}
		const refs = this.seedSecrets(params)
		// Where a driver that threw left the wallet is unknown, so no later `do` starts from it.
		this.doWorld = undefined
		await beforeDriver(this.s)
		const driven = await (DRIVERS[step.action] as Drive)(this.s, step.params, step, before)
		const allowed = step.expect.outcomes.includes(driven.outcome)
		this.doWorld = allowed ? step.expect.next : undefined
		if (allowed) this.doList.push(listed)
		const gaps = allowed ? await learnPhrases(this.s, step.expect.next) : []
		const secrets = Object.fromEntries(refs.map((ref) => [ref, this.s.secrets.get(ref as never)]))
		return {
			resolved: { ...cmd, params: params as Record<string, unknown> },
			data: { action: cmd.action, params, outcome: driven.outcome, allowed: step.expect.outcomes, secrets },
			ends: endsOf(listed, before),
			settle: driven.settle,
			gaps,
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
		await this.learnShownPhrases()
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
			...checkLeaks([...storage.hits, ...logs.hits, ...files.hits], structure, passkeyIds, homesOf(needles)),
		]
		for (const v of violations)
			lines.push({ kind: "violation", n, verb, ...v, ...(v.detail ? { detail: mask(v.detail, needles) } : {}) })
		s.origin = await backgroundOrigin(s.ctx)
		noteProfiles(this.profileOrder, profiles.listed)
		const open = profiles.listed.find((p) => p.id === active?.id)
		this.after = {
			open: open ? { name: open.name, type: open.type, seen: this.profileOrder.get(open.id) ?? -1 } : false,
			routes: (await this.routes()).map(({ id, route }) => [id, maskIds(route)]),
		}
		return lines
	}

	/** Keeps every download the pages captured, under a name the session chose. A text download is
	 *  kept with its URLs masked, as the log export may hold a node's; a compressed one that holds a
	 *  URL is not kept, since masking would break it. The leak scan reads what was captured. */
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
			const text = readableText(d.bytes)
			const gzip = isGzip(d.bytes)
			const masked = mask(text, [])
			if (gzip && masked !== text) {
				incomplete(`download ${seq} (${basename(d.name)}) holds a URL and was not kept`)
				this.saved.push({ rel: `withheld:${seq}`, text })
				continue
			}
			const body = !gzip && masked !== text ? masked : d.bytes
			this.saved.push({ rel: writeOwn(this.dirs, "downloads", `${seq}-${basename(d.name)}`, body), text })
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
				return { id, route: maskIds(read?.route ?? "<closed>"), testids: stableTestids(read?.ids ?? []) }
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

/** The verbs that drive the page they name, so the fault armed there has had its chance. */
const ACTS_ON_PAGE: ReadonlySet<string> = new Set(["click", "fill", "press", "pick-file", "close", "bg-restart"])

/** The network pages, where every endpoint shows, and the fields that hold one anywhere. */
const NETWORK_ROUTE = /^#\/popup\/settings\/networks(?:[/?]|$)/
const ENDPOINT_FIELD = /rpc|endpoint|url/

const noop = (): void => {}

/** What a served command came to, where its result says: a replay that reaches the same end by
 *  another way differs here. */
function outcomeOf(cmd: Command, data: unknown): unknown {
	const d = data as Record<string, unknown> | undefined
	switch (cmd.verb) {
		case "do":
			return d?.outcome
		case "passkey":
			return d?.fault
		case "open":
			// The route a page opens on is read before it settles; `after` holds where it settled.
			return { page: d?.page }
		case "close":
			return d
		case "pick-file":
			// A file the wallet made differs in size between runs.
			return d?.picked !== undefined
		case "downloads":
			return (d?.files as unknown[] | undefined)?.length
		default:
			return undefined
	}
}

/** The violations and incomplete checks among `lines`, as two runs compare them. */
const foundKeys = (lines: readonly FindingLine[]): string[] =>
	lines.flatMap((l) =>
		l.kind === "violation" ? [findingKey(l.oracle, l.message)] : l.kind === "incomplete" ? [findingKey("incomplete", l.reason)] : [],
	)

/** Whether `words` are a recovery phrase the wallet would take. */
async function isPhrase(words: string[]): Promise<boolean> {
	try {
		await getEntropy(words)
		return true
	} catch {
		return false
	}
}

const firstLine = (err: unknown): string => (err instanceof Error ? err.message : String(err)).split("\n")[0].slice(0, 300)

/** An element wait inside a command's deadline, so a control that never shows is the browser's
 *  refusal, not the deadline's. */
const elementWait = (deadlineMs: number): number => Math.max(Math.min(10_000, deadlineMs - 500), 100)

/** A download's text for the leak scan: gunzipped when it is a gzip stream, as a full backup is. */
const isGzip = (bytes: Uint8Array): boolean => bytes[0] === 0x1f && bytes[1] === 0x8b

function readableText(bytes: Buffer): string {
	if (isGzip(bytes)) {
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
 *  it holds no other testid, an input's type and value, and its state, every URL in a text or value
 *  masked. A password field and an endpoint field give their length only, and a network page no
 *  text or value at all, since an endpoint edited out of a URL's form would pass the masking. Names
 *  no hidden element. */
function readScreen(
	networkRoute: string,
	endpointField: string,
): { route: string; title: string; items: { testid: string; nth: number; [k: string]: unknown }[] } {
	const quiet = new RegExp(networkRoute).test(location.hash)
	const endpoint = new RegExp(endpointField, "i")
	const isShown = (el: HTMLElement) => {
		const style = window.getComputedStyle(el)
		const rect = el.getBoundingClientRect()
		return style.display !== "none" && style.visibility !== "hidden" && rect.width !== 0 && rect.height !== 0
	}
	// A node URL may carry a provider key, so no URL leaves the page as text.
	const unlinked = (text: string) => text.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'\\<>]+/gi, "<url>")
	const ownText = (el: HTMLElement) =>
		unlinked((el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim()).slice(0, 200) || undefined
	// A field's own input, or the one inside a wrapper that holds no other testid.
	const inputOf = (el: HTMLElement, leaf: boolean) =>
		el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
			? el
			: leaf
				? el.querySelector<HTMLInputElement>("input, textarea")
				: null
	const withheld = (input: HTMLInputElement | HTMLTextAreaElement, testid: string) =>
		quiet || input.type === "password" || endpoint.test(testid) || endpoint.test(input.name ?? "")
	const shownValue = (input: HTMLInputElement | HTMLTextAreaElement | null, testid: string) => {
		if (!input) return undefined
		return withheld(input, testid) ? `<${input.value.length} characters>` : unlinked(input.value).slice(0, 200)
	}
	const describe = (el: HTMLElement, testid: string, nth: number) => {
		const leaf = !el.querySelector("[data-testid]")
		const input = inputOf(el, leaf)
		const checked = el.getAttribute("aria-checked") ?? el.getAttribute("aria-selected")
		const item: { testid: string; nth: number; [k: string]: unknown } = {
			testid,
			nth,
			tag: el.tagName.toLowerCase(),
			text: leaf && !quiet ? ownText(el) : undefined,
			type: input?.type,
			value: shownValue(input, testid),
			disabled: (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true" || undefined,
			invalid: (input ?? el).getAttribute("aria-invalid") === "true" || undefined,
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
	return { route: unlinked(location.hash), title: unlinked(document.title), items }
}

/** The page's visible text that no item carries, in page order: a field's error or hint, a
 *  dialog's body, whatever sits outside every testid that holds no other. None on a network page,
 *  and every URL masked. */
function readLooseText(networkRoute: string): string[] {
	if (new RegExp(networkRoute).test(location.hash)) return []
	const out: string[] = []
	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
	for (let node = walker.nextNode(); node && out.length < 80; node = walker.nextNode()) {
		const parent = node.parentElement
		const owner = parent?.closest<HTMLElement>("[data-testid]")
		if (!parent || (owner && !owner.querySelector("[data-testid]"))) continue
		const style = window.getComputedStyle(parent)
		if (style.display === "none" || style.visibility === "hidden" || parent.getClientRects().length === 0) continue
		const text = (node.textContent ?? "")
			.replace(/\s+/g, " ")
			.trim()
			.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'\\<>]+/gi, "<url>")
			.slice(0, 200)
		if (text && out.at(-1) !== text) out.push(text)
	}
	return out
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
	const busy = [...document.querySelectorAll<HTMLElement>('[aria-busy="true"]')]
		.filter((el) => el.getBoundingClientRect().width !== 0 && window.getComputedStyle(el).visibility !== "hidden")
		.map((el) => `aria-busy:${el.dataset.testid ?? el.tagName.toLowerCase()}`)
	return {
		route: location.hash,
		ids,
		key: `${location.hash}|${keyParts.join(",")}`,
		loading: [...ids.filter((id) => /pending|loading|spinner|progress/.test(id)), ...busy],
	}
}

/** Why a screenshot of the page could carry an endpoint: a network page, a URL in its text or a
 *  field, or a shadow root, whose text neither check reads. */
function screenshotRisk(networkRoute: string): string | undefined {
	if (new RegExp(networkRoute).test(location.hash)) return "is a network page"
	const url = /\b[a-z][a-z0-9+.-]*:\/\/\S/i
	if (url.test(document.body?.innerText ?? "")) return "shows a URL"
	if ([...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")].some((f) => url.test(f.value)))
		return "shows a URL"
	if ([...document.querySelectorAll("*")].some((el) => el.shadowRoot)) return "holds a shadow root"
	return undefined
}

/** The words of every recovery phrase grid in the page, shown or not, by testid in page order. */
function shownWordRuns(): string[][] {
	const runs = new Map<string, string[]>()
	for (const el of document.querySelectorAll<HTMLElement>('[data-testid$="-word"]')) {
		const word = (el.textContent ?? "").trim().toLowerCase()
		if (!/^[a-z]{3,8}$/.test(word)) continue
		const testid = el.dataset.testid ?? ""
		runs.set(testid, [...(runs.get(testid) ?? []), word])
	}
	return [...runs.values()].filter((words) => [12, 15, 18, 21, 24].includes(words.length))
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
