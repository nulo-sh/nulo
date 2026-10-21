import { afterEach, expect, test } from "vitest"
import { captureWindowDocument, isWindowDocument } from "./window-document"

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
