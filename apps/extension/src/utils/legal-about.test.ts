import { describe, expect, test } from "vitest"
import { LEGAL_MANIFEST, type LegalAcceptanceRecord, acceptanceStatus, parseVersion } from "@nulo/legal"
import { legalAboutRow } from "./legal-about"

const TERMS = LEGAL_MANIFEST.terms.at(-1)?.version as string
const PRIVACY = LEGAL_MANIFEST.privacy.at(-1)?.version as string
const [MAJOR, MINOR, PATCH] = parseVersion(PRIVACY) ?? ([0, 0, 0] as const)
const PRIVACY_NEXT_PATCH = `${MAJOR}.${MINOR}.${PATCH + 1}`
const record = (over: Partial<LegalAcceptanceRecord> = {}): LegalAcceptanceRecord => ({
	termsVersion: TERMS,
	privacyVersionShown: PRIVACY,
	acceptedAt: Date.UTC(2027, 2, 14, 19, 4),
	surface: "onboarding",
	history: [],
	...over,
})

describe("legalAboutRow", () => {
	test("accepted: names the Terms version and when, and never claims the policy was accepted", () => {
		const row = legalAboutRow("current", record(), "en-GB")
		expect(row).toMatchObject({ accepted: true, title: "You accepted the Terms", privacyUpdated: false })
		expect(row.description).toContain(`Terms v${TERMS} · 14 Mar 2027`)
		expect(`${row.title} ${row.description}`).not.toMatch(/privacy/i)
	})

	test.each(["missing", "stale"] as const)("%s reads as not accepted, with the version that is waiting", (status) => {
		expect(legalAboutRow(status, status === "stale" ? record({ termsVersion: "0.9" }) : null)).toMatchObject({
			accepted: false,
			title: "Not accepted",
			description: `Terms v${TERMS}. Review`,
		})
	})

	test("a current status with no readable record is not shown as accepted", () => {
		expect(legalAboutRow("current", null).accepted).toBe(false)
	})

	test("loading claims nothing either way", () => {
		expect(legalAboutRow("loading", null)).toMatchObject({ accepted: false, description: "" })
	})

	test("a policy newer than the one last shown is flagged, without touching acceptance", () => {
		const row = legalAboutRow("current", record({ privacyVersionShown: "0.9" }))
		expect(row).toMatchObject({ accepted: true, privacyUpdated: true })
	})

	test("a privacy patch is flagged too, though a patch never asks for the Terms again", () => {
		const patched = {
			...LEGAL_MANIFEST,
			privacy: [...LEGAL_MANIFEST.privacy, { version: PRIVACY_NEXT_PATCH, effective: null, material: false, changes: ["Typo."] }],
		}
		expect(legalAboutRow("current", record(), undefined, patched)).toMatchObject({ accepted: true, privacyUpdated: true })
		expect(legalAboutRow("current", record({ privacyVersionShown: PRIVACY_NEXT_PATCH }), undefined, patched).privacyUpdated).toBe(false)
	})

	test("on the shipped manifest, a record that last saw privacy 1.1 stays accepted and is told the policy changed", () => {
		const seen = record({ privacyVersionShown: "1.1" })
		expect(acceptanceStatus(seen)).toBe("current")
		expect(legalAboutRow("current", seen)).toMatchObject({ accepted: true, privacyUpdated: true })
	})

	test("no em dash in any variant", () => {
		for (const row of [legalAboutRow("current", record()), legalAboutRow("missing", null)]) {
			expect(`${row.title}${row.description}`).not.toContain("—")
		}
	})
})
