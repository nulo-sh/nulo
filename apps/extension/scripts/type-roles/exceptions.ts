// biome-ignore-all lint/suspicious/noTemplateCurlyInString: a carve-out's text is a script value's source, template literal included.

import type { TypeRole } from "@nulo/design/tokens"

/**
 * The type-role guard's two permanent exception lists, shared with the e2e sweep. Both are
 * stale-checked by `type-role-ban.test.ts`: an entry that matches nothing in the tree fails.
 */

/** The guard's rules, in the order a declaration, prop, key or string is judged. */
export type RuleId = "face" | "tracking" | "case" | "size" | "text-prop" | "tie" | "faceless" | "site-size" | "identifier" | "role"

/** A pick that cannot be a role, kept for good. `selector` narrows a CSS pick to one rule. */
export type CarveOut = { file: string; rule: RuleId; text: string; selector?: string; why: string }

/**
 * A compound rule (two classes or more, so it outranks the role's one) allowed to override one
 * property of the role its element carries. `value` is the only value it may set. `scope` is the
 * same element as a selector the rendered page can match, since module class names are hashed.
 */
export type Override = {
	file: string
	selector: string
	scope: string
	property: string
	value: string
	role: TypeRole
	why: string
}

const PRESTO = "apps/extension/src/onboarding/pages/presto.vue"
const APP = "apps/extension/src/popup/app.vue"
const BRUTALIST = "packages/design/src/ui/BrutalistTitle.vue"
const BALANCE = "apps/extension/src/popup/components/modules/general/BalanceView.vue"
const BUTTON = "packages/design/src/ui/Button.vue"
const TX_CARD = "apps/extension/src/popup/components/modules/activity/TransactionCard.vue"
const TWO_CHIPS = ".chips > .chip, .app_slot > .app_chip"
const TWO_CHIP_SCOPE =
	'[data-testid="activity-direction-chip"]:has(+ span > [data-testid="activity-app-chip"]), [data-testid="activity-direction-chip"] + span > [data-testid="activity-app-chip"]'
const PUBLISH_STRIP = "apps/extension/src/components/composite/send/PublishStrip.vue"
const PUBLISH_FACTS = '[data-testid="send-publish-strip"] [data-cell]'
const ROLELESS = ".wrapper:is(.secondary, .ghost, .text)"
const ROLELESS_WHY = "the icon-only variants carry no role and keep their size step"
const CONTACT_ROW = "apps/extension/src/popup/components/modules/settings/contacts/ContactRow.vue"

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
		file: "apps/extension/src/components/composite/general/AccountAvatar.vue",
		rule: "faceless",
		text: "font-weight: 600",
		selector: ".initials",
		why: "the initials' weight, which the board leaves unchanged",
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
		file: "apps/extension/src/components/composite/send/AmountCard.vue",
		rule: "faceless",
		text: "font-size: calc(13px * var(--hero-scale, 1))",
		selector: ".derived_type",
		why: "the derived token line at its meta line's 13px, which the fit shrinks to keep it on one line",
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
		file: "apps/extension/src/components/composite/general/EmojiGrid.vue",
		rule: "faceless",
		text: "font-size: 24px",
		selector: ".cell",
		why: "the verification emoji's size, a glyph a person compares, which no role carries",
	},
	{
		file: CONTACT_ROW,
		rule: "faceless",
		text: "font-size: 10px",
		selector: ".avatar_text",
		why: "a contact's initials size with their 24px box, as AccountAvatar's do",
	},
	{
		file: CONTACT_ROW,
		rule: "faceless",
		text: "font-weight: 600",
		selector: ".avatar_text",
		why: "a contact's initials keep the avatar row's weight, which the board leaves unchanged",
	},
	{ file: BUTTON, rule: "faceless", text: "font-weight: 600", selector: ROLELESS, why: ROLELESS_WHY },
	{ file: BUTTON, rule: "faceless", text: "font-size: 14px", selector: `${ROLELESS}.large`, why: ROLELESS_WHY },
	{ file: BUTTON, rule: "faceless", text: "font-size: 13px", selector: `${ROLELESS}.medium`, why: ROLELESS_WHY },
	{ file: BUTTON, rule: "faceless", text: "font-size: 12px", selector: `${ROLELESS}.compact`, why: ROLELESS_WHY },
	{ file: BUTTON, rule: "faceless", text: "font-size: 12px", selector: `${ROLELESS}.mini`, why: ROLELESS_WHY },
	{ file: BUTTON, rule: "faceless", text: "font-size: 11px", selector: `${ROLELESS}.micro`, why: ROLELESS_WHY },
	{
		file: BUTTON,
		rule: "faceless",
		text: "font-size: 12px",
		selector: ".wrapper.text.small",
		why: "the text variant carries no role and keeps its smaller step",
	},
]

export const OVERRIDES: Override[] = [
	{
		file: "packages/design/src/ui/Input.vue",
		selector: ".base.mini input",
		scope: '[data-input-size="mini"] input',
		property: "font-size",
		value: "12px",
		role: "input",
		why: "a mini field's typed text keeps its 12px",
	},
	{
		file: "apps/extension/src/components/composite/send/SendTypesCard.vue",
		selector: ".toggle_btn.toggle_active",
		scope: '[data-testid="send-from-type"] > [data-selected], [data-testid="send-to-type"] > [data-selected]',
		property: "font-weight",
		value: "700",
		role: "segment",
		why: "the selected side of the send type toggle takes segment's active weight",
	},
	{
		file: "apps/extension/src/onboarding/pages/create.vue",
		selector: ".tab.tabActive",
		scope: '[data-testid^="onboarding-method-"][aria-selected="true"]',
		property: "font-weight",
		value: "700",
		role: "segment",
		why: "the selected method tab takes segment's active weight",
	},
	{
		file: "apps/extension/src/popup/components/modules/settings/new-profile/NewProfileMethodTabs.vue",
		selector: ".tab.tab_active",
		scope: '[data-testid^="register-method-"][aria-selected="true"]',
		property: "font-weight",
		value: "700",
		role: "segment",
		why: "the selected new-profile method tab takes segment's active weight",
	},
	{
		file: "apps/extension/src/components/composite/IdentityStrip.vue",
		selector: ".identity_network.identity_warn",
		scope: '[data-testid="identity-network"][data-warn]',
		property: "font-weight",
		value: "700",
		role: "meta",
		why: "a warned network keeps its bold over meta's 400",
	},
	{
		file: PUBLISH_STRIP,
		selector: ".strip .cell",
		scope: PUBLISH_FACTS,
		property: "font-size",
		value: "10px",
		role: "label-section",
		why: "a publish fact keeps its 10px beside the 10px names",
	},
	{
		file: PUBLISH_STRIP,
		selector: ".strip .cell",
		scope: PUBLISH_FACTS,
		property: "font-weight",
		value: "600",
		role: "label-section",
		why: "a publish fact keeps its semibold, a step under the bold names",
	},
	{
		file: PUBLISH_STRIP,
		selector: ".strip .cell",
		scope: PUBLISH_FACTS,
		property: "letter-spacing",
		value: "0.08em",
		role: "label-section",
		why: "a publish fact keeps the names' tracking",
	},
	{
		file: TX_CARD,
		selector: TWO_CHIPS,
		scope: TWO_CHIP_SCOPE,
		property: "font-size",
		value: "10px",
		role: "label-section",
		why: "a dApp transfer's two chips fit its row only at 10px",
	},
	{
		file: TX_CARD,
		selector: TWO_CHIPS,
		scope: TWO_CHIP_SCOPE,
		property: "font-weight",
		value: "600",
		role: "label-section",
		why: "a dApp transfer's two chips pair semibold with their 10px",
	},
	{
		file: TX_CARD,
		selector: TWO_CHIPS,
		scope: TWO_CHIP_SCOPE,
		property: "letter-spacing",
		value: "0.08em",
		role: "label-section",
		why: "a dApp transfer's two chips pair 0.08em with their 10px",
	},
]
