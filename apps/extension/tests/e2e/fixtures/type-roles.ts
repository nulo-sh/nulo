/**
 * The type-role sweep: what a page renders for each element that carries a type role, compared with
 * the role's record in `@nulo/design/tokens`. A composing module rule, a static class and
 * `<Text variant>` all put a `type--<role>` class on the element, so that class is what the sweep
 * collects. Every reader returns its findings whole rather than throwing, so a capture can save them
 * beside its image; `expectSweepClean` and `expectSitesClean` are the assertions.
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { fonts, MIN_MONO_PX, MIN_TEXT_PX, type TypeRole, typeRoleNames, typeRoles } from "@nulo/design/tokens"
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { OVERRIDES } from "../../../scripts/type-roles/exceptions"
import { ensureUnlocked, navigateByHash, readSessionRow } from "./helpers"

type FontToken = (typeof fonts)[keyof typeof fonts]
type RoleSpec = (typeof typeRoles)[TypeRole]
type Vars = Record<string, string>

const FONT_TOKENS: readonly FontToken[] = Object.values(fonts)
const MONO_ROLES: readonly TypeRole[] = typeRoleNames.filter((role) => typeRoles[role].family === fonts.mono)

/** Elements a size floor does not hold, by the testid they sit under. */
export const FLOOR_EXCEPTIONS: readonly { testid: string; minPx: number; why: string }[] = [
	{
		testid: "account-avatar",
		minPx: 9,
		why: "a 20px avatar's initials are 9px (`AccountAvatar.vue`: 0.4 of the box, never under 9); the hidden-accounts list draws one",
	},
]

/** What the page computes for one element, and where the element sits. */
export type TypeReading = {
	/** Its own `data-testid`, else its nearest ancestor's. */
	testid: string | null
	/** Its text, whitespace collapsed, first 60 characters. */
	text: string
	/** Its `type--` classes, prefix dropped. */
	roles: string[]
	fontFamily: string
	fontSize: string
	fontWeight: string
	letterSpacing: string
	textTransform: string
	fontVariantNumeric: string
	textOverflow: string
	/** `visible` cannot clip: an inline box or one whose overflow shows past it. */
	overflowX: string
	scrollWidth: number
	clientWidth: number
	visible: boolean
	/** The nearest visible ancestor that clips the text sideways without an ellipsis. */
	clippedBy: string | null
	/** The nearest ancestor whose ellipsis hides part of the text. */
	ellipsizedBy: string | null
	/** An `AddressDisplay`'s `data-address-shows`: `name` while it shows a contact or account name. */
	addressShows: string | null
	/** The `OVERRIDES` scopes the element matches. */
	scopes: string[]
}

/**
 * Which elements a read collects: the role-bearing ones, the visible ones with text of their own, or
 * those at a selector, each read as itself or, with `native`, as the native field at or under it.
 */
export type ReadScope = { kind: "roles" } | { kind: "own-text" } | { kind: "at"; selector: string; native?: boolean }

/** One read of a document: the three face variables as its root resolves them, and the elements. */
export type PageTypography = { vars: Vars; readings: TypeReading[] }

export type SweepFailure = { testid: string | null; text: string; role: string; property: string; expected: string; actual: string }

export type FontCheck = {
	faces: { token: FontToken; face: string; statuses: string[] }[]
	failures: string[]
}

export type SweepResult = { fonts: FontCheck; readings: TypeReading[]; failures: SweepFailure[] }

export type SweepOptions = {
	/** The faces that must have loaded; by default those of the roles on the page. */
	requireFaces?: readonly FontToken[]
}

/**
 * Runs in the page, or in Firefox's panel through a frame script, so it uses nothing but its
 * arguments: `win` is the document's window (the frame script's `content`). Shipped by `toString()`.
 */
function readTypography(win: Window, scope: ReadScope, tokens: readonly string[], scopes: readonly string[]): PageTypography {
	const doc = win.document
	const ROLE = '[class^="type--"], [class*=" type--"]'
	const rolesOf = (el: Element): string[] =>
		String(el.getAttribute("class") ?? "")
			.split(/\s+/)
			.filter((name) => name.startsWith("type--"))
			.map((name) => name.slice("type--".length))
	const isVisible = (el: Element): boolean => {
		const box = el.getBoundingClientRect()
		return box.width > 0 && box.height > 0 && win.getComputedStyle(el).visibility !== "hidden"
	}
	const hasOwnText = (el: Element): boolean =>
		Array.from(el.childNodes).some((node) => node.nodeType === 3 && (node.textContent ?? "").trim() !== "")
	const FIELD = "input, textarea"
	const field = (el: Element): Element => (el.matches(FIELD) ? el : (el.querySelector(FIELD) ?? el))
	const collect = (): Element[] => {
		if (scope.kind === "at") return Array.from(doc.querySelectorAll(scope.selector)).map((el) => (scope.native ? field(el) : el))
		if (scope.kind === "roles") return Array.from(doc.querySelectorAll(ROLE))
		return Array.from(doc.body.querySelectorAll("*")).filter((el) => hasOwnText(el) && isVisible(el))
	}
	type Span = { left: number; right: number }
	const paintedSpan = (el: Element): Span => {
		const box = el.getBoundingClientRect()
		// Text an element clips itself paints no further than its own box.
		if (win.getComputedStyle(el).overflowX !== "visible") return { left: box.left, right: box.right }
		return { left: box.left, right: Math.max(box.right, box.left + el.scrollWidth) }
	}
	const clippingAncestors = (el: Element): Element[] => {
		const found: Element[] = []
		for (let up = el.parentElement; up && up !== doc.documentElement; up = up.parentElement) {
			if (win.getComputedStyle(up).overflowX === "visible") continue
			// A box drawn at no size, like the hero's ruler, hides its content on purpose.
			if (!isVisible(up)) break
			found.push(up)
		}
		return found
	}
	const crosses = (span: Span, edge: DOMRect): boolean => span.left < edge.left - 0.5 || span.right > edge.right + 0.5
	const nameOf = (el: Element): string => el.getAttribute("data-testid") ?? el.tagName
	const cutBy = (el: Element): Pick<TypeReading, "clippedBy" | "ellipsizedBy"> => {
		const span = paintedSpan(el)
		let ellipsizedBy: string | null = null
		for (const up of clippingAncestors(el)) {
			const edge = up.getBoundingClientRect()
			const crossed = crosses(span, edge)
			if (crossed && win.getComputedStyle(up).textOverflow !== "ellipsis") return { clippedBy: nameOf(up), ellipsizedBy }
			if (crossed) ellipsizedBy ??= nameOf(up)
			span.left = Math.max(span.left, edge.left)
			span.right = Math.min(span.right, edge.right)
		}
		return { clippedBy: null, ellipsizedBy }
	}
	const read = (el: Element): TypeReading => {
		const style = win.getComputedStyle(el)
		return {
			testid: el.closest("[data-testid]")?.getAttribute("data-testid") ?? null,
			text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
			roles: rolesOf(el),
			fontFamily: style.fontFamily,
			fontSize: style.fontSize,
			fontWeight: style.fontWeight,
			letterSpacing: style.letterSpacing,
			textTransform: style.textTransform,
			fontVariantNumeric: style.fontVariantNumeric,
			textOverflow: style.textOverflow,
			overflowX: style.overflowX,
			scrollWidth: el.scrollWidth,
			clientWidth: el.clientWidth,
			visible: isVisible(el),
			...cutBy(el),
			addressShows: el.getAttribute("data-address-shows"),
			scopes: scopes.filter((selector) => el.matches(selector)),
		}
	}
	const rootStyle = win.getComputedStyle(doc.documentElement)
	const vars: Vars = {}
	for (const token of tokens) vars[token] = rootStyle.getPropertyValue(token).trim()
	return { vars, readings: collect().map(read) }
}

/** The hex text no mono role holds: a visible text node with `0x` and two hex digits. Shipped like `readTypography`. */
function readHexText(win: Window, monoRoles: readonly string[]): { testid: string | null; text: string }[] {
	const doc = win.document
	const ROLE = '[class^="type--"], [class*=" type--"]'
	const inMonoRole = (el: Element): boolean => {
		const holder = el.closest(ROLE)
		const roles = String(holder?.getAttribute("class") ?? "")
			.split(/\s+/)
			.filter((name) => name.startsWith("type--"))
		return roles.some((name) => monoRoles.includes(name.slice("type--".length)))
	}
	const hidden = (el: Element): boolean => {
		const box = el.getBoundingClientRect()
		return box.width === 0 || box.height === 0 || win.getComputedStyle(el).visibility === "hidden"
	}
	const found: { testid: string | null; text: string }[] = []
	const walker = doc.createTreeWalker(doc.body, 4)
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const holder = node.parentElement
		if (!holder || !/0x[0-9a-f]{2}/i.test(node.textContent ?? "")) continue
		if (hidden(holder) || inMonoRole(holder)) continue
		found.push({
			testid: holder.closest("[data-testid]")?.getAttribute("data-testid") ?? null,
			text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
		})
	}
	return found
}

const PROBE_HOST = "type-role-probes"
export const PROBE_TEXT = "Probe 0x1A"

/** One `<span class="type--<role>">` per role in a fixed column over the page; returns how many it placed. Shipped like `readTypography`. */
function placeProbes(win: Window, host: string, roles: readonly string[], text: string): number {
	const doc = win.document
	doc.querySelector(`[data-testid="${host}"]`)?.remove()
	const column = doc.createElement("div")
	column.setAttribute("data-testid", host)
	column.style.cssText =
		"position: fixed; top: 0; left: 0; z-index: 2147483647; display: flex; flex-direction: column; width: 100%; pointer-events: none"
	for (const role of roles) {
		const probe = doc.createElement("span")
		probe.setAttribute("data-testid", `type-role-probe-${role}`)
		probe.setAttribute("class", `type--${role}`)
		probe.textContent = text
		column.appendChild(probe)
	}
	doc.body.appendChild(column)
	return column.childElementCount
}

/** Removes the probes; returns whether there were any. Shipped like `readTypography`. */
function clearProbes(win: Window, host: string): boolean {
	const column = win.document.querySelector(`[data-testid="${host}"]`)
	column?.remove()
	return column !== null
}

const OVERRIDE_SCOPES: readonly string[] = OVERRIDES.map((entry) => entry.scope)

const call = (fn: (...args: never[]) => unknown, target: "window" | "content", ...args: unknown[]): string =>
	`(${fn.toString()})(${[target, ...args.map((arg) => JSON.stringify(arg))].join(", ")})`

/** Function bodies for `evaluateInActionPopup`, whose `content` is the panel's window. */
export const panelBodies = {
	read: (scope: ReadScope): string => `return ${call(readTypography, "content", scope, FONT_TOKENS, OVERRIDE_SCOPES)};`,
	placeProbes: (): string => `return ${call(placeProbes, "content", PROBE_HOST, typeRoleNames, PROBE_TEXT)};`,
	clearProbes: (): string => `return ${call(clearProbes, "content", PROBE_HOST)};`,
}

/** Reads only the root's face variables. */
const NO_ELEMENTS: ReadScope = { kind: "at", selector: ":not(*)" }

export const readPageTypography = (page: Page, scope: ReadScope): Promise<PageTypography> =>
	page.evaluate(call(readTypography, "window", scope, FONT_TOKENS, OVERRIDE_SCOPES)) as Promise<PageTypography>

/** Places one probe per role, each `data-testid="type-role-probe-<role>"`, over the page. */
export async function placeTypeRoleProbes(page: Page): Promise<void> {
	const placed = (await page.evaluate(call(placeProbes, "window", PROBE_HOST, typeRoleNames, PROBE_TEXT))) as number
	if (placed !== typeRoleNames.length) throw new Error(`placeTypeRoleProbes: placed ${placed} of ${typeRoleNames.length}`)
}

export const clearTypeRoleProbes = (page: Page): Promise<boolean> =>
	page.evaluate(call(clearProbes, "window", PROBE_HOST)) as Promise<boolean>

// ── Judging ─────────────────────────────────────────────────────────────

export const firstFamily = (value: string): string => (value.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "")
const px = (value: string): number => (value === "normal" ? 0 : Number.parseFloat(value))
const resolveVars = (value: string, vars: Vars): string => value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => vars[name] ?? "")
const trackingPx = (value: string, reading: TypeReading): number =>
	value.endsWith("em") ? Number.parseFloat(value) * px(reading.fontSize) : px(value)
const kebab = (property: string): string => property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
const isRole = (name: string): name is TypeRole => (typeRoleNames as readonly string[]).includes(name)

/** One computed property against its role: the role's declared value and an override's, both brought to what the browser computes. */
type Check = {
	property: string
	declared: (spec: RoleSpec) => string | null
	computed: (reading: TypeReading) => string
	normalize: (value: string, reading: TypeReading, vars: Vars) => number | string
	/** In px. Letter spacing's 0.1 absorbs a browser rounding em to px; an expected 0 is always exact. */
	within: number
}

const CHECKS: readonly Check[] = [
	{
		property: "font-family",
		declared: (spec) => `var(${spec.family})`,
		computed: (reading) => reading.fontFamily,
		normalize: (value, _reading, vars) => firstFamily(resolveVars(value, vars)),
		within: 0,
	},
	{
		property: "font-size",
		declared: (spec) => (spec.size === null ? null : `${spec.size}px`),
		computed: (reading) => reading.fontSize,
		normalize: px,
		within: 0.01,
	},
	{
		property: "font-weight",
		declared: (spec) => String(spec.weight),
		computed: (reading) => reading.fontWeight,
		normalize: (value) => Number(value),
		within: 0,
	},
	{
		property: "letter-spacing",
		declared: (spec) => (spec.tracking === 0 ? "normal" : `${spec.tracking}em`),
		computed: (reading) => reading.letterSpacing,
		normalize: trackingPx,
		within: 0.1,
	},
	{
		property: "text-transform",
		declared: (spec) => (spec.uppercase ? "uppercase" : "none"),
		computed: (reading) => reading.textTransform,
		normalize: (value) => value,
		within: 0,
	},
	{
		property: "font-variant-numeric",
		declared: (spec) => (spec.tabular ? "tabular-nums" : "normal"),
		computed: (reading) => reading.fontVariantNumeric,
		normalize: (value) => value,
		within: 0,
	},
]

function matches(actual: number | string, expected: number | string, within: number): boolean {
	if (typeof actual !== "number" || typeof expected !== "number") return actual === expected
	return expected === 0 ? actual === 0 : Math.abs(actual - expected) <= within
}

const failure = (reading: TypeReading, role: string, property: string, expected: string, actual: string): SweepFailure => ({
	testid: reading.testid,
	text: reading.text,
	role,
	property,
	expected,
	actual,
})

function floorFailures(reading: TypeReading, role: TypeRole): SweepFailure[] {
	const exception = FLOOR_EXCEPTIONS.find((entry) => entry.testid === reading.testid)
	const floor = exception?.minPx ?? (typeRoles[role].family === fonts.mono ? MIN_MONO_PX : MIN_TEXT_PX)
	return px(reading.fontSize) < floor - 0.01 ? [failure(reading, role, "font-size floor", `>= ${floor}px`, reading.fontSize)] : []
}

/** Judges `reading` as `role`, whatever classes it carries; a value off the role passes only as an `OVERRIDES` value of that role and property on an element in its scope. */
function judgeAs(reading: TypeReading, role: TypeRole, vars: Vars): SweepFailure[] {
	const spec = typeRoles[role]
	const failures: SweepFailure[] = []
	for (const check of CHECKS) {
		const declared = check.declared(spec)
		if (declared === null) continue
		const actual = check.normalize(check.computed(reading), reading, vars)
		if (matches(actual, check.normalize(declared, reading, vars), check.within)) continue
		const overridden = OVERRIDES.some(
			(entry) =>
				entry.role === role &&
				kebab(entry.property) === check.property &&
				reading.scopes.includes(entry.scope) &&
				matches(actual, check.normalize(entry.value, reading, vars), check.within),
		)
		if (!overridden) failures.push(failure(reading, role, check.property, declared, check.computed(reading)))
	}
	return [...failures, ...floorFailures(reading, role)]
}

function judgeReading(reading: TypeReading, vars: Vars): SweepFailure[] {
	const [role, ...rest] = reading.roles
	if (role === undefined || rest.length > 0 || !isRole(role)) {
		return [failure(reading, reading.roles.join(" "), "class", "one known type role", reading.roles.join(" ") || "none")]
	}
	return judgeAs(reading, role, vars)
}

/** Judges every reading of a document read by `readPageTypography` or `panelBodies.read`. */
export const judgeTypography = ({ vars, readings }: PageTypography): SweepFailure[] =>
	readings.flatMap((reading) => judgeReading(reading, vars))

// ── Faces ───────────────────────────────────────────────────────────────

/**
 * Every face a role names has loaded and none failed. Waits for the document's font loads to
 * settle first; a family never requested stays `unloaded`, so only `required` must reach `loaded`.
 */
export async function checkFontFaces(page: Page, required: readonly FontToken[] = FONT_TOKENS): Promise<FontCheck> {
	const { vars } = await readPageTypography(page, NO_ELEMENTS)
	const names = (tokens: readonly FontToken[]) => tokens.map((token) => firstFamily(vars[token] ?? ""))
	await page
		.waitForFunction(
			(families: string[]) => {
				document.body.getBoundingClientRect()
				if (document.fonts.status !== "loaded") return false
				const settled = new Set<string>()
				document.fonts.forEach((face) => {
					if (face.status === "loaded" || face.status === "error") settled.add(face.family.replace(/^["']|["']$/g, ""))
				})
				return families.every((family) => settled.has(family))
			},
			{ timeout: 10_000 },
			names(required),
		)
		.catch(() => undefined)
	const statuses = await page.evaluate(async () => {
		await document.fonts.ready
		const seen: { family: string; status: string }[] = []
		document.fonts.forEach((face) => {
			seen.push({ family: face.family.replace(/^["']|["']$/g, ""), status: face.status })
		})
		return seen
	})
	const faces = FONT_TOKENS.map((token) => {
		const face = firstFamily(vars[token] ?? "")
		return { token, face, statuses: statuses.filter((entry) => entry.family === face).map((entry) => entry.status) }
	})
	return { faces, failures: faces.flatMap((face) => faceFailures(face, required.includes(face.token))) }
}

function faceFailures({ token, face, statuses }: FontCheck["faces"][number], required: boolean): string[] {
	if (statuses.length === 0) return [`${token}: no @font-face declares ${face}`]
	const failures = statuses.includes("error") ? [`${token}: a ${face} face failed to load`] : []
	if (required && !statuses.includes("loaded")) failures.push(`${token}: no ${face} face loaded (${statuses.join(", ")})`)
	return failures
}

// ── The sweep and the record mode ───────────────────────────────────────

/** The faces, then every role-bearing element against its role. */
export async function sweepTypeRoles(page: Page, options: SweepOptions = {}): Promise<SweepResult> {
	const typography = await readPageTypography(page, { kind: "roles" })
	const used = new Set(typography.readings.flatMap((reading) => reading.roles.filter(isRole).map((role) => typeRoles[role].family)))
	const fontCheck = await checkFontFaces(page, options.requireFaces ?? FONT_TOKENS.filter((token) => used.has(token)))
	return { fonts: fontCheck, readings: typography.readings, failures: judgeTypography(typography) }
}

export function expectSweepClean(result: SweepResult, label = "type-role sweep"): void {
	expect(result.fonts.failures, `${label}: faces`).toEqual([])
	expect(result.failures, `${label}: role values`).toEqual([])
}

export type TypeRecord = Pick<
	TypeReading,
	"testid" | "text" | "roles" | "fontFamily" | "fontSize" | "fontWeight" | "letterSpacing" | "textTransform" | "fontVariantNumeric"
> & { surface: string }

/** The record mode, for a before set no role has reached yet: every visible element with text of its own, as computed. Asserts nothing. */
export async function recordTypography(page: Page, surface: string): Promise<TypeRecord[]> {
	const { readings } = await readPageTypography(page, { kind: "own-text" })
	return readings.map(({ testid, text, roles, fontFamily, fontSize, fontWeight, letterSpacing, textTransform, fontVariantNumeric }) => ({
		surface,
		testid,
		text,
		roles,
		fontFamily,
		fontSize,
		fontWeight,
		letterSpacing,
		textTransform,
		fontVariantNumeric,
	}))
}

// ── Identifier sites and coverage ───────────────────────────────────────

/** A row of `scripts/type-roles/identifier-sites.expected.json`. */
export type SiteEntry = {
	file: string
	expression: string
	branch: string
	ordinal: number
	role: "data" | "data-lead" | "input-data" | "meta" | "name" | "none"
	selector: string
	surface: string
	state: string
	unreachable?: string
	why?: string
}

export type SiteObservation = {
	key: string
	site: SiteEntry
	/** `unreachable` sites are listed, never read. */
	mode: "asserted" | "unreachable"
	readings: TypeReading[]
	failures: SweepFailure[]
}

export type IdentifierObservation = {
	surface: string
	state: string
	sites: SiteObservation[]
	/** Hex text the page renders outside a mono role; `expectSitesClean` refuses any. */
	hexOutsideMono: { testid: string | null; text: string }[]
}

export type ObserveOptions = {
	/** The expected entries; by default the expected file's. */
	sites?: readonly SiteEntry[]
}

const SITES_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../scripts/type-roles/identifier-sites.expected.json")

let loadedSites: readonly SiteEntry[] | undefined

/** The expected file's entries, read once; no file is no sites. */
export function identifierSites(): readonly SiteEntry[] {
	if (loadedSites) return loadedSites
	const parsed: unknown = existsSync(SITES_FILE) ? JSON.parse(readFileSync(SITES_FILE, "utf8")) : []
	loadedSites = Array.isArray(parsed) ? parsed : ((parsed as { sites?: SiteEntry[] }).sites ?? [])
	return loadedSites
}

/** An occurrence's identity: file, expression, branch and ordinal; the line is only a hint. */
export const siteKey = (site: Pick<SiteEntry, "file" | "expression" | "branch" | "ordinal">): string =>
	`${site.file}|${site.expression}|${site.branch}|${site.ordinal}`

const selectorOf = (selector: string): string => (/^[\w-]+$/.test(selector) ? `[data-testid="${selector}"]` : selector)

function judgeSite(reading: TypeReading, site: SiteEntry, vars: Vars): SweepFailure[] {
	const role: TypeRole = reading.addressShows === "name" ? "name" : (site.role as TypeRole)
	const carried = reading.roles.includes(role)
		? []
		: [failure(reading, role, "class", `type--${role}`, reading.roles.map((name) => `type--${name}`).join(" ") || "none")]
	return [...carried, ...judgeAs(reading, role, vars)]
}

async function observeSite(page: Page, site: SiteEntry): Promise<SiteObservation> {
	const key = siteKey(site)
	if (site.unreachable) return { key, site, mode: "unreachable", readings: [], failures: [] }
	const { vars, readings } = await readPageTypography(page, {
		kind: "at",
		selector: selectorOf(site.selector),
		native: site.role === "input-data",
	})
	const failures =
		readings.length === 0
			? [
					{
						testid: null,
						text: "",
						role: site.role,
						property: "selector",
						expected: `an element at ${site.selector}`,
						actual: "none",
					},
				]
			: readings.flatMap((reading) => judgeSite(reading, site, vars))
	return { key, site, mode: "asserted", readings, failures }
}

/**
 * The identifier sites of one surface in one seeded state: every element at each matching site's selector,
 * and at least one, carries the site's role and computes to it (an `AddressDisplay` showing a name
 * expects `name`; an `input-data` site is read at its native field), then the hex text scan.
 */
export async function observeIdentifierSites(
	page: Page,
	surface: string,
	state: string,
	options: ObserveOptions = {},
): Promise<IdentifierObservation> {
	const entries = (options.sites ?? identifierSites()).filter(
		(site) => site.surface === surface && site.state === state && site.role !== "none",
	)
	const sites: SiteObservation[] = []
	for (const site of entries) sites.push(await observeSite(page, site))
	return { surface, state, sites, hexOutsideMono: await readHexOutsideMono(page) }
}

/** Hex text the page renders outside a mono role, the scan `observeIdentifierSites` ends with. */
export async function readHexOutsideMono(page: Page): Promise<IdentifierObservation["hexOutsideMono"]> {
	return (await page.evaluate(call(readHexText, "window", MONO_ROLES))) as IdentifierObservation["hexOutsideMono"]
}

export function expectSitesClean(observation: IdentifierObservation): void {
	const asserted = observation.sites.filter((site) => site.mode === "asserted").flatMap((site) => site.failures)
	expect(asserted, `identifier sites on ${observation.surface} (${observation.state})`).toEqual([])
	expect(observation.hexOutsideMono, `hex outside a mono role on ${observation.surface} (${observation.state})`).toEqual([])
}

export type Coverage = {
	/** Live sites, by key, that no observation read. */
	unobserved: string[]
	live: number
	unreachable: { key: string; reason: string }[]
}

/** The coverage count: which live sites of `surfaces` (all, by default) the observations read, and every unreachable one with its reason. */
export function coverageOf(
	observations: readonly IdentifierObservation[],
	options: ObserveOptions & { surfaces?: readonly string[] } = {},
): Coverage {
	const inScope = (options.sites ?? identifierSites()).filter(
		(site) => site.role !== "none" && (options.surfaces === undefined || options.surfaces.includes(site.surface)),
	)
	const live = inScope.filter((site) => !site.unreachable)
	const read = new Set(
		observations.flatMap((observation) => observation.sites.filter((site) => site.readings.length > 0).map((site) => site.key)),
	)
	return {
		unobserved: live.map(siteKey).filter((key) => !read.has(key)),
		live: live.length,
		unreachable: inScope.flatMap((site) => (site.unreachable ? [{ key: siteKey(site), reason: site.unreachable }] : [])),
	}
}

// ── The account verification barrier ───────────────────────────────────

const BARRIER = '[data-testid="account-integrity-blocked"]'
const BLOCKED_ROOT = "nulo:core:account-integrity-blocked"

async function writeBlockedRow(page: Page, key: string, profileId: string): Promise<void> {
	await page.evaluate(
		async (rowKey: string, id: string) => {
			const record = {
				profileId: id,
				chainId: 1,
				accountIndex: 0,
				storedAddress: `0x${"11".repeat(32)}`,
				derivedAddress: `0x${"22".repeat(32)}`,
				regimeId: "e2e-fixture",
				walletVersion: chrome.runtime.getManifest().version,
				detectedAt: Date.now(),
			}
			await chrome.storage.local.set({ [rowKey]: JSON.stringify(record) })
		},
		key,
		profileId,
	)
}

/** Where the popup lands once the row is written: the barrier, or the lock screen a background restart leaves (the barrier stays off it). */
const landing = (page: Page): Promise<string> =>
	page
		.waitForFunction(
			(barrier: string) => {
				const box = document.querySelector(barrier)?.getBoundingClientRect()
				if (box && box.width > 0 && box.height > 0) return "barrier"
				return window.location.hash.includes("/popup/auth") ? "unlock" : false
			},
			{ timeout: 15_000 },
			BARRIER,
		)
		.then((handle) => handle.jsonValue() as Promise<string>)

async function backHome(page: Page): Promise<void> {
	await ensureUnlocked(page)
	if ((await page.evaluate(() => window.location.hash)) !== "#/popup/general") await navigateByHash(page, "#/popup/general", 15_000)
	await page.waitForSelector('[data-testid="nav-general"]', { visible: true, timeout: 15_000 })
}

/**
 * Runs `fn` with the account verification barrier up, which no e2e reaches by itself: from the
 * unlocked popup it writes the blocking row for the unlocked profile and asserts the barrier.
 * Landing on unlock means a background restart closed the session; unlocking re-verifies, which
 * clears the row, so it unlocks, writes the row again and fails if the barrier still does not show.
 * Always deletes the row, waits for the barrier to go and unlocks back to Home.
 */
export async function withBlockedAccount<T>(page: Page, fn: () => Promise<T>): Promise<T> {
	const session = await readSessionRow(page)
	if (!session) throw new Error("withBlockedAccount: the popup must be unlocked")
	const key = `${BLOCKED_ROOT}@${session.profile}`
	try {
		await writeBlockedRow(page, key, session.profile)
		if ((await landing(page)) === "unlock") {
			await backHome(page)
			await writeBlockedRow(page, key, session.profile)
			const second = await landing(page)
			if (second !== "barrier") throw new Error(`withBlockedAccount: landed on ${second} twice instead of the barrier`)
		}
		return await fn()
	} finally {
		await page.evaluate(async (rowKey: string) => chrome.storage.local.remove(rowKey), key)
		await page.waitForFunction((barrier: string) => !document.querySelector(barrier), { timeout: 15_000 }, BARRIER)
		await backHome(page)
	}
}
