import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { ContractInstanceWithAddress } from "@aztec-labs/stdlib/contract"
import { getContractClassFromArtifact } from "@aztec-labs/stdlib/contract"
import { resolvePackageAsset } from "@nulo/resolve-asset"
import type { ILogger } from "@nulo/wallet-core/logger"
import { describe, expect, test } from "vitest"
import { V6_REGIME } from "./address-freeze"
import { FROZEN_ACCOUNT_CLASS_ID, FROZEN_ARTIFACT_SHA256, FrozenSchnorrAccountArtifact } from "./frozen-artifact"
import { FROZEN_DESCRIPTOR_DIGEST, FROZEN_INSTANTIATION_DESCRIPTOR } from "./instantiation-descriptor"
import { NuloAccount } from "./nulo-account"

const nullLogger: ILogger = { log: () => {} }
const ARTIFACT_PATH = fileURLToPath(new URL("./artifacts/SchnorrAccount.json", import.meta.url))

/**
 * Pins for the vendored account artifact. A red run here means the address-bearing artifact (or
 * upstream's interpretation of it) moved — that changes every derived account address. Never
 * re-pin to make it green: only a regime rotation, appended to `address-freeze.ts` on the owner's
 * recorded decision, moves these pins.
 */
describe("frozen account artifact pins", () => {
	test("vendored SchnorrAccount.json bytes match FROZEN_ARTIFACT_SHA256", () => {
		const digest = createHash("sha256").update(readFileSync(ARTIFACT_PATH)).digest("hex")
		expect(digest).toBe(FROZEN_ARTIFACT_SHA256)
	})

	// The PXE refuses a contract compiled for another oracle major on its first private execution,
	// which no address or class-id pin sees. A tripwire only: the execution canaries prove the rest.
	test("the vendored artifact's oracle major is the installed PXE's", () => {
		const { file_map } = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")) as {
			file_map: Record<string, { path: string; source: string }>
		}
		const versionFiles = Object.values(file_map).filter((file) => file.path.endsWith("/aztec/src/oracle/version.nr"))
		expect(versionFiles).toHaveLength(1)
		const contractMajor = versionFiles[0]?.source.match(/\bORACLE_VERSION_MAJOR: Field = (\d+);/)?.[1]
		const pxeSource = readFileSync(resolvePackageAsset("@aztec-labs/pxe", "dest/oracle_version.js", { from: import.meta.url }), "utf8")
		const pxeMajor = pxeSource.match(/\bexport const ORACLE_VERSION_MAJOR = (\d+);/)?.[1]
		expect(contractMajor).toMatch(/^\d+$/)
		expect(contractMajor).toBe(pxeMajor)
	})

	test("loaded artifact's contract class id matches FROZEN_ACCOUNT_CLASS_ID", async () => {
		const contractClass = await getContractClassFromArtifact(FrozenSchnorrAccountArtifact)
		expect(contractClass.id.toString()).toBe(FROZEN_ACCOUNT_CLASS_ID)
	})

	// Closes the "V6_REGIME is a paper binding" gap: assert the LIVE account factory actually
	// produces the regime's identity BEHAVIORALLY, not by comparing constants. A refactor pointing
	// NuloAccount at a different artifact OR a different instantiation descriptor reds HERE:
	//  - artifact: the produced contract class id would no longer equal V6_REGIME.classId;
	//  - descriptor: the produced instance's fixed fields (salt/deployer/immutablesHash) would no
	//    longer match the frozen descriptor (the init-hash tie to the emitted ctor call is the
	//    complementary binding in instantiation-descriptor.test.ts).
	test("the live NuloAccount factory is bound to the V6_REGIME artifact + descriptor", async () => {
		const account = await NuloAccount.new(Fr.fromHexString("0x01"), nullLogger, "account")
		const producedClass = await getContractClassFromArtifact(account.artifact)
		expect(producedClass.id.toString()).toBe(V6_REGIME.classId)
		expect(V6_REGIME.classId).toBe(FROZEN_ACCOUNT_CLASS_ID)

		const instance = (account as unknown as { instance: ContractInstanceWithAddress }).instance
		expect(instance.salt.equals(FROZEN_INSTANTIATION_DESCRIPTOR.salt)).toBe(true)
		expect(instance.deployer.equals(FROZEN_INSTANTIATION_DESCRIPTOR.deployer)).toBe(true)
		expect(instance.immutablesHash.equals(FROZEN_INSTANTIATION_DESCRIPTOR.immutablesHash)).toBe(true)
		// The digest the regime records IS the digest of the frozen descriptor the factory consumes.
		expect(V6_REGIME.descriptorDigest).toBe(FROZEN_DESCRIPTOR_DIGEST)
	})
})
