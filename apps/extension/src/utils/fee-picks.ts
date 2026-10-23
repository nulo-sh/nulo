import { isRecord } from "@nulo/wallet-core/utils"

/**
 * A profile's saved fee-method picks, one pair of per-profile keys (`feePicksKey`, `sendFeePicksKey`).
 * The ui preference service is their one writer; readers re-parse every value, since extension
 * storage is writable by anything that reaches the profile dir.
 */

export type FeePickType = "fj" | "private_fpc" | "fpc"
export type FeeSide = "private" | "public"

/** Send's pick for one transfer side. `fpc.name` only labels the loading preview; a pick is resolved
 *  by `fpc.id` against fresh rows, never by name. */
export type SendPick = { type: FeePickType; fpc?: { id: string; name?: string } | null }
export type SendSlots = { private?: SendPick; public?: SendPick }

/** The app windows' one pick per account: the trigger shows its title while the card loads. */
export type AppPick = { type: FeePickType; title?: string; subtitle?: string; fpc?: { id: string; isProtocol?: boolean } }

export type FeePickUpdate =
	| { kind: "app"; address: string; pick: AppPick }
	| { kind: "send"; address: string; side: FeeSide; pick: SendPick }
	/** Drops every pick naming the FPC, on every account and side. */
	| { kind: "forgetFpc"; fpcId: string }

type Blob = Record<string, unknown>

const SIDES: readonly FeeSide[] = ["private", "public"]

/** A label longer than any real FPC name is dropped from a Send pick, and cut on an app pick, whose
 *  title the trigger needs: both only feed a one-line preview. */
const MAX_LABEL = 64

/** An Aztec address is 66 characters; the bound only keeps an absurd key out of storage. */
const MAX_ADDRESS = 128

const asObject = (value: unknown): Blob | undefined => (isRecord(value) ? value : undefined)

const isPickType = (value: unknown): value is FeePickType => value === "fj" || value === "private_fpc" || value === "fpc"

const nonEmpty = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max

const fpcIdOf = (value: unknown): string | undefined => {
	const id = asObject(value)?.id
	return typeof id === "string" && id.length > 0 ? id : undefined
}

function asSendPick(value: unknown): SendPick | undefined {
	const obj = asObject(value)
	if (obj?.type === "fj" || obj?.type === "private_fpc") return { type: obj.type }
	if (obj?.type !== "fpc") return undefined
	const id = fpcIdOf(obj.fpc)
	if (!id) return undefined
	const name = asObject(obj.fpc)?.name
	return { type: "fpc", fpc: nonEmpty(name, MAX_LABEL) ? { id, name } : { id } }
}

function asAppPick(value: unknown): AppPick | undefined {
	const obj = asObject(value)
	if (!obj || !isPickType(obj.type)) return undefined
	const pick: AppPick = { type: obj.type }
	if (nonEmpty(obj.title, Infinity)) pick.title = obj.title.slice(0, MAX_LABEL)
	if (nonEmpty(obj.subtitle, MAX_LABEL)) pick.subtitle = obj.subtitle
	if (obj.type === "fj") return pick
	const id = fpcIdOf(obj.fpc)
	if (!id) return obj.type === "fpc" ? undefined : pick
	const isProtocol = asObject(obj.fpc)?.isProtocol
	return { ...pick, fpc: typeof isProtocol === "boolean" ? { id, isProtocol } : { id } }
}

function slotsOf(value: unknown): SendSlots {
	const obj = asObject(value)
	const out: SendSlots = {}
	if (!obj) return out
	for (const side of SIDES) {
		const pick = asSendPick(obj[side])
		if (pick) out[side] = pick
	}
	return out
}

/** Send's whole map, re-parsed: a write never carries a malformed neighbour forward. */
export function readSendPicks(raw: unknown): Record<string, SendSlots> {
	const out: Record<string, SendSlots> = {}
	for (const [address, value] of Object.entries(asObject(raw) ?? {})) {
		const slots = slotsOf(value)
		if (slots.private || slots.public) out[address] = slots
	}
	return out
}

/** The app windows' whole map; anything malformed reads as absent. */
export function readAppPicks(raw: unknown): Record<string, AppPick> {
	const out: Record<string, AppPick> = {}
	for (const [address, value] of Object.entries(asObject(raw) ?? {})) {
		const pick = asAppPick(value)
		if (pick) out[address] = pick
	}
	return out
}

/** The account's two Send picks; anything malformed reads as absent. */
export function readSendSlots(raw: unknown, address: string): SendSlots {
	return slotsOf(asObject(raw)?.[address])
}

function withoutFpcInSend(raw: unknown, fpcId: string): Record<string, SendSlots> {
	const all = readSendPicks(raw)
	for (const [address, slots] of Object.entries(all)) {
		for (const side of SIDES) {
			if (slots[side]?.fpc?.id === fpcId) delete slots[side]
		}
		if (!slots.private && !slots.public) delete all[address]
	}
	return all
}

function withoutFpcInApp(raw: unknown, fpcId: string): Record<string, AppPick> {
	const all = readAppPicks(raw)
	for (const [address, pick] of Object.entries(all)) {
		if (pick.fpc?.id === fpcId) delete all[address]
	}
	return all
}

/** The update as plain, bounded values, or undefined when it is not one: it crosses an RPC. */
export function parseFeePickUpdate(value: unknown): FeePickUpdate | undefined {
	const obj = asObject(value)
	if (obj?.kind === "forgetFpc") return nonEmpty(obj.fpcId, Infinity) ? { kind: "forgetFpc", fpcId: obj.fpcId } : undefined
	if (!obj || !nonEmpty(obj.address, MAX_ADDRESS)) return undefined
	if (obj.kind === "app") {
		const pick = asAppPick(obj.pick)
		return pick && { kind: "app", address: obj.address, pick }
	}
	if (obj.kind !== "send" || !SIDES.includes(obj.side as FeeSide)) return undefined
	const pick = asSendPick(obj.pick)
	return pick && { kind: "send", address: obj.address, side: obj.side as FeeSide, pick }
}

/** The stored maps an update rewrites, each re-parsed whole; a map the update does not touch is absent. */
export function applyFeePickUpdate(stored: { app: unknown; send: unknown }, update: FeePickUpdate): { app?: Blob; send?: Blob } {
	switch (update.kind) {
		case "app":
			return { app: { ...readAppPicks(stored.app), [update.address]: update.pick } }
		case "send": {
			const all = readSendPicks(stored.send)
			return { send: { ...all, [update.address]: { ...all[update.address], [update.side]: update.pick } } }
		}
		case "forgetFpc":
			return { app: withoutFpcInApp(stored.app, update.fpcId), send: withoutFpcInSend(stored.send, update.fpcId) }
	}
}
