/**
 * Gives one Worker a build token of its own: a user API token holding Cloudflare's per-Worker
 * Editor role on that Worker alone, proven on a disposable Worker before it is registered with
 * Workers Builds and set on the Worker's build configuration. The token's value lives in this
 * process only, between its creation and its registration; it is never printed or written.
 *
 *   bun setup/build-token.ts narrow <worker> [--account-read] [--local-deploy <dir>] [--role workers-scripts] [--name <token name>]
 *   bun setup/build-token.ts status
 *   bun setup/build-token.ts probe-worker delete
 *
 * `--local-deploy <dir>` runs `wrangler deploy` in <dir> under the new token alone, as the
 * positive control; only for a Worker whose checkout here is the code it serves.
 * `--role workers-scripts` asks for account-wide `Workers Scripts Write` instead of the per-Worker
 * role (Cloudflare refuses granular roles on user tokens, and Builds accepts user tokens only): the
 * token then reaches every Worker, so the probe tests are skipped and only the deploy is proven.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Cf, CfRequestError, readToken } from "./cf"

const WRANGLER = JSON.parse(readFileSync(join(import.meta.dir, "../wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "")) as {
	account_id: string
}
const ACCOUNT = WRANGLER.account_id
const PROBE = "nulo-scope-probe"
const EDITOR = "Individual Workers Editor"
const say = (line: string) => console.log(line)

type Script = { id: string; tag?: string }
type Group = { id: string; name: string }
type Policy = { effect: "allow"; resources: Record<string, unknown>; permission_groups: { id: string; name: string }[] }
type Token = { id: string; name: string; value?: string; status?: string; policies?: Policy[] }

/** The resource spellings Cloudflare might use for one Worker; the API's 400 on a wrong one creates nothing. */
export function candidates(account: string, name: string, tag: string): Record<string, unknown>[] {
	const keys = [`${account}_${name}`, `${account}_${tag}`, tag, name]
	const flat = keys.map((k) => ({ [`com.cloudflare.edge.worker.script.${k}`]: "*" }))
	const nested = keys.map((k) => ({ [`com.cloudflare.api.account.${account}`]: { [`com.cloudflare.edge.worker.script.${k}`]: "*" } }))
	return [...flat, ...nested]
}

/** A write refused for want of permission; anything else, a 2xx above all, is not a refusal. */
export const denied = (status: number) => status === 401 || status === 403

async function main() {
	const [command, worker, ...flags] = process.argv.slice(2)
	const cf = new Cf(readToken(), say)
	if (command === "status") return status(cf)
	if (command === "probe-worker" && worker === "delete") return deleteProbe(cf)
	if (command !== "narrow" || !worker)
		throw new Error("usage: narrow <worker> [--account-read] [--local-deploy <dir>] | status | probe-worker delete")
	const flag = (name: string) => (flags.includes(name) ? flags[flags.indexOf(name) + 1] : undefined)
	await narrow(cf, worker, {
		accountRead: flags.includes("--account-read"),
		localDeploy: flag("--local-deploy"),
		wide: flag("--role") === "workers-scripts",
		name: flag("--name"),
	})
}

async function status(cf: Cf) {
	const scripts = await cf.get<Script[]>(`/accounts/${ACCOUNT}/workers/scripts`)
	for (const s of scripts.filter((s) => s.id.startsWith("nulo-"))) {
		const b = s.tag
			? await cf.maybe<{ production_settings?: { build_token_uuid?: string } }>(
					`/accounts/${ACCOUNT}/builds/workers/${s.tag}`,
					[400, 404],
				)
			: null
		say(`${s.id}: build token ${b?.production_settings?.build_token_uuid ?? (b ? "none" : "not connected")}`)
	}
}

type NarrowOptions = { accountRead: boolean; localDeploy?: string; wide: boolean; name?: string }

async function narrow(cf: Cf, worker: string, opts: NarrowOptions) {
	const scripts = await cf.get<Script[]>(`/accounts/${ACCOUNT}/workers/scripts`)
	const tag = scripts.find((s) => s.id === worker)?.tag
	if (!tag) throw new Error(`${worker} is not a Worker of this account`)
	const config = await cf.get<{ production_settings?: { build_token_uuid?: string } }>(`/accounts/${ACCOUNT}/builds/workers/${tag}`)
	say(`${worker}: tag ${tag}, build token now ${config.production_settings?.build_token_uuid ?? "none"} (rollback value)`)
	if (!opts.wide) await ensureProbe(cf)
	const groups = await cf.get<Group[]>("/user/tokens/permission_groups")
	const token = opts.wide
		? await createWideToken(cf, opts.name ?? `${worker} build`, groups)
		: await createToken(cf, worker, tag, groups, opts.accountRead)
	try {
		if (!opts.wide) await proveScope(token, worker, tag)
		if (opts.localDeploy) await proveDeploy(token, opts.localDeploy, opts.wide)
		const uuid = await register(cf, token)
		await cf.patch(`/accounts/${ACCOUNT}/builds/workers/${tag}`, { production_settings: { build_token_uuid: uuid } })
		const after = await cf.get<{ production_settings?: { build_token_uuid?: string } }>(`/accounts/${ACCOUNT}/builds/workers/${tag}`)
		say(`done: ${worker} builds with token "${token.name}" (${token.id}), registry ${after.production_settings?.build_token_uuid}`)
	} catch (error) {
		say(`failed after creating "${token.name}" (${token.id}); deleting it`)
		await cf
			.call("DELETE", `/user/tokens/${token.id}`)
			.catch((e: unknown) => say(`  delete failed: ${e instanceof Error ? e.message : String(e)}`))
		throw error
	}
}

/** The disposable Worker every negative write targets; created under the broad token, which is also the positive control for that write. */
async function ensureProbe(cf: Cf) {
	const have = await cf.maybe<unknown>(`/accounts/${ACCOUNT}/workers/scripts/${PROBE}/settings`, [404])
	if (have) {
		say(`probe Worker ${PROBE} exists`)
		return
	}
	const res = await putScript(readToken(), PROBE)
	if (!res.ok) throw new Error(`could not create the probe Worker: HTTP ${res.status}`)
	say(`probe Worker ${PROBE} created`)
}

async function deleteProbe(cf: Cf) {
	await cf.call("DELETE", `/accounts/${ACCOUNT}/workers/scripts/${PROBE}?force=true`)
	say(`probe Worker ${PROBE} deleted`)
}

/** A minimal module upload; the status is the whole answer, the body is never read into a log. */
async function putScript(bearer: string, name: string): Promise<{ ok: boolean; status: number }> {
	const form = new FormData()
	form.set(
		"metadata",
		new Blob([JSON.stringify({ main_module: "index.mjs", compatibility_date: "2026-09-01" })], { type: "application/json" }),
	)
	form.set(
		"index.mjs",
		new Blob(['export default { fetch() { return new Response("probe") } }'], { type: "application/javascript+module" }),
		"index.mjs",
	)
	const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/${name}`, {
		method: "PUT",
		headers: { authorization: `Bearer ${bearer}` },
		body: form,
	})
	await res.text()
	return { ok: res.ok, status: res.status }
}

function requireGroups(groups: Group[]): { editor: Group; settingsRead: Group } {
	const editor = groups.find((g) => g.name === EDITOR)
	const settingsRead = groups.find((g) => g.name === "Account Settings Read")
	if (!editor || !settingsRead)
		throw new Error(
			`permission groups missing: ${[!editor && EDITOR, !settingsRead && "Account Settings Read"].filter(Boolean).join(", ")}`,
		)
	return { editor, settingsRead }
}

/** Every resource key of a token's policies, a nested one as `key:{inner,...}`. */
const resourceKeys = (token: Token) =>
	(token.policies ?? []).flatMap((p) =>
		Object.entries(p.resources).map(([k, v]) => (typeof v === "object" && v ? `${k}:{${Object.keys(v).join(",")}}` : k)),
	)

/** One creation attempt; a 400 is a refused spelling and yields null, anything else throws. */
async function tryCreate(cf: Cf, body: unknown, resources: Record<string, unknown>): Promise<Token | null> {
	try {
		return await cf.post<Token>("/user/tokens", body)
	} catch (error) {
		if (!(error instanceof CfRequestError) || error.status !== 400) throw error
		say(
			`  resource spelling refused: ${Object.keys(resources)[0]}${error.errors[0] ? ` (${error.errors[0].code} ${error.errors[0].message})` : ""}`,
		)
		return null
	}
}

async function createToken(cf: Cf, worker: string, tag: string, groups: Group[], accountRead: boolean): Promise<Token & { value: string }> {
	const { editor, settingsRead } = requireGroups(groups)
	const extra: Policy[] = accountRead
		? [{ effect: "allow", resources: { [`com.cloudflare.api.account.${ACCOUNT}`]: "*" }, permission_groups: [settingsRead] }]
		: []
	for (const resources of candidates(ACCOUNT, worker, tag)) {
		const policies: Policy[] = [{ effect: "allow", resources, permission_groups: [{ id: editor.id, name: editor.name }] }, ...extra]
		const made = await tryCreate(cf, { name: `${worker} build`, policies }, resources)
		if (!made) continue
		if (!made.value) throw new Error("the token was created but its value was not returned")
		const back = await cf.get<Token>(`/user/tokens/${made.id}`)
		const keys = resourceKeys(back)
		say(
			`created "${made.name}" (${made.id}) with resources ${keys.join(" ")} and roles ${(back.policies ?? []).flatMap((p) => p.permission_groups.map((g) => g.name)).join(", ")}`,
		)
		if (!keys.some((k) => k.includes(worker) || k.includes(tag))) {
			await cf.call("DELETE", `/user/tokens/${made.id}`)
			throw new Error("the accepted policy names neither the Worker nor its tag; token deleted")
		}
		return { ...made, value: made.value }
	}
	throw new Error("no resource spelling for one Worker was accepted: per-Worker tokens are not available to this account yet")
}

/** The fallback token: Workers Scripts Write and Account Settings Read on this account, nothing else. */
async function createWideToken(cf: Cf, name: string, groups: Group[]): Promise<Token & { value: string }> {
	const pick = (n: string) => {
		const g = groups.find((g) => g.name === n)
		if (!g) throw new Error(`permission group missing: ${n}`)
		return { id: g.id, name: g.name }
	}
	const policies: Policy[] = [
		{
			effect: "allow",
			resources: { [`com.cloudflare.api.account.${ACCOUNT}`]: "*" },
			permission_groups: [pick("Workers Scripts Write"), pick("Account Settings Read")],
		},
	]
	const made = await cf.post<Token>("/user/tokens", { name, policies })
	if (!made.value) throw new Error("the token was created but its value was not returned")
	const back = await cf.get<Token>(`/user/tokens/${made.id}`)
	say(
		`created "${made.name}" (${made.id}) with resources ${resourceKeys(back).join(" ")} and roles ${(back.policies ?? []).flatMap((p) => p.permission_groups.map((g) => g.name)).join(", ")}`,
	)
	return { ...made, value: made.value }
}

/** Reads on its own Worker succeed; a secret write and a code upload on the probe Worker are refused. */
async function proveScope(token: Token & { value: string }, worker: string, tag: string) {
	const own = new Cf(token.value, (line) => say(`  [${worker} build] ${line}`))
	const verify = await own.get<{ status: string }>("/user/tokens/verify")
	if (verify.status !== "active") throw new Error(`new token status ${verify.status}`)
	await own.get(`/accounts/${ACCOUNT}/workers/scripts/${worker}/settings`)
	const settings = await own.call("GET", `/accounts/${ACCOUNT}/workers/scripts/${PROBE}/settings`).then(
		() => 200,
		(e: unknown) => (e instanceof CfRequestError ? e.status : 0),
	)
	const secret = await own
		.call("PUT", `/accounts/${ACCOUNT}/workers/scripts/${PROBE}/secrets`, { name: "SCOPE_PROBE", text: "1", type: "secret_text" })
		.then(
			() => 200,
			(e: unknown) => (e instanceof CfRequestError ? e.status : 0),
		)
	const upload = await putScript(token.value, PROBE)
	say(`  probe ${PROBE}: settings read ${settings}, secret write ${secret}, code upload ${upload.status}`)
	if (!denied(settings) || !denied(secret) || !denied(upload.status))
		throw new Error("the new token reached the probe Worker; it is not confined to its own")
	const control = await putScript(readToken(), PROBE)
	if (!control.ok) throw new Error(`the control upload under the broad token failed: HTTP ${control.status}`)
	say(
		`  control: the broad token uploads to ${PROBE} (HTTP ${control.status}), so the refusals above are the token's scope, not the Worker's state`,
	)
	void tag
}

/** `wrangler deploy` in the Worker's directory under the new token alone, then the same deploy aimed at the probe Worker, which must fail. */
async function proveDeploy(token: Token & { value: string }, dir: string, wide: boolean) {
	const run = async (args: string[]) => {
		const proc = Bun.spawn(["bun", "--no-install", "./node_modules/.bin/wrangler", ...args], {
			cwd: dir,
			env: {
				PATH: process.env.PATH ?? "",
				HOME: process.env.HOME ?? "",
				CLOUDFLARE_API_TOKEN: token.value,
				WRANGLER_SEND_METRICS: "false",
				CI: "1",
			},
			stdout: "pipe",
			stderr: "pipe",
		})
		const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
		return { code: await proc.exited, text: `${out}\n${err}` }
	}
	const own = await run(["deploy"])
	const version = own.text.match(/Current Version ID: ([0-9a-f-]+)/)?.[1]
	say(`  wrangler deploy under the new token: exit ${own.code}${version ? `, version ${version}` : ""}`)
	if (own.code !== 0)
		throw new Error(
			`the deploy under the new token failed:\n${own.text
				.split("\n")
				.filter((l) => /error|Error|\[code/.test(l))
				.slice(0, 6)
				.join("\n")}`,
		)
	// An account-wide token reaches every Worker by design; the negative deploy would only create the probe Worker.
	if (wide) return
	const other = await run(["deploy", "--name", PROBE])
	say(
		`  wrangler deploy --name ${PROBE} under the new token: exit ${other.code}${/10000|Authentication error|not authorized|403/i.test(other.text) ? " (authentication refused)" : ""}`,
	)
	if (other.code === 0) throw new Error(`the new token deployed to ${PROBE}; it is not confined to its own Worker`)
}

async function register(cf: Cf, token: Token & { value: string }): Promise<string> {
	const made = await cf.post<{ build_token_uuid?: string }>(`/accounts/${ACCOUNT}/builds/tokens`, {
		build_token_name: token.name,
		cloudflare_token_id: token.id,
		build_token_secret: token.value,
	})
	if (!made.build_token_uuid) throw new Error("Builds registered the token but returned no uuid")
	say(`registered with Workers Builds as ${made.build_token_uuid}`)
	return made.build_token_uuid
}

if (import.meta.main) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error))
		process.exitCode = 1
	})
}
