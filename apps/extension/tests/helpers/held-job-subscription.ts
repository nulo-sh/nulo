import { type Mock, vi } from "vitest"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"

type Listener = (op: OperationRecord | undefined) => void

/** Answers the next `subscribeJob` call with a subscription the test drives; its snapshot lands on `land()`. */
export function heldJobSubscription(subscribeJob: Mock) {
	let listener: Listener = () => {}
	let land = () => {}
	const release = vi.fn()
	subscribeJob.mockImplementationOnce((_id: string, next: Listener) => {
		listener = next
		return new Promise<() => void>((resolve) => {
			land = () => resolve(release)
		})
	})
	return { show: (op: OperationRecord | undefined) => listener(op), land: () => land(), release }
}

export const record = (progress: OperationRecord["progress"], terminalAt: number | null = null) =>
	({ progress, terminalAt }) as OperationRecord

/** Each live stage of a send and the awaiting card's line for it. */
export const LIVE_STAGES: [OperationRecord["progress"], string][] = [
	[{ stage: "pending" }, "Preparing..."],
	[{ stage: "simulating" }, "Simulating..."],
	[{ stage: "proving", enteredProveAt: 1, backend: "browser" }, "Proving in browser…"],
	[{ stage: "proving", enteredProveAt: 1, backend: "presto" }, "Proving with Presto ✦"],
	[{ stage: "submitting" }, "Submitting..."],
]
