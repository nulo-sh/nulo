import { describe, expect, test } from "vitest"
import { PasskeyProfileExistsError, walletErrorFromPayload } from "@nulo/extension-messaging/errors"
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

	// A plain error carrying the very message of the typed one: the choice is by class, never by text.
	test("a failed passkey import names the authenticator and notes Windows Hello", () => {
		expect(passkeyImportFailedNotice(new Error("Passkey profile already exists"))).toStrictEqual({
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

	test("a passkey whose profile is already here names that profile, with no note", () => {
		const err = walletErrorFromPayload(new PasskeyProfileExistsError(undefined, { existingProfileName: "Daily" }).toPayload())
		expect(passkeyImportFailedNotice(err)).toStrictEqual({
			type: "warning",
			payload: {
				title: "Profile already added",
				description:
					"“Daily” already uses this passkey in this wallet. Choose “Daily” from your profiles instead of importing it again.",
				confirmText: "OK",
				onConfirm: expect.any(Function),
			},
		})
	})

	test.each([undefined, { existingProfileName: "" }, { existingProfileName: 7 }])(
		"a passkey whose profile is already here, with details %j, reads nameless",
		(details) => {
			const err = walletErrorFromPayload({ code: PasskeyProfileExistsError.CODE, message: "Passkey profile already exists", details })
			expect(passkeyImportFailedNotice(err).payload.description).toBe(
				"This passkey already has a profile in this wallet. Choose it from your profiles instead of importing it again.",
			)
		},
	)
})
