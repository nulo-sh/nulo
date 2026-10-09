// biome-ignore-all lint/suspicious/noTemplateCurlyInString: a carve-out's text is a script value's source, template literal included.

import type { TypeRole } from "@nulo/design/tokens"

/**
 * The type-role guard's two permanent exception lists, shared with the e2e sweep. Both are
 * stale-checked by `type-role-ban.test.ts`: an entry that matches nothing in the tree fails.
 */

/** The guard's rules, in the order a declaration, prop, key or string is judged. */
export type RuleId = "face" | "tracking" | "case" | "size" | "text-prop" | "tie" | "faceless" | "site-size" | "identifier"

/** A pick that cannot be a role, kept for good. `selector` narrows a CSS pick to one rule. */
export type CarveOut = { file: string; rule: RuleId; text: string; selector?: string; why: string }

/**
 * A compound rule (two classes or more, so it outranks the role's one) allowed to override one
 * property of the role its element carries. `value` is the only value it may set.
 */
export type Override = { file: string; selector: string; property: string; value: string; role: TypeRole; why: string }

const PRESTO = "apps/extension/src/onboarding/pages/presto.vue"
const APP = "apps/extension/src/popup/app.vue"
const BRUTALIST = "packages/design/src/ui/BrutalistTitle.vue"
const BALANCE = "apps/extension/src/popup/components/modules/general/BalanceView.vue"

export const CARVE_OUTS: CarveOut[] = [
	{
		file: PRESTO,
		rule: "face",
		text: "--pb-font-body: var(--font-body)",
		why: "themes the third-party <presto-banner> shadow root, which no class reaches",
	},
	{
		file: PRESTO,
		rule: "face",
		text: "--pb-font-display: var(--font-headline)",
		why: "themes the third-party <presto-banner> shadow root, which no class reaches",
	},
	{ file: APP, rule: "face", text: "font-family: sans-serif", why: "the anti-scam banner's title, styled DevTools console output" },
	{ file: APP, rule: "face", text: "font-family: sans-serif", why: "the anti-scam banner's text, styled DevTools console output" },
	{
		file: "apps/extension/src/components/JsonViewer/creator.js",
		rule: "face",
		text: 'fontFamily: "monospace"',
		why: "CodeMirror's theme takes a style object, in the developer log viewer",
	},
	{ file: BRUTALIST, rule: "size", text: "font-size: 48px", why: "the onboarding hero title's default size, drawn only here" },
	{ file: BRUTALIST, rule: "size", text: "font-size: 56px", why: "the welcome page's hero title size, drawn only here" },
	{ file: BRUTALIST, rule: "faceless", text: "font-size: 32px", why: "the compact hero title inside a card, drawn only here" },
	{
		file: "apps/extension/src/components/composite/general/AccountAvatar.vue",
		rule: "faceless",
		text: "fontSize: `${fontSize}px`",
		why: "initials size with their avatar's box, which the board leaves unchanged",
	},
	{
		file: "apps/extension/src/components/composite/send/AmountCard.vue",
		rule: "faceless",
		text: "font-size: 40px",
		selector: ".field_line::after, .unit_pair::before",
		why: "the height strut copies the amount field's full-size line box; a pseudo-element takes no class",
	},
	{
		file: "apps/extension/src/popup/components/modules/send/SendReviewSheet.vue",
		rule: "size",
		text: "font-size: calc(30px * var(--hero-scale, 1))",
		selector: ".amount",
		why: "the review figure's full size, which the hero fit shrinks",
	},
	{
		file: BALANCE,
		rule: "size",
		text: "font-size: 48px",
		selector: ".balance_amount",
		why: "the Home figure's full size, which the hero fit shrinks",
	},
	{
		file: BALANCE,
		rule: "faceless",
		text: "font-size: 0.5em",
		selector: ".balance_symbol",
		why: "the symbol takes the fitted figure's face, weight and tracking at half its size, which a role would reset",
	},
	{
		file: "apps/extension/src/popup/pages/tab-hero.module.css",
		rule: "size",
		text: "font-size: 48px",
		selector: ".hero_title",
		why: "title-hero's size on Activity and the Settings hub",
	},
	{
		file: "packages/design/src/core/MaterialIcon.vue",
		rule: "faceless",
		text: "fontSize: `${props.size}px`",
		why: "sizes an icon glyph, not text",
	},
]

export const OVERRIDES: Override[] = [
	{
		file: "packages/design/src/ui/Input.vue",
		selector: ".base.mini input",
		property: "font-size",
		value: "12px",
		role: "input",
		why: "a mini field's typed text keeps its 12px",
	},
]
