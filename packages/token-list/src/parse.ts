/**
 * The `nulo-token-list/1` payload. No dependency, so `sign-cli.ts` validates exactly the bytes it
 * signs under `bun --no-install`, with the same rules the wallet applies.
 *
 * Two modes. `wallet` reads a list a later format revision may have extended: it ignores unknown
 * keys and drops a price feed record it cannot accept, so `selectEntries` leaves that record's
 * entries unpriced and the rest of the list, flags included, still reads. `strict` is what the
 * signer and the tree tests demand: known keys only, a bundled class, at most
 * `MAX_ENTRIES_PER_CHAIN` entries per chain, and, when the list carries `priceFeeds`, a record for
 * every price id and an entry for every record. Both refuse a value they would have to normalize:
 * upper-case hex, a field element at or above the modulus, an out-of-range number.
 */

import { BUNDLED_TOKEN_CLASS_IDS } from "./class-ids"
import { PAYLOAD_FORMAT } from "./envelope"
import {
	FEE_JUICE_PRICE_ID,
	isFeedId,
	MAX_BAND_RATIO,
	MAX_FEED_USD,
	MAX_PRICE_FEEDS,
	MIN_FEED_USD,
	type PriceFeed,
	type PriceFeeds,
} from "./price-feeds"

/** The BN254 scalar field modulus: an address or class id is a field element below it. The
 *  extension pins this constant to `Fr.MODULUS`. */
export const BN254_FR_MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n
export const MAX_ENTRIES_PER_CHAIN = 16
const MAX_TOKENS = 1024
const MAX_UINT32 = 0xffff_ffff

const FIELD_HEX = /^0x[0-9a-f]{64}$/
const PRICE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/
const TICKER = /^[A-Za-z0-9]{1,12}$/
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/
/** Control, format (bidi overrides, zero-width joiners) and line/paragraph separators. */
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u

const ENTRY_KEYS = ["chainId", "address", "classId", "symbol", "decimals", "name", "priceId"] as const
const PAYLOAD_KEYS = ["format", "sequence", "issuedAt", "tokens", "flagged", "priceFeeds"] as const
const PAIR_KEYS = ["chainId", "address"] as const
const FEED_KEYS = ["min", "max", "ticker"] as const

export type ParseMode = "wallet" | "strict"

export type TokenListEntry = {
	chainId: number
	/** Lower-case `0x` + 64 hex digits. */
	address: string
	classId: string
	symbol: string
	decimals: number
	name: string
	priceId?: string
}

export type TokenListPair = { chainId: number; address: string }

export type TokenListPayload = {
	format: typeof PAYLOAD_FORMAT
	sequence: number
	issuedAt: string
	tokens: TokenListEntry[]
	/** Tokens the publisher flags as scams; never listed in `tokens`. `[]` when the payload has none. */
	flagged: TokenListPair[]
	/** Each price id's feed; absent in a list that prices no entry this way. */
	priceFeeds?: PriceFeeds
}

/** A refused payload. `path` names the field (`tokens[3].address`) and never echoes its value. */
export class PayloadError extends Error {
	constructor(readonly path: string) {
		super(`token list payload refused at ${path}`)
		this.name = "PayloadError"
	}
}

type Fields = Record<string, unknown>

function record(value: unknown, path: string, keys: readonly string[], mode: ParseMode): Fields {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new PayloadError(path)
	if (mode === "strict") {
		const extra = Object.keys(value).find((key) => !keys.includes(key))
		if (extra !== undefined) throw new PayloadError(`${path}.${extra}`)
	}
	return value as Fields
}

function ensure(ok: boolean, path: string): void {
	if (!ok) throw new PayloadError(path)
}

export function isFieldHex(value: unknown): value is string {
	return typeof value === "string" && FIELD_HEX.test(value) && BigInt(value) < BN254_FR_MODULUS
}

function isText(value: unknown, max: number): value is string {
	if (typeof value !== "string" || UNSAFE_TEXT.test(value)) return false
	const length = [...value].length
	return length >= 1 && length <= max
}

function isIntIn(value: unknown, min: number, max: number): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
}

function checkPriceId(value: unknown, path: string): string | undefined {
	if (value === undefined) return undefined
	ensure(typeof value === "string" && PRICE_ID.test(value), path)
	return value as string
}

const isUsd = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value) && value >= MIN_FEED_USD && value <= MAX_FEED_USD

function checkFeed(value: unknown, path: string, mode: ParseMode): PriceFeed {
	const f = record(value, path, FEED_KEYS, mode)
	ensure(isUsd(f.min), `${path}.min`)
	const min = f.min as number
	ensure(isUsd(f.max) && f.max > min && f.max <= MAX_BAND_RATIO * min, `${path}.max`)
	ensure(typeof f.ticker === "string" && TICKER.test(f.ticker), `${path}.ticker`)
	return { min, max: f.max as number, ticker: f.ticker as string }
}

/**
 * Validates the feed map. Strict refuses any record it cannot accept; wallet mode drops it, so a
 * record a later revision words differently costs its tokens their price, never the list. A key is
 * named by its index until it has passed `isFeedId`, and Fee Juice's id is never the list's.
 */
export function checkPriceFeeds(value: unknown, path: string, mode: ParseMode): PriceFeeds {
	ensure(typeof value === "object" && value !== null && !Array.isArray(value), path)
	const fields = Object.entries(value as Fields)
	ensure(fields.length <= MAX_PRICE_FEEDS, path)
	const feeds: Record<string, PriceFeed> = {}
	fields.forEach(([id, feed], i) => {
		try {
			ensure(isFeedId(id) && id !== FEE_JUICE_PRICE_ID, `${path}[${i}]`)
			feeds[id] = checkFeed(feed, `${path}.${id}`, mode)
		} catch (error) {
			if (mode === "strict" || !(error instanceof PayloadError)) throw error
		}
	})
	return feeds
}

/** Strict, with a feed map: each entry's price id has a record and each record names a price id. */
function checkCoverage(tokens: readonly TokenListEntry[], tokensPath: string, feeds: PriceFeeds, feedsPath: string): void {
	const named = new Set<string>()
	tokens.forEach((token, i) => {
		if (token.priceId === undefined) return
		ensure(Object.hasOwn(feeds, token.priceId), `${tokensPath}[${i}].priceId`)
		named.add(token.priceId)
	})
	for (const id of Object.keys(feeds)) ensure(named.has(id), `${feedsPath}.${id}`)
}

/** `chainId:contract` with the hex lower-cased; validates nothing and adds no missing `0x`. A stored
 *  shape: the seeder persists it as a marker key. */
export const tokenKey = (chainId: number, contract: string): string => `${chainId}:${contract.toLowerCase()}`

const pairKey = (pair: TokenListPair) => tokenKey(pair.chainId, pair.address)

function checkPair(f: Fields, path: string): TokenListPair {
	ensure(isIntIn(f.chainId, 0, MAX_UINT32), `${path}.chainId`)
	ensure(isFieldHex(f.address), `${path}.address`)
	return { chainId: f.chainId as number, address: f.address as string }
}

function checkEntry(value: unknown, path: string, mode: ParseMode): TokenListEntry {
	const f = record(value, path, ENTRY_KEYS, mode)
	const { chainId, address } = checkPair(f, path)
	ensure(isFieldHex(f.classId), `${path}.classId`)
	ensure(mode === "wallet" || BUNDLED_TOKEN_CLASS_IDS.includes(f.classId as string), `${path}.classId`)
	ensure(isText(f.symbol, 32), `${path}.symbol`)
	ensure(isIntIn(f.decimals, 0, 18), `${path}.decimals`)
	ensure(isText(f.name, 80), `${path}.name`)
	const priceId = checkPriceId(f.priceId, `${path}.priceId`)
	const entry: TokenListEntry = {
		chainId,
		address,
		classId: f.classId as string,
		symbol: f.symbol as string,
		decimals: f.decimals as number,
		name: f.name as string,
	}
	if (priceId !== undefined) entry.priceId = priceId
	return entry
}

/** Validates the token array: every entry, (chainId, address) unique, and in `strict` mode the
 *  per-chain cap. */
export function checkTokens(value: unknown, path: string, mode: ParseMode): TokenListEntry[] {
	ensure(Array.isArray(value) && value.length <= MAX_TOKENS, path)
	const tokens = (value as unknown[]).map((entry, i) => checkEntry(entry, `${path}[${i}]`, mode))
	const seen = new Set<string>()
	const perChain = new Map<number, number>()
	tokens.forEach((token, i) => {
		const key = pairKey(token)
		ensure(!seen.has(key), `${path}[${i}]`)
		seen.add(key)
		const count = (perChain.get(token.chainId) ?? 0) + 1
		perChain.set(token.chainId, count)
		ensure(mode === "wallet" || count <= MAX_ENTRIES_PER_CHAIN, `${path}[${i}].chainId`)
	})
	return tokens
}

/** Validates the flagged set: every pair unique, and none of them listed in `tokens`, in both modes. */
export function checkFlagged(value: unknown, path: string, mode: ParseMode, tokens: readonly TokenListEntry[]): TokenListPair[] {
	if (value === undefined) return []
	ensure(Array.isArray(value) && value.length <= MAX_TOKENS, path)
	const taken = new Set(tokens.map(pairKey))
	return (value as unknown[]).map((item, i) => {
		const pair = checkPair(record(item, `${path}[${i}]`, PAIR_KEYS, mode), `${path}[${i}]`)
		ensure(!taken.has(pairKey(pair)), `${path}[${i}]`)
		taken.add(pairKey(pair))
		return pair
	})
}

export function checkPayload(value: unknown, mode: ParseMode): TokenListPayload {
	const f = record(value, "payload", PAYLOAD_KEYS, mode)
	ensure(f.format === PAYLOAD_FORMAT, "payload.format")
	ensure(typeof f.sequence === "number" && Number.isSafeInteger(f.sequence) && f.sequence >= 1, "payload.sequence")
	ensure(typeof f.issuedAt === "string" && ISO_INSTANT.test(f.issuedAt) && !Number.isNaN(Date.parse(f.issuedAt)), "payload.issuedAt")
	const tokens = checkTokens(f.tokens, "payload.tokens", mode)
	const flagged = checkFlagged(f.flagged, "payload.flagged", mode, tokens)
	const parsed: TokenListPayload = {
		format: PAYLOAD_FORMAT,
		sequence: f.sequence as number,
		issuedAt: f.issuedAt as string,
		tokens,
		flagged,
	}
	if (f.priceFeeds === undefined) return parsed
	parsed.priceFeeds = checkPriceFeeds(f.priceFeeds, "payload.priceFeeds", mode)
	if (mode === "strict") checkCoverage(tokens, "payload.tokens", parsed.priceFeeds, "payload.priceFeeds")
	return parsed
}

export type TokenListSource = { tokens: TokenListEntry[]; flagged?: TokenListPair[]; priceFeeds?: PriceFeeds }

/**
 * Validates `list.source.json`: `{ tokens, flagged?, priceFeeds? }` and nothing else, every rule in
 * `strict` mode. An optional key comes back only when the source has it, so a source without one
 * stays canonical.
 */
export function checkSource(value: unknown): TokenListSource {
	const f = record(value, "source", ["tokens", "flagged", "priceFeeds"], "strict")
	const source: TokenListSource = { tokens: checkTokens(f.tokens, "source.tokens", "strict") }
	if (f.flagged !== undefined) source.flagged = checkFlagged(f.flagged, "source.flagged", "strict", source.tokens)
	if (f.priceFeeds !== undefined) {
		source.priceFeeds = checkPriceFeeds(f.priceFeeds, "source.priceFeeds", "strict")
		checkCoverage(source.tokens, "source.tokens", source.priceFeeds, "source.priceFeeds")
	}
	return source
}

/** Decodes and validates payload bytes, which must already have passed `verifyEnvelope`. */
export function parsePayload(bytes: Uint8Array, mode: ParseMode): TokenListPayload {
	let value: unknown
	try {
		value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
	} catch {
		throw new PayloadError("payload")
	}
	return checkPayload(value, mode)
}

/**
 * The entries a wallet acts on: those whose class it bundles, the first `MAX_ENTRIES_PER_CHAIN` of
 * them per chain in list order, with a price id the list carries no accepted feed for dropped so the
 * entry stays unpriced.
 */
export function selectEntries(
	tokens: readonly TokenListEntry[],
	feeds: PriceFeeds,
	classIds: readonly string[] = BUNDLED_TOKEN_CLASS_IDS,
): TokenListEntry[] {
	const perChain = new Map<number, number>()
	const selected: TokenListEntry[] = []
	for (const token of tokens) {
		if (!classIds.includes(token.classId)) continue
		const count = perChain.get(token.chainId) ?? 0
		if (count >= MAX_ENTRIES_PER_CHAIN) continue
		perChain.set(token.chainId, count + 1)
		const { priceId, ...rest } = token
		selected.push(priceId !== undefined && Object.hasOwn(feeds, priceId) ? { ...rest, priceId } : rest)
	}
	return selected
}
