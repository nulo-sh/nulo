import { describe, expect, onTestFinished, test } from "bun:test"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
	type BypassActor,
	CLOSE_COMMAND,
	RELEASE_APP,
	type RemoteTag,
	type RulesetState,
	type TagByHandIO,
	tagByHand,
} from "./tag-by-hand-run"

const SHA = "08856c263f3151877fa5a6aa52a647bae50364fc"
const OTHER = "1111111111111111111111111111111111111111"
const OWNER: BypassActor = { actor_id: 2982991, actor_type: "User", bypass_mode: "always" }
const APPLIED: RulesetState = {
	target: "tag",
	enforcement: "active",
	include: ["refs/tags/v*"],
	exclude: ["refs/tags/v*-nightly.*"],
	rules: ["creation"],
	bypassActors: [RELEASE_APP],
}

interface Script {
	ruleset?: RulesetState
	/** What origin holds under the tag before the run. */
	origin?: RemoteTag | null
	commitExists?: boolean
	failPut?: "open" | "close"
	/** `lost`: origin takes the tag but the client sees a failure; `elsewhere`: origin got the name at another commit first. */
	push?: "ok" | "refused" | "lost" | "elsewhere"
	/** The read of origin after the push fails. */
	unverifiable?: boolean
	/** A signal arrives while the open is in flight. */
	signalDuringOpen?: boolean
	/** The bypass actors the read after closing returns, when not the ones last written. */
	readBackAfterClose?: BypassActor[]
}

/** A recording fake whose ruleset and origin change only as GitHub's would. */
function fakeIO(script: Script = {}) {
	const calls: string[] = []
	const puts: BypassActor[][] = []
	const logs: string[] = []
	let actors = (script.ruleset ?? APPLIED).bypassActors
	let origin = script.origin ?? null
	let stopped = false
	const io: TagByHandIO = {
		async readRuleset() {
			calls.push("readRuleset")
			const afterClose = puts.length === 2 && script.readBackAfterClose
			return { ...(script.ruleset ?? APPLIED), bypassActors: afterClose || actors }
		},
		async putBypassActors(next) {
			calls.push("put")
			puts.push(next)
			if (puts.length === 1 && script.signalDuringOpen) stopped = true
			if (script.failPut === (puts.length === 1 ? "open" : "close")) throw new Error("gh api: HTTP 502")
			actors = next
		},
		async callerId() {
			calls.push("callerId")
			return OWNER.actor_id
		},
		async remoteTag() {
			calls.push("remoteTag")
			if (calls.includes("push") && script.unverifiable) throw new Error("git ls-remote exited 128")
			return origin
		},
		async commitExists() {
			calls.push("commitExists")
			return script.commitExists ?? true
		},
		async createLocalTag() {
			calls.push("tag")
		},
		async pushTag() {
			calls.push("push")
			if (script.push === "refused") throw new Error("git push exited 1")
			if (script.push === "elsewhere") {
				origin = { object: "5c0ffee5", commit: OTHER }
				throw new Error("git push exited 1")
			}
			origin = { object: "3b1d32e50ca818cf4b3366c99f68da5d1ba01692", commit: SHA }
			if (script.push === "lost") throw new Error("git push exited 128")
		},
		async deleteLocalTag() {
			calls.push("deleteLocalTag")
		},
		cancelled: () => stopped,
		log: (m) => logs.push(m),
	}
	return { io, calls, puts, logs }
}

describe("tagByHand", () => {
	test("opens for the caller beside the App, pushes, and reads the App back alone", async () => {
		const { io, calls, puts } = fakeIO()
		expect(await tagByHand("1.0.0", SHA, io)).toBe(0)
		expect(puts).toEqual([[RELEASE_APP, OWNER], [RELEASE_APP]])
		expect(calls.slice(-7)).toEqual(["callerId", "put", "tag", "push", "put", "readRuleset", "remoteTag"])
	})

	test("a refused push still closes, drops the tag it made, and exits 2 so the runbook does not relabel", async () => {
		const { io, calls, puts } = fakeIO({ push: "refused" })
		expect(await tagByHand("1.0.0-rc.0", SHA, io)).toBe(2)
		expect(puts.at(-1)).toEqual([RELEASE_APP])
		expect(calls.at(-1)).toBe("deleteLocalTag")
	})

	test("a push that reached origin but lost its response counts as pushed", async () => {
		const { io, calls } = fakeIO({ push: "lost" })
		expect(await tagByHand("1.0.0", SHA, io)).toBe(0)
		expect(calls).not.toContain("deleteLocalTag")
	})

	test("a tag origin holds at another commit is never reported as pushed", async () => {
		const { io, calls, logs } = fakeIO({ push: "elsewhere" })
		expect(await tagByHand("1.0.0", SHA, io)).toBe(4)
		expect(calls).not.toContain("deleteLocalTag")
		expect(logs).toContain(`origin's v1.0.0 names ${OTHER}, not ${SHA}`)
	})

	test("a push origin cannot confirm exits 4, keeps the local tag and prints the check", async () => {
		const { io, calls, logs } = fakeIO({ push: "refused", unverifiable: true })
		expect(await tagByHand("1.0.0", SHA, io)).toBe(4)
		expect(calls).not.toContain("deleteLocalTag")
		expect(logs.join("\n")).toContain("git ls-remote --tags origin 'refs/tags/v1.0.0^{}'")
	})

	test.each([
		["a failed open", { failPut: "open" } as Script],
		["a signal during the open", { signalDuringOpen: true }],
	])("%s is closed anyway and nothing is tagged", async (_, script) => {
		const { io, calls, puts } = fakeIO(script)
		expect(await tagByHand("1.0.0", SHA, io)).toBe(2)
		expect(calls).not.toContain("tag")
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
		["a tag origin already has", "1.0.0", SHA, { origin: { object: "3b1d32e5", commit: SHA } }],
		["a ruleset already open to someone", "1.0.0", SHA, { ruleset: { ...APPLIED, bypassActors: [RELEASE_APP, OWNER] } }],
		["a disabled ruleset", "1.0.0", SHA, { ruleset: { ...APPLIED, enforcement: "disabled" } }],
		["a ruleset retargeted at branches", "1.0.0", SHA, { ruleset: { ...APPLIED, target: "branch" } }],
	] as Array<[string, string, string, Script]>)("refuses %s before changing anything", async (_, version, sha, script) => {
		const { io, calls } = fakeIO(script)
		expect(await tagByHand(version, sha, io)).toBe(1)
		expect(calls).not.toContain("put")
		expect(calls).not.toContain("tag")
	})

	test("a pre-check that cannot reach origin refuses rather than throws", async () => {
		const { io, calls } = fakeIO()
		io.remoteTag = async () => {
			throw new Error("git ls-remote exited 128")
		}
		expect(await tagByHand("1.0.0", SHA, io)).toBe(1)
		expect(calls).not.toContain("put")
	})
})

/** `gh` and `git` stand-ins that log every call; the open PUT hangs in a descendant that keeps stdout open. */
function fakeTools(): { dir: string; log: string } {
	const dir = mkdtempSync(join(tmpdir(), "tag-by-hand-"))
	const log = join(dir, "calls.log")
	writeFileSync(log, "")
	const ruleset = JSON.stringify({
		target: "tag",
		enforcement: "active",
		conditions: { ref_name: { include: ["refs/tags/v*"], exclude: ["refs/tags/v*-nightly.*"] } },
		rules: [{ type: "creation" }],
		bypass_actors: [RELEASE_APP],
	})
	const gh = `#!/usr/bin/env bash
echo "gh $*" >> '${log}'
case "$*" in
  "api user --jq .id") echo 2982991 ;;
  *"-X PUT"*) body=$(cat); echo "body $body" >> '${log}'; case "$body" in *User*) sleep 30 & echo "descendant $!" >> '${log}'; wait ;; esac ;;
  *) echo '${ruleset}' ;;
esac
`
	const git = `#!/usr/bin/env bash
echo "git $*" >> '${log}'
`
	for (const [name, text] of [
		["gh", gh],
		["git", git],
	]) {
		writeFileSync(join(dir, name), text)
		chmodSync(join(dir, name), 0o755)
	}
	return { dir, log }
}

describe("the runner process", () => {
	test("a SIGTERM to it alone mid-open ends that step past a descendant holding its output, skips the push, closes", async () => {
		const { dir, log } = fakeTools()
		const child = Bun.spawn(["bun", join(import.meta.dir, "tag-by-hand-run.ts"), "1.0.0", SHA], {
			env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
			stdout: "pipe",
			stderr: "pipe",
		})
		// The runner traps SIGTERM and goes on to close: kill it before its fake gh and git leave PATH.
		onTestFinished(async () => {
			child.kill("SIGKILL")
			await child.exited
			rmSync(dir, { recursive: true, force: true })
		})
		const calls = () => readFileSync(log, "utf8")
		for (let i = 0; i < 100 && !/body .*User/.test(calls()); i++) await Bun.sleep(30)
		child.kill("SIGTERM")
		const code = await child.exited
		const descendant = calls().match(/descendant (\d+)/)?.[1]
		if (descendant) process.kill(Number(descendant), "SIGKILL")
		expect(code).toBe(2)
		expect(calls()).not.toContain("git tag")
		expect(calls()).not.toContain("git push")
		expect(
			calls()
				.trim()
				.split("\n")
				.filter((l) => l.startsWith("body "))
				.at(-1),
		).toBe(`body ${JSON.stringify({ bypass_actors: [RELEASE_APP] })}`)
	})
})
