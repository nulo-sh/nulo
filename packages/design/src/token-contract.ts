// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
/**
 * Canonical source of truth for Nulo's design-token NAMES, scales, and durations.
 *
 * The public typed reflection in
 * `src/tokens.ts` is GENERATED from this file by `scripts/gen-tokens.ts` — never hand-edit the
 * generated file; run `bun run gen:tokens`. `tokens.drift.test.ts` fails CI on divergence.
 *
 * This file carries only names + scales + durations; the per-theme VALUES live in `base.css`.
 *
 * Members are CSS-variable NAMES (e.g. `"--txt-primary"`), not `var(...)` wrappers.
 */

/** Ordered token groups. Each is emitted as a top-level `export const <group>` in tokens.ts. */
export const tokenGroups = {
	surfaces: {
		appBg: "--app-bg",
		cardBg: "--card-bg",
		tooltipBg: "--tooltip-bg",
		dropdownBg: "--dropdown-bg",
		nuloSurface: "--nulo-surface",
		nuloSurfaceLow: "--nulo-surface-low",
		nuloSurfaceHigh: "--nulo-surface-high",
		nuloSurfaceHighest: "--nulo-surface-highest",
	},
	brand: {
		accent: "--nulo-accent",
		secondary: "--nulo-secondary",
		outline: "--nulo-outline",
		border: "--nulo-border",
		track: "--nulo-track",
	},
	text: {
		primary: "--txt-primary",
		secondary: "--txt-secondary",
		body: "--txt-body",
		tertiary: "--txt-tertiary",
		support: "--txt-support",
		white: "--txt-white",
		inverse: "--txt-inverse",
		warning: "--txt-warning",
		danger: "--txt-danger",
		success: "--txt-success",
	},
	borders: {
		default: "--border",
		hovered: "--border-hovered",
		hairlineSoft: "--hairline-soft",
		hairlineStrong: "--hairline-strong",
	},
	scrims: {
		popup: "--scrim-popup",
		sheet: "--scrim-sheet",
		loader: "--scrim-loader",
		barrier: "--scrim-barrier",
	},
	colors: {
		white: "--white",
		black: "--black",
		blue: "--blue",
		green: "--green",
		mint: "--mint",
		neutralMint: "--neutral-mint",
		orange: "--orange",
		yellow: "--yellow",
		red: "--red",
		purple: "--purple",
		gray: "--gray",
		sand: "--sand",
	},
	fonts: {
		headline: "--font-headline",
		body: "--font-body",
		mono: "--font-mono",
	},
	easings: {
		bezier: "--bezier",
	},
	layout: {
		baseWidth: "--base-width",
		baseHeight: "--base-height",
		navClearance: "--nav-clearance",
	},
} as const

/** Font-size scale (px): every size a role or a module rule may set is a step of it. */
export const fontSizes = [8, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 26, 28, 32, 36, 38, 40] as const

/** Font-weight scale: every weight a role sets is a step of it. */
export const fontWeights = [400, 500, 600, 700] as const

/** Line-height scale: key is the `N` in `.lh--N`; value is the unitless multiplier. */
export const lineHeights = {
	100: 1,
	110: 1.1,
	120: 1.2,
	130: 1.3,
	140: 1.4,
	150: 1.5,
	160: 1.6,
	180: 1.8,
} as const

export type TypeRoleSpec = {
	/** A family token from `tokenGroups.fonts`. */
	readonly family: (typeof tokenGroups.fonts)[keyof typeof tokenGroups.fonts]
	/** A `fontSizes` step, or `null` when the element keeps its own size. */
	readonly size: (typeof fontSizes)[number] | null
	readonly weight: (typeof fontWeights)[number]
	/** The weight of the selected item, applied by the component's own compound rule. */
	readonly activeWeight?: (typeof fontWeights)[number]
	/** In em; 0 renders `letter-spacing: normal`. */
	readonly tracking: number
	readonly uppercase: boolean
	readonly tabular: boolean
}

/** No text renders below this size (px). */
export const MIN_TEXT_PX = 10
/** A step above `MIN_TEXT_PX`: small mono holds what a person compares glyph by glyph, a hash's head and tail. */
export const MIN_MONO_PX = 11

/**
 * The only way the wallet picks a face, tracking or case. Each key renders `.type--<key>` in
 * `utilities.css`. No role sets line height, so a line box moves only where face or size changes.
 */
export const typeRoles = {
	"title-hero": { family: "--font-headline", size: null, weight: 700, tracking: -0.04, uppercase: true, tabular: false },
	"amount-hero": { family: "--font-headline", size: null, weight: 700, tracking: -0.04, uppercase: false, tabular: true },
	"amount-total": { family: "--font-mono", size: null, weight: 500, tracking: -0.02, uppercase: false, tabular: false },
	"title-page": { family: "--font-headline", size: 13, weight: 700, tracking: 0.12, uppercase: true, tabular: false },
	"label-section": { family: "--font-headline", size: 11, weight: 700, tracking: 0.1, uppercase: true, tabular: false },
	label: { family: "--font-headline", size: 10, weight: 700, tracking: 0.1, uppercase: true, tabular: false },
	"row-title": { family: "--font-headline", size: null, weight: 700, tracking: -0.02, uppercase: false, tabular: false },
	caption: { family: "--font-body", size: 11, weight: 400, tracking: 0, uppercase: false, tabular: false },
	name: { family: "--font-body", size: null, weight: 600, tracking: 0, uppercase: false, tabular: false },
	"name-tag": { family: "--font-body", size: 11, weight: 600, tracking: 0.04, uppercase: true, tabular: false },
	body: { family: "--font-body", size: 12, weight: 400, tracking: 0, uppercase: false, tabular: false },
	button: { family: "--font-headline", size: 14, weight: 700, tracking: 0.2, uppercase: true, tabular: false },
	"button-md": { family: "--font-headline", size: 13, weight: 700, tracking: 0.03, uppercase: true, tabular: false },
	nav: { family: "--font-headline", size: 10, weight: 500, tracking: 0.05, uppercase: true, tabular: false },
	segment: { family: "--font-headline", size: 10, weight: 500, activeWeight: 700, tracking: 0.06, uppercase: true, tabular: false },
	tag: { family: "--font-headline", size: 10, weight: 600, tracking: 0.08, uppercase: true, tabular: false },
	"tag-name": { family: "--font-headline", size: 10, weight: 700, tracking: 0.08, uppercase: true, tabular: false },
	brand: { family: "--font-headline", size: 10, weight: 700, tracking: 0.2, uppercase: false, tabular: false },
	"input-data": { family: "--font-mono", size: 14, weight: 400, tracking: 0, uppercase: false, tabular: false },
	data: { family: "--font-mono", size: 12, weight: 500, tracking: 0, uppercase: false, tabular: false },
	"data-lead": { family: "--font-mono", size: 13, weight: 600, tracking: 0, uppercase: false, tabular: false },
	"amount-row": { family: "--font-mono", size: 14, weight: 500, tracking: 0, uppercase: false, tabular: false },
	"amount-detail": { family: "--font-headline", size: 24, weight: 700, tracking: -0.02, uppercase: false, tabular: true },
	fiat: { family: "--font-mono", size: null, weight: 400, tracking: 0, uppercase: false, tabular: false },
	time: { family: "--font-mono", size: 11, weight: 400, tracking: 0, uppercase: false, tabular: false },
	meta: { family: "--font-mono", size: 11, weight: 400, tracking: 0, uppercase: false, tabular: false },
	value: { family: "--font-body", size: 12, weight: 600, tracking: 0, uppercase: false, tabular: false },
	input: { family: "--font-body", size: 15, weight: 500, tracking: 0, uppercase: false, tabular: false },
} as const satisfies Record<string, TypeRoleSpec>

/** Informal transition-duration scale (literal values, not CSS vars). */
export const durations = {
	short: "150ms",
	medium: "200ms",
	long: "300ms",
} as const

/**
 * Utility-class inputs — drive the generated `utilities.css` (the text and flex
 * utility layer). Kept stable so the generated CSS is byte-faithful.
 */

/** `.color--*` / `.fill--*` color-name → CSS-var map */
export const textColors = {
	primary: "--txt-primary",
	body: "--txt-body",
	secondary: "--txt-secondary",
	tertiary: "--txt-tertiary",
	support: "--txt-support",
	inverse: "--txt-inverse",
	white: "--txt-white",
	"txt-warning": "--txt-warning",
	"txt-danger": "--txt-danger",
	"txt-success": "--txt-success",
	blue: "--blue",
	orange: "--orange",
	purple: "--purple",
	green: "--green",
	red: "--red",
	yellow: "--yellow",
	amber: "--yellow",
	gray: "--gray",
	"neutral-mint": "--neutral-mint",
	sand: "--sand",
} as const

/** Text-align utilities (`.ta--*`). */
export const textAligns = { center: "center", left: "left", right: "right" } as const

/** `.gap--N` scale (px). */
export const flexGaps = [2, 3, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 48, 60] as const

/** `.justify-*` / `.items-*` / `.justify-items-*` / `.content-*` value map. */
export const flexAlignments = {
	center: "center",
	between: "space-between",
	around: "space-around",
	evenly: "space-evenly",
	start: "flex-start",
	end: "flex-end",
} as const

/** `.wrap-*` value map. */
export const flexWraps = { nowrap: "nowrap", wrap: "wrap", wrapReverse: "wrap-reverse" } as const

/** `.flex-direction-*` value map. */
export const flexDirections = {
	row: "row",
	column: "column",
	rowReversed: "row-reverse",
	columnReversed: "column-reverse",
} as const
