/**
 * A token import a worker restart ended: the wallet's sentence for it, and the Retry that re-runs
 * it from its stored record through the popup's own import path. The import is idempotent, so a
 * retry of a contract the wallet already holds stores nothing new.
 */
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"
import type { TokenServiceClient } from "@/wallet/services/token/client"

const INTERRUPTED_BY_RESTART = "interrupted_by_restart"

const RESTARTED_SENTENCE = "The wallet restarted while adding this token."

export type RetryableImport = Pick<
	OperationRecord,
	"progress" | "error" | "origin" | "profileId" | "networkId" | "accountAddress" | "contractAddress"
>

type Retryable = RetryableImport & Required<Pick<RetryableImport, "networkId" | "accountAddress" | "contractAddress">>

export type ImportRetryClient = Pick<TokenServiceClient, "parseTokenInterface" | "addToken">

export function importFailureSentence(op: Pick<OperationRecord, "error">): string | undefined {
	return op.error?.kind === INTERRUPTED_BY_RESTART ? RESTARTED_SENTENCE : undefined
}

const filled = (value: unknown): value is string => typeof value === "string" && value.length > 0

/** A default's import is the seeder's to run again, so only the person's and a dApp's are offered. */
export function canRetryImport(op: RetryableImport): op is Retryable {
	return (
		op.progress?.stage === "failed" &&
		op.error?.kind === INTERRUPTED_BY_RESTART &&
		(op.origin === "popup" || op.origin === "dapp") &&
		filled(op.profileId) &&
		filled(op.networkId) &&
		filled(op.accountAddress) &&
		filled(op.contractAddress)
	)
}

/**
 * Re-runs the import as the person's own: the press authorizes it, as Import token would, so a
 * dApp's approved details are not re-checked. `isLive` false after the parse adds nothing, since a
 * call on the departed page's disconnected client would open a new port.
 */
export async function retryTokenImport(client: ImportRetryClient, op: RetryableImport, isLive: () => boolean): Promise<void> {
	if (!canRetryImport(op)) throw new Error("this import cannot be retried")
	const { profileId, networkId, accountAddress, contractAddress } = op
	const tokenInterface = await client.parseTokenInterface(networkId, contractAddress)
	if (!isLive()) return
	if (!tokenInterface.isComplete) throw new Error("incomplete token interface")
	await client.addToken(profileId, networkId, accountAddress, tokenInterface, { origin: "popup" })
}
