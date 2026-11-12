/**
 * What a contract's chip and its press say for a level reading. A chip names a contract only from
 * evidence Nulo holds: an unverified one shows its short address, never a name the request supplies.
 */
import type { ContractLevel, ContractReading } from "@/utils/contract-level"
import { trimAddress } from "@/utils/string"
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

/**
 * `held` is the person's own token at this address, so a flagged one keeps its red badge; nothing
 * else of it reaches an unverified chip.
 */
export function contractChipOf(reading: ContractReading, address: string, held?: TokenMarkOf | null): ChipModel {
	const short = trimAddress(address)
	switch (reading.level) {
		case "pending":
			return chip(short, true, null, { mark: null, lines: ["Nulo is still checking this contract."], address })
		case "nulo":
			return reading.source === "token"
				? verifiedToken(reading, address)
				: chip("Private Fee Juice", false, "nulo", { mark: null, title: "Private Fee Juice", lines: [KNOWN], address })
		case "scan": {
			const name = sanitizeWireString(reading.name, 64) || short
			return chip(name, name === short, "scan", {
				mark: null,
				title: name,
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
				: chip(short, true, "none", {
						mark: null,
						title: "Unknown contract",
						lines: ["Nulo hasn't checked this contract."],
						address,
					})
	}
}

/** The app's own chip: its self-declared name, which no list vouches for yet; none when nothing survives. */
export function appChipOf(name: unknown, host: string): ChipModel | null {
	const label = typeof name === "string" ? sanitizeWireString(name, 64) : ""
	if (!label.trim()) return null
	return chip(label, false, "none", {
		mark: null,
		title: host,
		lines: [
			"Nulo doesn't know this site. Each contract shows its own level.",
			`The name ${label} comes from the site. Nulo hasn't checked it.`,
		],
	})
}
