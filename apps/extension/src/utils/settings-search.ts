/**
 * Every Settings row a search can find, in the order the pages show them. The pages render each
 * row's title, description and testid from here; a row on the Settings list also takes its link
 * (`to`), and a sub-page row is marked `v-settings-row="<id>"` so a result can outline it. The one
 * place a searchable row registers is its entry below: adding, renaming or removing a row is an
 * edit here plus the control that renders it, and each owning page's test (`expectOwnedRows`) fails
 * when the two halves disagree.
 */

/** What decides which rows exist and what two of them say, as the Settings list knows it. */
export type SettingsContext = {
	/** The browser has a side panel (Chrome); Firefox has none. */
	sidePanel: boolean
	passkey: boolean
	developerMode: boolean
	/** The Proving row's live line. */
	provingStatus: string
}

type RowDefinition = {
	page: string
	/** The caption the row sits under: the list's section, or the sub-page's title. */
	section: string
	danger?: true
	title: string
	description?: string | ((context: SettingsContext) => string)
	/** Words that find the row and are never shown. */
	synonyms: readonly string[]
	testid: string
	/** Where the row itself leads; its result opens that page as a tap on the row does. */
	to?: string
	visible?: (context: SettingsContext) => boolean
}

export type SettingsRow = {
	id: SettingsRowId
	page: string
	section: string
	danger: boolean
	title: string
	description: string | undefined
	synonyms: readonly string[]
	testid: string
	to: string | undefined
}

export type SettingsResultGroup = { caption: string; danger: boolean; rows: SettingsRow[] }

const HUB = "/popup/settings"

export const SETTINGS_ROWS = {
	"hub-accounts": {
		page: HUB,
		section: "Your wallet",
		title: "Accounts",
		description: "Switch, create, manage",
		synonyms: ["wallet", "address", "add account", "import account", "hide account"],
		testid: "setting-nav-accounts",
		to: "/popup/settings/accounts",
	},
	"hub-contacts": {
		page: HUB,
		section: "Your wallet",
		title: "Contacts",
		description: "Saved addresses",
		synonyms: ["address book", "people", "recipients", "import contacts", "export contacts"],
		testid: "setting-nav-contacts",
		to: "/popup/settings/contacts",
	},
	"hub-tokens": {
		page: HUB,
		section: "Your wallet",
		title: "Tokens",
		description: "Tracked tokens and balances",
		synonyms: ["assets", "coins", "add token", "import token", "balances"],
		testid: "setting-nav-tokens",
		to: "/popup/settings/tokens",
	},
	"hub-connected-apps": {
		page: HUB,
		section: "Apps and networks",
		title: "Connected Apps",
		description: "Apps with granted permissions",
		synonyms: ["dapps", "sites", "sessions", "permissions", "disconnect"],
		testid: "setting-nav-connected-apps",
		to: "/popup/settings/connected-apps",
	},
	"hub-networks": {
		page: HUB,
		section: "Apps and networks",
		title: "Networks",
		description: "Aztec networks and RPCs",
		synonyms: ["chain", "rpc", "node", "endpoint", "testnet"],
		testid: "setting-nav-networks",
		to: "/popup/settings/networks",
	},
	"hub-fpcs": {
		page: HUB,
		section: "Apps and networks",
		title: "Fee Payments",
		description: "FPCs and fee methods",
		synonyms: ["fee", "gas", "sponsor", "fee juice", "paymaster"],
		testid: "setting-nav-fpcs",
		to: "/popup/settings/fpcs",
	},
	"hub-proving": {
		page: HUB,
		section: "Apps and networks",
		title: "Proving",
		description: (context) => context.provingStatus,
		synonyms: ["presto", "prover", "proof", "speed"],
		testid: "setting-nav-proving",
		to: "/popup/settings/proving",
	},
	"hub-lock": {
		page: HUB,
		section: "Safety",
		title: "Lock",
		description: (context) => (context.passkey ? "Auto-lock" : "Auto-lock, strict mode"),
		synonyms: ["auto-lock", "timeout", "session"],
		testid: "setting-nav-lock",
		to: "/popup/settings/lock",
	},
	"hub-backup": {
		page: HUB,
		section: "Safety",
		title: "Back up profile",
		description: "Keep a copy of this profile",
		synonyms: ["export", "backup", "recovery phrase", "seed phrase", "save"],
		testid: "backup-link-btn",
		to: "/popup/settings/security/export",
	},
	"hub-change-password": {
		page: HUB,
		section: "Safety",
		title: "Change password",
		synonyms: ["password", "passphrase"],
		testid: "change-password-link-btn",
		to: "/popup/settings/security/change-password",
		visible: (context) => !context.passkey,
	},
	"hub-privacy": {
		page: HUB,
		section: "Preferences",
		title: "Privacy",
		description: "Prices, explorer",
		synonyms: ["prices", "fiat", "usd", "explorer", "coingecko"],
		testid: "setting-nav-privacy",
		to: "/popup/settings/privacy",
	},
	"hub-display": {
		page: HUB,
		section: "Preferences",
		title: "Display",
		description: "Theme, layout",
		synonyms: ["appearance", "theme", "dark mode", "light mode", "layout"],
		testid: "setting-nav-display",
		to: "/popup/settings/display",
	},
	"hub-developer": {
		page: HUB,
		section: "Preferences",
		title: "Developer",
		description: "Mode, logs, account state",
		synonyms: ["debug", "logs", "advanced"],
		testid: "setting-nav-developer",
		to: "/popup/settings/developer",
	},
	"hub-glossary": {
		page: HUB,
		section: "Help",
		title: "Glossary",
		description: "What Nulo's words mean",
		synonyms: ["help", "terms", "definitions", "dictionary"],
		testid: "setting-nav-glossary",
		to: "/popup/settings/glossary",
	},
	"hub-about": {
		page: HUB,
		section: "Help",
		title: "About Nulo",
		description: "Version, contact, legal",
		synonyms: ["version", "contact", "support", "terms of use", "privacy policy", "licences", "feedback"],
		testid: "setting-nav-about",
		to: "/popup/settings/about",
	},
	"hub-delete-profile": {
		page: HUB,
		section: "Danger zone",
		danger: true,
		title: "Delete profile",
		synonyms: ["reset", "remove", "erase", "wipe"],
		testid: "delete-profile-link-btn",
		to: "/popup/settings/security/reset",
	},
	"lock-now": {
		page: "/popup/settings/lock",
		section: "Lock",
		title: "Lock now",
		description: "Locks Nulo until you unlock it again",
		synonyms: ["lock"],
		testid: "lock-now-btn",
	},
	"lock-strict-mode": {
		page: "/popup/settings/lock",
		section: "Lock",
		title: "Strict security mode",
		description: "More secure, asks for your password more often. Recommended.",
		synonyms: ["password", "security"],
		testid: "setting-strict-security-mode",
		visible: (context) => !context.passkey,
	},
	"lock-auto-lock": {
		page: "/popup/settings/lock",
		section: "Lock",
		title: "Auto-lock Timeout",
		description: "Automatic wallet locking (minutes)",
		synonyms: ["auto-lock", "timeout", "minutes", "session"],
		testid: "lock-row-auto-lock",
	},
	"privacy-fiat-values": {
		page: "/popup/settings/privacy",
		section: "Privacy",
		title: "Show fiat values",
		description: "Fetch USD prices from CoinGecko while unlocked. Off hides all dollar values",
		synonyms: ["prices", "usd", "dollar", "coingecko"],
		testid: "privacy-row-fiat-values",
	},
	"privacy-explorer": {
		page: "/popup/settings/privacy",
		section: "Privacy",
		title: "Block Explorer",
		description: "Transaction link explorer",
		synonyms: ["explorer", "links", "aztecscan"],
		testid: "privacy-row-explorer",
	},
	"privacy-mode": {
		page: "/popup/settings/privacy",
		section: "Privacy",
		title: "Privacy mode",
		description: "Load a receipt's network fee only when you tap Show fee",
		synonyms: ["fee", "hide fee"],
		testid: "privacy-row-mode",
	},
	"display-theme": {
		page: "/popup/settings/display",
		section: "Display",
		title: "Theme",
		description: "Application theme",
		synonyms: ["appearance", "dark", "light", "dark mode", "light mode", "colour", "color"],
		testid: "display-row-theme",
	},
	"display-side-panel": {
		page: "/popup/settings/display",
		section: "Display",
		title: "Open as Side Panel",
		description: "Open as side panel instead of popup",
		synonyms: ["side panel", "sidebar", "panel", "dock", "fullscreen"],
		testid: "display-row-side-panel",
		visible: (context) => context.sidePanel,
	},
	"display-network-name": {
		page: "/popup/settings/display",
		section: "Display",
		title: "Show network name",
		description: "Always show network name in the header",
		synonyms: ["network", "chain", "header"],
		testid: "display-row-network-name",
	},
	"display-full-height": {
		page: "/popup/settings/display",
		section: "Display",
		title: "Full-height popups",
		description: "Open popups to the full height",
		synonyms: ["fullscreen", "full screen", "tall", "expand", "height"],
		testid: "display-row-full-height",
	},
	"display-animations": {
		page: "/popup/settings/display",
		section: "Display",
		title: "Disable animations",
		description: "Minimize the use of animations",
		synonyms: ["motion", "reduce motion", "animation"],
		testid: "display-row-animations",
	},
	"display-incoming-transfers": {
		page: "/popup/settings/display",
		section: "Display",
		title: "Show incoming transfers",
		description:
			"Hide if you run the same recovery phrase on multiple devices and don't want one device's outgoing to appear as incoming here",
		synonyms: ["received", "receipts", "incoming", "activity"],
		testid: "display-row-incoming-transfers",
	},
	"display-dust": {
		page: "/popup/settings/display",
		section: "Display",
		title: "Hide dust",
		description: "Hide receipts and holdings below this value. 0 turns it off.",
		synonyms: ["dust", "small balances", "spam", "threshold"],
		testid: "display-row-dust",
	},
	"developer-mode": {
		page: "/popup/settings/developer",
		section: "Developer",
		title: "Developer Mode",
		description: "Access to entity metadata, etc",
		synonyms: ["developer", "advanced"],
		testid: "developer-row-mode",
	},
	"developer-indicate-failures": {
		page: "/popup/settings/developer",
		section: "Developer",
		title: "Indicate Failures",
		description: "Highlight errors and warnings in the header",
		synonyms: ["errors", "warnings"],
		testid: "developer-row-indicate-failures",
		visible: (context) => context.developerMode,
	},
	"developer-debug": {
		page: "/popup/settings/developer",
		section: "Developer",
		title: "Debug Mode",
		description: "Collect debug level logs",
		synonyms: ["debug", "logging"],
		testid: "developer-row-debug",
		visible: (context) => context.developerMode,
	},
	"developer-logs": {
		page: "/popup/settings/developer",
		section: "Developer",
		title: "Logs",
		description: "Open the log viewer window",
		synonyms: ["log viewer", "errors"],
		testid: "settings-logs-row",
		visible: (context) => context.developerMode,
	},
	"developer-account-state": {
		page: "/popup/settings/developer",
		section: "Developer",
		title: "Account State",
		description: "Notes, authwits, contracts, senders",
		synonyms: ["notes", "authwits", "contracts", "senders", "pxe"],
		testid: "setting-nav-advanced-account-state",
	},
} as const satisfies Record<string, RowDefinition>

export type SettingsRowId = keyof typeof SETTINGS_ROWS

const ROW_IDS = Object.keys(SETTINGS_ROWS) as SettingsRowId[]

/** One row with its description resolved; without a context, a context-dependent description is undefined. */
export function settingsRow(id: SettingsRowId, context?: SettingsContext): SettingsRow {
	const row: RowDefinition = SETTINGS_ROWS[id]
	const description = typeof row.description === "function" ? context && row.description(context) : row.description
	return {
		id,
		page: row.page,
		section: row.section,
		danger: row.danger === true,
		title: row.title,
		description,
		synonyms: row.synonyms,
		testid: row.testid,
		to: row.to,
	}
}

export function settingItemProps(id: SettingsRowId, context?: SettingsContext) {
	const { title, description, to, testid } = settingsRow(id, context)
	return { title, description, to, "data-testid": testid }
}

export function settingsResultTo(row: SettingsRow): string {
	return row.to ?? `${row.page}?row=${row.id}`
}

export function isSettingsRowVisible(id: SettingsRowId, context: SettingsContext): boolean {
	const row: RowDefinition = SETTINGS_ROWS[id]
	return row.visible?.(context) ?? true
}

/** The rows a person can see in `context`, in page order. */
export function visibleSettingsRows(context: SettingsContext): SettingsRow[] {
	return ROW_IDS.filter((id) => isSettingsRowVisible(id, context)).map((id) => settingsRow(id, context))
}

/** Case- and accent-insensitive: "THÉME" reads as "theme". */
function fold(text: string): string {
	return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

const TITLE = 0
const DESCRIPTION = 1
const SYNONYM = 2

/** The weakest field any term needed (title, then description, then synonym), or -1 for no match. */
function matchRank(row: SettingsRow, terms: string[]): number {
	const title = fold(row.title)
	const description = fold(row.description ?? "")
	const synonyms = row.synonyms.map(fold)
	let rank = TITLE
	for (const term of terms) {
		if (title.includes(term)) continue
		if (description.includes(term)) rank = Math.max(rank, DESCRIPTION)
		else if (synonyms.some((synonym) => synonym.includes(term))) rank = SYNONYM
		else return -1
	}
	return rank
}

/** The words a search matches, folded; none means no search, and the Settings list shows. */
export function settingsQueryTerms(query: string): string[] {
	return fold(query).split(/\s+/).filter(Boolean)
}

/**
 * The rows every term of `query` finds, grouped under their captions in page order; inside a group,
 * rows found by their titles come first. `null` for a blank query, `[]` when nothing matches.
 */
export function searchSettings(rows: readonly SettingsRow[], query: string): SettingsResultGroup[] | null {
	const terms = settingsQueryTerms(query)
	if (!terms.length) return null
	const groups: SettingsResultGroup[] = []
	const ranks = new Map<SettingsRow, number>()
	for (const row of rows) {
		const rank = matchRank(row, terms)
		if (rank < 0) continue
		ranks.set(row, rank)
		let group = groups.at(-1)
		if (group?.caption !== row.section) {
			group = { caption: row.section, danger: row.danger, rows: [] }
			groups.push(group)
		}
		group.rows.push(row)
	}
	for (const group of groups) group.rows.sort((a, b) => (ranks.get(a) ?? 0) - (ranks.get(b) ?? 0))
	return groups
}
