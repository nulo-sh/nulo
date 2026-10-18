import { describe, expect, test } from "vitest"
import { createFailedNotice, passkeyImportFailedNotice } from "./profile-flow-notices"

const WINDOWS_HELLO = "Windows Hello may not work correctly with some versions of Windows."

describe("profile-flow notices", () => {
	test("a failed password create says to try again, with no note", () => {
		expect(createFailedNotice(false)).toStrictEqual({
			type: "warning",
			payload: {
				title: "Profile creation failed",
				description: "An error occurred while creating the profile. Please try again.",
				note: undefined,
				confirmText: "OK",
				onConfirm: expect.any(Function),
			},
		})
	})

	test("a failed passkey create names the authenticator and notes Windows Hello", () => {
		expect(createFailedNotice(true)).toStrictEqual({
			type: "warning",
			payload: {
				title: "Profile creation failed",
				description:
					"An error occurred while creating the profile. This authenticator may not be supported or encountered an issue. Try again or use another one.",
				note: WINDOWS_HELLO,
				confirmText: "OK",
				onConfirm: expect.any(Function),
			},
		})
	})

	test("a failed passkey import names the authenticator and notes Windows Hello", () => {
		expect(passkeyImportFailedNotice()).toStrictEqual({
			type: "warning",
			payload: {
				title: "Profile import failed",
				description:
					"An error occurred while importing the profile. This authenticator may not be supported or encountered an issue. Try again or use another one.",
				note: WINDOWS_HELLO,
				confirmText: "OK",
				onConfirm: expect.any(Function),
			},
		})
	})
})
