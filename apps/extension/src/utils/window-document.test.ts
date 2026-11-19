import { afterEach, expect, test } from "vitest"
import { captureWindowDocument, isUnlockWindowDocument, isWindowDocument } from "./window-document"

afterEach(() => captureWindowDocument(""))

test.each([
	["#/windows/execute?requestId=r1", true],
	["#/windows/fee?requestId=r1", true],
	["#/windows/passkey?requestId=r1", true],
	["#/windows/json", true],
	["#/windows/logger", true],
	["#/popup/general", false],
	["#/popup/settings/security/export/full?window=own", false],
	["#/windowsx", false],
	["", false],
])("a document first loaded at %j is a window document: %s", (hash, expected) => {
	captureWindowDocument(hash)
	expect(isWindowDocument()).toBe(expected)
})

test.each([
	["#/windows/unlock?origin=https%3A%2F%2Fapp.example", true],
	["#/windows/discover?requestId=r1", false],
	["#/windows/unlock/more", false],
	["#/popup/auth", false],
])("a document first loaded at %j is an unlock window: %s", (hash, expected) => {
	captureWindowDocument(hash)
	expect(isUnlockWindowDocument()).toBe(expected)
})
