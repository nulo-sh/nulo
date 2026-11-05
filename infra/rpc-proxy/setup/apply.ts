/**
 * Applies the owner checklist's Cloudflare steps that need no secret: the two custom domains, the
 * configuration rule that keeps challenge pages and HTML rewriting off the proxy hosts, and the
 * Workers Builds connection (production `main`, previews off). Idempotent: a step whose state is
 * already right prints `ok` and does nothing. The Worker itself is created by `bun run deploy`
 * first, and the dRPC secrets stay the owner's.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Cf, readToken } from "./cf"
import { HOSTS, WORKER, ZONE, type WorkerDomain } from "./plan"

const WRANGLER = JSON.parse(readFileSync(join(import.meta.dir, "../wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "")) as {
	account_id: string
}
const ACCOUNT = WRANGLER.account_id
/** The Worker whose Workers Builds connection (repository and build token) the proxy's copies. */
const TEMPLATE_WORKER = "nulo-tokens"
const ROOT = "infra/rpc-proxy"
const REPO_FIELDS = ["provider_type", "provider_account_id", "provider_account_name", "repo_id", "repo_name"] as const
const EXPRESSION = `(http.host in {${HOSTS.map((h) => `"${h}"`).join(" ")}})`
const RULE_DESCRIPTION = `${HOSTS.join(" and ")} — the RPC proxy answers JSON to a wallet, never a browser: no challenge page, no HTML rewriting, no edge-injected script`
/** The parameters the zone's other API hosts (passkey, tokens) already run under. */
const CONFIG = {
	automatic_https_rewrites: false,
	bic: false,
	disable_rum: true,
	disable_zaraz: true,
	email_obfuscation: false,
	mirage: false,
	polish: "off",
	rocket_loader: false,
	security_level: "essentially_off",
}

type Script = { id: string; tag?: string }
type Rule = { id?: string; action: string; expression?: string; description?: string }
type BuildConfig = {
	git_repository?: Record<string, unknown>
	production_settings?: Record<string, unknown>
	previews_enabled?: boolean
}
const say = (line: string) => console.log(line)

async function main() {
	const cf = new Cf(readToken(), say)
	const scripts = await cf.get<Script[]>(`/accounts/${ACCOUNT}/workers/scripts`)
	const worker = scripts.find((s) => s.id === WORKER)
	if (!worker?.tag) throw new Error(`Worker ${WORKER} does not exist yet: run \`bun run deploy\` in ${ROOT} first`)
	const zone = (await cf.get<{ id: string }[]>(`/zones?name=${ZONE}`))[0]
	if (!zone) throw new Error(`zone ${ZONE} is not visible to this token`)

	await attachDomains(cf, zone.id)
	await configRule(cf, zone.id)
	await connectBuilds(cf, worker.tag, scripts)
	say("done")
}

async function attachDomains(cf: Cf, zoneId: string) {
	const domains = await cf.get<WorkerDomain[]>(`/accounts/${ACCOUNT}/workers/domains`)
	for (const hostname of HOSTS) {
		const have = domains.find((d) => d.hostname === hostname)
		if (have && have.service !== WORKER) throw new Error(`${hostname} is attached to ${have.service}; not touching it`)
		if (have) {
			say(`ok: ${hostname} already attached (cert ${have.cert_id ? "issued" : "pending"})`)
			continue
		}
		const made = await cf.put<WorkerDomain>(`/accounts/${ACCOUNT}/workers/domains`, {
			hostname,
			service: WORKER,
			environment: "production",
			zone_id: zoneId,
		})
		say(`attached ${hostname} -> ${made.service} (cert ${made.cert_id ? "issued" : "pending"})`)
	}
}

async function configRule(cf: Cf, zoneId: string) {
	const heads = await cf.get<{ id: string; phase: string }[]>(`/zones/${zoneId}/rulesets`)
	const head = heads.find((h) => h.phase === "http_config_settings")
	if (!head) throw new Error("the zone has no http_config_settings ruleset; create the first configuration rule in the dashboard")
	const rules = (await cf.get<{ rules?: Rule[] }>(`/zones/${zoneId}/rulesets/${head.id}`)).rules ?? []
	const covering = rules.find((r) => r.action === "set_config" && HOSTS.every((h) => (r.expression ?? "").includes(h)))
	if (covering) {
		say(`ok: configuration rule ${covering.id} already covers the proxy hosts`)
		return
	}
	const rule = { action: "set_config", expression: EXPRESSION, description: RULE_DESCRIPTION, enabled: true, action_parameters: CONFIG }
	await cf.post(`/zones/${zoneId}/rulesets/${head.id}/rules`, rule)
	say(`added the configuration rule for ${HOSTS.join(", ")} (security level essentially off, browser integrity check off)`)
}

async function connectBuilds(cf: Cf, tag: string, scripts: Script[]) {
	const have = await cf.maybe<BuildConfig>(`/accounts/${ACCOUNT}/builds/workers/${tag}`, [400, 404])
	if (have) {
		say(
			`ok: Workers Builds already connected (branch ${String(have.git_repository?.branch)}, previews ${have.previews_enabled ? "ON" : "off"})`,
		)
		return
	}
	const templateTag = scripts.find((s) => s.id === TEMPLATE_WORKER)?.tag
	if (!templateTag) throw new Error(`${TEMPLATE_WORKER} is not in this account; nothing to copy the repository connection from`)
	const template = await cf.get<BuildConfig>(`/accounts/${ACCOUNT}/builds/workers/${templateTag}`)
	const repo = template.git_repository
	const token = template.production_settings?.build_token_uuid
	if (!repo || typeof token !== "string") throw new Error(`${TEMPLATE_WORKER}'s build config has no repository or build token to copy`)
	// The GET echoes read-only fields (a null grant id, for one) that the POST refuses, so only the
	// connection's own are copied; and the POST refuses a body with no previews_base_config even
	// with previews off, so the base config is the production one with the preview deploy command.
	const connection = Object.fromEntries(REPO_FIELDS.map((k) => [k, repo[k]]))
	const settings = {
		build_command: "",
		deploy_command: "bun run deploy",
		root_directory: ROOT,
		build_caching_enabled: true,
		path_includes: [`${ROOT}/**`],
		path_excludes: [],
		build_token_uuid: token,
		environment_variables: { BUN_VERSION: { value: "1.4.2", is_secret: false } },
	}
	const body = {
		script_tag: tag,
		git_repository: { ...connection, branch: "main" },
		production_settings: settings,
		previews_enabled: false,
		previews_base_config: { ...settings, deploy_command: "wrangler versions upload" },
	}
	const made = await cf.post<BuildConfig>(`/accounts/${ACCOUNT}/builds/workers`, body)
	say(
		`connected Workers Builds: ${String(repo.provider_account_name)}/${String(repo.repo_name)}@main, root ${ROOT}, previews ${made.previews_enabled ? "ON" : "off"}, build token shared with ${TEMPLATE_WORKER} (narrow it in the dashboard)`,
	)
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error))
	process.exitCode = 1
})
