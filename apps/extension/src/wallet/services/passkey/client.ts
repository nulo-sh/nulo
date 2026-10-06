// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { MethodsSpec, ServiceSpec } from "@/wallet/base"
import { ServiceClient, definePassthroughsExhaustive } from "@nulo/extension-messaging/background"
import { documentLogger } from "@/wallet/services/logger/client"
import { PASSKEY_SERVICE_NAME, type Methods } from "./spec"

export * from "./spec"

/** The passkey window waits on `resolvePasskeyRequest` until its step has ended, and that step may
 *  first wait out the profile lock's 5-minute force-release. */
const RESOLVE_REQUEST_TIMEOUT_MS = 10 * 60_000

// Declaration-merge the passthrough signatures onto the class type. Bodies are
// installed at runtime by `definePassthroughs`; this is what satisfies
// `implements ServiceSpec` and gives consumers full inference.
export interface PasskeyServiceClient extends MethodsSpec<Methods> {}
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: the merged interface's methods ARE installed — at runtime by definePassthroughsExhaustive below, whose signature proves the name list covers every Methods key, so no advertised method is missing.
export class PasskeyServiceClient extends ServiceClient<Methods> implements ServiceSpec<Methods> {
	public constructor(name?: string) {
		super(PASSKEY_SERVICE_NAME, documentLogger(), name)
	}

	protected override getRequestTimeoutMs(method: keyof Methods): number {
		return method === "resolvePasskeyRequest" ? RESOLVE_REQUEST_TIMEOUT_MS : super.getRequestTimeoutMs(method)
	}
}
// Every client method is a pure request-passthrough; the installer's
// signature checks the name list in both directions against `Methods`.
definePassthroughsExhaustive<Methods>()(PasskeyServiceClient.prototype, [
	"getPendingRequest",
	"resolvePasskeyRequest",
	"rejectPasskeyRequest",
])
