import { describe, expect, test, vi } from "vitest"
import { PENDING_SEND_REFUSAL, toastPendingSendRefusal } from "./pending-send"

describe("toastPendingSendRefusal", () => {
	test("opens one error toast with the refusal's exact characters", () => {
		const openToast = vi.fn()
		toastPendingSendRefusal(openToast)
		expect(openToast.mock.calls).toEqual([[{ kind: "error", label: "Finish or cancel your pending transaction first" }]])
		expect(PENDING_SEND_REFUSAL).toBe("Finish or cancel your pending transaction first")
	})
})
