/**
 * Pushes one stable or rc tag by hand through the tag-creation ruleset's break-glass.
 *
 * `release tags: creation by the release app only` admits only the release App. This adds the
 * caller as a second bypass actor for one `git tag -a` + `git push`, then restores the App as the
 * only one and reads the ruleset back, on every exit path: a refused push, a failed open, and an
 * interrupt (the terminal's SIGINT ends the running `git` or `gh` child, which fails the step).
 *
 * Usage: `bun scripts/release/tag-by-hand-run.ts <X.Y.Z or X.Y.Z-rc.N> <40-hex commit>`.
 * Exit 0: the tag is pushed and the ruleset read back closed. 1: refused before anything changed.
 * 2: no tag pushed, the ruleset read back closed. 3: the ruleset was not read back closed; the
 * printed command closes it.
 */

export const REPO = "nulo-sh/nulo"
export const RULESET_ID = 25437716
export const RELEASE_APP_ID = 5179103

export interface BypassActor {
	actor_id: number
	actor_type: string
	bypass_mode: string
}

export interface RulesetState {
	enforcement: string
	include: string[]
	exclude: string[]
	rules: string[]
	bypassActors: BypassActor[]
}

export const RELEASE_APP: BypassActor = { actor_id: RELEASE_APP_ID, actor_type: "Integration", bypass_mode: "always" }

export const CLOSE_COMMAND = `gh api -X PUT repos/${REPO}/rulesets/${RULESET_ID} --input - <<<'${JSON.stringify({ bypass_actors: [RELEASE_APP] })}'`

/** The injectable GitHub/git side; the real one shells out to `gh` and `git` from the operator's clone. */
export interface TagByHandIO {
	readRuleset(): Promise<RulesetState>
	putBypassActors(actors: BypassActor[]): Promise<void>
	callerId(): Promise<number>
	/** The object origin's tag names, or null when origin has no such tag. */
	remoteTag(tag: string): Promise<string | null>
	commitExists(sha: string): Promise<boolean>
	/** Creates the annotated tag locally and pushes it; a refused push deletes the local tag again. */
	createAndPushTag(tag: string, sha: string, message: string): Promise<void>
	log(msg: string): void
}

const VERSION = /^\d+\.\d+\.\d+(-rc\.\d+)?$/
const COMMIT = /^[0-9a-f]{40}$/

/** True only for the ruleset as applied: anything else is not reopened or closed blind. */
export function isClosed(state: RulesetState): boolean {
	const [actor, ...rest] = state.bypassActors
	return (
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

async function refusal(version: string, sha: string, io: TagByHandIO): Promise<string | null> {
	if (!VERSION.test(version)) return `${version} is not a stable or rc version (X.Y.Z or X.Y.Z-rc.N)`
	if (!COMMIT.test(sha)) return `${sha} is not a full 40-hex commit`
	if (!(await io.commitExists(sha))) return `${sha} is not a commit in this clone; fetch it first`
	const existing = await io.remoteTag(`v${version}`)
	if (existing !== null) return `v${version} already exists on origin (object ${existing}); nothing to push`
	if (!isClosed(await io.readRuleset())) return `ruleset ${RULESET_ID} is not in its applied state; repair it before tagging`
	return null
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function close(io: TagByHandIO): Promise<boolean> {
	try {
		await io.putBypassActors([RELEASE_APP])
		return isClosed(await io.readRuleset())
	} catch (error) {
		io.log(`closing failed: ${message(error)}`)
		return false
	}
}

/** Opens the break-glass for the one tag and closes it on every path; returns the process exit code. */
export async function tagByHand(version: string, sha: string, io: TagByHandIO): Promise<number> {
	const refused = await refusal(version, sha, io)
	if (refused) {
		io.log(`refused: ${refused}`)
		return 1
	}
	let pushed = false
	try {
		const caller: BypassActor = { actor_id: await io.callerId(), actor_type: "User", bypass_mode: "always" }
		await io.putBypassActors([RELEASE_APP, caller])
		await io.createAndPushTag(`v${version}`, sha, `Release ${version}`)
		pushed = true
		io.log(`pushed v${version} at ${sha}`)
	} catch (error) {
		io.log(`not pushed: ${message(error)}`)
	}
	// A failed or interrupted open may still have reached GitHub, so closing never depends on it.
	if (!(await close(io))) {
		io.log(`ruleset ${RULESET_ID} was not read back with the release App alone. Close it now:\n${CLOSE_COMMAND}`)
		return 3
	}
	io.log(`ruleset ${RULESET_ID} read back closed: the release App alone`)
	return pushed ? 0 : 2
}

if (import.meta.main) {
	const { $ } = await import("bun")
	const path = `repos/${REPO}/rulesets/${RULESET_ID}`
	const realIO: TagByHandIO = {
		async readRuleset() {
			const r = (await $`gh api ${path}`.json()) as {
				enforcement: string
				conditions?: { ref_name?: { include?: string[]; exclude?: string[] } }
				rules?: Array<{ type: string }>
				bypass_actors?: BypassActor[]
			}
			return {
				enforcement: r.enforcement,
				include: r.conditions?.ref_name?.include ?? [],
				exclude: r.conditions?.ref_name?.exclude ?? [],
				rules: (r.rules ?? []).map((rule) => rule.type),
				bypassActors: r.bypass_actors ?? [],
			}
		},
		async putBypassActors(actors) {
			const body = new Response(JSON.stringify({ bypass_actors: actors }))
			await $`gh api -X PUT ${path} --input - < ${body}`.quiet()
		},
		async callerId() {
			return Number((await $`gh api user --jq .id`.text()).trim())
		},
		async remoteTag(tag) {
			const out = await $`git ls-remote --tags --refs origin ${`refs/tags/${tag}`}`.text()
			const line = out.split("\n").find((l) => l.endsWith(`\trefs/tags/${tag}`))
			return line ? line.split("\t")[0] : null
		},
		async commitExists(sha) {
			return (await $`git cat-file -e ${`${sha}^{commit}`}`.nothrow().quiet()).exitCode === 0
		},
		async createAndPushTag(tag, sha, message) {
			await $`git tag -a ${tag} ${sha} -m ${message}`
			const push = await $`git push origin ${`refs/tags/${tag}`}`.nothrow()
			if (push.exitCode !== 0) {
				await $`git tag -d ${tag}`.nothrow().quiet()
				throw new Error(`git push exited ${push.exitCode}`)
			}
		},
		log: (m) => console.log(m),
	}
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
		process.on(signal, () => console.log(`${signal}: stopping at the current step, then closing the ruleset`))
	const [version = "", sha = ""] = process.argv.slice(2)
	process.exit(await tagByHand(version, sha, realIO))
}
