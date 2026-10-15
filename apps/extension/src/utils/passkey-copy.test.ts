import { describe, expect, test, vi } from "vitest"
import { UserRejectedError } from "@nulo/extension-messaging/errors"
import { PasskeyPrfError, PasskeyUnconfirmedError } from "@/wallet/utils/passkey-errors"
import {
	classifyPasskeyFailure,
	handleCancelOrUnconfirmed,
	isPasskeyCancel,
	PASSKEY_COPY,
	passkeyFailureCopy,
	passkeyTag,
	stepFailedTitle,
} from "./passkey-copy"

const dismissed = () => new DOMException("The operation either timed out or was not allowed.", "NotAllowedError")
const aborted = () => new DOMException("user cancelled with Escape", "AbortError")
const unconfirmed = (cause: unknown) => new PasskeyUnconfirmedError("cred-1", "a3f29b14", cause)

describe("classifyPasskeyFailure", () => {
	test("a dismissed or timed-out prompt is not confirmed, also behind a created credential", () => {
		expect(classifyPasskeyFailure(dismissed())).toBe("not-confirmed")
		expect(classifyPasskeyFailure(unconfirmed(dismissed()))).toBe("not-confirmed")
	})

	test("a missing PRF is its own class, also behind a created credential", () => {
		expect(classifyPasskeyFailure(new PasskeyPrfError("Passkey PRF not available"))).toBe("no-prf")
		expect(classifyPasskeyFailure(unconfirmed(new PasskeyPrfError("Passkey PRF has no results")))).toBe("no-prf")
	})

	test("anything else is other, including a message that merely names PRF", () => {
		expect(classifyPasskeyFailure(new Error("Passkey PRF not available"))).toBe("other")
		expect(classifyPasskeyFailure(new DOMException("bad state", "InvalidStateError"))).toBe("other")
		expect(classifyPasskeyFailure(new UserRejectedError())).toBe("other")
		expect(classifyPasskeyFailure("NotAllowedError")).toBe("other")
		expect(classifyPasskeyFailure(undefined)).toBe("other")
	})
})

describe("isPasskeyCancel", () => {
	test("only an abort is a cancel, also behind a created credential", () => {
		expect(isPasskeyCancel(aborted())).toBe(true)
		expect(isPasskeyCancel(unconfirmed(aborted()))).toBe(true)
		expect(isPasskeyCancel(dismissed())).toBe(false)
		expect(isPasskeyCancel(new Error("AbortError"))).toBe(false)
	})
})

describe("handleCancelOrUnconfirmed", () => {
	test("a cancel is handled silently, an unconfirmed prompt with the one line, anything else not at all", () => {
		const openToast = vi.fn()
		expect(handleCancelOrUnconfirmed(new UserRejectedError(), openToast)).toBe(true)
		expect(handleCancelOrUnconfirmed(unconfirmed(new UserRejectedError()), openToast)).toBe(true)
		expect(openToast).not.toHaveBeenCalled()
		expect(handleCancelOrUnconfirmed(unconfirmed(dismissed()), openToast)).toBe(true)
		expect(openToast).toHaveBeenCalledExactlyOnceWith({ kind: "error", label: "Passkey not confirmed. Try again." })
		expect(handleCancelOrUnconfirmed(new PasskeyPrfError("Passkey PRF not available"), openToast)).toBe(false)
		expect(openToast).toHaveBeenCalledTimes(1)
	})
})

describe("passkeyFailureCopy", () => {
	test("each class reads its signed-off line, and anything else the caller's fallback", () => {
		expect(passkeyFailureCopy(dismissed(), "fallback")).toBe("Passkey not confirmed. Try again.")
		expect(passkeyFailureCopy(new PasskeyPrfError("Passkey PRF not available"), "fallback")).toBe("This passkey can't unlock Nulo.")
		expect(passkeyFailureCopy(new Error("boom"), PASSKEY_COPY.unlockFailed)).toBe("Couldn't unlock. Try again.")
	})
})

describe("the passkey screen's words", () => {
	test("the tag joins the step and the profile name, or shows the step alone", () => {
		expect(passkeyTag("unlock", "Alice")).toBe("Unlock · Alice")
		expect(passkeyTag("create", "Savings")).toBe("New profile · Savings")
		expect(passkeyTag("import")).toBe("Import")
		expect(passkeyTag("export", "")).toBe("Backup")
		expect(passkeyTag("restore", "Main")).toBe("Restore · Main")
	})

	test("a step that failed after the prompt names what failed", () => {
		expect(stepFailedTitle("unlock")).toEqual(["Couldn't", "unlock"])
		expect(stepFailedTitle("create")).toEqual(["Couldn't", "create the profile"])
		expect(stepFailedTitle("import")).toEqual(["Couldn't", "import the passkey"])
	})
})
