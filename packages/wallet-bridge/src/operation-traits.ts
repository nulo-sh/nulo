/**
 * Per operation kind, the two facts the scope and fee-settings sites branch on: whether a request is
 * scoped by a chain or by an account, and whether the wallet, not the dApp, supplies its fee
 * settings. The checks below tie the table to the request and draft shapes, so a new kind does not
 * compile until its traits exist and agree with them.
 */

import type { OperationRequest } from "./dapp-interaction-protocol"
import type { DraftOperation, OperationKind } from "./operation"

export type OperationTraits = { readonly scope: "network" | "account"; readonly feeSettings: boolean }

export const OPERATION_TRAITS = {
	register_contract: { scope: "network", feeSettings: false },
	register_sender: { scope: "network", feeSettings: false },
	register_token: { scope: "account", feeSettings: false },
	send_transaction: { scope: "account", feeSettings: true },
	simulate_transaction: { scope: "account", feeSettings: false },
	simulate_utility: { scope: "account", feeSettings: false },
	aztec_getContractClassMetadata: { scope: "network", feeSettings: false },
	aztec_getContractMetadata: { scope: "network", feeSettings: false },
	aztec_getPrivateEvents: { scope: "network", feeSettings: false },
	aztec_getChainInfo: { scope: "network", feeSettings: false },
	aztec_registerSender: { scope: "network", feeSettings: false },
	aztec_getAddressBook: { scope: "network", feeSettings: false },
	aztec_registerContract: { scope: "network", feeSettings: false },
	aztec_simulateTx: { scope: "account", feeSettings: false },
	aztec_executeUtility: { scope: "account", feeSettings: false },
	aztec_profileTx: { scope: "account", feeSettings: false },
	aztec_sendTx: { scope: "account", feeSettings: true },
	aztec_createAuthWit: { scope: "account", feeSettings: false },
} as const satisfies Record<OperationKind, OperationTraits>

type Traits = typeof OPERATION_TRAITS
export type NetworkScopedKind = { [K in OperationKind]: Traits[K]["scope"] extends "network" ? K : never }[OperationKind]
export type AccountScopedKind = { [K in OperationKind]: Traits[K]["scope"] extends "account" ? K : never }[OperationKind]
export type FeeSettingsKind = { [K in OperationKind]: Traits[K]["feeSettings"] extends true ? K : never }[OperationKind]

/** The kind's traits, or `undefined` for anything else: own properties only, so `"constructor"` or
 *  `"__proto__"` names no kind. */
export function operationTraits(kind: unknown): OperationTraits | undefined {
	return typeof kind === "string" && Object.hasOwn(OPERATION_TRAITS, kind) ? OPERATION_TRAITS[kind as OperationKind] : undefined
}

export function isNetworkScoped<O extends { kind: string }>(op: O): op is Extract<O, { kind: NetworkScopedKind }> {
	return operationTraits(op.kind)?.scope === "network"
}

export function isAccountScoped<O extends { kind: string }>(op: O): op is Extract<O, { kind: AccountScopedKind }> {
	return operationTraits(op.kind)?.scope === "account"
}

/** Null-safe, as an unvalidated RPC argument may be. */
export function carriesFeeSettings<O extends { kind: string }>(op: O | null | undefined): op is Extract<O, { kind: FeeSettingsKind }> {
	return operationTraits(op?.kind)?.feeSettings === true
}

// Two-way equalities: a kind on either side alone fails. Each control moves one kind and must not
// compile; between them they move a kind each way, so neither direction of the check is missing.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T
/** The kinds whose variant declares `Key`, optional or not. */
type KindsCarrying<U extends { kind: string }, Key extends PropertyKey> = U extends unknown
	? Key extends keyof U
		? U["kind"]
		: never
	: never

type _ChainScoped = Expect<Equal<KindsCarrying<OperationRequest, "chain">, NetworkScopedKind>>
// @ts-expect-error
type _ChainScopedControl = Expect<Equal<KindsCarrying<OperationRequest, "chain">, Exclude<NetworkScopedKind, "register_contract">>>
type _AccountScoped = Expect<Equal<KindsCarrying<OperationRequest, "account">, AccountScopedKind>>
// @ts-expect-error
type _AccountScopedControl = Expect<Equal<KindsCarrying<OperationRequest, "account">, Exclude<AccountScopedKind, "register_token">>>
type _FeeSettings = Expect<Equal<KindsCarrying<DraftOperation, "feeSettings">, FeeSettingsKind>>
// @ts-expect-error
type _FeeSettingsControl = Expect<Equal<KindsCarrying<DraftOperation, "feeSettings">, Exclude<FeeSettingsKind, "aztec_sendTx">>>
// Only these kinds carry nested actions or an event filter, which `validateSession` checks besides the scope.
type _Actions = Expect<Equal<KindsCarrying<OperationRequest, "actions">, "send_transaction" | "simulate_transaction">>
// @ts-expect-error
type _ActionsControl = Expect<Equal<KindsCarrying<OperationRequest, "actions">, "send_transaction">>
type _EventFilter = Expect<Equal<KindsCarrying<OperationRequest, "eventFilter">, "aztec_getPrivateEvents">>
// @ts-expect-error
type _EventFilterControl = Expect<Equal<KindsCarrying<OperationRequest, "eventFilter">, "aztec_getPrivateEvents" | "aztec_getChainInfo">>
