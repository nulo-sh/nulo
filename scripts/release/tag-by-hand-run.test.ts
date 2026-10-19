import { describe, expect, test } from "bun:test"
import { type BypassActor, CLOSE_COMMAND, RELEASE_APP, type RulesetState, type TagByHandIO, tagByHand } from "./tag-by-hand-run"

const SHA = "08856c263f3151877fa5a6aa52a647bae50364fc"
const OWNER: BypassActor = { actor_id: 2982991, actor_type: "User", bypass_mode: "always" }
const APPLIED: RulesetState = {
	enforcement: "active",
	include: ["refs/tags/v*"],
	exclude: ["refs/tags/v*-nightly.*"],
	rules: ["creation"],
	bypassActors: [RELEASE_APP],
}

interface Script {
	ruleset?: RulesetState
	remoteTag?: string | null
	commitExists?: boolean
	failPut?: "open" | "close"
	failPush?: boolean
	/** The bypass actors the read after closing returns, when not the ones last written. */
	readBackAfterClose?: BypassActor[]
}

/** A recording fake whose ruleset holds the actors last written, as GitHub does. */
function fakeIO(script: Script = {}) {
	const calls: string[] = []
	const puts: BypassActor[][] = []
	const logs: string[] = []
	let actors = (script.ruleset ?? APPLIED).bypassActors
	const io: TagByHandIO = {
		async readRuleset() {
			calls.push("readRuleset")
			const afterClose = puts.length === 2 && script.readBackAfterClose
			return { ...(script.ruleset ?? APPLIED), bypassActors: afterClose || actors }
		},
		async putBypassActors(next) {
			calls.push("put")
			puts.push(next)
			if (script.failPut === (puts.length === 1 ? "open" : "close")) throw new Error("gh api: HTTP 502")
			actors = next
		},
		async callerId() {
			calls.push("callerId")
			return OWNER.actor_id
		},
		async remoteTag() {
			calls.push("remoteTag")
			return script.remoteTag ?? null
		},
		async commitExists() {
			calls.push("commitExists")
			return script.commitExists ?? true
		},
		async createAndPushTag() {
			calls.push("push")
			if (script.failPush) throw new Error("git push exited 1")
		},
		log: (m) => logs.push(m),
	}
	return { io, calls, puts, logs }
}

describe("tagByHand", () => {
	test("opens for the caller beside the App, pushes, and reads the App back alone", async () => {
		const { io, calls, puts } = fakeIO()
		expect(await tagByHand("1.0.0", SHA, io)).toBe(0)
		expect(puts).toEqual([[RELEASE_APP, OWNER], [RELEASE_APP]])
		expect(calls.slice(-5)).toEqual(["callerId", "put", "push", "put", "readRuleset"])
	})

	test("a refused push still closes, and exits 2 so the runbook does not relabel", async () => {
		const { io, puts, logs } = fakeIO({ failPush: true })
		expect(await tagByHand("1.0.0-rc.0", SHA, io)).toBe(2)
		expect(puts.at(-1)).toEqual([RELEASE_APP])
		expect(logs).toContain("not pushed: git push exited 1")
	})

	test("a failed open is closed anyway: the request may have reached GitHub", async () => {
		const { io, calls, puts } = fakeIO({ failPut: "open" })
		expect(await tagByHand("1.0.0", SHA, io)).toBe(2)
		expect(calls).not.toContain("push")
		expect(puts.at(-1)).toEqual([RELEASE_APP])
	})

	test.each([
		["a failed close", { failPut: "close" } as Script],
		["a read-back that still admits the caller", { readBackAfterClose: [RELEASE_APP, OWNER] }],
	])("%s exits 3 with the command that closes it", async (_, script) => {
		const { io, logs } = fakeIO(script)
		expect(await tagByHand("1.0.0", SHA, io)).toBe(3)
		expect(logs.join("\n")).toContain(CLOSE_COMMAND)
		expect(JSON.parse(CLOSE_COMMAND.split("<<<'")[1].slice(0, -1))).toEqual({ bypass_actors: [RELEASE_APP] })
	})

	test.each([
		["a nightly version", "1.0.0-nightly.26292", SHA, {}],
		["a short commit", "1.0.0", "08856c26", {}],
		["a commit this clone lacks", "1.0.0", SHA, { commitExists: false }],
		["a tag origin already has", "1.0.0", SHA, { remoteTag: "3b1d32e50ca818cf4b3366c99f68da5d1ba01692" }],
		["a ruleset already open to someone", "1.0.0", SHA, { ruleset: { ...APPLIED, bypassActors: [RELEASE_APP, OWNER] } }],
		["a disabled ruleset", "1.0.0", SHA, { ruleset: { ...APPLIED, enforcement: "disabled" } }],
	] as Array<[string, string, string, Script]>)("refuses %s before changing anything", async (_, version, sha, script) => {
		const { io, calls } = fakeIO(script)
		expect(await tagByHand(version, sha, io)).toBe(1)
		expect(calls).not.toContain("put")
		expect(calls).not.toContain("push")
	})
})
