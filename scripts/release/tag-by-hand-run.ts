/**
 * Pushes one stable or rc tag by hand through the tag-creation ruleset's break-glass.
 *
 * `release tags: creation by the release app only` admits only the release App. This adds the
 * caller as a second bypass actor for one `git tag -a` + `git push`, then restores the App as the
 * only one and reads the ruleset back. The restore runs after a refused push, a failed open, a
 * timed-out step and a SIGINT, SIGTERM or SIGHUP (which also ends the running child); a SIGKILL, a
 * lost host or an unreachable GitHub can still leave the caller admitted.
 *
 * Usage: `bun scripts/release/tag-by-hand-run.ts <X.Y.Z or X.Y.Z-rc.N> <40-hex commit>`.
 * Exit 0: origin's tag names the commit; the ruleset read back closed. 1: refused before anything
 * changed. 2: origin has no such tag; the ruleset read back closed. 3: the ruleset was not read back
 * closed; the printed command closes it. 4: the ruleset read back closed, but origin's tag could not
 * be confirmed at the commit; the local tag is kept for the check the log prints.
 */

export const REPO = "nulo-sh/nulo"
export const RULESET_ID = 25437716
export const RELEASE_APP_ID = 5179103
/** A tag push is a few hundred bytes; any step slower than this is hung, not slow. */
export const STEP_TIMEOUT_MS = 120_000

export interface BypassActor {
	actor_id: number
	actor_type: string
	bypass_mode: string
}

export interface RulesetState {
	target: string
	enforcement: string
	include: string[]
	exclude: string[]
	rules: string[]
	bypassActors: BypassActor[]
}

/** What origin holds under a tag name: the ref's object and the commit it peels to. */
export interface RemoteTag {
	object: string
	commit: string
}

export const RELEASE_APP: BypassActor = { actor_id: RELEASE_APP_ID, actor_type: "Integration", bypass_mode: "always" }

export const CLOSE_COMMAND = `gh api -X PUT repos/${REPO}/rulesets/${RULESET_ID} --input - <<<'${JSON.stringify({ bypass_actors: [RELEASE_APP] })}'`

/** The injectable GitHub/git side; the real one shells out to `gh` and `git` from the operator's clone. */
export interface TagByHandIO {
	readRuleset(): Promise<RulesetState>
	putBypassActors(actors: BypassActor[]): Promise<void>
	callerId(): Promise<number>
	remoteTag(tag: string): Promise<RemoteTag | null>
	commitExists(sha: string): Promise<boolean>
	createLocalTag(tag: string, sha: string, message: string): Promise<void>
	pushTag(tag: string): Promise<void>
	deleteLocalTag(tag: string): Promise<void>
	/** True once a signal asked the run to stop; the push is never started after it. */
	cancelled(): boolean
	log(msg: string): void
}

const VERSION = /^\d+\.\d+\.\d+(-rc\.\d+)?$/
const COMMIT = /^[0-9a-f]{40}$/

/** True only for the ruleset as applied: anything else is not reopened or reported closed. */
export function isClosed(state: RulesetState): boolean {
	const [actor, ...rest] = state.bypassActors
	return (
		state.target === "tag" &&
		state.enforcement === "active" &&
		state.include.join() === "refs/tags/v*" &&
		state.exclude.join() === "refs/tags/v*-nightly.*" &&
		state.rules.join() === "creation" &&
		rest.length === 0 &&
		actor?.actor_id === RELEASE_APP.actor_id &&
		actor.actor_type === RELEASE_APP.actor_type &&
		actor.bypass_mode === RELEASE_APP.bypass_mode
	)
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function refusal(version: string, sha: string, io: TagByHandIO): Promise<string | null> {
	if (!VERSION.test(version)) return `${version} is not a stable or rc version (X.Y.Z or X.Y.Z-rc.N)`
	if (!COMMIT.test(sha)) return `${sha} is not a full 40-hex commit`
	if (!(await io.commitExists(sha))) return `${sha} is not a commit in this clone; fetch it first`
	const existing = await io.remoteTag(`v${version}`)
	if (existing) return `v${version} already exists on origin at ${existing.commit}; nothing to push`
	if (!isClosed(await io.readRuleset())) return `ruleset ${RULESET_ID} is not in its applied state; repair it before tagging`
	return null
}

async function close(io: TagByHandIO): Promise<boolean> {
	try {
		await io.putBypassActors([RELEASE_APP])
		return isClosed(await io.readRuleset())
	} catch (error) {
		io.log(`closing failed: ${message(error)}`)
		return false
	}
}

/** Origin, not the push's exit status, decides: a push can land and still lose its response. */
async function outcome(tag: string, sha: string, io: TagByHandIO): Promise<0 | 2 | 4> {
	try {
		const remote = await io.remoteTag(tag)
		if (remote?.commit === sha) return 0
		if (!remote) return 2
		io.log(`origin's ${tag} names ${remote.commit}, not ${sha}`)
		return 4
	} catch (error) {
		io.log(`could not read ${tag} on origin: ${message(error)}`)
		return 4
	}
}

/** Opens the break-glass for the one tag and closes it on every path it runs; returns the exit code. */
export async function tagByHand(version: string, sha: string, io: TagByHandIO): Promise<number> {
	const refused = await refusal(version, sha, io).catch((error) => `could not check: ${message(error)}`)
	if (refused) {
		io.log(`refused: ${refused}`)
		return 1
	}
	const tag = `v${version}`
	let created = false
	let attempted = false
	const stopIfCancelled = () => {
		if (io.cancelled()) throw new Error("stopped by a signal")
	}
	try {
		const caller: BypassActor = { actor_id: await io.callerId(), actor_type: "User", bypass_mode: "always" }
		await io.putBypassActors([RELEASE_APP, caller])
		stopIfCancelled()
		await io.createLocalTag(tag, sha, `Release ${version}`)
		created = true
		stopIfCancelled()
		attempted = true
		await io.pushTag(tag)
	} catch (error) {
		io.log(`not pushed: ${message(error)}`)
	}
	// A failed or interrupted open may still have reached GitHub, so closing never depends on it.
	const closed = await close(io)
	const result = attempted ? await outcome(tag, sha, io) : 2
	// Only a tag this run created is removed, and only once origin is known not to hold it.
	if (result === 2 && created) await io.deleteLocalTag(tag)
	if (!closed) {
		io.log(`ruleset ${RULESET_ID} was not read back with the release App alone. Close it now:\n${CLOSE_COMMAND}`)
		return 3
	}
	io.log(`ruleset ${RULESET_ID} read back closed: the release App alone`)
	if (result === 0) io.log(`${tag} is on origin at ${sha}`)
	if (result === 2) io.log(`${tag} was not pushed`)
	if (result === 4) io.log(`check before relabeling: git ls-remote --tags origin 'refs/tags/${tag}^{}' 'refs/tags/${tag}'`)
	return result
}

if (import.meta.main) {
	const path = `repos/${REPO}/rulesets/${RULESET_ID}`
	let active: ReturnType<typeof Bun.spawn> | null = null
	let stopped = false
	/** Runs one bounded child; only stdout is captured, so git's prompts and progress stay visible. */
	const run = async (cmd: string[], input?: string): Promise<string> => {
		const child = Bun.spawn(cmd, {
			stdin: input === undefined ? "inherit" : new Response(input),
			stdout: "pipe",
			stderr: "inherit",
			timeout: STEP_TIMEOUT_MS,
		})
		active = child
		try {
			const out = await new Response(child.stdout).text()
			const code = await child.exited
			if (code !== 0)
				throw new Error(`${cmd.slice(0, 3).join(" ")} exited ${code}${child.signalCode ? ` (${child.signalCode})` : ""}`)
			return out
		} finally {
			active = null
		}
	}
	const realIO: TagByHandIO = {
		async readRuleset() {
			const r = JSON.parse(await run(["gh", "api", path])) as {
				target: string
				enforcement: string
				conditions?: { ref_name?: { include?: string[]; exclude?: string[] } }
				rules?: Array<{ type: string }>
				bypass_actors?: BypassActor[]
			}
			return {
				target: r.target,
				enforcement: r.enforcement,
				include: r.conditions?.ref_name?.include ?? [],
				exclude: r.conditions?.ref_name?.exclude ?? [],
				rules: (r.rules ?? []).map((rule) => rule.type),
				bypassActors: r.bypass_actors ?? [],
			}
		},
		async putBypassActors(actors) {
			await run(["gh", "api", "-X", "PUT", path, "--input", "-"], JSON.stringify({ bypass_actors: actors }))
		},
		async callerId() {
			return Number((await run(["gh", "api", "user", "--jq", ".id"])).trim())
		},
		async remoteTag(tag) {
			const ref = `refs/tags/${tag}`
			const lines = (await run(["git", "ls-remote", "--tags", "origin", ref, `${ref}^{}`])).split("\n")
			const sha = (name: string) => lines.find((l) => l.endsWith(`\t${name}`))?.split("\t")[0]
			const object = sha(ref)
			return object ? { object, commit: sha(`${ref}^{}`) ?? object } : null
		},
		async commitExists(sha) {
			return (await Bun.spawn(["git", "cat-file", "-e", `${sha}^{commit}`], { stderr: "ignore" }).exited) === 0
		},
		async createLocalTag(tag, sha, msg) {
			await run(["git", "tag", "-a", tag, sha, "-m", msg])
		},
		async pushTag(tag) {
			await run(["git", "push", "origin", `refs/tags/${tag}`])
		},
		async deleteLocalTag(tag) {
			await Bun.spawn(["git", "tag", "-d", tag], { stdout: "ignore", stderr: "ignore" }).exited
		},
		cancelled: () => stopped,
		log: (m) => console.log(m),
	}
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
		process.on(signal, () => {
			stopped = true
			active?.kill()
			console.error(`${signal}: stopping the current step; the ruleset is closed next`)
		})
	const [version = "", sha = ""] = process.argv.slice(2)
	process.exit(await tagByHand(version, sha, realIO))
}
