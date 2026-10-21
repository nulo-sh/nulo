// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { createFixtureL1Client } from "../../tests/e2e/fixtures/l1-signer"
import { REPO_ROOT, sourceFiles } from "../type-roles/source-scan"

/** Index 0 of anvil's mnemonic: `aztec start --local-network` publishes, validates and deploys as it when no
 *  key is configured (`@aztec-labs/aztec`'s local network). */
const LOCAL_NETWORK_SIGNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
const ANVIL_ACCOUNT_1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
const SIGNER_MODULE = "apps/extension/tests/e2e/fixtures/l1-signer.ts"

describe("the e2e fixtures' L1 signer", () => {
	test("signs as an anvil-funded account the local network never signs with", () => {
		const { address } = createFixtureL1Client(["http://127.0.0.1:1"], 31337).account
		expect(address).toBe(ANVIL_ACCOUNT_1)
		expect(address).not.toBe(LOCAL_NETWORK_SIGNER)
	})

	test("is the only L1 client the e2e tree builds", () => {
		const callers = sourceFiles({ roots: ["apps/extension/tests/e2e"], exts: ["ts"] }).filter((file) =>
			readFileSync(join(REPO_ROOT, file), "utf8").includes("createExtendedL1Client"),
		)
		expect(callers).toEqual([SIGNER_MODULE])
	})
})
