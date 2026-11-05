import { describe, expect, test } from "bun:test"
import { HOSTS, type Inventory, plan, WORKER } from "../setup/plan"

const blank: Inventory = {
	workers: [],
	domains: [],
	dns: [],
	fightMode: true,
	securityLevel: "medium",
	browserCheck: "on",
	rulesets: [],
	legacyRules: [],
	pageRuleTargets: [],
	builds: {},
}

const done: Inventory = {
	...blank,
	workers: ["nulo-landing", WORKER],
	domains: HOSTS.map((hostname) => ({ hostname, service: WORKER, cert_id: "cert" })),
	fightMode: false,
	rulesets: [
		{ phase: "http_config_settings", rules: [{ action: "set_config", expression: `http.host in {"${HOSTS[0]}" "${HOSTS[1]}"}` }] },
	],
	builds: {
		"nulo-landing": { production_settings: { build_token_uuid: "t1" } },
		[WORKER]: {
			git_repository: { repo_name: "nulo-sh/nulo", branch: "main" },
			production_settings: { root_directory: "infra/rpc-proxy", build_token_uuid: "t2" },
		},
	},
}

describe("plan", () => {
	test("a blank account gets every step and no warning", () => {
		const steps = plan(blank)
		expect(steps.filter((s) => s.startsWith("WARN"))).toEqual([])
		expect(steps.filter((s) => s.startsWith("attach ")).map((s) => s.split(" ")[1].slice(0, -1))).toEqual([...HOSTS])
		for (const head of ["create the Worker", "turn Bot Fight Mode off", "add a configuration rule", "connect Workers Builds"]) {
			expect(steps.some((s) => s.startsWith(head))).toBe(true)
		}
	})

	test("a finished setup is ok lines only", () => {
		expect(plan(done).every((s) => s.startsWith("ok:"))).toBe(true)
	})

	test("a challenge rule, a squatting record, a preview build and a shared token each warn", () => {
		const challenge = {
			action: "managed_challenge",
			expression: 'not http.request.uri.path contains "/api"',
			description: "challenge the rest",
		}
		const warnings = plan({
			...done,
			domains: [done.domains[0]],
			dns: [{ type: "A", name: HOSTS[1], content: "192.0.2.1" }],
			rulesets: [...done.rulesets, { phase: "http_request_firewall_custom", rules: [challenge] }],
			builds: {
				...done.builds,
				"nulo-tokens": { production_settings: { build_token_uuid: "t1" } },
				[WORKER]: { ...done.builds[WORKER], previews_enabled: true },
			},
		}).filter((s) => s.startsWith("WARN"))
		expect(warnings).toHaveLength(4)
		const text = warnings.join("\n")
		expect(text).toContain(`${HOSTS[1]} has an existing A record`)
		expect(text).toContain("challenge the rest")
		expect(text).toContain("builds previews")
		expect(text).toContain("build token t1 deploys nulo-landing, nulo-tokens")
	})
})
