export type LegalDocument = "terms" | "privacy"

export interface LegalVersion {
	/** `major.minor` or `major.minor.patch`. A material version always bumps minor or major. */
	readonly version: string
	/** The effective date exactly as the document prints it, or `null` while it is still a placeholder. */
	readonly effective: string | null
	/** Material versions require re-acceptance; the rest take effect on publication. */
	readonly material: boolean
	/** What a user who accepted the previous version needs to know. Hand-written, never derived. */
	readonly changes: readonly string[]
}

/** Oldest first. The last entry of each list is what `legal/<doc>.md` currently says. */
export const LEGAL_MANIFEST: Readonly<Record<LegalDocument, readonly LegalVersion[]>> = {
	terms: [
		{ version: "1.0", effective: null, material: true, changes: ["First published version."] },
		{
			version: "1.1",
			effective: "26 October 2026",
			material: true,
			changes: ["You accepted a draft of these Terms. This version is the one in effect."],
		},
		{
			version: "1.2",
			effective: "27 October 2026",
			material: true,
			changes: [
				"Passkey profiles now have a recovery phrase.",
				"A full backup of a passkey profile is always protected with a file password.",
			],
		},
		{
			version: "1.2.1",
			effective: null,
			material: false,
			changes: ["The summary box names the default network as Nulo shows it, Alpha."],
		},
	],
	privacy: [
		{ version: "1.0", effective: "23 September 2026", material: true, changes: ["First published version."] },
		{
			version: "1.1",
			effective: "6 October 2026",
			material: true,
			changes: [
				'Names the site the "Get Fee Juice" and "Get private gas" links open, which I operate, and what a click reveals (§ 5.10).',
			],
		},
		{
			version: "1.1.1",
			effective: "6 October 2026",
			material: false,
			changes: ["Updated the address for reporting security vulnerabilities."],
		},
		{
			version: "1.2",
			effective: "13 October 2026",
			material: true,
			changes: [
				"The wallet now downloads its list of default tokens from tokens.nulo.sh, a host I operate. The request carries no wallet data. Cloudflare, which hosts it, receives your IP address and browser headers (§ 5.11).",
			],
		},
		{
			version: "1.2.1",
			effective: "15 October 2026",
			material: false,
			changes: ["The explorer is disabled in Settings → Privacy, not Settings → Advanced (§ 5.3)."],
		},
		{
			version: "1.2.2",
			effective: "25 October 2026",
			material: false,
			changes: [
				"The token-list and price requests bypass the browser's HTTP cache, and the price request carries no cookies and no referrer (§§ 5.2, 5.11).",
			],
		},
		{
			version: "1.2.3",
			effective: "25 October 2026",
			material: false,
			changes: [
				"Contacts, history, balances, accounts, tokens, networks and app permissions are now stored encrypted on your device, readable only after you unlock the profile.",
			],
		},
		{
			version: "1.2.4",
			effective: "25 October 2026",
			material: false,
			changes: ["Pinned tokens, fee-payer choices and the last-selected account are now stored encrypted too."],
		},
		{
			version: "1.2.5",
			effective: "25 October 2026",
			material: false,
			changes: ["Only the default Testnet endpoint uses the Developer's provider account (§ 5.1)."],
		},
		{
			version: "1.2.6",
			effective: "27 October 2026",
			material: false,
			changes: [
				"Passkey profiles have a recovery phrase, and a passkey-profile backup restores with its file password alone (§§ 3, 5.4, 9).",
			],
		},
		{
			version: "1.2.7",
			effective: "27 October 2026",
			material: false,
			changes: ["The website nulo.sh and its mailing list are now described in a separate Website Privacy Notice (§ 5.5)."],
		},
	],
}

export interface RiskPoint {
	readonly lead: string
	readonly body: string
}

export const RISK_POINTS: readonly RiskPoint[] = [
	{ lead: "You hold the keys.", body: "Nobody else has them: not the developer, not a server, not anyone." },
	{
		lead: "Lose what protects your wallet and your money is gone.",
		body: "Permanently. There is no reset and no support ticket. Your recovery phrase or a full backup is the only way back.",
	},
	{ lead: "Sent is sent.", body: "A transaction cannot be cancelled, reversed or refunded by anyone." },
	{ lead: "Nulo has not been audited, and Aztec is young.", body: "Use what you can afford to lose entirely." },
]

/** The control labels Terms § 3 names verbatim; a test pins them against the document. */
export const CONSENT_LABEL = "I agree to the Terms of Use"
export const CONTINUE_LABEL = "Continue"

export const LEGAL_SITE_ORIGIN = "https://nulo.sh"
