/**
 * What a contract's chip and its press say for a level reading. A chip names a contract only from
 * evidence Nulo holds or a name the person gave it: an unverified one shows that name or its short
 * address, never a name the request supplies.
 */
import type { ContractLevel, ContractReading } from "@/utils/contract-level"
import { stripPictographs, trimAddress } from "@/utils/string"
import type { TokenMarkOf } from "@/utils/token-icon"
import { sanitizeWireString } from "@/wallet/services/dapp-session/capability-meta"

export const LEVEL_LABEL: Readonly<Record<ContractLevel, string>> = {
	nulo: "Nulo verified",
	scan: "Aztecscan verified",
	none: "Unverified",
}

/** Unverified draws no seal. */
export const LEVEL_GLYPH = { nulo: "seal-solid", scan: "seal" } as const

/** `level` is null while the level is pending: no seal and no level words, on the chip or in its press. */
export type ChipModel = {
	label: string
	mono: boolean
	level: ContractLevel | null
	mark: TokenMarkOf | null
	accessibleName: string
	title?: string
	lines: readonly string[]
	/** The press's last row; absent for the app, which has no address. */
	address?: string
	/** The label is the person's own name for the address, read in the name role as `AddressDisplay` reads one. */
	ownName?: true
}

const KNOWN = "Nulo knows this contract. Knowing it isn't a promise that it's safe."

const chip = (
	label: string,
	mono: boolean,
	level: ContractLevel | null,
	rest: Omit<ChipModel, "label" | "mono" | "level" | "accessibleName">,
): ChipModel => ({
	label,
	mono,
	level,
	accessibleName: level ? `${label}, ${LEVEL_LABEL[level]}` : label,
	...rest,
})

function uncheckedLines(selfName: string | undefined): string[] {
	const name = selfName ? sanitizeWireString(selfName, 64) : ""
	return [
		"Nulo hasn't checked this contract.",
		...(name.trim() ? [`The name ${name} comes from the contract's code. Nulo hasn't checked it.`] : []),
	]
}

/** The fee contracts this build pins, by the names the fee card gives them. */
const PINNED_NAME = { fpc: "Private Fee Juice", sponsor: "Sponsored" } as const

/** Like a symbol in any other row, the list's own strings are capped as wire text. */
function verifiedToken(reading: Extract<ContractReading, { source: "token" }>, address: string): ChipModel {
	const symbol = sanitizeWireString(reading.symbol, 16)
	const name = sanitizeWireString(reading.name, 64)
	return chip(symbol, false, "nulo", {
		mark: { symbol, icon: reading.icon, badge: false },
		title: name && name !== symbol ? `${symbol} · ${name}` : symbol,
		lines: [KNOWN, "Nulo names it from its token list."],
		address,
	})
}

function unverified(address: string, selfName: string | undefined, name: string | undefined): ChipModel {
	const label = name ? sanitizeWireString(name, 64) : ""
	return label.trim()
		? chip(label, false, "none", { mark: null, title: label, lines: uncheckedLines(selfName), address, ownName: true })
		: chip(trimAddress(address), true, "none", { mark: null, title: "Unknown contract", lines: uncheckedLines(selfName), address })
}

/**
 * `held` is the person's own token at this address, so a flagged one keeps its red badge; nothing
 * else of it reaches an unverified chip. `selfName` is the name the contract's own code gives it,
 * which only an unverified press repeats, saying where it came from. `name` is the person's own
 * label for the address (a contact or an account), which an unverified, unflagged chip reads by.
 */
export function contractChipOf(
	reading: ContractReading,
	address: string,
	{ held, selfName, name }: { held?: TokenMarkOf | null; selfName?: string; name?: string } = {},
): ChipModel {
	const short = trimAddress(address)
	switch (reading.level) {
		case "pending":
			return chip(short, true, null, { mark: null, lines: ["Nulo is still checking this contract."], address })
		case "nulo":
			return reading.source === "token"
				? verifiedToken(reading, address)
				: chip(PINNED_NAME[reading.source], false, "nulo", {
						mark: null,
						title: PINNED_NAME[reading.source],
						lines: [KNOWN],
						address,
					})
		case "scan": {
			const scanName = sanitizeWireString(reading.name, 64) || short
			return chip(scanName, scanName === short, "scan", {
				mark: null,
				title: scanName,
				lines: ["Its code is verified on Aztecscan. Nulo hasn't checked who runs it."],
				address,
			})
		}
		case "none":
			return reading.flagged
				? chip(short, true, "none", {
						mark: held ? { ...held, badge: true } : null,
						title: "Nulo flagged this token as a scam",
						lines: [],
						address,
					})
				: unverified(address, selfName, name)
	}
}

/**
 * The app's own chip: its self-declared name, which no list vouches for yet, without emoji or check
 * marks, so a seal-like one cannot sit beside a level; none when nothing survives. Its press quotes the name
 * as declared.
 */
export function appChipOf(name: unknown, host: string): ChipModel | null {
	if (typeof name !== "string") return null
	const label = sanitizeWireString(stripPictographs(name), 64)
	if (!label.trim()) return null
	return chip(label, false, "none", {
		mark: null,
		title: host,
		lines: [
			"Nulo doesn't know this site. Each contract shows its own level.",
			`The name ${sanitizeWireString(name, 64)} comes from the site. Nulo hasn't checked it.`,
		],
	})
}
