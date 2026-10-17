import { describe, expect, test } from "vitest"
import { MIN_MONO_PX, MIN_TEXT_PX, siteSizedTypeRoles, type TypeRole, typeRoleNames, typeRoles } from "./tokens"

/**
 * The roles against the board the owner signed ("Nulo Type Roles", 2026-10-08): its A column row by
 * row, transcribed here so a record that drifts from its rows fails. G is Space Grotesk, I Inter,
 * M JetBrains Mono; "site" is the board's "size per slot".
 */
type Face = "G" | "I" | "M"
type Drawn = { face: Face; size: number | "site"; weight: number; upper: boolean; tracking: number; tabular: boolean }
type Row = Drawn & { row: string; role: TypeRole | null }

const row = (
	name: string,
	role: TypeRole | null,
	face: Face,
	size: number | "site",
	weight: number,
	upper: boolean,
	tracking = 0,
): Row => ({
	row: name,
	role,
	face,
	size,
	weight,
	upper,
	tracking,
	tabular: false,
})

const BOARD_A: Row[] = [
	row("Screen hero title", "title-hero", "G", "site", 700, true, -0.04),
	row("Hero amount", "amount-total", "M", "site", 500, false, -0.02),
	row("Sub-page / popup title", "title-page", "G", 13, 700, true, 0.12),
	row("Section label", "label-section", "G", 11, 700, true, 0.1),
	row("Field / key label", "label-section", "G", 10, 700, true, 0.1),
	row("Toggle label", "label-section", "G", 10, 700, true, 0.1),
	row("Row title", "row-title", "G", "site", 700, false, -0.02),
	row("Row secondary line", "caption", "I", 11, 400, false),
	row("Person or thing name", "name", "I", "site", 600, false),
	row("Account name tag", "label-section", "I", 11, 600, true, 0.04),
	row("Body / help text", "body", "I", 12, 400, false),
	row("Primary button", "button", "G", 14, 700, true, 0.2),
	row("Medium button", "button-md", "G", 13, 700, true, 0.03),
	row("Bottom nav label", "nav", "G", 10, 500, true, 0.05),
	row("Segmented control", "segment", "G", 10, 500, true, 0.06),
	row("Chip / tag / network", "label-section", "G", 10, 600, true, 0.08),
	row("Chip name", "tag-name", "G", 10, 700, true, 0.08),
	row("Inline action", "label-section", "G", 10, 700, true, 0.1),
	row("Address input", "input-data", "M", 14, 400, false),
	row("Address", "meta", "M", 12, 500, false),
	row("Address, prominent", "data-lead", "M", 13, 600, false),
	row("dApp hostname", "data-lead", "M", 13, 600, false),
	row("Hash / id / function", "meta", "M", 12, 500, false),
	row("Hash, small", "meta", "M", 10, 400, false),
	row("Amount in a row", "amount-row", "M", 14, 500, false),
	row("Amount, inline", "meta", "M", 12, 500, false),
	row("Amount, detail", "amount-detail", "M", 24, 500, false),
	row("Fiat value", "fiat", "M", "site", 400, false),
	row("Token symbol", "meta", "M", 10, 400, false),
	row("Date and time", "time", "M", 11, 400, false),
	row("Meta / count / hint", "meta", "M", 10, 400, false),
	row("Value text", "value", "I", 12, 600, false),
	row("Brand mark", "brand", "G", 10, 700, false, 0.2),
	row("Avatar initial", null, "I", 13, 600, false),
]

/** Where the build departs from an A cell, each by the owner's choice. */
const ANSWERED: Record<string, Partial<Drawn>> = {
	// Home's small caps fold into one caps voice on every screen.
	"Field / key label": { size: 11 },
	"Toggle label": { size: 11 },
	"Inline action": { size: 11 },
	"Account name tag": { face: "G", weight: 700, tracking: 0.1 },
	"Chip / tag / network": { size: 11, weight: 700, tracking: 0.1 },
	// The two role edits: meta at 13, the nav at 11.
	"Hash, small": { size: 13 },
	"Token symbol": { size: 13 },
	"Meta / count / hint": { size: 13 },
	"Bottom nav label": { size: 11 },
	// Every identifier in meta, as Home gets.
	Address: { size: 13, weight: 400 },
	"Hash / id / function": { size: 13, weight: 400 },
	"Amount, inline": { size: 13, weight: 400 },
	// The receipt amount takes B's row, as the board's Chosen column drew it.
	"Amount, detail": { face: "G", weight: 700, tracking: -0.02, tabular: true },
}

/** B's "Hero amount" cell, which the owner chose for the three big numbers. */
const BOARD_B_HERO_AMOUNT: Drawn = { face: "G", size: "site", weight: 700, upper: false, tracking: -0.04, tabular: true }

const FAMILY: Record<Face, string> = { G: "--font-headline", I: "--font-body", M: "--font-mono" }

function drawnOf(role: TypeRole): Drawn {
	const spec = typeRoles[role]
	const face = (Object.keys(FAMILY) as Face[]).find((key) => FAMILY[key] === spec.family)
	if (!face) throw new Error(`${role}: unknown family ${spec.family}`)
	return { face, size: spec.size ?? "site", weight: spec.weight, upper: spec.uppercase, tracking: spec.tracking, tabular: spec.tabular }
}

describe("type roles against the signed board", () => {
	test("the floors are 10px for any text and 11px for mono", () => {
		expect(MIN_TEXT_PX).toBe(10)
		expect(MIN_MONO_PX).toBe(11)
	})

	test("the board has 34 rows", () => {
		expect(BOARD_A).toHaveLength(34)
	})

	test.each(BOARD_A.filter((r) => r.role !== null))("$row → $role", ({ row: name, role, ...drawn }) => {
		expect(drawnOf(role as TypeRole)).toEqual({ ...drawn, ...ANSWERED[name] })
	})

	test("amount-hero is B's Hero amount cell", () => {
		expect(drawnOf("amount-hero")).toEqual(BOARD_B_HERO_AMOUNT)
	})

	test("every role carries a board row, except input, which keeps today's typed words", () => {
		const carried = new Set<string | null>([...BOARD_A.map((r) => r.role), "amount-hero"])
		expect(typeRoleNames.filter((name) => !carried.has(name))).toEqual(["input"])
	})

	test("every fixed size sits on the floors", () => {
		for (const name of typeRoleNames) {
			const { size, family } = typeRoles[name]
			if (size === null) continue
			expect(size, name).toBeGreaterThanOrEqual(family === "--font-mono" ? MIN_MONO_PX : MIN_TEXT_PX)
		}
	})

	test("upper-case Space Grotesk tracks at most 0.12em, except the call-to-action button", () => {
		const wide = typeRoleNames.filter((name) => {
			const { family, uppercase, tracking } = typeRoles[name]
			return family === "--font-headline" && uppercase && tracking > 0.12
		})
		expect(wide).toEqual(["button"])
	})

	test("exactly six roles leave the size to the element", () => {
		expect([...siteSizedTypeRoles]).toEqual(["title-hero", "amount-hero", "amount-total", "row-title", "name", "fiat"])
		expect(typeRoleNames.filter((name) => typeRoles[name].size === null)).toEqual([...siteSizedTypeRoles])
	})
})
