/**
 * Every definition Nulo shows. Settings → Glossary renders all of them, and a dotted term takes a
 * key, never its own text, so a tooltip and the glossary cannot disagree.
 */
export type GlossaryEntry = {
	term: string
	definition: string
	/** Where the word appears, as the Glossary page lists it. */
	where: string
}

export const GLOSSARY = {
	profile: {
		term: "Profile",
		definition: "Your wallet on this device: its accounts and keys, behind one password or passkey.",
		where: "Lock screen · Settings",
	},
	account: {
		term: "Account",
		definition: "An address inside a profile, with its own balances and history.",
		where: "Home · Settings",
	},
	network: {
		term: "Network",
		definition: "The Aztec chain Nulo talks to; each network keeps its own balances and history.",
		where: "Header · Settings",
	},
	alpha: {
		term: "Alpha",
		definition: "Aztec's main network, also called Mainnet; Testnet and local networks are for trying things out.",
		where: "Network menu",
	},
	"recovery-phrase": {
		term: "Recovery phrase",
		definition: "The 24 words that restore your accounts, except the ones you imported.",
		where: "Get started · Backup",
	},
	"full-backup": {
		term: "Full backup",
		definition: "Your accounts, imported keys, tokens, contacts and history, in one password-protected file.",
		where: "Backup",
	},
	passkey: {
		term: "Passkey",
		definition: "It unlocks Nulo on this device. Your recovery phrase is what restores it.",
		where: "Lock screen · Create profile",
	},
	"strict-mode": {
		term: "Strict security mode",
		definition: "Locks whenever Nulo restarts in the background, as well as after the timeout.",
		where: "Lock settings",
	},
	"private-balance": {
		term: "Private balance",
		definition: "Only you can see it. Marked with a shield.",
		where: "Home · tokens · send",
	},
	"public-balance": {
		term: "Public balance",
		definition: "Anyone can see it, like a balance on Ethereum. Marked with a globe.",
		where: "Home · tokens · send",
	},
	"fee-juice": {
		term: "Fee Juice",
		definition: "The token that pays network fees on Aztec. Shown as FJ.",
		where: "Home · fee card",
	},
	"public-fee-juice": {
		term: "Public Fee Juice",
		definition: "Paying a fee with it shows your address.",
		where: "Home · fee menu",
	},
	"private-fee-juice": {
		term: "Private Fee Juice",
		definition: "Paying a fee with it keeps your address hidden.",
		where: "Home · fee menu",
	},
	sponsored: {
		term: "Sponsored",
		definition: "Someone else pays the network fee for you.",
		where: "Fee menu",
	},
	"priority-fee": {
		term: "Priority fee",
		definition: "An extra the app asks you to pay the network for faster inclusion, up to the cap shown.",
		where: "Approval window",
	},
	fpc: {
		term: "FPC",
		definition: "A Fee Payment Contract: it settles the network fee, from a sponsor or from your Private Fee Juice.",
		where: "Fee Payments",
	},
	authorization: {
		term: "Authorization",
		definition: "Lets a contract do one specific thing for you, once.",
		where: "Permission window · Connected apps",
	},
	"name-for-this-app": {
		term: "Name for this app",
		definition: "A private name for this account visible only to this app.",
		where: "Permission window",
	},
	interface: {
		term: "Interface",
		definition: "A contract's interface names a call's arguments; without it Nulo shows the raw values.",
		where: "Approval window",
	},
	discover: {
		term: "Discover",
		definition: "A site learning that Nulo is installed, and its version, so it can ask to connect.",
		where: "Connect window",
	},
	"connection-check": {
		term: "Connection check",
		definition: "Emojis you compare with the site's, so no one can sit between Nulo and the site.",
		where: "Connect window",
	},
	"nulo-verified": {
		term: "Nulo verified",
		definition: "Nulo knows which contract this is and names it, which isn't a promise that it's safe.",
		where: "Approval window · Connect window",
	},
	"aztecscan-verified": {
		term: "Aztecscan verified",
		definition: "Its code is verified on Aztecscan, but Nulo hasn't checked who runs it.",
		where: "Approval window · Connect window",
	},
	unverified: {
		term: "Unverified",
		definition: "Shown with no mark: Nulo has nothing that vouches for this contract.",
		where: "Approval window · Connect window",
	},
	proof: {
		term: "Proof",
		definition: "What your device builds to show a transaction is valid without revealing what's in it.",
		where: "Proving",
	},
	proving: {
		term: "Proving",
		definition:
			"Your device builds a proof that the transaction is valid without revealing what's in it. It's the slow step before sending.",
		where: "History · Settings",
	},
} as const satisfies Record<string, GlossaryEntry>

export type GlossaryKey = keyof typeof GLOSSARY

export const GLOSSARY_SECTIONS = [
	{
		title: "Your wallet",
		keys: ["profile", "account", "network", "alpha", "recovery-phrase", "full-backup", "passkey", "strict-mode"],
	},
	{ title: "Balances", keys: ["private-balance", "public-balance"] },
	{ title: "Fees", keys: ["fee-juice", "public-fee-juice", "private-fee-juice", "sponsored", "priority-fee", "fpc"] },
	{ title: "Apps", keys: ["authorization", "name-for-this-app", "interface", "discover", "connection-check"] },
	{ title: "Contracts", keys: ["nulo-verified", "aztecscan-verified", "unverified"] },
	{ title: "Transactions", keys: ["proof", "proving"] },
] as const satisfies ReadonlyArray<{ title: string; keys: ReadonlyArray<GlossaryKey> }>
