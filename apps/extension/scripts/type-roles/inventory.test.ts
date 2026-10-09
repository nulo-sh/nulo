import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeAll, describe, expect, test } from "vitest"
import { type BranchStep, type IdentifierSite, identifierSites, type ProducerHit, producerHits, sitesInSource } from "./identifier-sites"
import { REPO_ROOT } from "./source-scan"
import { type Surface, surfaces } from "./surfaces"

/**
 * Holds both inventories to their reviewed expected files. A generated item with no entry, an entry
 * whose item is gone, a field missing, two entries one selector cannot tell apart, a pinned producer
 * set that moved, or a `review` note still open each fails here, so a change to what the wallet
 * renders reaches review before a board does.
 */

type Role = "data" | "data-lead" | "input-data" | "meta" | "name" | "none"
type SiteKey = { file: string; expression: string; branch: string; ordinal: number }
type SiteEntry = SiteKey & {
	role: Role
	selector: string
	surface: string
	state: string
	liveFrom: 2 | 3 | 4
	unreachable?: string
	why?: string
	review?: string
}
type ProducerSet = { search: string; hits: ProducerHit[]; evidence: { file: string; text: string }[] }
type SurfaceEntry = {
	id: string
	name: string
	kind: Surface["kind"]
	source: string
	arcs: number[]
	reach: string
	states: string[]
	suite: "smoke" | "network" | "none"
	why?: string
	review?: string
}

const HERE = "apps/extension/scripts/type-roles"
const ROLES = new Set<string>(["data", "data-lead", "input-data", "meta", "name", "none"])
const SUITES = new Set<string>(["smoke", "network", "none"])

const read = (file: string): string => readFileSync(join(REPO_ROOT, file), "utf8")
const readJson = <T>(name: string): T => JSON.parse(read(`${HERE}/${name}`)) as T
const collapse = (text: string): string => text.replace(/\s+/g, " ")
const keyOf = (x: SiteKey): string => JSON.stringify([x.file, x.expression, x.branch, x.ordinal])
const testidsIn = (selector: string): string[] => [...selector.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])

const expectedSites = readJson<{ producers: Record<string, ProducerSet>; sites: SiteEntry[] }>("identifier-sites.expected.json")
const expectedSurfaces = readJson<{ surfaces: SurfaceEntry[] }>("surfaces.expected.json").surfaces

/** True when `a` and `b` part at one step of a single `v-if` chain: two branches that never render together. */
function siblingBranches(a: readonly BranchStep[], b: readonly BranchStep[]): boolean {
	const i = a.findIndex((step, n) => step.chain !== b[n]?.chain || step.condition !== b[n]?.condition)
	return i >= 0 && i < b.length && a[i].chain === b[i].chain
}

function siteProblems(entry: SiteEntry, surfaceIds: ReadonlySet<string>): string[] {
	const where = `${entry.file} ${entry.expression} #${entry.ordinal}`
	const problems: string[] = []
	if (![entry.file, entry.expression, entry.branch, entry.selector, entry.surface, entry.state].every((v) => typeof v === "string")) {
		problems.push(`${where}: a text field is missing`)
	}
	if (!Number.isInteger(entry.ordinal)) problems.push(`${where}: no ordinal`)
	if (!ROLES.has(entry.role)) problems.push(`${where}: role ${entry.role}`)
	if (![2, 3, 4].includes(entry.liveFrom)) problems.push(`${where}: liveFrom ${entry.liveFrom}`)
	if (!surfaceIds.has(entry.surface)) problems.push(`${where}: surface ${entry.surface} has no entry`)
	if (entry.role !== "none" && !entry.selector) problems.push(`${where}: no selector`)
	if ((entry.role === "none" || entry.unreachable) && !entry.why) problems.push(`${where}: no why`)
	if (entry.unreachable && !expectedSites.producers[entry.unreachable]) problems.push(`${where}: no producer set ${entry.unreachable}`)
	return problems
}

/**
 * Whether a selector's last testid is the site's own element: its own testid (a bound template
 * literal matches any text in place of its `${…}`, a bound name is the caller's to choose), or one no
 * ancestor in the site's file carries, so one inside the component the site renders through.
 */
function namesOwnElement(site: IdentifierSite, selector: readonly string[]): boolean {
	const testid = selector.at(-1) ?? ""
	const own = site.ownTestid
	const inside = !site.testids.includes(testid)
	if (own === null) return inside
	if (!own.bound) return own.text === testid || (selector.includes(own.text) && inside)
	if (!own.text.startsWith("`")) return true
	const pattern = own.text
		.slice(1, -1)
		.split(/\$\{[^}]*\}/)
		.map((part) => part.replace(/[.*+?^$()|[\]\\]/g, "\\$&"))
	return new RegExp(`^${pattern.join(".*")}$`).test(testid)
}

/** Why a group of entries that share one surface and one selector cannot be told apart, or nothing. */
function sharedSelectorProblem(group: readonly SiteEntry[], sitesByKey: ReadonlyMap<string, IdentifierSite>): string | undefined {
	const label = `${group[0].surface} ${group[0].selector}`
	const steps = group.map((entry) => sitesByKey.get(keyOf(entry))?.steps)
	if (steps.some((s) => !s)) return `${label}: an entry has no site to prove its branch`
	const apart = steps.every((a, i) => steps.every((b, j) => i === j || siblingBranches(a ?? [], b ?? [])))
	if (!apart) return `${label}: shared by entries that are no sibling branches of one chain`
	const states = group.filter((entry) => !entry.unreachable).map((entry) => entry.state)
	return new Set(states).size === states.length ? undefined : `${label}: two sibling branches share a seeded state`
}

describe("identifier sites", () => {
	let sites: IdentifierSite[] = []
	let sitesByKey = new Map<string, IdentifierSite>()
	const entries = expectedSites.sites
	const entriesByKey = new Map(entries.map((entry) => [keyOf(entry), entry]))

	beforeAll(() => {
		sites = identifierSites()
		sitesByKey = new Map(sites.map((site) => [keyOf(site), site]))
	}, 120_000)

	test("every site has an entry", () => {
		const missing = sites.filter((site) => !entriesByKey.has(keyOf(site)))
		const paste = missing.map(({ file, expression, branch, ordinal, line }) =>
			JSON.stringify({ file, expression, branch, ordinal, role: "TODO", selector: "", surface: "", state: "", liveFrom: 0, line }),
		)
		expect(paste).toEqual([])
	})

	test("an entry no site backs stays only while its selector's testid is in its file", () => {
		const unmatched = entries.filter((entry) => !sitesByKey.has(keyOf(entry)))
		const stale = unmatched.filter((entry) => !testidsIn(entry.selector).some((id) => read(entry.file).includes(id)))
		const kept = unmatched.filter((entry) => !stale.includes(entry))
		if (kept.length) console.info(`identifier entries no pattern finds, kept by testid:\n${kept.map(keyOf).join("\n")}`)
		expect(stale.map(keyOf)).toEqual([])
	})

	test("every entry carries its fields, and keys are unique", () => {
		const surfaceIds = new Set(expectedSurfaces.map((s) => s.id))
		expect(entries.flatMap((entry) => siteProblems(entry, surfaceIds))).toEqual([])
		expect(entriesByKey.size).toBe(entries.length)
	})

	test("entries of one surface share a selector only as sibling branches of one chain, each seeded alone", () => {
		const groups = new Map<string, SiteEntry[]>()
		for (const entry of entries.filter((e) => e.role !== "none" && e.selector)) {
			const key = `${entry.surface} ${entry.selector}`
			groups.set(key, [...(groups.get(key) ?? []), entry])
		}
		const problems = [...groups.values()]
			.filter((group) => group.length > 1)
			.flatMap((group) => sharedSelectorProblem(group, sitesByKey) ?? [])
		expect(problems).toEqual([])
	})

	test("an unreachable branch's producer set and evidence are as pinned", () => {
		const used = new Set(entries.flatMap((entry) => entry.unreachable ?? []))
		for (const name of used) {
			const pinned = expectedSites.producers[name]
			expect(producerHits(new RegExp(pinned.search)), name).toEqual(pinned.hits)
			for (const { file, text } of pinned.evidence) expect(collapse(read(file)), `${name}: ${file}`).toContain(collapse(text))
		}
	})

	test("a selector names the site's own element, never a row around its label", () => {
		const wrapping = entries.filter((entry) => {
			const site = sitesByKey.get(keyOf(entry))
			const named = testidsIn(entry.selector)
			if (!site || !named.length || entry.role === "none" || entry.role === "input-data" || entry.unreachable) return false
			return !namesOwnElement(site, named)
		})
		expect(wrapping.map(keyOf)).toEqual([])
	})

	test("one expression on two branches of a chain reads as two sites", () => {
		const fixture = `<template>
	<template v-if="op.kind === 'register_contract'">
		<Flex><AddressDisplay :address="op.address" /></Flex>
	</template>
	<template v-else-if="op.kind === 'register_sender'">
		<Flex><AddressDisplay :address="op.address" /></Flex>
	</template>
</template>`
		const [contract, sender, ...rest] = sitesInSource("Fixture.vue", fixture, [])
		expect(rest).toEqual([])
		expect([contract, sender].map(({ expression, branch, ordinal }) => ({ expression, branch, ordinal }))).toEqual([
			{ expression: "op.address", branch: "op.kind === 'register_contract'", ordinal: 0 },
			{ expression: "op.address", branch: "op.kind === 'register_sender'", ordinal: 1 },
		])
		expect(siblingBranches(contract.steps, sender.steps)).toBe(true)

		const card = sites.filter((s) => s.file.endsWith("/execute/OperationCard.vue") && s.expression === "op.address")
		expect(card.map((s) => s.branch)).toEqual(
			expect.arrayContaining([
				"!(isSendTx(op)) && op.kind === 'register_contract'",
				"!(isSendTx(op)) && op.kind === 'register_sender'",
			]),
		)
	})
})

describe("surfaces", () => {
	let generated: Surface[] = []
	const byId = new Map(expectedSurfaces.map((entry) => [entry.id, entry]))

	beforeAll(async () => {
		generated = await surfaces()
	}, 120_000)

	test("every surface has an entry whose kind, source and arcs it still has", () => {
		const drift = generated.flatMap((surface) => {
			const entry = byId.get(surface.id)
			if (!entry) return [`${surface.id}: no entry (${surface.kind} ${surface.source}, arcs ${surface.arcs.join(",")})`]
			const same = entry.kind === surface.kind && entry.source === surface.source && entry.arcs.join() === surface.arcs.join()
			return same ? [] : [`${surface.id}: now ${surface.kind} ${surface.source}, arcs ${surface.arcs.join(",")}`]
		})
		expect(drift).toEqual([])
	})

	test("no entry outlives its surface, and every entry carries its fields", () => {
		const ids = new Set(generated.map((s) => s.id))
		expect(expectedSurfaces.filter((entry) => !ids.has(entry.id)).map((entry) => entry.id)).toEqual([])
		const incomplete = expectedSurfaces.filter(
			(e) =>
				!(e.name && e.reach && Array.isArray(e.states) && SUITES.has(e.suite)) ||
				(e.reach === "none" && !e.why) ||
				(e.reach !== "none" && !e.states.length),
		)
		expect(incomplete.map((e) => e.id)).toEqual([])
		expect(byId.size).toBe(expectedSurfaces.length)
	})
})

test("no entry is left for review", () => {
	const open = [
		...expectedSites.sites.flatMap((e) => (e.review ? [`${e.file} ${e.expression} #${e.ordinal}: ${e.review}`] : [])),
		...expectedSurfaces.flatMap((e) => (e.review ? [`${e.id}: ${e.review}`] : [])),
	]
	expect(open).toEqual([])
})
