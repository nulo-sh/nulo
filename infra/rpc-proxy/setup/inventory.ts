/**
 * Reads the Cloudflare account against the owner checklist in ../README.md and prints the steps
 * left. Read-only: every call is a GET. Runs only as a keyed run under a temporary token.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Cf, readToken } from "./cf"
import {
	type BuildConfig,
	type DnsRecord,
	HOSTS,
	type Inventory,
	plan,
	type Rule,
	type Ruleset,
	WORKER,
	type WorkerDomain,
	ZONE,
} from "./plan"

const WRANGLER = JSON.parse(readFileSync(join(import.meta.dir, "../wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "")) as {
	name: string
	account_id: string
}
const PHASES = new Set(["http_request_firewall_custom", "http_ratelimit", "http_config_settings", "http_request_firewall_managed"])
const say = (line: string) => console.log(line)
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

type Zone = { id: string; name: string; status: string; plan?: { name?: string } }
type Script = { id: string; tag?: string }
type RulesetHead = { id: string; phase: string; name?: string; kind?: string }
type LegacyRule = { action: string; description?: string; paused?: boolean; filter?: { expression?: string } }
type PageRule = { targets?: { constraint?: { value?: string } }[] }
type CertPack = { type?: string; hosts?: string[]; status?: string; certificate_authority?: string }
type UserToken = {
	name?: string
	status?: string
	expires_on?: string
	policies?: { effect?: string; resources?: Record<string, unknown>; permission_groups?: { name?: string }[] }[]
}

async function main() {
	if (WRANGLER.name !== WORKER) throw new Error(`wrangler.jsonc names ${WRANGLER.name}, not ${WORKER}`)
	const cf = new Cf(readToken(), say)
	const account = WRANGLER.account_id
	const verify = await cf.get<{ status: string; expires_on?: string }>("/user/tokens/verify")
	say(`token ${verify.status}, expires ${verify.expires_on ?? "never"}`)

	const zone = await readZone(cf)
	const dns = await readDns(cf, zone.id)
	const fightMode = await readFightMode(cf, zone.id)
	const securityLevel = await readSetting(cf, zone.id, "security_level")
	const browserCheck = await readSetting(cf, zone.id, "browser_check")
	const rulesets = await readRulesets(cf, zone.id)
	const legacyRules = await readLegacy(cf, zone.id)
	const pageRuleTargets = await readPageRules(cf, zone.id)
	await readCertPacks(cf, zone.id)

	const scripts = await cf.get<Script[]>(`/accounts/${account}/workers/scripts`)
	say(`== workers: ${scripts.map((s) => s.id).join(", ") || "none"}`)
	const domains = await cf.get<WorkerDomain[]>(`/accounts/${account}/workers/domains`)
	say(`== worker domains: ${domains.length}`)
	for (const d of domains) say(`  ${d.hostname} -> ${d.service}${d.cert_id ? "" : " (no certificate id)"}`)
	const builds = await readBuilds(cf, account, scripts)
	await readBuildTokens(cf, account)
	await readUserTokens(cf)

	const inventory: Inventory = {
		workers: scripts.map((s) => s.id),
		domains,
		dns,
		fightMode,
		securityLevel,
		browserCheck,
		rulesets,
		legacyRules,
		pageRuleTargets,
		builds,
	}
	say("== plan")
	for (const step of plan(inventory)) say(`  ${step}`)
}

async function readZone(cf: Cf): Promise<Zone> {
	const zone = (await cf.get<Zone[]>(`/zones?name=${ZONE}`))[0]
	if (!zone) throw new Error(`zone ${ZONE} is not visible to this token`)
	say(`== zone ${zone.name} ${zone.status}, plan ${zone.plan?.name ?? "?"}`)
	return zone
}

async function readDns(cf: Cf, zoneId: string): Promise<DnsRecord[]> {
	const records = await cf.get<DnsRecord[]>(`/zones/${zoneId}/dns_records?per_page=500`)
	const relevant = records.filter((r) => HOSTS.includes(r.name) || r.name.endsWith(".rpc.nulo.sh") || r.name === "tokens.nulo.sh")
	say(`== dns: ${records.length} records, ${relevant.length} on the proxy or token hosts`)
	for (const r of relevant) say(`  ${r.type} ${r.name} -> ${r.content}${r.proxied ? " (proxied)" : ""}`)
	return relevant
}

async function readFightMode(cf: Cf, zoneId: string): Promise<boolean | null> {
	const bot = await cf.maybe<Record<string, unknown>>(`/zones/${zoneId}/bot_management`, [403, 404])
	if (!bot) {
		say("== bot management: unreadable")
		return null
	}
	say(
		`== bot management: ${Object.entries(bot)
			.map(([k, v]) => `${k}=${String(v)}`)
			.join(" ")}`,
	)
	return typeof bot.fight_mode === "boolean" ? bot.fight_mode : null
}

async function readSetting(cf: Cf, zoneId: string, id: string): Promise<string | null> {
	const setting = await cf.maybe<{ value: string }>(`/zones/${zoneId}/settings/${id}`, [403, 404])
	say(`== setting ${id}: ${setting?.value ?? "unreadable"}`)
	return setting?.value ?? null
}

async function readRulesets(cf: Cf, zoneId: string): Promise<Ruleset[]> {
	const heads = await cf.get<RulesetHead[]>(`/zones/${zoneId}/rulesets`)
	const out: Ruleset[] = []
	for (const head of heads.filter((h) => PHASES.has(h.phase))) {
		const rules = (await cf.get<{ rules?: Rule[] }>(`/zones/${zoneId}/rulesets/${head.id}`)).rules ?? []
		say(`== ruleset ${head.phase} (${head.kind ?? "?"}): ${rules.length} rules`)
		for (const r of rules) say(`  ${r.enabled === false ? "[off] " : ""}${r.action} "${r.description ?? ""}" on ${r.expression}`)
		out.push({ phase: head.phase, name: head.name, rules })
	}
	return out
}

async function readLegacy(cf: Cf, zoneId: string): Promise<Rule[]> {
	const rules = (await cf.maybe<LegacyRule[]>(`/zones/${zoneId}/firewall/rules`, [400, 403, 404, 410])) ?? []
	const out = rules.map((r) => ({
		action: r.action,
		description: r.description,
		enabled: !r.paused,
		expression: r.filter?.expression ?? "",
	}))
	say(`== legacy firewall rules: ${out.length}`)
	for (const r of out) say(`  ${r.enabled ? "" : "[off] "}${r.action} "${r.description ?? ""}" on ${r.expression}`)
	return out
}

async function readPageRules(cf: Cf, zoneId: string): Promise<string[]> {
	const rules = (await cf.maybe<PageRule[]>(`/zones/${zoneId}/pagerules`, [403, 404])) ?? []
	const targets = rules.flatMap((r) => (r.targets ?? []).map((t) => t.constraint?.value ?? "?"))
	say(`== page rules: ${targets.join(", ") || "none"}`)
	return targets
}

async function readCertPacks(cf: Cf, zoneId: string) {
	const packs = (await cf.maybe<CertPack[]>(`/zones/${zoneId}/ssl/certificate_packs?status=all`, [403, 404])) ?? []
	say(`== certificate packs: ${packs.length}`)
	for (const p of packs) say(`  ${p.type ?? "?"} ${p.status ?? "?"} ${p.certificate_authority ?? ""}: ${(p.hosts ?? []).join(", ")}`)
}

async function readBuilds(cf: Cf, account: string, scripts: Script[]): Promise<Record<string, BuildConfig | null>> {
	const builds: Record<string, BuildConfig | null> = {}
	for (const script of scripts) {
		const config = script.tag ? await cf.maybe<BuildConfig>(`/accounts/${account}/builds/workers/${script.tag}`, [400, 403, 404]) : null
		builds[script.id] = config
		if (!config) {
			say(`== builds ${script.id}: ${script.tag ? "not connected" : "no tag in the scripts list"}`)
			continue
		}
		const p = config.production_settings
		const repo = `${config.git_repository?.repo_name ?? "?"}@${config.git_repository?.branch ?? "?"}`
		say(
			`== builds ${script.id}: ${repo} root ${p?.root_directory ?? "/"} deploy "${p?.deploy_command ?? ""}" token ${p?.build_token_uuid ?? "?"} previews ${config.previews_enabled ? "ON" : "off"}`,
		)
	}
	return builds
}

/** Build tokens are listed by name and uuid only; the listing's envelope key is unknown, so both an array and a wrapped one are read. */
async function readBuildTokens(cf: Cf, account: string) {
	const raw = await cf.maybe<unknown>(`/accounts/${account}/builds/tokens`, [400, 403, 404])
	const wrapped = isRecord(raw) ? (Object.values(raw).find(Array.isArray) as unknown[] | undefined) : undefined
	const list: unknown[] = Array.isArray(raw) ? raw : (wrapped ?? [])
	say(`== build tokens: ${list.length}${isRecord(raw) ? ` (keys ${Object.keys(raw).join(",")})` : ""}`)
	for (const t of list) {
		const row = isRecord(t) ? t : {}
		say(`  ${String(row.build_token_name ?? row.name ?? "?")} ${String(row.build_token_uuid ?? row.uuid ?? row.id ?? "?")}`)
	}
}

async function readUserTokens(cf: Cf) {
	const tokens = (await cf.maybe<UserToken[]>("/user/tokens", [403, 404])) ?? []
	say(`== user api tokens: ${tokens.length}`)
	for (const t of tokens) {
		say(`  "${t.name ?? "?"}" ${t.status ?? "?"} expires ${t.expires_on ?? "never"}`)
		for (const p of t.policies ?? [])
			say(
				`    ${p.effect ?? "?"} ${Object.keys(p.resources ?? {}).join(" ")}: ${(p.permission_groups ?? []).map((g) => g.name ?? "?").join(", ")}`,
			)
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error))
	process.exitCode = 1
})
