/**
 * Fixed `aztec_sendTx` requests the execute window renders in an armed build
 * (`VITE_NULO_E2E_EXECUTE_FIXTURE=1`, see `./config.ts`) when its route names one
 * (`#/windows/execute?fixture=batch`): the smoke suite's way to lay out what no live dApp sends, a
 * struct, a deep value, the decoder's hostile extremes. Every call is wire-shaped (`0x` + 64 hex per
 * field, flattened from its decode in ABI order) and every decode is a record the decoder returns.
 * The component tests feed the same requests.
 */
import type { DraftUIOperation } from "@/popup/windows/execute/types"
import { vocabularySelector } from "@/utils/token-transfer-vocabulary"
import type { Account } from "@/wallet/services/account/client"
import type { DappMetadata } from "@/wallet/services/dapp-session/client"
import type { DecodedCall, DecodedValue, DiscoveredAuthwit, TransferFeeEstimate } from "@/wallet/services/execution/client"
import type { Network } from "@/wallet/services/network/client"
import type { TokenInfo } from "@/wallet/services/token/client"

/** Travels in every fixture's app metadata, so the release grep finds this module wherever it lands. */
export const EXECUTE_FIXTURE_MARKER = "nulo:e2e:execute-fixture"

export const EXECUTE_FIXTURES = ["one", "batch", "deep", "raw", "ten", "wide", "depth", "ancestry"] as const
export type ExecuteFixtureName = (typeof EXECUTE_FIXTURES)[number]

export type ExecuteFixture = {
	readonly operations: DraftUIOperation[]
	/** Per operation, its calls' decodes. */
	readonly decodedCalls: readonly (readonly DecodedCall[])[]
	readonly decodedAuthwits: ReadonlyMap<string, DecodedCall>
	/** Per operation, the estimate its fee and authorizations read. */
	readonly feeEstimates: readonly TransferFeeEstimate[]
	readonly tokens: TokenInfo[]
	readonly dapp: DappMetadata
}

const hex = (prefix: string, tail: string): string => `0x${prefix}${"0".repeat(64 - prefix.length - tail.length)}${tail}`
export const field = (n: bigint | number): string => `0x${BigInt(n).toString(16).padStart(64, "0")}`

export const HUB = hex("1b5c09", "083d4e")
export const USDC = hex("2f4e81", "0077a0")
export const TST = hex("0e8a35", "0051c7")
export const ROUTER = hex("15d7a2", "006b1b")
export const ESCROW = hex("237b40", "0019e6")
export const POOL_A = hex("0a77d1", "00c2e8")
export const POOL_B = hex("19b3e0", "004a72")
export const RECIPIENT = hex("1e6f12", "007a8b")
export const RECIPIENT_2 = hex("08c3f9", "003d08")
export const UNKNOWN = hex("2c3d4e", "004e5f")
export const APP_FPC = hex("1a4b6c", "000f23")

const NONCES = [
	"0x1a7c03e59d2b46f80c3e1a5b7d9f2c4e6a8b0d1f3e5c7a9b1d3f5e7c9a1b3d5f",
	"0x0e2c4a6b8d1f3e5c7a9b0d2f4e6c8a1b3d5f7e9c0a2b4d6f8e1c3a5b7d9f0e2c",
	"0x2f9e41c7a05b3d18e6f42c90b7d15a3e8c06f21d94b7e3a50c18d6f2a97c1b08",
]
export const SALT = "0x0b6e2f91d4a7c3058e1f6b2d9a4c7e0f3b8d5a2c6e9f1b4d7a0c3e6f9b2d5a8c"
export const ROOT = "0x14f2a6c8e0b3d5f7192b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c"
const INNER = [
	"0x05d7f9b1c3e5a7092d4f6b8c0e2a4d6f8b0c2e4a6d8f0b2c4e6a8d0f2b4c6e8a",
	"0x2a6c8e0b3d5f7192b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c14f",
	"0x0c4e6a8f0b2d4062e8a0c2f4b6d8e0a2c4f6b8d0e2a4c6f8b0d2e4a6c8f0b2d1",
]
export const MESSAGES = [
	"0x21a3c5e7f9b1d3052f4b6d8e0a2c4f6b8d0e2a4c6f8b0d2e4a6c8f0b2d4e6a8c",
	"0x12c4e6a8f0b2d4062e8a0c2f4b6d8e0a2c4f6b8d0e2a4c6f8b0d2e4a6c8f0b2d",
	"0x1d3f5b7a9c0e2d4f6a8b1c3e5d7f9a0b2c4e6d8f1a3b5c7e9d0f2a4b6c8e1d3f",
]

const addr = (value: string): DecodedValue => ({ kind: "address", value })
const int = (value: bigint | number): DecodedValue => ({ kind: "integer", value: String(value) })
const fld = (value: string): DecodedValue => ({ kind: "field", value })
const bool = (value: boolean): DecodedValue => ({ kind: "boolean", value })
const arr = (...items: DecodedValue[]): DecodedValue => ({ kind: "array", items })
const st = (fields: Record<string, DecodedValue>): DecodedValue => ({
	kind: "struct",
	fields: Object.entries(fields).map(([name, value]) => ({ name, value })),
})

/** The fields a decoded value encodes into, in ABI order. */
export const flatten = (v: DecodedValue): string[] => {
	switch (v.kind) {
		case "address":
		case "field":
			return [v.value]
		case "integer":
			return [field(BigInt(v.value))]
		case "boolean":
			return [field(v.value ? 1 : 0)]
		case "array":
			return v.items.flatMap(flatten)
		case "struct":
			return v.fields.flatMap((f) => flatten(f.value))
		default:
			return [field(0)]
	}
}

type Spec = { name: string; to: string; contract: string; params: Record<string, DecodedValue>; selector?: string; unreadable?: boolean }

const wireCall = (s: Spec) => ({
	name: s.name,
	to: s.to,
	selector: s.selector ?? vocabularySelector(s.name, Object.keys(s.params).length) ?? field(0).slice(0, 10),
	type: "private",
	isStatic: false,
	hideMsgSender: false,
	args: Object.values(s.params).flatMap(flatten),
	returnTypes: [],
})

const decodeOf = (s: Spec): DecodedCall =>
	s.unreadable
		? { kind: "undecoded", reason: "unknown-contract" }
		: { kind: "decoded", contract: s.contract, fn: s.name, params: Object.entries(s.params).map(([name, value]) => ({ name, value })) }

const transfer = (token: string, from: string, to: string, amount: bigint, nonce = field(0), fn = "transfer_private_to_private"): Spec => ({
	name: fn,
	to: token,
	contract: "Token",
	params: { from: addr(from), to: addr(to), amount: int(amount), _nonce: fld(nonce) },
})

const authwit = (k: number, caller: string, from: string, amount: bigint, onBehalfOf?: string) => {
	const spec = transfer(USDC, from, caller, amount, NONCES[k], "transfer_private_to_public")
	const record: DiscoveredAuthwit = {
		consumer: USDC,
		caller,
		selector: vocabularySelector("transfer_private_to_public", 4) ?? "",
		args: Object.values(spec.params).flatMap(flatten),
		innerHash: INNER[k],
		messageHash: MESSAGES[k],
		...(onBehalfOf ? { onBehalfOf } : {}),
	}
	return { record, decode: decodeOf(spec) }
}

/** `n` levels of `wrap` around `leaf`. */
const nest = (n: number, leaf: DecodedValue, wrap: (inner: DecodedValue, level: number) => DecodedValue): DecodedValue =>
	n === 0 ? leaf : wrap(nest(n - 1, leaf, wrap), n)

/** The worst the decoder admits by rows: 1,024 counted nodes, each an empty struct (zero fields) under
 *  31 singleton arrays, so one parameter of no fields renders 1 + 1,024 × 32 rows. */
const wideSpec = (): Spec => ({
	name: "settle_all",
	to: HUB,
	contract: "Hub",
	selector: "0x7d3a91c4",
	params: { items: arr(...Array.from({ length: 1024 }, () => nest(31, st({}), (inner) => arr(inner)))) },
})

/** The decoder's deepest type: an integer at type depth 32, under 32 struct levels. */
const depthSpec = (): Spec => ({
	name: "configure",
	to: HUB,
	contract: "Hub",
	selector: "0x2e6b0f57",
	params: { config: nest(31, st({ limit: int(42) }), (inner, level) => st({ [`level_${32 - level}`]: inner })) },
})

/** Two leaves of one name past the sixth level, under parents of one name, told apart only by ancestry. */
const ancestrySpec = (): Spec => {
	const branch = (amount: number) => nest(6, st({ amount: int(amount) }), (inner) => st({ leg: inner }))
	return {
		name: "rebalance",
		to: ROUTER,
		contract: "Router",
		selector: "0x51c7e2a9",
		params: { route: st({ inbound: branch(1_000), outbound: branch(9_000_000) }) },
	}
}

const batchSpecs = (main: string): Spec[] => [
	{
		name: "deposit",
		to: HUB,
		contract: "Hub",
		selector: "0x3a1f9c42",
		params: {
			order: st({ token: addr(USDC), amount: int(25_000_000), recipient: addr(main), deadline: int(1_767_225_600) }),
			route: arr(st({ pool: addr(POOL_A), fee_bps: int(30) }), st({ pool: addr(POOL_B), fee_bps: int(5) })),
		},
	},
	{
		name: "set_preferences",
		to: HUB,
		contract: "Hub",
		selector: "0x6e02b7d1",
		params: { prefs: st({ slippage_bps: int(50), notify: bool(true), tags: arr(int(1), int(4), int(9)) }) },
	},
	transfer(TST, main, RECIPIENT, 1_500_000_000_000_000_000n),
	{
		name: "swap_exact_in",
		to: ROUTER,
		contract: "Router",
		selector: "0x4c8d20e5",
		params: {
			path: arr(addr(USDC), addr(TST)),
			amount_in: int(10_000_000),
			min_out: int(9_850_000_000_000_000_000n),
			config: st({ recipient: addr(main), referral: st({ code: int(7), share_bps: int(10) }) }),
		},
	},
	{
		name: "claim_rewards",
		to: HUB,
		contract: "Hub",
		selector: "0x0b9e57a3",
		params: { account: addr(main), epochs: arr(int(12), int(13), int(14)) },
	},
	transfer(USDC, main, RECIPIENT_2, 5_000_000n),
]

const deepSpec = (main: string): Spec => {
	const leg = (token: string, amount: bigint, min: bigint, max: bigint) =>
		st({ token: addr(token), amount: int(amount), limits: st({ min: int(min), max: int(max) }) })
	return {
		name: "open_position",
		to: ESCROW,
		contract: "Escrow",
		selector: "0x52ae7f08",
		params: {
			params: st({
				owner: addr(main),
				legs: arr(
					leg(USDC, 1_000_000n, 990_000n, 1_010_000n),
					leg(TST, 2_000_000_000_000_000_000n, 1_980_000_000_000_000_000n, 2_020_000_000_000_000_000n),
				),
				settlement: st({
					mode: int(2),
					window: st({ start: int(1_767_225_600), end: int(1_767_830_400) }),
					beneficiary: st({ account: addr(RECIPIENT), share_bps: int(10_000) }),
				}),
			}),
			salt: fld(SALT),
		},
	}
}

const rawSpecs = (main: string): Spec[] => [
	transfer(USDC, main, RECIPIENT, 2_000_000n),
	{
		name: "checkpoint",
		to: UNKNOWN,
		contract: "",
		selector: "0x6c4d2e1f",
		params: { root: fld(ROOT), epoch: int(7), signer: addr(main), weight: int(1_000), flags: int(3), salt: fld(SALT) },
		unreadable: true,
	},
]

type Shape = { specs: Spec[]; authwits: ReturnType<typeof authwit>[]; maxFee: string }

const shapeOf = (name: ExecuteFixtureName, main: string): Shape => {
	const fee = (specs: Spec[], maxFee: string, authwits: ReturnType<typeof authwit>[] = []): Shape => ({ specs, authwits, maxFee })
	switch (name) {
		case "one":
			return fee([transfer(USDC, main, RECIPIENT, 25_000_000n)], "1840000000000000")
		case "batch":
			return fee(batchSpecs(main), "2310000000000000", [
				authwit(0, HUB, main, 25_000_000n, main),
				authwit(1, ROUTER, main, 10_000_000n, main),
			])
		case "deep":
			return fee([deepSpec(main)], "2960000000000000", [authwit(2, ESCROW, main, 1_000_000n, main)])
		case "raw":
			return fee(rawSpecs(main), "2070000000000000")
		case "ten":
			return fee(
				Array.from({ length: 10 }, (_, i) =>
					transfer(i % 2 ? TST : USDC, main, i % 3 ? RECIPIENT : RECIPIENT_2, BigInt(i + 1) * 1_000_000n),
				),
				"3120000000000000",
			)
		case "wide":
			return fee([wideSpec()], "2500000000000000")
		case "depth":
			return fee([depthSpec()], "2500000000000000")
		case "ancestry":
			return fee([ancestrySpec()], "2500000000000000")
	}
}

const isFixtureName = (name: string): name is ExecuteFixtureName => (EXECUTE_FIXTURES as readonly string[]).includes(name)

/** The named request, sent from `account` on `network`; `undefined` for a name no fixture has. Every
 *  operation is an account-entrypoint send its app pays for, so the window asks its one estimate at
 *  open, with no fee pick; such a send lists only the authorizations an account already gave, so
 *  every fixture's are the sending account's own. */
export function executeFixture(name: string, account: Account, network: Network): ExecuteFixture | undefined {
	if (!isFixtureName(name)) return undefined
	const { specs, authwits, maxFee } = shapeOf(name, account.address)
	const operation = {
		kind: "aztec_sendTx",
		networkId: network.id,
		accountAddress: account.address,
		account,
		network,
		exec: { calls: specs.map(wireCall), feePayer: APP_FPC },
		opts: { from: account.address },
	} as unknown as DraftUIOperation
	const estimate: TransferFeeEstimate = {
		maxFee,
		gasDetails: { l2GasLimit: 0, daGasLimit: 0, teardownL2GasLimit: 0, teardownDaGasLimit: 0, feePerL2Gas: "1", feePerDaGas: "1" },
		discoveredAuthwits: authwits.map((a) => a.record),
		appPayerFunding: { address: APP_FPC, funded: true, provenShort: false },
	} as TransferFeeEstimate
	return {
		operations: [operation],
		decodedCalls: [specs.map(decodeOf)],
		decodedAuthwits: new Map(authwits.map((a) => [a.record.messageHash, a.decode])),
		feeEstimates: [estimate],
		tokens: [
			{ id: 9001, chainId: network.chainId, contract: USDC, name: "USD Coin", symbol: "USDC", decimals: 6 },
			{ id: 9002, chainId: network.chainId, contract: TST, name: "Test Token", symbol: "TST", decimals: 18 },
		] as TokenInfo[],
		dapp: { name: "Playground", url: "https://playground.nulo.sh", description: EXECUTE_FIXTURE_MARKER },
	}
}
