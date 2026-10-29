import { carriesFeeSettings } from "@nulo/wallet-bridge"
import type { OperationApprovalDelta, ShownTokenMetadata } from "@/wallet/services/dapp-interaction/client"
import type { OperationAuthwitPreview, TransferFeeEstimate } from "@/wallet/services/execution/client"
import type { DraftUIOperation } from "./types"

/**
 * What an approval hands the worker per operation: the fee choice, the ids the worker minted for the
 * estimate or preview the window holds, and the token details its card showed. The worker executes
 * the dApp's stored request, never an operation the window built.
 */
export function approvalDeltas(
	operations: readonly DraftUIOperation[],
	feeEstimates: Readonly<Record<number, TransferFeeEstimate | null | undefined>>,
	authwitPreviews: Readonly<Record<number, OperationAuthwitPreview | null | undefined>>,
	tokenMetadata: ReadonlyMap<string, ShownTokenMetadata>,
): OperationApprovalDelta[] {
	return operations.map((op, index) => {
		const estimate = feeEstimates[index] ?? undefined
		return {
			feeSettings: carriesFeeSettings(op) ? op.feeSettings : undefined,
			estimateId: estimate?.estimateId,
			previewId: estimate?.previewId ?? authwitPreviews[index]?.previewId,
			feeCeiling: estimate?.maxFee,
			tokenMetadata: op.kind === "register_token" ? tokenMetadata.get(op.address) : undefined,
		}
	})
}
