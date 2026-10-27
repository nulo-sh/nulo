import { describe, expect, test } from "vitest"
import { acceptLists } from "../../tests/e2e/fixtures/file-accept"

describe("acceptLists", () => {
	test("lists a name ending in one of the extensions, in any case, and refuses one that ends in none", () => {
		const accept = ".json,.txt,.gz,.gzip"
		expect(acceptLists(accept, "NuloEncryptedBackup_Main_1761480000.gz")).toBe(true)
		expect(acceptLists(accept, "backup.JSON")).toBe(true)
		expect(acceptLists(accept, "backup.txt.zip")).toBe(false)
		expect(acceptLists(" .json , ", "backup.json")).toBe(true)
		expect(acceptLists("", "anything.bin")).toBe(true)
		expect(acceptLists("application/json", "backup.json")).toBe(false)
	})
})
