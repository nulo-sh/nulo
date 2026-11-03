import { expect, test } from "vitest"
import { LIST_REFRESH_STATE } from "./list-refresh"

test("every refresh result reads as one state, and only a network failure as unreached", () => {
	expect(LIST_REFRESH_STATE).toEqual({
		accepted: "updated",
		unchanged: "current",
		network: "unreachable",
		"http-status": "failed",
		"older-sequence": "failed",
		refused: "failed",
		oversize: "failed",
		"verify-unsupported": "failed",
		off: "failed",
		error: "failed",
		"terms-not-current": "terms",
	})
})
