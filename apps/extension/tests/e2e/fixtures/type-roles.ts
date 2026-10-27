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
import { withTimeoutMessage } from "./dom"
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
	/**
	 * How far, in px, its text reaches past the box it lays out in: its own box, or an inline
	 * element's containing block. 0 for a field, a box that scrolls and a box that draws an ellipsis.
	 */
	pastBox: number
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
 * Which elements a read collects: the role-bearing ones, the visible ones with text of their own,
 * both (`laid-out`, what the layout gate judges), or those at a selector, each read as itself or,
 * with `native`, as the native field at or under it.
 */
export type ReadScope = { kind: "roles" } | { kind: "own-text" } | { kind: "laid-out" } | { kind: "at"; selector: string; native?: boolean }

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
	// Insets that meet, the screen-reader idiom: the box paints nothing. A value read as other than a
	// percentage keeps the box visible.
	const clipsToNothing = (style: CSSStyleDeclaration): boolean => {
		const insets = /^inset\(([^)]*?)(?:\s+round\b[^)]*)?\)$/.exec(style.clipPath)?.[1].trim().split(/\s+/)
		if (!insets) return false
		const [top, right = top, bottom = top, left = right] = insets.map((v) => (v.endsWith("%") ? Number.parseFloat(v) : Number.NaN))
		return top + bottom >= 100 || left + right >= 100
	}
	const isVisible = (el: Element): boolean => {
		const box = el.getBoundingClientRect()
		const style = win.getComputedStyle(el)
		return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && !clipsToNothing(style)
	}
	const hasOwnText = (el: Element): boolean =>
		Array.from(el.childNodes).some((node) => node.nodeType === 3 && (node.textContent ?? "").trim() !== "")
	const FIELD = "input, textarea"
	const field = (el: Element): Element => (el.matches(FIELD) ? el : (el.querySelector(FIELD) ?? el))
	const shownText = (el: Element): boolean => hasOwnText(el) && isVisible(el)
	const collect = (): Element[] => {
		if (scope.kind === "at") return Array.from(doc.querySelectorAll(scope.selector)).map((el) => (scope.native ? field(el) : el))
		if (scope.kind === "roles") return Array.from(doc.querySelectorAll(ROLE))
		const all = Array.from(doc.body.querySelectorAll("*"))
		return scope.kind === "own-text" ? all.filter(shownText) : all.filter((el) => el.matches(ROLE) || shownText(el))
	}
	type Span = { left: number; right: number }
	const join = (span: Span | null, more: Span): Span =>
		span ? { left: Math.min(span.left, more.left), right: Math.max(span.right, more.right) } : { left: more.left, right: more.right }
	/** Lays its text out apart from its parent's: a field, a box out of flow, or one that clips or scrolls. */
	const apart = (el: Element, style: CSSStyleDeclaration): boolean =>
		el.matches(FIELD) || /^(absolute|fixed)$/.test(style.position) || style.overflowX !== "visible"
	const textNodeSpan = (node: Node): Span | null => {
		if ((node.textContent ?? "").trim() === "") return null
		const range = doc.createRange()
		range.selectNodeContents(node)
		return Array.from(range.getClientRects())
			.filter((rect) => rect.width > 0)
			.reduce<Span | null>(join, null)
	}
	const childSpan = (child: Element): Span | null => {
		const style = win.getComputedStyle(child)
		if (style.display === "contents") return textSpan(child)
		if (!isVisible(child) || child.matches(FIELD) || /^(absolute|fixed)$/.test(style.position)) return null
		if (!apart(child, style)) return textSpan(child)
		// A box that clips lays its text out apart, yet paints it inside this one.
		const own = textSpan(child)
		return own ? paintedSpan(child, own) : null
	}
	const spans = new Map<Element, Span | null>()
	/** Where an element's text reaches sideways: its own and its in-flow descendants', a clipping one's as painted, a field's not at all. */
	const textSpan = (el: Element): Span | null => {
		const known = spans.get(el)
		if (known !== undefined) return known
		const parts = Array.from(el.childNodes).map((node) =>
			node.nodeType === 3 ? textNodeSpan(node) : node.nodeType === 1 ? childSpan(node as Element) : null,
		)
		const span = parts.reduce<Span | null>((sum, part) => (part ? join(sum, part) : sum), null)
		spans.set(el, span)
		return span
	}
	/** `text-overflow` acts on a block container's own lines: a flex or grid container draws no ellipsis. */
	const drawsEllipsis = (style: CSSStyleDeclaration): boolean =>
		style.textOverflow === "ellipsis" && style.overflowX !== "visible" && !/flex|grid/.test(style.display)
	const pastBox = (el: Element, span: Span | null): number => {
		let box = el
		while (box.parentElement && /^(inline|contents)$/.test(win.getComputedStyle(box).display)) box = box.parentElement
		const style = win.getComputedStyle(box)
		if (!span || box.matches(FIELD) || /^(auto|scroll)$/.test(style.overflowX) || drawsEllipsis(style)) return 0
		const left = box.getBoundingClientRect().left + box.clientLeft
		return Math.max(0, left - span.left, span.right - (left + box.clientWidth))
	}
	const paintedSpan = (el: Element, span: Span | null): Span => {
		const box = el.getBoundingClientRect()
		if (!span || el.matches(FIELD)) return { left: box.left, right: box.right }
		// Text an element clips itself paints no further than its own box.
		if (win.getComputedStyle(el).overflowX !== "visible")
			return { left: Math.max(span.left, box.left), right: Math.min(span.right, box.right) }
		return { ...span }
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
	/** The block whose lines hold the element: itself, or the nearest ancestor it sits inline in. */
	const lineOf = (el: Element): Element => {
		let box = el
		while (box.parentElement && /^(inline|contents)/.test(win.getComputedStyle(box).display)) box = box.parentElement
		return box
	}
	const crosses = (span: Span, edge: DOMRect): boolean => span.left < edge.left - 0.5 || span.right > edge.right + 0.5
	const nameOf = (el: Element): string => el.getAttribute("data-testid") ?? el.tagName
	const cutBy = (el: Element, text: Span | null): Pick<TypeReading, "clippedBy" | "ellipsizedBy"> => {
		const span = paintedSpan(el, text)
		const lines = lineOf(el)
		let ellipsizedBy: string | null = null
		for (const up of clippingAncestors(el)) {
			const edge = up.getBoundingClientRect()
			const crossed = crosses(span, edge)
			// An ellipsis shortens the lines of the box that draws it, never a block inside that box.
			const ellipsis = up === lines && drawsEllipsis(win.getComputedStyle(up))
			if (crossed && !ellipsis) return { clippedBy: nameOf(up), ellipsizedBy }
			if (crossed) ellipsizedBy ??= nameOf(up)
			span.left = Math.max(span.left, edge.left)
			span.right = Math.min(span.right, edge.right)
		}
		return { clippedBy: null, ellipsizedBy }
	}
	const read = (el: Element): TypeReading => {
		const style = win.getComputedStyle(el)
		const span = textSpan(el)
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
			pastBox: pastBox(el, span),
			scrollWidth: el.scrollWidth,
			clientWidth: el.clientWidth,
			visible: isVisible(el),
			...cutBy(el, span),
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

// ── The layout gate ─────────────────────────────────────────────────────

export type Overflow = Pick<TypeReading, "testid" | "text" | "roles" | "pastBox" | "clippedBy">

/**
 * Text cut by an ancestor with no ellipsis drawn, or reaching more than 1 px past the box it lays
 * out in with none drawn there. A field or a box that scrolls answers only for an ancestor's cut.
 */
export const overflowingText = (readings: readonly TypeReading[]): Overflow[] =>
	readings
		.filter((reading) => reading.visible && (reading.clippedBy !== null || reading.pastBox > 1))
		.map(({ testid, text, roles, pastBox, clippedBy }) => ({ testid, text, roles, pastBox: Math.round(pastBox * 10) / 10, clippedBy }))

/**
 * The layout gate over the page as it stands: every role-bearing element and every element with text
 * of its own, but text under a testid `accepted` names.
 */
export async function expectLaidOut(page: Page, label: string, accepted: ReadonlySet<string> = new Set()): Promise<void> {
	const { readings } = await readPageTypography(page, { kind: "laid-out" })
	const cut = overflowingText(readings).filter(({ testid }) => testid === null || !accepted.has(testid))
	expect(cut, `${label}: text past its box`).toEqual([])
}

export type PastView = { testid: string | null; tag: string; left: number; right: number }
export type Sideways = { testid: string | null; holds: string | null; tag: string; scrollWidth: number; clientWidth: number }
export type InsideView = { view: number; scroll: number; past: PastView[]; sideways: Sideways[] }

/**
 * Boxes past the view's sides, boxes that scroll sideways, and how wide the page scrolls. A box past
 * the view counts whatever holds it: an ancestor that clips cuts it, and one that scrolls must not
 * scroll sideways, which `sideways` reports. A page scroller's `overflow-x` computes to `auto` from
 * its `overflow-y`, so style cannot tell it from a sideways one. A box inside one already reported
 * is not reported again; a field scrolls its own text. A scroller is named by its own or the nearest
 * testid above it and by the first one it holds, as a shared wrapper rarely carries one. `expectLaidOut`
 * reads text only, so a box with none, or one placed past the view, needs this.
 */
export async function readInsideView(page: Page): Promise<InsideView> {
	return page.evaluate(() => {
		const view = document.documentElement.clientWidth
		const shownBox = (el: Element): DOMRect | null => {
			const style = getComputedStyle(el)
			if (style.display === "none" || style.visibility === "hidden") return null
			const box = el.getBoundingClientRect()
			return box.width < 2 || box.height < 2 ? null : box
		}
		const scrollsSideways = (el: Element) =>
			/^(auto|scroll)$/.test(getComputedStyle(el).overflowX) && !el.matches("input, textarea") && el.scrollWidth > el.clientWidth
		const past: PastView[] = []
		const sideways: Sideways[] = []
		const reported: Element[] = []
		for (const el of document.body.querySelectorAll("*")) {
			const box = shownBox(el)
			if (!box) continue
			const testid = el.closest("[data-testid]")?.getAttribute("data-testid") ?? null
			const tag = el.tagName.toLowerCase()
			if (scrollsSideways(el)) {
				const holds = el.querySelector("[data-testid]")?.getAttribute("data-testid") ?? null
				sideways.push({ testid, holds, tag, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })
			}
			if ((box.left >= -0.5 && box.right <= view + 0.5) || reported.some((outer) => outer.contains(el))) continue
			reported.push(el)
			past.push({ testid, tag, left: Math.round(box.left), right: Math.round(box.right) })
		}
		return { view, scroll: document.documentElement.scrollWidth, past, sideways }
	})
}

/** Nothing past the view's sides, and nothing in the page, the page included, scrolls sideways. */
export async function expectInsideView(page: Page, label: string): Promise<void> {
	const { view, scroll, past, sideways } = await readInsideView(page)
	expect({ past, sideways }, `${label}: boxes past the ${view} px view, and boxes that scroll sideways`).toEqual({
		past: [],
		sideways: [],
	})
	expect(scroll, `${label}: the page scrolls sideways`).toBeLessThanOrEqual(view)
}

/**
 * Text the narrow width is allowed to drop or cut, by the testid it sits under. No scroller in the
 * page is meant to scroll sideways, so none is accepted for it: the logs and JSON viewers' editors
 * scroll sideways inside shadow roots these readers never enter (`viewers-csp.test.ts` reads the
 * log's box in its root), and the capabilities Details table narrows its columns instead.
 */
export const NARROW_ACCEPTED: readonly { testid: string; why: string }[] = [
	{ testid: "header-lock", why: "below 359 px the Lock chip keeps its icon; the button's name stays Lock wallet" },
	{ testid: "network-name", why: "the network chip keeps the ellipsis it has, down to its status dot; the button names the network" },
	{
		testid: "activity-title-sep",
		why: "a row's chips wrapped under its title leave their separator left of the row's clip, as wrapTrailing rows do",
	},
	{ testid: "tx-incoming-kind-sep", why: "a receipt's kind chip wrapped under its title leaves its separator left of the row's clip" },
	{ testid: "identity-sep", why: "a dApp window's network goes under its account below 359 px, with no separator between them" },
]

export type TextFate = { fate: "cut" | "gone" | "split"; testid: string | null; text: string }

/**
 * At the page's own width (`record`), notes for each element whether its text is painted, whether
 * a box cuts it with an ellipsis or a line clamp, and whether a shortened identifier in its own text
 * (`0x1234..abcd`) runs across two lines; at another width, returns each noted element whose text
 * that width hides, newly cuts or newly splits. Elements are told apart by identity, so repeated rows never
 * stand in for one another; one the page replaced is judged by its replacement, the element under the
 * same testid with the same text, and is gone when there is none. `expectLaidOut` cannot see either:
 * a drawn ellipsis is not a cut to it, and text squeezed to no width or clipped away is not shown.
 */
export async function textFates(page: Page, mode: "record" | "compare"): Promise<TextFate[]> {
	return page.evaluate((recording: boolean) => {
		type Noted = { el: Element; shown: boolean; cut: boolean; split: boolean; testid: string | null; text: string; own: boolean }
		const store = window as unknown as { __nuloTextFates?: Noted[] }
		const hasText = (el: Element) =>
			Array.from(el.childNodes).some((node) => node.nodeType === 3 && (node.textContent ?? "").trim() !== "")
		const textOf = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60)
		const testidOf = (el: Element) => el.closest("[data-testid]")?.getAttribute("data-testid") ?? null
		const clips = (overflow: string) => overflow === "hidden" || overflow === "clip"
		const scrolls = (overflow: string) => overflow === "auto" || overflow === "scroll"
		type Edge = { lo: number; hi: number; overflow: string; box: boolean }
		// The edges, per axis, of the ancestors that can clip a box: none past a fixed one, which no
		// ancestor above it holds.
		const holders = (el: Element) => {
			const chain: { x: Edge[]; y: Edge[] } = { x: [], y: [] }
			for (let up = getComputedStyle(el).position === "fixed" ? null : el.parentElement; up; up = up.parentElement) {
				const style = getComputedStyle(up)
				const box = up.getBoundingClientRect()
				const boxed = style.display !== "contents"
				chain.x.push({ lo: box.left, hi: box.right, overflow: style.overflowX, box: boxed })
				chain.y.push({ lo: box.top, hi: box.bottom, overflow: style.overflowY, box: boxed })
				if (style.position === "fixed") break
			}
			return chain
		}
		// The length of a span that no hidden or clipped overflow cuts away. Past an ancestor that
		// scrolls on that axis the span is reachable, so nothing above it cuts it; but where nothing may
		// scroll sideways (`sidewaysCuts`, the compare), a scroller with a box cuts sideways like a clip.
		const span = (from: number, to: number, edges: Edge[], sidewaysCuts: boolean) => {
			let [lo, hi] = [from, to]
			for (const edge of edges) {
				const cuts = clips(edge.overflow) || (sidewaysCuts && edge.box && scrolls(edge.overflow))
				if (cuts) [lo, hi] = [Math.max(lo, edge.lo), Math.min(hi, edge.hi)]
				else if (scrolls(edge.overflow)) break
			}
			return hi - lo
		}
		const painted = (el: Element) => {
			const box = el.getBoundingClientRect()
			const chain = holders(el)
			return span(box.left, box.right, chain.x, !recording) >= 1 && span(box.top, box.bottom, chain.y, false) >= 1
		}
		const cut = (el: Element, style: CSSStyleDeclaration) => {
			const clamp = style.getPropertyValue("-webkit-line-clamp")
			const ellipsis = style.textOverflow === "ellipsis" && style.overflowX !== "visible" && el.scrollWidth > el.clientWidth + 0.5
			const clamped = clamp !== "" && clamp !== "none" && el.scrollHeight > el.clientHeight + 0.5
			return (ellipsis || clamped) && (el.textContent ?? "").trim() !== ""
		}
		// A shortened identifier reads as one token: drawn over two lines it reads as two. Lines are told
		// apart by their tops: at `line-height: 1` a glyph box is taller than its line, so lines overlap.
		const split = (el: Element) =>
			Array.from(el.childNodes).some((node) => {
				if (node.nodeType !== 3) return false
				return Array.from((node.textContent ?? "").matchAll(/0x[0-9a-f]+(?:\.{2,3}|…)[0-9a-f]+/gi)).some((match) => {
					const range = document.createRange()
					range.setStart(node, match.index)
					range.setEnd(node, match.index + match[0].length)
					const tops = Array.from(range.getClientRects(), (rect) => (rect.width > 0 ? Math.round(rect.top) : null))
					return new Set(tops.filter((top) => top !== null)).size > 1
				})
			})
		const read = (el: Element) => {
			const style = getComputedStyle(el)
			return { shown: hasText(el) && style.visibility !== "hidden" && painted(el), cut: cut(el, style), split: split(el) }
		}
		const all = Array.from(document.body.querySelectorAll("*"))
		if (recording) {
			store.__nuloTextFates = all.map((el) => ({ el, ...read(el), testid: testidOf(el), text: textOf(el), own: hasText(el) }))
			return []
		}
		const noted = store.__nuloTextFates
		if (!noted) throw new Error("textFates: nothing recorded at the page's own width")
		const known = new Set(noted.map(({ el }) => el))
		const key = (testid: string | null, own: boolean, text: string) => `${testid}\u0000${own}\u0000${text}`
		// Each replacement stands in for one record, in document order, so none answers for two.
		const fresh = new Map<string, Element[]>()
		for (const el of all.filter((one) => !known.has(one))) {
			const k = key(testidOf(el), hasText(el), textOf(el))
			fresh.set(k, [...(fresh.get(k) ?? []), el])
		}
		const now = (before: Noted) => {
			const el = before.el.isConnected ? before.el : fresh.get(key(before.testid, before.own, before.text))?.shift()
			return el ? read(el) : { shown: false, cut: false, split: false }
		}
		const fateOf = (before: Noted): TextFate["fate"] | null => {
			const after = now(before)
			if (before.shown && !after.shown) return "gone"
			if (!before.cut && after.cut) return "cut"
			return before.shown && !before.split && after.split ? "split" : null
		}
		return noted.flatMap((before) => {
			const fate = fateOf(before)
			return fate ? [{ fate, testid: before.testid, text: before.text }] : []
		})
	}, mode === "record")
}

/** The narrowest width a page is laid out for: Firefox's sidebar opens at 240 px. */
export const NARROW_WIDTH = 240

/**
 * Two frames, then whatever transitions the change started (a button animates its padding), then two
 * more: a Vue transition removes its leaving element on the `transitionend` after `finished`.
 */
async function settleLayout(page: Page): Promise<void> {
	await page.evaluate(async () => {
		const frames = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
		await frames()
		const ends = document.getAnimations().flatMap((a) => (a instanceof CSSTransition ? [a.finished.catch(() => undefined)] : []))
		await Promise.race([Promise.all(ends), new Promise((done) => setTimeout(done, 1_500))])
		await frames()
	})
}

/** Runs `check` with the page's viewport `width` wide, then gives the page back its own. */
export async function atWidth(page: Page, width: number, check: () => Promise<void>): Promise<void> {
	const own = page.viewport()
	await page.setViewport({ width, height: own?.height ?? 600 })
	try {
		await settleLayout(page)
		await check()
	} finally {
		await page.setViewport(own)
		await settleLayout(page)
	}
}

const narrowAccepted: ReadonlySet<string> = new Set(NARROW_ACCEPTED.map(({ testid }) => testid))

/** At the narrow width: the layout gate but under what `NARROW_ACCEPTED` names, nothing past the view, and nothing scrolling sideways. */
export async function expectFits(page: Page, label: string): Promise<void> {
	await expectLaidOut(page, label, narrowAccepted)
	await expectInsideView(page, label)
}

/**
 * `expectFits` with the page at its narrowest width, and no text that its own width shows whole
 * hidden, newly cut or with a shortened identifier newly split there; text under a testid
 * `NARROW_ACCEPTED` names is exempt from all of it.
 */
export async function expectFitsNarrow(page: Page, label: string): Promise<void> {
	// A menu a press closed is still in the DOM for its leave.
	await settleLayout(page)
	// A success snack closes itself within seconds, unless a pointer or focus holds it, and Send's fee
	// card ends its balance read, whose legs run at once under the store's 20 s bound each
	// (`INIT_FETCH_TIMEOUT_MS`); either changing mid-check would read as text the width hid.
	const held = await page.evaluate(() => {
		const snack = document.querySelector('[data-testid="snackbar"][data-kind="success"]')
		if (snack?.contains(document.activeElement) && document.activeElement instanceof HTMLElement) document.activeElement.blur()
		return snack?.matches(":hover") ?? false
	})
	if (held) await page.mouse.move(0, 0)
	const unsettled = '[data-testid="snackbar"][data-kind="success"], [data-testid="fee-settings-card"][data-read-pending]'
	await withTimeoutMessage(
		page.waitForFunction((s) => !document.querySelector(s), { timeout: 30_000, polling: 100 }, unsettled),
		async () =>
			`${label}: still on the page after 30 s: ${await page.evaluate((s) => [...document.querySelectorAll(s)].map((el) => el.getAttribute("data-testid")).join(", "), unsettled)}`,
	)
	await textFates(page, "record")
	await atWidth(page, NARROW_WIDTH, async () => {
		const at = `${label} at ${NARROW_WIDTH} px`
		await expectFits(page, at)
		const fates = (await textFates(page, "compare")).filter(({ testid }) => testid === null || !narrowAccepted.has(testid))
		expect(fates, `${at}: text its own width shows whole, hidden, cut or split here`).toEqual([])
	})
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
	role: "data-lead" | "input-data" | "meta" | "name" | "none"
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

/** The suite that observes a site: the network spec for a state the expected file marks `(network)`, the smoke spec for any other. */
export function siteSuite(site: Pick<SiteEntry, "state">): "smoke" | "network" {
	return site.state.endsWith("(network)") ? "network" : "smoke"
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

/** A hidden match is another branch's or a closed panel's, so it neither passes nor observes the site. */
async function observeSite(page: Page, site: SiteEntry): Promise<SiteObservation> {
	const key = siteKey(site)
	if (site.unreachable) return { key, site, mode: "unreachable", readings: [], failures: [] }
	const { vars, readings: matched } = await readPageTypography(page, {
		kind: "at",
		selector: selectorOf(site.selector),
		native: site.role === "input-data",
	})
	const readings = matched.filter((reading) => reading.visible)
	const failures =
		readings.length === 0
			? [
					{
						testid: null,
						text: "",
						role: site.role,
						property: "selector",
						expected: `a visible element at ${site.selector}`,
						actual: matched.length === 0 ? "none" : `${matched.length} hidden`,
					},
				]
			: readings.flatMap((reading) => judgeSite(reading, site, vars))
	return { key, site, mode: "asserted", readings, failures }
}

/**
 * The identifier sites of one surface in one seeded state: every visible element at each matching
 * site's selector, and at least one, carries the site's role and computes to it (an `AddressDisplay`
 * showing a name expects `name`; an `input-data` site is read at its native field), then the hex text
 * scan.
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
