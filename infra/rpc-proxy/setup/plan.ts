/** The account state the inventory reads, reduced to what the plan reasons about. */
export const ZONE = "nulo.sh"
export const WORKER = "nulo-rpc-proxy"
export const HOSTS: readonly string[] = ["rpc.nulo.sh", "testnet.rpc.nulo.sh"]
const CHALLENGE_ACTIONS = new Set(["challenge", "managed_challenge", "js_challenge", "block"])

export type DnsRecord = { type: string; name: string; content: string; proxied?: boolean }
export type WorkerDomain = { hostname: string; service: string; cert_id?: string }
export type Rule = { action: string; expression?: string; description?: string; enabled?: boolean }
export type Ruleset = { phase: string; name?: string; rules: Rule[] }
export type BuildConfig = {
	git_repository?: { repo_name?: string; branch?: string }
	production_settings?: { root_directory?: string; deploy_command?: string; build_token_uuid?: string }
	previews_enabled?: boolean
}

export type Inventory = {
	workers: string[]
	domains: WorkerDomain[]
	dns: DnsRecord[]
	fightMode: boolean | null
	securityLevel: string | null
	browserCheck: string | null
	rulesets: Ruleset[]
	legacyRules: Rule[]
	pageRuleTargets: string[]
	builds: Record<string, BuildConfig | null>
}

/** The steps left, in the order the apply run takes them. A `WARN:` line is a stop for the owner. */
export function plan(inv: Inventory): string[] {
	return [...workerSteps(inv), ...domainSteps(inv), ...botSteps(inv), ...ruleSteps(inv), ...settingSteps(inv), ...buildSteps(inv)]
}

function workerSteps(inv: Inventory): string[] {
	if (inv.workers.includes(WORKER)) return [`ok: Worker ${WORKER} exists`]
	return ["create the Worker: `bun run deploy` in infra/rpc-proxy at the pinned commit (the custom domains and the build config need it)"]
}

function domainSteps(inv: Inventory): string[] {
	return HOSTS.flatMap((host) => {
		const domain = inv.domains.find((d) => d.hostname === host)
		if (domain && domain.service !== WORKER) return [`WARN: ${host} is attached to Worker ${domain.service}, not ${WORKER}; stop`]
		if (domain) return [`ok: ${host} attached${domain.cert_id ? "" : " (no certificate id yet)"}`]
		const squatters = inv.dns.filter((r) => r.name === host)
		const blocked = squatters.map(
			(r) => `WARN: ${host} has an existing ${r.type} record (${r.content}); a Workers custom domain needs the name free`,
		)
		return [...blocked, `attach ${host}: PUT /accounts/{account}/workers/domains {hostname, service: ${WORKER}, zone_name: ${ZONE}}`]
	})
}

function botSteps(inv: Inventory): string[] {
	if (inv.fightMode === null) return ["WARN: Bot Fight Mode unreadable"]
	if (!inv.fightMode) return ["ok: Bot Fight Mode off"]
	return [
		"turn Bot Fight Mode off: PUT /zones/{zone}/bot_management {fight_mode: false} (zone-wide: tokens.nulo.sh and nulo.sh/api/* share it)",
	]
}

const namesEveryHost = (expression: string | undefined) => HOSTS.every((h) => (expression ?? "").includes(h))

function ruleSteps(inv: Inventory): string[] {
	const placed = [
		...inv.rulesets.flatMap((set) => set.rules.map((rule) => ({ where: set.phase, rule }))),
		...inv.legacyRules.map((rule) => ({ where: "firewall rule", rule })),
	]
	const warnings = placed
		.filter(({ rule }) => rule.enabled !== false && CHALLENGE_ACTIONS.has(rule.action) && !namesEveryHost(rule.expression))
		.map(
			({ where, rule }) =>
				`WARN: ${where} "${rule.description ?? "(unnamed)"}" does ${rule.action} on \`${rule.expression}\`; exclude the proxy hosts or disable it`,
		)
	const pages = inv.pageRuleTargets.filter((t) => t.includes("rpc.")).map((t) => `WARN: page rule on ${t}; review it`)
	return warnings.length + pages.length ? [...warnings, ...pages] : ["ok: no challenge or block rule reaches the proxy hosts"]
}

function settingSteps(inv: Inventory): string[] {
	const configured = inv.rulesets.some(
		(s) => s.phase === "http_config_settings" && s.rules.some((r) => r.action === "set_config" && namesEveryHost(r.expression)),
	)
	if (configured) return ["ok: a configuration rule already covers the proxy hosts"]
	const relaxed = inv.securityLevel === "essentially_off" || inv.securityLevel === "off"
	if (relaxed && inv.browserCheck === "off") return ["ok: Security Level and Browser Integrity Check already off"]
	return [
		`add a configuration rule for the two hosts (phase http_config_settings): Security Level essentially off, Browser Integrity Check off (zone: security_level=${inv.securityLevel}, browser_check=${inv.browserCheck})`,
	]
}

function buildSteps(inv: Inventory): string[] {
	const own = inv.builds[WORKER]
	const steps = own
		? [
				`ok: Workers Builds connected (${own.git_repository?.repo_name ?? "?"}@${own.git_repository?.branch ?? "?"}, root ${own.production_settings?.root_directory ?? "/"})`,
			]
		: [
				"connect Workers Builds: POST /accounts/{account}/builds/workers (git_repository copied from an existing nulo-sh/nulo config, branch main, root infra/rpc-proxy, deploy `bun run deploy`, path_includes infra/rpc-proxy/**, BUN_VERSION=1.4.2, previews off; the build token per the owner's decision)",
			]
	if (own?.previews_enabled) steps.push(`WARN: ${WORKER} builds previews; turn them off (a branch build can read its secrets)`)
	const byToken = new Map<string, string[]>()
	for (const [worker, config] of Object.entries(inv.builds)) {
		const uuid = config?.production_settings?.build_token_uuid
		if (uuid) byToken.set(uuid, [...(byToken.get(uuid) ?? []), worker])
	}
	for (const [uuid, workers] of byToken) {
		if (workers.length > 1)
			steps.push(`WARN: build token ${uuid} deploys ${workers.join(", ")}; narrow each Worker to a token of its own (README step 1)`)
	}
	return steps
}
