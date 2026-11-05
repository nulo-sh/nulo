import { describe, expect, test } from "vitest"
import { showsDeveloperFields } from "./detail-page"

describe("showsDeveloperFields", () => {
	test.each([
		[[], false],
		[
			[
				{ key: "debugMode", value: false },
				{ key: "developerMode", value: false },
			],
			false,
		],
		[[{ key: "debugMode", value: true }], true],
		[
			[
				{ key: "developerMode", value: true },
				{ key: "debugMode", value: false },
			],
			true,
		],
	])("%j → %s", (props, shown) => {
		expect(showsDeveloperFields(props as never)).toBe(shown)
	})
})
