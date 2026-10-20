import { describe, expect, test } from "vitest"
import type { ILogger } from "@/wallet/logger"
import { wireRestartPreparation } from "./restart-preparation"

function wired(endSession: (sessionId: string) => void) {
	const order: string[] = []
	let prepare: (() => void) | undefined
	wireRestartPreparation({
		profileService: { setRestartPreparation: (fn) => void (prepare = fn) },
		handler: { getActiveSessions: () => [{ sessionId: "s1" }, { sessionId: "s2" }, { sessionId: "s3" }] },
		endSession: (sessionId) => {
			order.push(`end:${sessionId}`)
			endSession(sessionId)
		},
		windows: { closeRestartEnded: () => void order.push("close windows") },
		logger: { log: () => {} } as unknown as ILogger,
	})
	return { order, prepare: () => prepare?.() }
}

describe("wireRestartPreparation", () => {
	test("ends every live session before any window is removed", () => {
		const { order, prepare } = wired(() => {})
		expect(order).toEqual([])
		prepare()
		expect(order).toEqual(["end:s1", "end:s2", "end:s3", "close windows"])
	})

	test("a session that fails to end stops neither the others nor the window removals", () => {
		const { order, prepare } = wired((sessionId) => {
			if (sessionId === "s1") throw new Error("terminate failed")
		})
		prepare()
		expect(order).toEqual(["end:s1", "end:s2", "end:s3", "close windows"])
	})
})
