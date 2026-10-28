import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, expect, test } from "vitest"
import { AUTH_ENTRY_ROUTES } from "@/popup/should-advance-to-general"
import { ProfileRowSchema } from "@/wallet/services/profile/profile-row"
import { STORED_SHAPES } from "@/wallet/storage/stored-shapes"
import {
	ADVANCES_ON_OPEN,
	ALLOWED_ERRORS,
	bindCeremonies,
	bindProfile,
	type Bindings,
	carriedBy,
	checkErrors,
	evidenceGaps,
	RESTART_LOG_GAP,
	runVerdict,
	type StepOutcome,
	stopsRun,
	UNPLANNED_RESTART,
	GUARDED_NODE_REFUSAL,
	checkLeaks,
	checkLogContinuity,
	checkOutcome,
	checkPreUpdate,
	checkProfiles,
	checkSession,
	checkSettle,
	checkVerify,
	checkWrites,
	emptyBindings,
	type ErrorEntry,
	type KnownFinding,
	FAMILY_GROUPS,
	type FamilyEntry,
	familyOfKey,
	findNeedles,
	ownerOf,
	releaseRowOwner,
	lostRelease,
	type ChainAddresses,
	pageErrorText,
	PROFILE_ROW_FIELDS,
	RETIRED_REFUSALS,
	type ProfileReading,
	type SessionReading,
	type StoredEntry,
	type StructureReading,
	type Violation,
	type WriteContext,
} from "../../tests/e2e/helpers/profile-chaos/checkers"
import { CITED } from "../../tests/e2e/helpers/profile-chaos/citations"
import {
	capsOfRecord,
	ACTIONS,
	type ActionName,
	type Caps,
	CATALOG,
	coverage,
	EARLIER_TITLE,
	coverageLine,
	endsOf,
	type ListedStep,
	mintedCredentials,
	type PlannedStep,
	plan,
	planFromList,
	type StartState,
	startWorld,
	type World,
	recordCaps,
} from "../../tests/e2e/helpers/profile-chaos/model"

const CHROME: Caps = { ceremonyOffAnchor: false, restartUnderOpenPage: true, network: false, restoreGate: false, credentialSlots: 3 }
const FIREFOX: Caps = {
	ceremonyOffAnchor: true,
	restartUnderOpenPage: false,
	network: false,
	restoreGate: false,
	credentialSlots: Number.POSITIVE_INFINITY,
}
const NETWORK: Caps = { ...CHROME, network: true, restoreGate: true }
const SEEDS = Array.from({ length: 1_000 }, (_, i) => i * 7_919 + 1)
const STARTS = ["empty", "pre-update-retired", "pre-update-unlocks"] as const satisfies readonly StartState[]

const CHAIN = 1
const on = (addresses: string[], chainId = CHAIN): ChainAddresses => ({ chainId, addresses })

const listOf = (steps: { action: ActionName; params: unknown }[]): ListedStep[] =>
	steps.map((s) => ({ action: s.action, params: s.params }) as ListedStep)

/** Each citation whose file is missing or whose line no longer holds its fragment. */
function citationMisses(cited: ReadonlyMap<string, string>): string[] {
	return [...cited].flatMap(([source, fragment]) => {
		const [, file, line] = /^code:(\S+):(\d+)$/.exec(source) ?? []
		const path = file.startsWith("apps/") ? join(import.meta.dirname, "../../../..", file) : join(import.meta.dirname, "../..", file)
		return existsSync(path) && readFileSync(path, "utf8").split("\n")[Number(line) - 1]?.includes(fragment) ? [] : [source]
	})
}

/** A plan's committed imports, and each profile other than the open one whose files they changed. */
function importsElsewhere(start: StartState, seed: number): { imports: number; leaks: string[] } {
	let imports = 0
	const leaks: string[] = []
	for (const [s, before] of withBefore(plan(seed, start, CHROME))) {
		if (s.action !== "importAccountFile" || !s.expect.outcomes.includes("committed")) continue
		imports++
		const open = before.session.kind === "open" ? before.session.ref : undefined
		for (const p of s.expect.next.profiles) {
			const was = before.profiles.find((x) => x.ref === p.ref)?.imported ?? []
			if (p.ref !== open && p.imported.join() !== was.join()) leaks.push(`${start} seed ${seed} step ${s.index} ${p.ref}`)
		}
	}
	return { imports, leaks }
}

/** Whether `k` names a credential the authenticator held before the step. */
const mintedBefore = (w: World, k: string | undefined): boolean => k !== undefined && Number(k.slice(1)) < w.next.credential

/** The steps of a plan, each with the world it ran on. */
const withBefore = (p: { start: StartState; steps: PlannedStep[] }): [PlannedStep, World][] => {
	let w = startWorld(p.start)
	return p.steps.map((s) => {
		const before = w
		w = s.expect.next
		return [s, before]
	})
}

type AnyParams = { credential?: string; method?: string; change?: string; current?: string; variant?: string; password?: string }

/** The passkey choice, method change or account file variant a step draws, if any. */
function newVariant(s: PlannedStep, before: World): string | undefined {
	const p = s.params as AnyParams & { duplicate?: string }
	const choice = (k: string | undefined) => (mintedBefore(before, k) ? "reuse" : "mint")
	switch (s.action) {
		case "createPasskey":
			return `createPasskey:${choice(p.credential)}`
		case "onboardingCreate":
			return p.method === "passkey" ? `onboardingCreate:${choice(p.credential)}` : undefined
		case "importPhrase":
		case "importBackup":
			return p.method === "passkey" ? `${s.action}:${choice(p.credential)}${p.duplicate === "decline" ? ":declined" : ""}` : undefined
		case "changeUnlockMethod":
			return `changeUnlockMethod:${p.change}:${p.current}`
		case "exportAccountFile":
			return p.password ? `exportAccountFile:passkey:${p.variant ?? "approve"}` : undefined
		default:
			return undefined
	}
}

/** Whether the step makes the authenticator mint a credential, read from its params alone. */
function mintsAt(s: PlannedStep, before: World): boolean {
	const p = s.params as AnyParams
	const fresh = p.credential !== undefined && Number(p.credential.slice(1)) === before.next.credential
	switch (s.action) {
		case "createPasskey":
		case "onboardingCreate":
			return fresh
		case "importPhrase":
			return p.method === "passkey" && fresh
		case "importBackup":
			return p.method === "passkey" && p.variant === "right" && fresh
		case "changeUnlockMethod":
			return p.change !== "password" && (p.current === "right" || p.current === "approve")
		default:
			return false
	}
}

/** The credential a step's `other` must differ from: the profile it unlocks, or the open one. */
function ownCredential(s: PlannedStep, before: World): string | undefined {
	const ref = s.action === "unlockPasskey" ? s.params.target : before.session.kind === "open" ? before.session.ref : undefined
	return before.profiles.find((x) => x.ref === ref)?.credential
}

/** A break fixture's violations go to the gate's output, so a reader sees each checker fail. */
function shown(label: string, violations: Violation[]): Violation[] {
	console.log(`[break] ${label}: ${violations.map((v) => `${v.oracle} ${v.message}`).join(" | ") || "<none>"}`)
	return violations
}

describe("the planner", () => {
	test("the same seed plans the same run", () => {
		for (const seed of SEEDS.slice(0, 50)) expect(plan(seed, "empty", CHROME)).toEqual(plan(seed, "empty", CHROME))
	})

	test("another seed plans another run", () => {
		const runs = new Set(SEEDS.slice(0, 50).map((seed) => JSON.stringify(plan(seed, "empty", CHROME).steps.map((s) => s.action))))
		expect(runs.size).toBeGreaterThan(45)
	})

	test.each([
		["Chrome", CHROME],
		["Firefox", FIREFOX],
		["the network file", NETWORK],
	])("every planned step respects its preconditions over 1,000 seeds on %s, from every start", { timeout: 180_000 }, (_label, caps) => {
		for (const start of STARTS) {
			for (const seed of SEEDS) {
				const p = plan(seed, start, caps)
				const replayed = planFromList(listOf(p.steps), start, caps, seed)
				expect(replayed.steps.map((s) => s.expect)).toEqual(p.steps.map((s) => s.expect))
			}
		}
	})

	test("from the retired start, the retired profile is never opened, and is deleted and verified as retired", () => {
		const steps = SEEDS.flatMap((seed) => plan(seed, "pre-update-retired", FIREFOX).steps)
		const opensP2 = steps.filter(({ expect: { next } }) => next.session.kind === "open" && next.session.ref === "P2")
		expect(opensP2).toEqual([])
		expect(steps.every((s) => s.expect.next.profiles.find((x) => x.ref === "P2")?.retired)).toBe(true)
		const retiredClause = steps.filter((s) => s.expect.sources.includes("decision:P86-11")).map((s) => s.action)
		expect(new Set(retiredClause)).toEqual(new Set(["deleteProfile", "verifyAll"]))
	})

	test("the same seed plans the same run from a pre-update start, and another start plans another", () => {
		for (const seed of SEEDS.slice(0, 50))
			for (const start of ["pre-update-retired", "pre-update-unlocks"] as const) {
				expect(plan(seed, start, FIREFOX)).toEqual(plan(seed, start, FIREFOX))
				expect(plan(seed, start, FIREFOX).steps).not.toEqual(plan(seed, "empty", FIREFOX).steps)
			}
	})

	test("from the unlocks start, P2 holds K1 in a slot, and seeds open it with K1 on both browsers", () => {
		const w = startWorld("pre-update-unlocks")
		expect(w.profiles.find((x) => x.ref === "P2")).toMatchObject({ method: "passkey", credential: "K1", phrase: "W2" })
		expect(w.profiles.find((x) => x.ref === "P2")?.retired).toBeUndefined()
		expect(mintedCredentials(w)).toBe(1)
		for (const caps of [CHROME, FIREFOX]) {
			const opens = SEEDS.slice(0, 300).flatMap((seed) =>
				plan(seed, "pre-update-unlocks", caps).steps.filter(
					(s) => s.action === "unlockPasskey" && s.expect.next.session.kind === "open" && s.expect.next.session.ref === "P2",
				),
			)
			// A method change may give P2 another credential first, so only some opens use K1.
			expect(opens.filter((s) => s.expect.next.profiles.find((x) => x.ref === "P2")?.credential === "K1").length).toBeGreaterThan(0)
		}
	})

	test("every run ends with verifyAll once a profile is left", () => {
		for (const seed of SEEDS) {
			const p = plan(seed, "empty", CHROME)
			const last = p.steps.at(-1)?.expect.next as World
			if (last.profiles.some((x) => !x.deleted)) expect(p.steps.at(-1)?.action).toBe("verifyAll")
		}
	})

	// A catalog entry no seed ever draws is coverage the run claims and never has.
	test.each([
		["Chrome", CHROME, ["raceRestartDuringUnlock"]],
		["Firefox", FIREFOX, ["raceRestartDuringUnlock"]],
		["the network file", NETWORK, []],
	] as const)("every action %s can run is drawn within 1,000 seeds", (_label, caps, alsoChrome) => {
		const drawn = new Set(SEEDS.flatMap((seed) => plan(seed, "empty", caps).steps.map((s) => s.action)))
		const networkOnly = ["dappWhileLocked", "dappDuringHeldUnlock", "restoreHeld"]
		const unreachable = new Set<string>([
			...(caps.network ? [] : networkOnly),
			...(caps.restartUnderOpenPage ? [] : ["raceRestartDuringUnlock"]),
		])
		const expected = CATALOG.map((a) => a.name).filter((n) => !unreachable.has(n))
		expect([...expected].filter((n) => !drawn.has(n))).toEqual([])
		expect(alsoChrome.every((n) => drawn.has(n) === caps.restartUnderOpenPage)).toBe(true)
	})

	test("every held-restore pairing is drawn within 1,000 seeds", () => {
		const pairs = new Set(
			SEEDS.flatMap((seed) =>
				plan(seed, "empty", NETWORK).steps.flatMap((s) =>
					s.action === "restoreHeld" ? [`${s.params.stage}>${s.params.competing}`] : [],
				),
			),
		)
		expect([...pairs].sort()).toEqual([
			"account-state>delete",
			"account-state>lock",
			"account-state>restart",
			"service-restore>lock",
			"service-restore>restart",
		])
	})

	test("Firefox never draws a restart under a held page", () => {
		for (const seed of SEEDS) {
			expect(plan(seed, "empty", FIREFOX).steps.map((s) => s.action)).not.toContain("raceRestartDuringUnlock")
		}
	})

	test.each([
		["Chrome", CHROME],
		["Firefox", FIREFOX],
		["the network file", NETWORK],
	])("every passkey choice, method change and account file variant is drawn within 1,000 seeds on %s", (_label, caps) => {
		const drawn = new Set(SEEDS.flatMap((seed) => withBefore(plan(seed, "empty", caps)).flatMap(([s, w]) => newVariant(s, w) ?? [])))
		const choices = ["mint", "reuse", "mint:declined", "reuse:declined"]
		const expected = [
			"createPasskey:mint",
			"createPasskey:reuse",
			"onboardingCreate:mint",
			"onboardingCreate:reuse",
			...choices.flatMap((c) => [`importPhrase:${c}`, `importBackup:${c}`]),
			"changeUnlockMethod:passkey:right",
			"changeUnlockMethod:passkey:wrong",
			"changeUnlockMethod:new-passkey:approve",
			"changeUnlockMethod:new-passkey:refuse",
			"changeUnlockMethod:password:approve",
			"changeUnlockMethod:password:refuse",
			"changeUnlockMethod:password:other",
			...["approve", "short", "refuse", "other"].map((v) => `exportAccountFile:passkey:${v}`),
		]
		expect(expected.filter((v) => !drawn.has(v))).toEqual([])
	})

	// A credential counted twice, or a mint left out, plans a create the authenticator cannot serve.
	test.each([
		["Chrome", CHROME],
		["Firefox", FIREFOX],
		["the network file", NETWORK],
	])("the counter moves by one exactly at a mint, a declined import's included, and stays within the slots on %s", (_label, caps) => {
		for (const start of STARTS) {
			for (const seed of SEEDS) {
				for (const [s, before] of withBefore(plan(seed, start, caps))) {
					const moved = s.expect.next.next.credential - before.next.credential
					expect(moved, `seed ${seed} step ${s.index} ${s.action}`).toBe(mintsAt(s, before) ? 1 : 0)
					expect(s.expect.next.next.credential - 1).toBeLessThanOrEqual(caps.credentialSlots)
				}
			}
		}
	})

	test("another credential is always one the authenticator holds and never the target's own", () => {
		for (const seed of SEEDS) {
			for (const [s, before] of withBefore(plan(seed, "empty", FIREFOX))) {
				const other = (s.params as { other?: string }).other
				if (other === undefined) continue
				expect(mintedBefore(before, other), `seed ${seed} step ${s.index}`).toBe(true)
				expect(other, `seed ${seed} step ${s.index}`).not.toBe(ownCredential(s, before))
			}
		}
	})
})

const SURFACE: readonly ActionName[] = ["createPassword", "createPasskey", "lock", "unlockPassword", "rename", "backgroundRestart"]
const VERIFIED: readonly ActionName[] = [...SURFACE, "verifyAll"]

describe("the action surface a driver states", () => {
	test("a surface naming every action plans exactly what no surface plans", () => {
		const every = CATALOG.map((a) => a.name)
		for (const caps of [CHROME, FIREFOX, NETWORK])
			for (const start of STARTS)
				for (const seed of SEEDS.slice(0, 100))
					expect(plan(seed, start, { ...caps, actions: every }).steps).toEqual(plan(seed, start, caps).steps)
	})

	test("a plan draws only its surface, replays from its own record, and closes with verifyAll only when the surface has it", () => {
		for (const actions of [SURFACE, VERIFIED]) {
			const caps = capsOfRecord(JSON.parse(JSON.stringify(recordCaps({ ...FIREFOX, actions }))))
			expect(caps.actions).toEqual(actions)
			for (const seed of SEEDS.slice(0, 200)) {
				const p = plan(seed, "empty", caps)
				expect(p.steps.filter((s) => !actions.includes(s.action))).toEqual([])
				const replayed = planFromList(listOf(p.steps), "empty", caps, seed)
				expect(replayed.steps.map((s) => s.expect)).toEqual(p.steps.map((s) => s.expect))
			}
		}
		expect(
			SEEDS.slice(0, 200).some((seed) => plan(seed, "empty", { ...FIREFOX, actions: VERIFIED }).steps.at(-1)?.action === "verifyAll"),
		).toBe(true)
	})

	test("a hand list naming an action outside the surface is refused at that step", () => {
		const listed = listOf([
			{ action: "createPassword", params: { ref: "P1", name: "Chaos 1", password: "S1", double: false } },
			{ action: "addAccount", params: {} },
		])
		expect(() => planFromList(listed, "empty", { ...FIREFOX, actions: SURFACE })).toThrow(
			"step 1 (addAccount) is outside the run's actions",
		)
		expect(planFromList(listed, "empty", FIREFOX).steps).toHaveLength(2)
	})
})

/** The modules the unit suite and the e2e runner share: each may import only the others at run time,
 *  so neither Puppeteer nor a page fixture reaches the unit suite through them. */
const PURE_MODULES = [
	"tests/e2e/helpers/profile-chaos/model.ts",
	"tests/e2e/helpers/profile-chaos/checkers.ts",
	"tests/e2e/helpers/profile-chaos/citations.ts",
	"tests/e2e/fixtures/chaos-seed.ts",
]

/** Every specifier `text` imports or re-exports at run time, side-effect imports included. */
const runtimeImports = (text: string): string[] =>
	[...text.matchAll(/^(import|export)\s+(type\s+)?(?:[^;"]*?from\s+)?"([^"]+)"/gms)].filter((m) => !m[2]).map((m) => m[3])

describe("the shared modules", () => {
	test.each(PURE_MODULES)("%s imports nothing at run time beyond the other shared modules", (file) => {
		const path = join(import.meta.dirname, "../..", file)
		const shared = PURE_MODULES.map((m) => join(import.meta.dirname, "../..", m).replace(/\.ts$/, ""))
		const outside = runtimeImports(readFileSync(path, "utf8")).filter((s) => !shared.includes(join(dirname(path), s)))
		expect(outside).toEqual([])
	})

	test("the check sees a multi-line, a side-effect and a re-exported import, and lets a type-only one pass", () => {
		const planted =
			'import type { Y } from "@/a"\nimport {\n\tz,\n\ttype W,\n} from "puppeteer"\nimport "./setup"\nexport { q } from "../b"\n'
		expect(runtimeImports(planted)).toEqual(["puppeteer", "./setup", "../b"])
	})
})

describe("a hand-trimmed list", () => {
	test("plans the same from a record's caps as from the browser's", () => {
		for (const caps of [CHROME, FIREFOX]) {
			const recorded = capsOfRecord(JSON.parse(JSON.stringify(recordCaps(caps))))
			expect(recorded).toEqual(caps)
			const drawn = plan(1, "empty", caps)
			const listed = drawn.steps.map((s) => ({ action: s.action, params: s.params }) as ListedStep)
			expect(planFromList(listed, "empty", recorded, 1).steps.length).toBe(drawn.steps.length)
		}
	})

	const create = { action: "createPassword", params: { ref: "P1", name: "Chaos 1", password: "S1", double: false } } as ListedStep
	const passkey = { action: "createPasskey", params: { ref: "P1", name: "Chaos 1", credential: "K1", double: false } } as ListedStep

	test("replays when every step can run where it stands", () => {
		const p = planFromList(
			[create, { action: "lock", params: {} }, { action: "unlockPassword", params: { target: "P1", variant: "right" } }],
			"empty",
			CHROME,
		)
		expect(p.steps.at(-1)?.expect.next.session).toEqual({ kind: "open", ref: "P1", bearer: false })
	})

	test.each([
		["a lock with no session", [{ action: "lock", params: {} }], "step 0 (lock) cannot run here: no open session"],
		[
			"a password unlock of a passkey profile",
			[passkey, { action: "lock", params: {} }, { action: "unlockPassword", params: { target: "P1", variant: "right" } }],
			"is no live password profile",
		],
		[
			"a restore of a file never exported",
			[create, { action: "importBackup", params: { file: "F9", variant: "right", ref: "P2", password: "S2" } }],
			"F9 is no backup",
		],
		["an unknown action", [{ action: "jump", params: {} }], "unknown action jump"],
		[
			"a strict toggle with no profile open",
			[passkey, { action: "lock", params: {} }, { action: "toggleStrict", params: {} }],
			"only to an open profile",
		],
		[
			"a passkey create past the authenticator's storage, a deleted profile's credential counted",
			[
				passkey,
				{ ...passkey, params: { ...passkey.params, ref: "P2", credential: "K2" } },
				{ action: "deleteProfile", params: { via: "settings" } },
				{ ...passkey, params: { ...passkey.params, ref: "P3", credential: "K3" } },
				{ ...passkey, params: { ...passkey.params, ref: "P4", credential: "K4" } },
			],
			"the authenticator holds no more credentials",
		],
		[
			"a phrase import of a phrase never read",
			[create, { action: "importPhrase", params: { ref: "P2", phrase: "W1", name: "x", password: "S2" } }],
			"W1 was never read",
		],
		["a profile ref used twice", [create, { ...create, params: { ...create.params, password: "S2" } }], "P1 already exists"],
		["a password ref used twice", [create, { ...create, params: { ...create.params, ref: "P2" } }], "S1 is already a password"],
		[
			"a file ref used twice",
			[create, { action: "exportBackup", params: { file: "F1" } }, { action: "exportBackup", params: { file: "F1" } }],
			"F1 already exists",
		],
		[
			"a negative account index",
			[create, { action: "exportAccountFile", params: { file: "F1", which: { derivedIndex: -1 } } }],
			"no derived account -1",
		],
		[
			"an account index past the derived ones",
			[create, { action: "exportAccountFile", params: { file: "F1", which: { derivedIndex: 1 } } }],
			"no derived account 1",
		],
		[
			"a duplicate answer when nothing warns",
			[
				create,
				{ action: "revealPhrase", params: { variant: "right" } },
				{ action: "deleteProfile", params: { via: "settings" } },
				{ action: "importPhrase", params: { ref: "P2", phrase: "W1", name: "x", password: "S2", duplicate: "confirm" } },
			],
			"nothing warns",
		],
		[
			"no duplicate answer when the wallet warns",
			[
				create,
				{ action: "revealPhrase", params: { variant: "right" } },
				{ action: "importPhrase", params: { ref: "P2", phrase: "W1", name: "x", password: "S2" } },
			],
			"the warning needs an answer",
		],
		[
			"a forgot-password delete with a session open",
			[create, { action: "deleteProfile", params: { via: "forgot" } }],
			"nothing for forgot",
		],
		[
			"a reuse of a credential the authenticator never held",
			[passkey, { action: "createPasskey", params: { ref: "P2", name: "y", credential: "K3", double: false } }],
			"K3 is neither minted nor the next credential",
		],
		[
			"a passkey restore of a file that does not open",
			[
				passkey,
				{ action: "exportBackup", params: { file: "F1", password: "S1" } },
				{ action: "deleteProfile", params: { via: "settings" } },
				{ action: "importBackup", params: { file: "F1", variant: "truncated", ref: "P2", method: "passkey", credential: "K1" } },
			],
			"the unlock choice shows only once the file opens",
		],
		[
			"a phrase import naming both unlocks",
			[
				create,
				{ action: "revealPhrase", params: { variant: "right" } },
				{ action: "deleteProfile", params: { via: "settings" } },
				{
					action: "importPhrase",
					params: { ref: "P2", phrase: "W1", name: "x", method: "passkey", credential: "K1", password: "S2" },
				},
			],
			"a passkey unlock takes no password",
		],
		[
			"a change to a password on a password profile",
			[create, { action: "changeUnlockMethod", params: { change: "password", current: "approve", password: "S2" } }],
			"password changes no open passkey profile",
		],
		[
			"a change naming the profile's own credential as another",
			[passkey, { action: "changeUnlockMethod", params: { change: "password", current: "other", password: "S1", other: "K1" } }],
			"no other minted credential",
		],
		[
			"a new passkey past the authenticator's storage",
			[
				passkey,
				{ ...passkey, params: { ...passkey.params, ref: "P2", credential: "K2" } },
				{ ...passkey, params: { ...passkey.params, ref: "P3", credential: "K3" } },
				{ action: "changeUnlockMethod", params: { change: "new-passkey", current: "approve", credential: "K4" } },
			],
			"the authenticator holds no more credentials",
		],
		[
			"a passkey account file with no file password",
			[passkey, { action: "exportAccountFile", params: { file: "F1", which: { derivedIndex: 0 } } }],
			"takes a file password",
		],
		[
			"a password account file with a file password",
			[create, { action: "exportAccountFile", params: { file: "F1", which: { derivedIndex: 0 }, password: "S2" } }],
			"takes no file password",
		],
	])("is refused at %s", (_label, list, message) => {
		expect(() => planFromList(list as unknown as ListedStep[], "empty", CHROME)).toThrow(message)
	})
})

describe("lists recorded before the passkey choice", () => {
	const create = { action: "createPassword", params: { ref: "P1", name: "x", password: "S1", double: false } }

	test("a phrase import with no method plans a password import", () => {
		const w = planFromList(
			[
				create,
				{ action: "revealPhrase", params: { variant: "right" } },
				{ action: "importPhrase", params: { ref: "P2", phrase: "W1", name: "y", password: "S2", duplicate: "confirm" } },
			] as ListedStep[],
			"empty",
			CHROME,
		).steps.at(-1)?.expect.next as World
		expect(w.profiles.find((x) => x.ref === "P2")).toMatchObject({ method: "password", password: "S2", phrase: "W1" })
		expect(w.next.credential).toBe(1)
	})

	test("a backup import with no method plans a password restore", () => {
		const w = planFromList(
			[
				create,
				{ action: "exportBackup", params: { file: "F1" } },
				{ action: "deleteProfile", params: { via: "settings" } },
				{ action: "importBackup", params: { file: "F1", variant: "right", ref: "P2", password: "S2" } },
			] as ListedStep[],
			"empty",
			CHROME,
		).steps.at(-1)?.expect.next as World
		expect(w.profiles.find((x) => x.ref === "P2")).toMatchObject({ method: "password", password: "S2", phrase: "W1" })
		expect(w.next.credential).toBe(1)
	})
})

describe("the model's clauses", () => {
	const run = (list: unknown[], caps = CHROME) => planFromList(list as ListedStep[], "empty", caps).steps.at(-1)?.expect.next as World
	const create = { action: "createPassword", params: { ref: "P1", name: "x", password: "S1", double: false } }
	const passkey = { action: "createPasskey", params: { ref: "P1", name: "x", credential: "K1", double: false } }

	test("strict mode on drops an open session's bearer at once; off gives one only at the next unlock", () => {
		const off = run([create, { action: "toggleStrict", params: {} }])
		expect(off.session).toEqual({ kind: "open", ref: "P1", bearer: false })
		const unlocked = run([
			create,
			{ action: "toggleStrict", params: {} },
			{ action: "lock", params: {} },
			{ action: "unlockPassword", params: { target: "P1", variant: "right" } },
		])
		expect(unlocked.session).toEqual({ kind: "open", ref: "P1", bearer: true })
		const backOn = run([
			create,
			{ action: "toggleStrict", params: {} },
			{ action: "lock", params: {} },
			{ action: "unlockPassword", params: { target: "P1", variant: "right" } },
			{ action: "toggleStrict", params: {} },
		])
		expect(backOn.session).toEqual({ kind: "open", ref: "P1", bearer: false })
	})

	test("a password change reopens the session, which takes a bearer once strict mode is off", () => {
		const change = { action: "changePassword", params: { variant: "right", password: "S2" } }
		expect(run([create, { action: "toggleStrict", params: {} }, change]).session).toEqual({ kind: "open", ref: "P1", bearer: true })
		expect(run([create, change]).session).toEqual({ kind: "open", ref: "P1", bearer: false })
	})

	test("a restart keeps a bearer's session, locks a password one without, and leaves a passkey row", () => {
		const restart = { action: "backgroundRestart", params: {} }
		expect(run([create, restart]).session).toEqual({ kind: "locked" })
		expect(
			run([
				create,
				{ action: "toggleStrict", params: {} },
				{ action: "lock", params: {} },
				{ action: "unlockPassword", params: { target: "P1", variant: "right" } },
				restart,
			]).session,
		).toEqual({ kind: "open", ref: "P1", bearer: true })
		expect(run([passkey, restart]).session).toEqual({ kind: "locked", staleRow: "P1" })
	})

	test("a passkey profile's backup takes a file password and restores as a password profile on its phrase", () => {
		const exported = [passkey, { action: "exportBackup", params: { file: "F1", password: "S1" } }]
		const file = run(exported).files[0]
		expect(file).toMatchObject({ method: "passkey", password: "S1", phrase: "W1" })
		const restore = { action: "importBackup", params: { file: "F1", variant: "right", ref: "P2", password: "S2" } }
		const after = run([...exported, { action: "deleteProfile", params: { via: "settings" } }, restore])
		expect(after.profiles.find((x) => x.ref === "P2")).toMatchObject({
			method: "password",
			password: "S2",
			phrase: "W1",
			deleted: false,
		})
		expect(after.profiles.find((x) => x.ref === "P2")?.credential).toBeUndefined()
		// The live passkey profile holds the phrase, so the restore warns of a duplicate first.
		expect(() => planFromList([...exported, restore] as ListedStep[], "empty", CHROME)).toThrow(/warning needs an answer/)
	})

	test("a passkey profile's export without a file password is refused by the list, and a short one by the page", () => {
		expect(() => planFromList([passkey, { action: "exportBackup", params: { file: "F1" } }] as ListedStep[], "empty", CHROME)).toThrow(
			/takes a file password/,
		)
		const short = planFromList(
			[passkey, { action: "exportBackup", params: { file: "F1", password: "S1", variant: "short" } }] as ListedStep[],
			"empty",
			CHROME,
		).steps[1].expect
		expect(short.outcomes).toEqual(["refused"])
		expect(short.next.files).toEqual([])
		expect(() =>
			planFromList([create, { action: "exportBackup", params: { file: "F1", password: "S9" } }] as ListedStep[], "empty", CHROME),
		).toThrow(/takes no file password/)
	})

	test("a refused step writes nothing and leaves the world as it was", () => {
		const before = run([create])
		const p = planFromList([create, { action: "revealPhrase", params: { variant: "wrong" } }] as ListedStep[], "empty", CHROME)
		expect(p.steps[1].expect).toMatchObject({ outcomes: ["refused"], writes: [], next: before })
	})

	test("a locked delete removes the lock screen's profile", () => {
		const second = { action: "createPassword", params: { ref: "P2", name: "y", password: "S2", double: false } }
		const w = run([create, second, { action: "lock", params: {} }, { action: "deleteProfile", params: { via: "forgot" } }])
		expect(w.profiles.map((x) => [x.ref, x.deleted])).toEqual([
			["P1", false],
			["P2", true],
		])
		expect(w.selected).toBeUndefined()
	})

	test.each([
		["service-restore", "lock", { P2: false }],
		["service-restore", "restart", {}],
		["account-state", "lock", { P2: false }],
		["account-state", "restart", { P2: false }],
		["account-state", "delete", { P2: true }],
	] as const)("a restore held at %s meeting a %s ends locked with %o", (stage, competing, held) => {
		const list = [
			create,
			{ action: "exportBackup", params: { file: "F1" } },
			{ action: "deleteProfile", params: { via: "settings" } },
			{ action: "restoreHeld", params: { file: "F1", stage, competing, ref: "P2", password: "S2" } },
		]
		const w = run(list, NETWORK)
		expect(w.session).toEqual({ kind: "locked" })
		expect(Object.fromEntries(w.profiles.filter((x) => x.ref === "P2").map((x) => [x.ref, x.deleted]))).toEqual(held)
		expect(w.next.profile).toBe(3)
	})

	test("a step ends the session or the background only where it means to", () => {
		const ends = (action: string, params: unknown = {}, before = startWorld("empty")) =>
			endsOf({ action, params } as ListedStep, before)
		expect(ends("lock")).toEqual(["session"])
		expect(ends("backgroundRestart")).toEqual(["background"])
		expect(ends("toggleStrict")).toEqual([])
		expect(ends("raceDoubleUnlock")).toEqual([])
		expect(ends("secondWindow", { op: "unlock" })).toEqual([])
		expect(ends("restoreHeld", { competing: "restart" })).toEqual(["session", "background"])
		expect(ends("createPassword")).toEqual([])
		expect(ends("importPhrase", {}, run([create]))).toEqual(["session"])
	})

	test("a race's outcomes share one successor state", () => {
		const race = run([passkey, { action: "lock", params: {} }, { action: "raceLockDuringUnlock", params: {} }])
		expect(race.session).toEqual({ kind: "locked" })
	})

	test("an import that does not commit leaves the session it entered through the lock screen locked", () => {
		const second = { action: "createPasskey", params: { ref: "P2", name: "y", credential: "K2", double: false } }
		const restore = { action: "importBackup", params: { file: "F1", variant: "earlier-shape", ref: "P3", password: "S3" } }
		const refused = planFromList(
			[passkey, { action: "exportBackup", params: { file: "F1", password: "S1" } }, second, restore] as ListedStep[],
			"empty",
			CHROME,
		)
		const last = refused.steps.at(-1)
		expect(last?.expect.outcomes).toEqual(["refused"])
		expect(last?.expect.next.session).toEqual({ kind: "locked" })
	})

	test("the lock that ends a race deletes a row a restart left", () => {
		const restart = { action: "backgroundRestart", params: {} }
		expect(run([passkey, restart]).session).toEqual({ kind: "locked", staleRow: "P1" })
		expect(run([passkey, restart, { action: "raceLockDuringUnlock", params: {} }]).session).toEqual({ kind: "locked" })
	})

	test("every clause names its source", () => {
		for (const seed of SEEDS.slice(0, 200)) {
			for (const s of plan(seed, "empty", NETWORK).steps) {
				expect(s.expect.sources.length, s.action).toBeGreaterThan(0)
				for (const source of s.expect.sources) expect(source).toMatch(/^(code|flow|decision):\S/)
			}
		}
	})

	// Two profiles sharing one list would show an import in both, which the wallet never does.
	test("a committed import changes only the open profile's files, from every start", () => {
		const runs = STARTS.flatMap((start) => SEEDS.slice(0, 300).map((seed) => ({ start, ...importsElsewhere(start, seed) })))
		expect(runs.flatMap((r) => r.leaks)).toEqual([])
		expect(runs.filter((r) => r.start !== "empty").reduce((n, r) => n + r.imports, 0)).toBeGreaterThan(0)
	})

	// A citation that no longer resolves would let a clause outlive the branch it names.
	test("every cited line holds the fragment its citation names", () => {
		expect(CITED.size).toBeGreaterThan(40)
		expect(citationMisses(CITED)).toEqual([])
	})

	test("every code source a plan or an allowlist names is a citation with its fragment", () => {
		const sources = new Set([
			...STARTS.flatMap((start) =>
				[CHROME, FIREFOX, NETWORK].flatMap((caps) =>
					SEEDS.slice(0, 300).flatMap((seed) => plan(seed, start, caps).steps.flatMap((s) => s.expect.sources)),
				),
			),
			...ALLOWED_ERRORS.map((a) => a.source),
		])
		expect([...sources].filter((c) => c.startsWith("code:") && !CITED.has(c))).toEqual([])
	})

	test("a cited line that moved, or a file that is gone, fails its citation", () => {
		const moved = new Map([
			["code:src/wallet/services/profile/service.ts:1", "public async createProfile("],
			["code:src/wallet/services/profile/gone.ts:1", "anything"],
		])
		console.log(`[break] citations: ${citationMisses(moved).join(", ")}`)
		expect(citationMisses(moved)).toEqual([...moved.keys()])
	})

	test("every call the retired probe makes is one a page can reach", () => {
		const service = readFileSync(join(import.meta.dirname, "../..", "src/wallet/services/profile/service.ts"), "utf8")
		const listed = /defineRpcMethods<Methods>\(\)\(([^)]*)\)/.exec(service)?.[1] ?? ""
		const rpc = new Set([...listed.matchAll(/"(\w+)"/g)].map((m) => m[1]))
		expect(rpc.size).toBeGreaterThan(10)
		expect(RETIRED_REFUSALS.filter((m) => !rpc.has(m))).toEqual([])
	})

	test("the coverage line counts completed families, transitions and schedules", () => {
		const c = coverage(["createPassword", "lock", "unlockPassword", "raceDoubleUnlock"])
		expect(c.families).toEqual({ create: 1, lock: 1, unlock: 1, race: 1 })
		expect(c.schedules).toEqual({ raceDoubleUnlock: 1 })
		expect(coverageLine(c, { profile: 2 })).toBe(
			"families[create=1 lock=1 unlock=1 race=1] transitions=3 schedules[raceDoubleUnlock=1] warns[profile=2]",
		)
		expect(coverageLine(c, {}, { lock: 1 }, { "code:a.ts:1": 3 })).toBe(
			"families[create=1 lock=1 unlock=1 race=1] transitions=3 schedules[raceDoubleUnlock=1] warns[] incomplete[lock=1] allowed[code:a.ts:1=3]",
		)
	})

	test("the catalog's names are its keys", () => {
		for (const spec of CATALOG) expect(ACTIONS[spec.name]).toBe(spec)
	})
})

describe("the passkey choices", () => {
	const steps = (list: unknown[], caps = CHROME) => planFromList(list as ListedStep[], "empty", caps).steps
	const last = (list: unknown[], caps = CHROME) => steps(list, caps).at(-1) as PlannedStep
	const pw = { action: "createPassword", params: { ref: "P1", name: "x", password: "S1", double: false } }
	const pk = { action: "createPasskey", params: { ref: "P1", name: "x", credential: "K1", double: false } }
	const reveal = { action: "revealPhrase", params: { variant: "approve" } }
	const toPassword = (current: string, other?: string) => ({
		action: "changeUnlockMethod",
		params: { change: "password", current, password: "S1", ...(other ? { other } : {}) },
	})

	test("a reuse takes a minted credential at a fresh profile, minting none", () => {
		const second = { action: "createPasskey", params: { ref: "P2", name: "y", credential: "K1", double: false } }
		const step = last([pk, second])
		expect(step.expect.next.profiles.map((x) => [x.ref, x.credential, x.phrase])).toEqual([
			["P1", "K1", "W1"],
			["P2", "K1", "W2"],
		])
		expect(step.expect.next.next.credential).toBe(2)
		expect(step.expect.sources).toContain("code:src/wallet/utils/passkey-ceremony.ts:117")
	})

	test("a passkey phrase import mints or reuses, and a declined one still keeps its mint", () => {
		const start = [pk, reveal]
		const imported = (credential: string, duplicate: "confirm" | "decline") => ({
			action: "importPhrase",
			params: { ref: "P2", phrase: "W1", name: "y", method: "passkey", credential, duplicate },
		})
		const minted = last([...start, imported("K2", "confirm")])
		expect(minted.expect.next.profiles.find((x) => x.ref === "P2")).toMatchObject({ method: "passkey", credential: "K2", phrase: "W1" })
		expect(minted.expect.next.next.credential).toBe(3)
		const reused = last([...start, imported("K1", "confirm")])
		expect(reused.expect.next.profiles.find((x) => x.ref === "P2")?.credential).toBe("K1")
		expect(reused.expect.next.next.credential).toBe(2)
		const declined = last([...start, imported("K2", "decline")])
		expect(declined.expect.outcomes).toEqual(["cancelled"])
		expect(declined.expect.next.profiles.map((x) => x.ref)).toEqual(["P1"])
		expect(declined.expect.next.next.credential).toBe(3)
		expect(last([...start, imported("K1", "decline")]).expect.next.next.credential).toBe(2)
	})

	test("a restore takes the unlock the form chose, whatever its file was made with", () => {
		const exported = [pw, { action: "exportBackup", params: { file: "F1" } }, { action: "deleteProfile", params: { via: "settings" } }]
		const restore = { action: "importBackup", params: { file: "F1", variant: "right", ref: "P2", method: "passkey", credential: "K1" } }
		const step = last([...exported, restore])
		expect(step.expect.next.profiles.find((x) => x.ref === "P2")).toMatchObject({
			method: "passkey",
			credential: "K1",
			phrase: "W1",
			derived: 1,
		})
		expect(step.expect.next.profiles.find((x) => x.ref === "P2")?.password).toBeUndefined()
		expect(step.expect.next.next).toMatchObject({ credential: 2, secret: 2 })
	})

	test("a password profile changes to a passkey only with its password, minting the next credential", () => {
		const change = (current: string) => ({ action: "changeUnlockMethod", params: { change: "passkey", current, credential: "K1" } })
		const right = last([pw, change("right")])
		expect(right.expect.outcomes).toEqual(["committed"])
		expect(right.expect.writes).toEqual([{ kind: "profile", ref: "P1" }])
		const p1 = right.expect.next.profiles[0]
		expect(p1).toMatchObject({ method: "passkey", credential: "K1", phrase: "W1", derived: 1 })
		expect(p1.password).toBeUndefined()
		expect(right.expect.next.next.credential).toBe(2)
		expect(right.expect.next.session).toEqual({ kind: "open", ref: "P1", bearer: false })
		const before = last([pw]).expect.next
		expect(last([pw, change("wrong")]).expect).toMatchObject({ outcomes: ["refused"], writes: [], next: before })
	})

	test("a committed change keeps the session open on its profile, with a bearer only outside strict mode", () => {
		const newPasskey = { action: "changeUnlockMethod", params: { change: "new-passkey", current: "approve", credential: "K2" } }
		const strict = last([pk, newPasskey])
		expect(strict.expect.next.session).toEqual({ kind: "open", ref: "P1", bearer: false })
		expect(strict.expect.next.profiles[0]).toMatchObject({ method: "passkey", credential: "K2" })
		expect(strict.expect.next.next.credential).toBe(3)
		const loose = last([pk, { action: "toggleStrict", params: {} }, newPasskey])
		expect(loose.expect.next.session).toEqual({ kind: "open", ref: "P1", bearer: true })
		const toPw = last([pk, { action: "toggleStrict", params: {} }, toPassword("approve")])
		expect(toPw.expect.next.profiles[0]).toMatchObject({ method: "password", password: "S1", phrase: "W1" })
		expect(toPw.expect.next.profiles[0].credential).toBeUndefined()
		expect(toPw.expect.next.session).toEqual({ kind: "open", ref: "P1", bearer: true })
		expect(toPw.expect.next.next).toMatchObject({ credential: 2, secret: 2 })
	})

	test("a refused or cancelled change keeps the row, the session and the counter", () => {
		const two = [pk, { action: "createPasskey", params: { ref: "P2", name: "y", credential: "K2", double: false } }]
		const before = last(two).expect.next
		const refuse = { action: "changeUnlockMethod", params: { change: "new-passkey", current: "refuse", credential: "K3" } }
		expect(last([...two, refuse]).expect).toMatchObject({ outcomes: ["cancelled"], writes: [], next: before })
		expect(last([...two, toPassword("refuse")]).expect).toMatchObject({ outcomes: ["cancelled"], writes: [], next: before })
		expect(last([...two, toPassword("other", "K1")]).expect).toMatchObject({ outcomes: ["refused"], writes: [], next: before })
	})

	test("a replaced credential stays held: it is another credential to the profile that left it", () => {
		const changed = [pk, { action: "changeUnlockMethod", params: { change: "new-passkey", current: "approve", credential: "K2" } }]
		const step = last([...changed, toPassword("other", "K1")])
		expect(step.expect.outcomes).toEqual(["refused"])
		expect(() => steps([...changed, toPassword("other", "K2")])).toThrow(/no other minted credential/)
	})

	test("a lock during the current passkey's prompt ends the session and writes nothing", () => {
		const step = last([pk, { action: "raceLockDuringMethodChange", params: {} }])
		expect(step.expect).toMatchObject({ outcomes: ["cancelled"], writes: [], settle: "lock" })
		expect(step.expect.next.session).toEqual({ kind: "locked" })
		expect(endsOf({ action: "raceLockDuringMethodChange", params: {} }, step.expect.next)).toEqual(["session"])
		expect(endsOf({ action: "changeUnlockMethod", params: toPassword("approve").params } as ListedStep, step.expect.next)).toEqual([])
		expect(() => steps([pw, { action: "raceLockDuringMethodChange", params: {} }])).toThrow(/open passkey profile/)
	})

	test("a passkey account file opens with its file password; a short one, a refused or another passkey makes none", () => {
		const file = (variant?: string, other?: string) => ({
			action: "exportAccountFile",
			params: {
				file: "F1",
				which: { derivedIndex: 0 },
				password: "S1",
				...(variant ? { variant } : {}),
				...(other ? { other } : {}),
			},
		})
		const made = last([pk, file()])
		expect(made.expect).toMatchObject({ outcomes: ["committed"], writes: [] })
		expect(made.expect.next.files).toEqual([
			{
				ref: "F1",
				kind: "account",
				from: "P1",
				method: "passkey",
				password: "S1",
				phrase: "W1",
				imported: [],
				derived: 0,
				account: { derivedIndex: 0 },
			},
		])
		expect(made.expect.next.next).toMatchObject({ file: 2, secret: 2 })
		const short = last([pk, file("short")])
		expect(short.expect).toMatchObject({ outcomes: ["refused"], writes: [] })
		expect(short.expect.next.files).toEqual([])
		expect(short.expect.next.next.secret).toBe(2)
		const two = [pk, { action: "createPasskey", params: { ref: "P2", name: "y", credential: "K2", double: false } }]
		const before = last(two).expect.next
		expect(last([...two, file("refuse")]).expect).toMatchObject({ outcomes: ["cancelled"], next: before })
		expect(last([...two, file("other", "K1")]).expect).toMatchObject({ outcomes: ["refused"], next: before })
	})
})

// ── the oracles: a success fixture each, and each break fixture seen failing ──

const P1 = "aaaa1111"
const P2 = "bbbb2222"
const bind = (pairs: [string, string][]): Bindings => {
	const b = emptyBindings()
	for (const [ref, id] of pairs) b.profiles.set(ref as `P${number}`, id)
	return b
}
const world = (list: unknown[]) => planFromList(list as ListedStep[], "empty", CHROME).steps.at(-1)?.expect.next as World
const pw = { action: "createPassword", params: { ref: "P1", name: "x", password: "S1", double: false } }
const pk = { action: "createPasskey", params: { ref: "P1", name: "x", credential: "K1", double: false } }

describe("O1, the session", () => {
	const b = bind([["P1", P1]])
	const open = world([pw])
	const bearerWorld = world([
		pw,
		{ action: "toggleStrict", params: {} },
		{ action: "lock", params: {} },
		{ action: "unlockPassword", params: { target: "P1", variant: "right" } },
	])
	const strictBack = world([
		pw,
		{ action: "toggleStrict", params: {} },
		{ action: "lock", params: {} },
		{ action: "unlockPassword", params: { target: "P1", variant: "right" } },
		{ action: "toggleStrict", params: {} },
	])
	const lockedPasskey = world([pk, { action: "backgroundRestart", params: {} }])
	const locked = world([pw, { action: "lock", params: {} }])
	const row = (hasBearer = false) => ({ profile: P1, hasBearer, hasPasshash: false })
	const pages = [{ label: "anchor", route: "/popup/general", anchor: true }]
	const lockPages = [{ label: "anchor", route: "/popup/auth", anchor: true }]

	test.each([
		["an open strict session", open, { row: row(), active: P1, pages }],
		["a bearer after strict off and an unlock", bearerWorld, { row: row(true), active: P1, pages }],
		["a passkey row left by a restart", lockedPasskey, { row: row(), pages: lockPages, protectedCallRefused: true }],
		[
			"a second page still on the lock screen",
			open,
			{ row: row(), active: P1, pages: [...pages, { ...lockPages[0], label: "w2", anchor: false }] },
		],
		["a lock", locked, { pages: lockPages, protectedCallRefused: true }],
		[
			"the anchor left on an import page while open",
			open,
			{ row: row(), active: P1, pages: [{ ...pages[0], route: "/popup/import" }] },
		],
	] as const)("passes %s", (_label, w, r) => {
		expect(checkSession(w, r as SessionReading, b)).toEqual([])
	})

	test.each([
		["a bearer left after strict turned on", strictBack, { row: row(true), active: P1, pages }],
		["no bearer after strict off and an unlock", bearerWorld, { row: row(false), active: P1, pages }],
		["a bearer under strict mode", open, { row: row(true), active: P1, pages }],
		["a session row after a lock", locked, { row: row(), pages: lockPages, protectedCallRefused: true }],
		["an active profile after a lock", locked, { active: P1, pages: lockPages, protectedCallRefused: true }],
		["a locked reading that never probed", locked, { pages: lockPages }],
		["the anchor on the lock screen while open", open, { row: row(), active: P1, pages: lockPages }],
		["the anchor on Register while open", open, { row: row(), active: P1, pages: [{ ...pages[0], route: "/popup/register" }] }],
		["a page still on Home after a lock", locked, { pages, protectedCallRefused: true }],
		["a protected call served after a lock", locked, { pages: lockPages, protectedCallRefused: false }],
		["the wrong profile open", open, { row: { ...row(), profile: P2 }, active: P2, pages }],
		["a legacy passhash", open, { row: { ...row(), hasPasshash: true }, active: P1, pages }],
		[
			"a password row kept by a restart",
			world([pw, { action: "backgroundRestart", params: {} }]),
			{ row: row(), pages: lockPages, protectedCallRefused: true },
		],
	] as const)("fails %s", (label, w, r) => {
		expect(shown(`O1 ${label}`, checkSession(w, r as SessionReading, b)).length).toBeGreaterThan(0)
	})

	test("an open session fails on exactly the routes the popup advances from", () => {
		expect(ADVANCES_ON_OPEN.map((r) => r.slice(1).replace("/", "-")).sort()).toEqual([...AUTH_ENTRY_ROUTES].sort())
	})
})

describe("O2, profile rows", () => {
	const b = bind([["P1", P1]])
	const w = world([pw])
	const good = (): ProfileReading => ({
		listed: [{ id: P1, name: "Main", type: "password", retired: false }],
		rows: [{ keyId: P1, id: P1, name: "Main", type: "password", fields: [...PROFILE_ROW_FIELDS.password] }],
	})

	test("passes a profile listed and stored as the model holds it", () => {
		expect(checkProfiles(w, good(), b)).toEqual([])
	})

	test.each([
		[
			"a renamed profile",
			(r: ProfileReading) => {
				r.listed[0].name = "Other"
				r.rows[0].name = "Other"
			},
		],
		["a passkey row for a password profile", (r: ProfileReading) => (r.rows[0].type = "passkey")],
		["a row with an extra field", (r: ProfileReading) => r.rows[0].fields.push("prfSalt")],
		["a row missing its MAC", (r: ProfileReading) => (r.rows[0].fields = r.rows[0].fields.filter((f) => f !== "envelopeMac"))],
		["an extra profile listed", (r: ProfileReading) => r.listed.push({ id: P2, name: "Ghost", type: "password", retired: false })],
		["an openable profile listed as retired", (r: ProfileReading) => (r.listed[0].retired = true)],
		["an extra row stored", (r: ProfileReading) => r.rows.push({ keyId: P2, id: P2, name: "Ghost", type: "password", fields: [] })],
		[
			"the profile missing",
			(r: ProfileReading) => {
				r.listed = []
				r.rows = []
			},
		],
		["a row whose id is not its key's", (r: ProfileReading) => (r.rows[0].id = P2)],
	])("fails %s", (label, mutate) => {
		const r = good()
		mutate(r)
		expect(shown(`O2 ${label}`, checkProfiles(w, r, b)).length).toBeGreaterThan(0)
	})

	test("a name the wallet shows goes only to the masked detail", () => {
		const r = good()
		r.listed[0].name = "hunter2-typed-as-a-name"
		r.rows[0].name = "hunter2-typed-as-a-name"
		const [v] = checkProfiles(w, r, b)
		expect(v?.message).not.toContain("hunter2")
		expect(v?.detail).toContain("hunter2")
	})

	test("the row fields are the schema's, a field a variant forbids left out", () => {
		const required = (o: (typeof ProfileRowSchema.options)[number]) =>
			Object.entries(o.shape as Record<string, { safeParse(v: unknown): { success: boolean } }>)
				.filter(([, field]) => !field.safeParse(undefined).success)
				.map(([key]) => key)
				.sort()
		const [password, passkey, retired] = ProfileRowSchema.options.map(required)
		expect({ password, passkey, retired }).toEqual({
			password: [...PROFILE_ROW_FIELDS.password].sort(),
			passkey: [...PROFILE_ROW_FIELDS.passkey].sort(),
			retired: [...PROFILE_ROW_FIELDS.retired].sort(),
		})
	})

	test("passes a retired profile listed as retired with its row's fields, and fails one listed openable", () => {
		const wr = startWorld("pre-update-retired")
		const both = bind([
			["P1", P1],
			["P2", P2],
		])
		const r: ProfileReading = {
			listed: [
				{ id: P1, name: "Main", type: "password", retired: false },
				{ id: P2, name: "Chaos 1", type: "passkey", retired: true },
			],
			rows: [
				{ keyId: P1, id: P1, name: "Main", type: "password", fields: [...PROFILE_ROW_FIELDS.password] },
				{ keyId: P2, id: P2, name: "Chaos 1", type: "passkey", fields: [...PROFILE_ROW_FIELDS.retired] },
			],
		}
		expect(checkProfiles(wr, r, both)).toEqual([])
		r.listed[1].retired = false
		expect(shown("O2 a retired profile listed openable", checkProfiles(wr, r, both)).length).toBeGreaterThan(0)
		r.listed[1].retired = true
		r.rows[1].fields.push("prfSalt")
		expect(shown("O2 a retired row given a key only a later row carries", checkProfiles(wr, r, both)).length).toBeGreaterThan(0)
	})

	describe("a passkey row's credential", () => {
		const shared = world([pk, { action: "createPasskey", params: { ref: "P2", name: "y", credential: "K1", double: false } }])
		const K1 = "Y3JlZGVudGlhbC1vbmU="
		const bound = () => {
			const both = bind([
				["P1", P1],
				["P2", P2],
			])
			both.credentials.set("K1", K1)
			return both
		}
		const row = (keyId: string, name: string, credentialId: string) => ({
			keyId,
			id: keyId,
			name,
			type: "passkey",
			fields: [...PROFILE_ROW_FIELDS.passkey],
			credentialId,
		})
		const reading = (second = K1): ProfileReading => ({
			listed: [
				{ id: P1, name: "Main", type: "passkey", retired: false },
				{ id: P2, name: "y", type: "passkey", retired: false },
			],
			rows: [row(P1, "Main", K1), row(P2, "y", second)],
		})

		test("passes two rows naming the one credential the model gave both", () => {
			expect(checkProfiles(shared, reading(), bound())).toEqual([])
		})

		test("fails a row naming another credential than its binding", () => {
			const v = shown("O2 a row naming another credential", checkProfiles(shared, reading("b3RoZXI="), bound()))
			expect(v.map((x) => x.message)).toEqual(["P2's row names another credential than K1"])
		})

		test("fails a passkey profile whose credential was never bound", () => {
			const unbound = bind([
				["P1", P1],
				["P2", P2],
			])
			expect(shown("O2 an unbound credential", checkProfiles(shared, reading(), unbound)).length).toBe(2)
		})
	})
})

describe("the passkey's answers", () => {
	const minted = [
		{ kind: "create" as const, credential: "K1" as const },
		{ kind: "get" as const, credential: "K1" as const, optional: true as const },
	]
	const reused = [{ kind: "get" as const, credential: "K1" as const }]
	const bound = () => {
		const b = emptyBindings()
		b.credentials.set("K1", "a2V5LW9uZQ==")
		return b
	}
	const named = { named: 0, prf: true }

	test("a mint binds its credential from the create's answer, with or without the confirming get", () => {
		const b = emptyBindings()
		expect(bindCeremonies(b, { answers: [{ kind: "create", id: "bmV3" }], picks: [] }, minted)).toBeUndefined()
		expect(b.credentials.get("K1")).toBe("bmV3")
		const confirmed = emptyBindings()
		const answers = [
			{ kind: "create" as const, id: "bmV3" },
			{ kind: "get" as const, id: "bmV3" },
		]
		expect(bindCeremonies(confirmed, { answers, picks: [] }, minted)).toBeUndefined()
	})

	test("a reuse passes on its own credential, picked from a request that named none", () => {
		expect(bindCeremonies(bound(), { answers: [{ kind: "get", id: "a2V5LW9uZQ==" }], picks: [named] }, reused)).toBeUndefined()
	})

	test.each([
		["a reuse answered by another credential", { answers: [{ kind: "get", id: "b3RoZXI=" }], picks: [named] }, reused, bound()],
		[
			"a discovery the wallet narrowed itself",
			{ answers: [{ kind: "get", id: "a2V5LW9uZQ==" }], picks: [{ named: 1, prf: true }] },
			reused,
			bound(),
		],
		[
			"a discovery asking no PRF output",
			{ answers: [{ kind: "get", id: "a2V5LW9uZQ==" }], picks: [{ named: 0, prf: false }] },
			reused,
			bound(),
		],
		["a mint that made no create", { answers: [], picks: [] }, minted, emptyBindings()],
		[
			"a mint answered with a credential already bound",
			{ answers: [{ kind: "create", id: "a2V5LW9uZQ==" }], picks: [] },
			[{ kind: "create", credential: "K2" }],
			bound(),
		],
		[
			"a second create past the step's one",
			{
				answers: [
					{ kind: "create", id: "bmV3" },
					{ kind: "create", id: "bmV4" },
				],
				picks: [],
			},
			minted,
			emptyBindings(),
		],
		["a get for a credential no create minted", { answers: [{ kind: "get", id: "bmV3" }], picks: [] }, reused, emptyBindings()],
	] as const)("fails %s", (label, seen, expected, b) => {
		const wrong = bindCeremonies(b, seen as never, expected as never)
		console.log(`[break] answers ${label}: ${wrong ?? "<none>"}`)
		expect(wrong).toBeDefined()
	})
})

describe("O3, writes", () => {
	const b = bind([
		["P1", P1],
		["P2", P2],
	])
	const entry = (key: string, digest: string, envelopeOwner?: string): StoredEntry => ({
		key,
		digest,
		envelope: !!envelopeOwner,
		envelopeOwner,
	})
	const base = [entry(`nulo:core:profiles@${P1}`, "a"), entry(`nulo:core:accounts@x1`, "b", P1), entry(`nulo:core:profiles@${P2}`, "c")]
	const released: StoredEntry = { key: "nulo:core:networks@n1", digest: "r", envelope: false, plainOwner: P1 }
	const releasedByKey: StoredEntry = {
		key: `nulo:core:accounts@${JSON.stringify(["account", P1, 31337, "0x01"])}`,
		digest: "k",
		envelope: false,
	}
	const ctx = (after: StoredEntry[], contract: WriteContext["contract"], extra: Partial<WriteContext> = {}): WriteContext => ({
		before: base,
		after,
		contract,
		bindings: b,
		knownIds: new Set([P1, P2]),
		openIds: new Set([P1]),
		deletedIds: new Set(),
		...extra,
	})

	test.each([
		[
			"a profile write inside the contract",
			ctx([...base.slice(0, 2), entry(`nulo:core:profiles@${P2}`, "c2")], [{ kind: "profile", ref: "P2" }]),
		],
		["a balance refresh for the open profile", ctx([...base, entry("nulo:core:token-balances@1", "t", P1)], [])],
		["the open profile's selection stamped by its account setup", ctx([...base, entry("nulo:ui:selectedAccount@device", "s", P1)], [])],
		["a device write the contract names", ctx([...base, entry("nulo:ui:lastActiveProfile", "l")], [{ kind: "device" }])],
		["the harness's own key", ctx([...base, entry("nulo:e2e:proof-gate", "g")], [])],
		["a create that stores its row", ctx(base, [{ kind: "create", ref: "P2" }])],
		["a delete that purged everything", ctx([base[2]], [{ kind: "delete", ref: "P1" }])],
		[
			"network seeding for the profile a restore names",
			ctx([...base, entry("nulo:core:networks@n2", "n", P2)], [{ kind: "create", ref: "P2" }], { openIds: new Set() }),
		],
	])("passes %s", (_label, c) => {
		expect(checkWrites(c)).toEqual([])
	})

	test.each([
		["a refused step that wrote a profile row", ctx([entry(`nulo:core:profiles@${P1}`, "a2"), ...base.slice(1)], [])],
		[
			"a write to a profile outside the contract",
			ctx([entry(`nulo:core:profiles@${P1}`, "a2"), ...base.slice(1)], [{ kind: "profile", ref: "P2" }]),
		],
		["a device write the contract does not name", ctx([...base, entry("nulo:config", "c")], [])],
		["a balance write for a locked profile", ctx([...base, entry("nulo:core:token-balances@2", "t", P2)], [])],
		["a selection stamped for a locked profile", ctx([...base, entry("nulo:ui:selectedAccount@device", "s", P2)], [])],
		["a row for a deleted profile", ctx([...base, entry("nulo:core:tokens@9", "t", P2)], [], { deletedIds: new Set([P2]) })],
		["a row left by a delete", ctx(base, [{ kind: "delete", ref: "P1" }])],
		[
			"a row for a profile the run never saw",
			ctx([...base, entry("nulo:core:profiles@zzzz9999", "z", "zzzz9999")], [{ kind: "device" }]),
		],
		["an unregistered key", ctx([...base, entry("nulo:core:mystery", "m")], [{ kind: "device" }])],
		[
			"a plain row for a profile the run never saw",
			ctx([...base, entry("nulo:ui:getStartedHidden@zzzz9999", "z")], [{ kind: "device" }]),
		],
		["a sealed family's row without its envelope", ctx([...base, entry("nulo:core:contacts@c1", "c")], [{ kind: "device" }])],
		["a create that stored no row", ctx(base.slice(0, 2), [{ kind: "create", ref: "P2" }])],
		[
			"a plaintext row written in a sealed root",
			ctx(
				[...base, { key: "nulo:core:networks@n9", digest: "p", envelope: false, plainOwner: P1 }],
				[{ kind: "profile", ref: "P1" }],
			),
		],
		[
			"a delete that left its release-era plaintext row",
			ctx([base[2], released], [{ kind: "delete", ref: "P1" }], { before: [...base, released] }),
		],
		[
			"a delete that left a release-era row its key names",
			ctx([base[2], releasedByKey], [{ kind: "delete", ref: "P1" }], { before: [...base, releasedByKey] }),
		],
	])("fails %s", (label, c) => {
		expect(shown(`O3 ${label}`, checkWrites(c)).length).toBeGreaterThan(0)
	})

	test("passes a release-era plaintext row sealed at its profile's unlock, and one its delete purges", () => {
		const before = [...base, released]
		const sealedNow = entry("nulo:core:networks@n1", "s", P1)
		expect(checkWrites(ctx([...base, sealedNow], [{ kind: "profile", ref: "P1" }], { before }))).toEqual([])
		expect(checkWrites(ctx([base[2]], [{ kind: "delete", ref: "P1" }], { before }))).toEqual([])
	})

	test("every registered family is grouped, under the registry's own ref", () => {
		const registry = Object.fromEntries(
			Object.entries(STORED_SHAPES).map(([name, s]) => [
				name,
				{ ref: s.ref.kind === "root" ? `root:${s.ref.root}` : `value:${s.ref.key}`, sealed: "sealed" in s && s.sealed === true },
			]),
		)
		const grouped = Object.fromEntries(
			Object.entries(FAMILY_GROUPS).map(([name, e]) => [
				name,
				{ ref: (e as FamilyEntry).ref, sealed: (e as FamilyEntry).sealed === true },
			]),
		)
		expect(grouped).toEqual(registry)
		for (const e of Object.values(FAMILY_GROUPS) as FamilyEntry[]) expect(e.reason.length).toBeGreaterThan(10)
	})

	test("a key maps to its family by whole prefix, and its owner by envelope or id", () => {
		expect(familyOfKey("nulo:core:network-reset@x")).toBe("networkReset")
		expect(familyOfKey("nulo:core:network-reset-done@x")).toBe("networkResetDone")
		expect(familyOfKey("nulo:config")).toBe("config")
		expect(familyOfKey("nulo:configx")).toBeUndefined()
		expect(ownerOf(entry(`nulo:ui:getStartedHidden@${P1}`, "x"))).toBe(P1)
		expect(ownerOf(entry(`nulo:core:account-integrity-verified@${P1}|0`, "x"))).toBe(P1)
		expect(ownerOf(entry("nulo:core:network-seeded@zzzz9999", "x"))).toBe("zzzz9999")
		expect(ownerOf(entry("nulo:core:accounts@hashed", "x", P2))).toBe(P2)
		expect(ownerOf(entry("nulo:core:accounts@hashed", "x"))).toBeUndefined()
		expect(ownerOf({ key: "nulo:core:accounts@hashed", digest: "x", envelope: false, plainOwner: P1 })).toBe(P1)
		expect(ownerOf(entry("nulo:config", "x"))).toBeUndefined()
		const ids = new Set([P1, P2])
		const byKey = { key: `nulo:core:accounts@${JSON.stringify(["account", P2, 31337, `0x${P1}00`])}`, digest: "x", envelope: false }
		expect(ownerOf(byKey, ids)).toBe(P2)
		expect(ownerOf({ ...byKey, envelope: true }, ids)).toBeUndefined()
		expect(releaseRowOwner("nulo:core:networks@n1", `{"profileId":"${P1}"}`, ids)).toBe(P1)
		expect(releaseRowOwner(byKey.key, "{}", ids)).toBe(P2)
		expect(releaseRowOwner("nulo:core:networks@n1", "not json", ids)).toBeUndefined()
	})
})

describe("O4, errors", () => {
	const page = (text: string): ErrorEntry => ({ kind: "page-error", page: "anchor", text })

	test("passes a disconnect rejection the popup prevents, at any step", () => {
		const verdict = checkErrors([page("Error: Client disconnected")], [])
		expect(verdict.violations).toEqual([])
		expect(verdict.allowed).toEqual({ "code:apps/extension/src/wallet/logger/console-forwarding.ts:19": 1 })
	})

	test("passes a lock's disconnect cascade and counts warn lines without failing", () => {
		const verdict = checkErrors(
			[page("Error: Client disconnected"), { kind: "log", level: "warn", source: "profile", text: "slow" }],
			["session"],
		)
		expect(verdict).toEqual({
			violations: [],
			warns: { profile: 1 },
			allowed: { "code:apps/extension/src/wallet/logger/console-forwarding.ts:19": 1 },
		})
	})

	describe("the guarded node's refusal", () => {
		const refusal = (text: string): ErrorEntry => ({ kind: "log", level: "error", source: "pxe", text })
		const refused = refusal(
			'["[READ] getLatestBlockNumber failed",{"error":{"message":"Error 400 from server <url> no node answers a guarded e2e run"}}]',
		)

		test("passes at any step, and counts what it let through", () => {
			expect(checkErrors([refused, refused], [])).toEqual({
				violations: [],
				warns: {},
				allowed: { [GUARDED_NODE_REFUSAL.source]: 2 },
			})
		})

		test.each([
			["for an error log without the stand-in's text", [refusal('["Failed to fetch node info",{"message":"fetch failed"}]')]],
			["for a page error carrying the stand-in's text", [page("Error: no node answers a guarded e2e run")]],
			[
				"for an entry that also carries another error",
				[
					refusal(
						'["Failed to sync",{"message":"Error 400 from server <url> no node answers a guarded e2e run"},{"message":"QuotaExceededError: disk full"}]',
					),
				],
			],
			[
				"for an entry that also carries a bare error string",
				[
					refusal(
						'["Failed to sync",{"message":"Error 400 from server <url> no node answers a guarded e2e run"},"TypeError: invalid recovery state"]',
					),
				],
			],
			[
				"for an unhandled rejection carrying it",
				[refusal('["unhandled rejection",{"error":{"message":"Error 400 from server <url> no node answers a guarded e2e run"}}]')],
			],
			[
				"for a failed restore carrying it",
				[
					refusal(
						'["[full-backup] restore failed:",{"error":{"message":"Error 400 from server <url> no node answers a guarded e2e run"}}]',
					),
				],
			],
		] as const)("fails %s", (label, entries) => {
			const verdict = checkErrors(entries as unknown as ErrorEntry[], [])
			expect(shown(`O4 the refusal allowance ${label}`, verdict.violations).length).toBeGreaterThan(0)
		})
	})

	test("passes a restore a planned restart failed, only during that restart and only for the disconnect", () => {
		const failed = (message: string): ErrorEntry => ({
			kind: "log",
			level: "error",
			source: "ui",
			text: `["[full-backup] restore failed:",{"error":{"name":"Error","message":"${message}"}}]`,
		})
		const source = "code:apps/extension/src/composables/full-backup-restore.ts:1000"
		expect(checkErrors([failed("Client disconnected")], ["session", "background"])).toEqual({
			violations: [],
			warns: {},
			allowed: { [source]: 1 },
		})
		expect(
			shown("O4 a restore failed with no planned restart", checkErrors([failed("Client disconnected")], ["session"]).violations),
		).toHaveLength(1)
		expect(
			shown("O4 a restore failed for another reason", checkErrors([failed("Profile locked")], ["background"]).violations),
		).toHaveLength(1)
	})

	test.each([
		["an uncaught error", [page("TypeError: x is undefined")], ["session"]],
		["an error log line", [{ kind: "log", level: "error", source: "profile", text: "Failed to refresh profile session" }], []],
		["a console error", [{ kind: "console-error", page: "anchor", text: "boom" }], []],
		["a disconnect that only contains the phrase", [page("Error: Client disconnected while x")], ["session"]],
		["a disconnect the wallet logs at error", [{ kind: "log", level: "error", source: "profile", text: "Client disconnected" }], []],
		["a disconnect thrown in a console error", [{ kind: "console-error", page: "anchor", text: "Error: Client disconnected" }], []],
	] as const)("fails %s", (label, entries, ends) => {
		expect(shown(`O4 ${label}`, checkErrors(entries as unknown as ErrorEntry[], ends).violations).length).toBeGreaterThan(0)
	})

	test("a page error reads as one text on both browsers", () => {
		const named = (name: string, message: string) => Object.assign(new Error(message), { name })
		expect(pageErrorText(named("Error", "Client disconnected"))).toBe("Error: Client disconnected")
		expect(pageErrorText(new Error("Uncaught (in promise) Error: Client disconnected"))).toBe("Error: Client disconnected")
		expect(pageErrorText(new Error("Error: Client disconnected"))).toBe("Error: Client disconnected")
		expect(pageErrorText(named("TypeError", "x is undefined"))).toBe("TypeError: x is undefined")
		expect(pageErrorText(new Error("TypeError: x is undefined"))).toBe("TypeError: x is undefined")
		expect(pageErrorText(new Error("Wrapped: thing"))).toBe("Error: Wrapped: thing")
		expect(pageErrorText("a thrown string")).toBe("a thrown string")
	})

	test("a violation's message names the error's class; its text stays in the detail", () => {
		const [v] = checkErrors([page("TypeError: secret-looking text")], []).violations
		expect(v).toEqual({ oracle: "O4", message: "page-error on anchor: TypeError", detail: "TypeError: secret-looking text" })
	})

	test("every allowed error names its reason and a source line that exists", () => {
		for (const a of ALLOWED_ERRORS) {
			const [, file, line] = /^code:(\S+):(\d+)$/.exec(a.source) ?? []
			expect(file, a.source).toBeTruthy()
			const path = join(import.meta.dirname, "../../../..", file)
			expect(readFileSync(path, "utf8").split("\n")[Number(line) - 1]?.trim(), a.source).toBeTruthy()
			expect(a.reason.length).toBeGreaterThan(20)
		}
	})

	test("a filed finding's error line is marked with its issue; any other error line is not", () => {
		// A fixed finding's entry is gone, so its line, should it come back, is an unfiled red.
		const gasRetry = {
			kind: "log" as const,
			level: "error" as const,
			source: "execution",
			text: '["Failed to get public FeeJuice balance",{"error":{"name":"Error","message":"Profile locked"}}]',
		}
		const [refired] = shown("O4 a fixed finding's line", checkErrors([gasRetry], []).violations)
		expect(refired?.oracle).toBe("O4")
		expect(refired?.known).toBeUndefined()
		const forwarded = {
			kind: "log" as const,
			level: "error" as const,
			source: "ui",
			text: '["unhandled rejection",{"error":{"name":"Error","message":"Wallet locked"}}]',
		}
		for (const line of [forwarded, { ...forwarded, text: '[{"name":"Error","message":"Client disconnected"}]' }]) {
			expect(shown("O4 a fixed finding's ui line", checkErrors([line], []).violations)[0]?.known).toBeUndefined()
		}
		// The source and pairing rules, on a fixture finding: no filed finding pairs a page error now.
		const fixture: KnownFinding[] = [
			{ issue: 1, pattern: /^\["unhandled rejection",.*"Wallet locked"/, kinds: ["log"], source: "ui" },
			{
				issue: 1,
				pattern: /^Error: (?:Wallet|Profile) locked$/,
				kinds: ["page-error"],
				alongside: {
					source: "ui",
					text: (pageError) => forwarded.text.replace("Wallet locked", pageError.replace(/^Error: /, "")),
				},
			},
		]
		const check = (entries: ErrorEntry[]) => checkErrors(entries, [], ALLOWED_ERRORS, fixture).violations
		expect(shown("O4 the fixture's line from another source", check([{ ...forwarded, source: "profile" }]))[0]?.known).toBeUndefined()
		const lockedPage = (page: string, text = "Error: Wallet locked"): ErrorEntry => ({ kind: "page-error", page, text })
		// The second page's rejection has no forwarded line of its own, so nothing vouches for it.
		const refused = check([forwarded, lockedPage("anchor"), lockedPage("second", "Error: Profile locked")])
		expect(refused.map((v) => v.known)).toEqual([1, 1, undefined])
		const twice = check([forwarded, lockedPage("anchor"), lockedPage("second")])
		expect(shown("O4 two page errors beside one forwarded rejection", twice).map((v) => v.known)).toEqual([1, 1, undefined])
		expect(
			shown("O4 a locked page error with no forwarded rejection beside it", check([lockedPage("anchor")]))[0]?.known,
		).toBeUndefined()
		const otherRefusal = check([lockedPage("anchor", "Error: Wallet locked while x")])
		expect(shown("O4 a refusal beside a filed one's text", otherRefusal)[0]?.known).toBeUndefined()
		const discovery = (message: string) => ({
			kind: "log" as const,
			level: "error" as const,
			source: "fpc",
			text: `["Failed to discover FPC 0x${"ab".repeat(32)}",{"name":"PxeStoreKeyMissingError","message":"${message}"}]`,
		})
		// A discovery a lock or a deletion interrupts logs nothing at error, so each of its refusals is an
		// unfiled red.
		for (const message of [
			"PXE_STORE_KEY_MISSING: no store key provisioned for profile x",
			"pxe op rejected: profile x has no current incarnation (deleted or tombstoned)",
			"profile x is being deleted — write rejected (epoch 0 → 1)",
			"profile x deleted",
		]) {
			const [refusal] = shown("O4 a discovery a lock interrupts", checkErrors([discovery(message)], []).violations)
			expect(refusal?.oracle).toBe("O4")
			expect(refusal?.known).toBeUndefined()
		}
		const read = (text: string) => ({ kind: "log" as const, level: "error" as const, source: "pxe", text })
		const unreachable = checkErrors([discovery("Error 400 from server")], []).violations
		expect(shown("O4 a discovery failure that is not the lock's", unreachable)[0]?.known).toBeUndefined()
		const retried = (module: string, cause = "TypeError: Failed to fetch") =>
			read(
				`[{"module":"${module}"},{},"Error while retrying JsonRpcClient request to <url> Error: Error fetching from host <url> ${cause}"]`,
			)
		expect(checkErrors([retried("foundation:retry")], []).violations[0]?.known).toBe(432)
		const otherLogger = checkErrors([retried("pxe:service")], []).violations
		expect(shown("O4 a retry line from another logger", otherLogger)[0]?.known).toBeUndefined()
		const answered = checkErrors([retried("foundation:retry", "Error: 500 Internal Server Error")], []).violations
		expect(shown("O4 a retry the node answered", answered)[0]?.known).toBeUndefined()
		const methodFailed = (message: string) => ({
			kind: "log" as const,
			level: "error" as const,
			source: "ui",
			text: `["[unlock-method] change failed",{"error":{"name":"Error","message":"${message}"}}]`,
		})
		// A refused passkey logs at debug, so its line at error is an unfiled red like any other failure.
		for (const message of ["Passkey did not open this profile", "The new password needs at least 8 characters"]) {
			const [failed] = shown("O4 a method change failing at error", checkErrors([methodFailed(message)], []).violations)
			expect(failed?.oracle).toBe("O4")
			expect(failed?.known).toBeUndefined()
		}
	})

	test("log ids that run on are complete; a gap is not", () => {
		expect(checkLogContinuity(10, [11, 12, 13])).toEqual({ complete: true })
		expect(checkLogContinuity(0, [])).toEqual({ complete: true })
		const gap = checkLogContinuity(10, [14, 15])
		console.log(`[break] O4 a log-id gap: ${gap.reason}`)
		expect(gap.complete).toBe(false)
		expect(checkLogContinuity(10, [11, 13]).complete).toBe(false)
	})
})

describe("bindings", () => {
	test("a restored profile takes over a deleted symbol's id, and no live one's", () => {
		const b = emptyBindings()
		bindProfile(b, "P1", "aaaa1111")
		bindProfile(b, "P2", "bbbb2222")
		bindProfile(b, "P3", "aaaa1111", new Set(["P1"]))
		expect(Object.fromEntries(b.profiles)).toEqual({ P2: "bbbb2222", P3: "aaaa1111" })
		expect(() => bindProfile(b, "P4", "bbbb2222", new Set(["P1"]))).toThrow("bbbb2222 is already P2")
		expect(() => bindProfile(b, "P3", "cccc3333")).toThrow("P3 is bound to aaaa1111")
	})
})

describe("the run's verdict", () => {
	const known: Violation = { oracle: "O4", message: "error log from pxe: unclassified", known: 432 }
	const fresh: Violation = { oracle: "O1", message: "locked, but the service reports p active" }
	const step = (r: Partial<StepOutcome> = {}): StepOutcome => ({ violations: [], incomplete: [], ...r })

	test("green only when every planned step ran with complete evidence", () => {
		expect(runVerdict([step(), step()], 2)).toBe("green")
		expect(runVerdict([step()], 2)).toBe("incomplete")
		expect(runVerdict([step(), step({ incomplete: ["logs: x"] })], 2)).toBe("incomplete")
		expect(runVerdict([step(), step({ crashed: "boom" })], 2)).toBe("incomplete")
	})

	test("a filed finding keeps the seed red and the run going; anything else stops it", () => {
		expect(runVerdict([step({ violations: [known] }), step()], 2)).toBe("red")
		expect(stopsRun(step({ violations: [known] }))).toBe(false)
		expect(stopsRun(step({ violations: [known, fresh] }))).toBe(true)
		expect(stopsRun(step({ crashed: "boom" }))).toBe(true)
		expect(stopsRun(step({ incomplete: [UNPLANNED_RESTART] }))).toBe(true)
		expect(stopsRun(step({ incomplete: [RESTART_LOG_GAP] }))).toBe(false)
	})

	test("a seed with no violation fails on every evidence gap but a planned restart's log window", () => {
		const at = (index: number, r: Partial<StepOutcome> = {}) => ({ index, action: "lock", ...step(r) })
		expect(evidenceGaps([at(0), at(1, { incomplete: [RESTART_LOG_GAP] })], 2)).toEqual([])
		const breaks: [string, string[], string[]][] = [
			[
				"an unplanned restart",
				evidenceGaps([at(0, { incomplete: [UNPLANNED_RESTART] })], 2),
				[`step 0 lock: ${UNPLANNED_RESTART}`, "ran 1 of 2 planned steps"],
			],
			["a log-id gap", evidenceGaps([at(0, { incomplete: ["logs: id 14 after 10"] })], 1), ["step 0 lock: logs: id 14 after 10"]],
			["a check that threw", evidenceGaps([at(0, { crashed: "boom" })], 1), ["step 0 lock: the checks threw"]],
			["a short run", evidenceGaps([at(0)], 2), ["ran 1 of 2 planned steps"]],
		]
		for (const [label, gaps, want] of breaks) {
			console.log(`[break] verdict ${label}: ${gaps.join("; ")}`)
			expect(gaps, label).toEqual(want)
		}
	})
})

describe("O5, settle bounds", () => {
	test("passes a settle within its bound and fails a miss, naming what still loads", () => {
		expect(checkSettle("lock", { reached: true, elapsedMs: 900, boundMs: 15_000 })).toEqual([])
		const miss = shown(
			"O5 a spinner past its bound",
			checkSettle("unlock", { reached: false, elapsedMs: 15_000, boundMs: 15_000, loading: ["start-pending"], route: "/popup/auth" }),
		)
		expect(miss[0].message).toContain("start-pending")
		expect(
			shown("O5 a settle past its bound", checkSettle("lock", { reached: true, elapsedMs: 15_001, boundMs: 15_000 })),
		).toHaveLength(1)
	})
})

describe("O3, a release row on its profile's first open", () => {
	const legacy = `nulo:core:accounts@${JSON.stringify(["account", P1, 31337, "0x01"])}`
	const plain: StoredEntry = { key: legacy, digest: "p", envelope: false }
	const twin: StoredEntry = { key: "nulo:core:accounts@hashed", digest: "s", envelope: true, envelopeOwner: P1 }
	const network: StoredEntry = { key: "nulo:core:networks@n1", digest: "p", envelope: false, plainOwner: P1 }

	test("passes a row sealed under a new key and one sealed in place", () => {
		const inPlace: StoredEntry = { ...network, digest: "s", envelope: true, envelopeOwner: P1, plainOwner: undefined }
		expect(lostRelease([legacy, network.key], [plain, network], [twin, inPlace], P1)).toEqual([])
	})

	test.each([
		["a row gone with no sealed row in its place", [] as StoredEntry[]],
		["a row gone beside another profile's sealed row", [{ ...twin, envelopeOwner: P2 }]],
		["a row gone beside a sealed row that was already there", [twin]],
	] as const)("fails %s", (label, now) => {
		const before = label.includes("already") ? [plain, twin] : [plain]
		expect(
			shown(
				`O3 ${label}`,
				lostRelease([legacy], before, now, P1).map((message) => ({ oracle: "O3" as const, message })),
			).length,
		).toBe(1)
	})
})

describe("O6, verifyAll", () => {
	const b = bind([
		["P1", P1],
		["P2", P2],
	])
	b.addresses.set("P1", on(["0xa1"]))
	const w = world([
		pw,
		{ action: "revealPhrase", params: { variant: "right" } },
		{ action: "importPhrase", params: { ref: "P2", phrase: "W1", name: "n", password: "S2", duplicate: "confirm" } },
	])
	const ok = (ref: "P1" | "P2") => ({
		ref,
		wrongRefused: true,
		wrongWrote: [],
		opened: true,
		addresses: ["0xa1"],
		chainId: CHAIN,
		sentinels: [],
	})

	test("passes two profiles of one phrase deriving one account", () => {
		expect(checkVerify(w, [ok("P1"), ok("P2")], b)).toEqual([])
	})

	test("compares addresses on one chain only: a reset or a restore's reseed moves a profile's chain", () => {
		const moved = bind([
			["P1", P1],
			["P2", P2],
		])
		moved.addresses.set("P1", on(["0xold"], 2))
		moved.addresses.set("P2", on(["0xa1"]))
		expect(checkVerify(w, [ok("P1"), { ...ok("P2"), addresses: ["0xb2"], chainId: 3 }], moved)).toEqual([])
	})

	test.each([
		["a wrong secret that opened", [{ ...ok("P1"), wrongRefused: false }, ok("P2")]],
		["a refused unlock that wrote", [{ ...ok("P1"), wrongWrote: ["nulo:config"] }, ok("P2")]],
		["its own secret refused", [{ ...ok("P1"), opened: false }, ok("P2")]],
		["a phrase import deriving another account", [ok("P1"), { ...ok("P2"), addresses: ["0xb2"] }]],
		["an account that moved", [{ ...ok("P1"), addresses: ["0xff"] }, ok("P2")]],
		["a missing derived account", [{ ...ok("P1"), addresses: [] }, ok("P2")]],
		["a profile left unverified", [ok("P1")]],
		["a profile verified twice", [ok("P1"), ok("P2"), ok("P2")]],
		["a profile the model never held", [ok("P1"), ok("P2"), { ...ok("P2"), ref: "P3" }]],
		["a release row lost on the profile's first open", [{ ...ok("P1"), lost: ["nulo:core:accounts@ lost 1"] }, ok("P2")]],
		[
			"an imported account the model never recorded",
			[{ ...ok("P1"), sentinels: [{ file: "F1", now: "k1", imported: "k1" }] }, ok("P2")],
		],
	] as const)("fails %s", (label, readings) => {
		b.addresses.set("P2", on(["0xa1"]))
		expect(shown(`O6 ${label}`, checkVerify(w, readings as never, b)).length).toBeGreaterThan(0)
	})
})

describe("O6, accounts across siblings and imports", () => {
	const b = bind([
		["P1", P1],
		["P2", P2],
	])
	const w = world([
		pw,
		{ action: "addAccount", params: {} },
		{ action: "exportAccountFile", params: { file: "F1", which: { derivedIndex: 1 } } },
		{ action: "revealPhrase", params: { variant: "right" } },
		{ action: "importPhrase", params: { ref: "P2", phrase: "W1", name: "n", password: "S2", duplicate: "confirm" } },
		{ action: "addAccount", params: {} },
		{ action: "exportAccountFile", params: { file: "F2", which: { derivedIndex: 0 } } },
		{ action: "createPassword", params: { ref: "P3", name: "m", password: "S3", double: false } },
		{ action: "importAccountFile", params: { file: "F1" } },
	])
	b.profiles.set("P3", "cccc3333")
	b.addresses.set("P1", on(["0xa1", "0xa2"]))
	// P2's accounts as first read, before its second one existed: only a sibling check sees index 1.
	b.addresses.set("P2", on(["0xa1"]))
	b.addresses.set("P3", on(["0xc1"]))
	const reading = (ref: "P1" | "P2" | "P3", over: object = {}) => ({
		ref,
		wrongRefused: true,
		wrongWrote: [],
		opened: true,
		addresses: ref === "P3" ? ["0xc1"] : ["0xa1", "0xa2"],
		chainId: CHAIN,
		sentinels: ref === "P3" ? [{ file: "F1", now: "k1", imported: "k1" }] : [],
		...over,
	})

	test("passes siblings deriving the same accounts and the import the model recorded", () => {
		expect(checkVerify(w, [reading("P1"), reading("P2"), reading("P3")], b)).toEqual([])
	})

	test.each([
		["siblings diverging at their second account", [reading("P1"), reading("P2", { addresses: ["0xa1", "0xb2"] }), reading("P3")]],
		["an imported account left out", [reading("P1"), reading("P2"), reading("P3", { sentinels: [] })]],
		[
			"an imported account exporting another key",
			[reading("P1"), reading("P2"), reading("P3", { sentinels: [{ file: "F1", now: "k2", imported: "k1" }] })],
		],
	] as const)("fails %s", (label, readings) => {
		expect(shown(`O6 ${label}`, checkVerify(w, readings as never, b)).length).toBeGreaterThan(0)
	})
})

describe("O6, a restore of a deleted profile's backup", () => {
	const w = world([
		pw,
		{ action: "exportBackup", params: { file: "F1" } },
		{ action: "createPassword", params: { ref: "P2", name: "y", password: "S2", double: false } },
		{ action: "lock", params: {} },
		{ action: "switchProfile", params: { to: "P1" } },
		{ action: "unlockPassword", params: { target: "P1", variant: "right" } },
		{ action: "deleteProfile", params: { via: "settings" } },
		{ action: "importBackup", params: { file: "F1", variant: "right", ref: "P3", password: "S3" } },
	])
	const b = bind([
		["P2", P2],
		["P3", P1],
	])
	// P3's own first read is the wrong wallet, so only its deleted source's accounts can catch it.
	b.addresses.set("P1", on(["0xa1"]))
	b.addresses.set("P3", on(["0xf9"]))
	const reading = (ref: "P2" | "P3", addresses: string[]) => ({
		ref,
		wrongRefused: true,
		wrongWrote: [],
		opened: true,
		addresses,
		chainId: CHAIN,
		sentinels: [],
	})

	test("passes a restore deriving its deleted source's accounts", () => {
		const right = bind([
			["P2", P2],
			["P3", P1],
		])
		right.addresses.set("P1", on(["0xa1"]))
		right.addresses.set("P3", on(["0xa1"]))
		expect(checkVerify(w, [reading("P2", ["0xb1"]), reading("P3", ["0xa1"])], right)).toEqual([])
	})

	test("fails a restore deriving another wallet's accounts", () => {
		const v = checkVerify(w, [reading("P2", ["0xb1"]), reading("P3", ["0xf9"])], b)
		expect(shown("O6 a restore deriving another wallet than its deleted source", v).length).toBeGreaterThan(0)
	})
})

describe("O6, profiles sharing a passkey and a passkey profile's imports", () => {
	const w = world([
		pw,
		{ action: "exportAccountFile", params: { file: "F1", which: { derivedIndex: 0 } } },
		{ action: "createPasskey", params: { ref: "P2", name: "y", credential: "K1", double: false } },
		{ action: "importAccountFile", params: { file: "F1" } },
		{ action: "createPasskey", params: { ref: "P3", name: "z", credential: "K1", double: false } },
	])
	const b = bind([
		["P1", P1],
		["P2", P2],
		["P3", "cccc3333"],
	])
	b.addresses.set("P1", on(["0xa1"]))
	b.addresses.set("P2", on(["0xb1"]))
	b.addresses.set("P3", on(["0xc1"]))
	const reading = (ref: "P1" | "P2" | "P3", over: object = {}) => ({
		ref,
		wrongRefused: true,
		wrongWrote: [],
		opened: true,
		addresses: [{ P1: "0xa1", P2: "0xb1", P3: "0xc1" }[ref]],
		chainId: CHAIN,
		sentinels: ref === "P2" ? [{ file: "F1", now: "k1", imported: "k1" }] : [],
		...over,
	})

	test("passes two profiles on one passkey deriving their own phrases' accounts, and a passkey profile's re-export", () => {
		expect(w.profiles.filter((x) => x.credential === "K1").map((x) => x.ref)).toEqual(["P2", "P3"])
		expect(checkVerify(w, [reading("P1"), reading("P2"), reading("P3")], b)).toEqual([])
	})

	test.each([
		[
			"a passkey profile's imported account missing from its re-export",
			[reading("P1"), reading("P2", { sentinels: [] }), reading("P3")],
		],
		[
			"a passkey profile's imported account re-exporting another key",
			[reading("P1"), reading("P2", { sentinels: [{ file: "F1", now: "k2", imported: "k1" }] }), reading("P3")],
		],
	] as const)("fails %s", (label, readings) => {
		expect(shown(`O6 ${label}`, checkVerify(w, readings as never, b)).length).toBeGreaterThan(0)
	})

	test("fails two profiles on one passkey deriving one account, each as first read", () => {
		const keyed = bind([
			["P1", P1],
			["P2", P2],
			["P3", "cccc3333"],
		])
		keyed.addresses.set("P1", on(["0xa1"]))
		keyed.addresses.set("P2", on(["0xb1"]))
		keyed.addresses.set("P3", on(["0xb1"]))
		const found = shown(
			"O6 two profiles on one passkey deriving one account",
			checkVerify(w, [reading("P1"), reading("P2"), reading("P3", { addresses: ["0xb1"] })], keyed),
		)
		expect(found.map((v) => v.message)).toEqual([
			`P2 and P3 hold different phrases but both derive 0xb1 on chain ${CHAIN}`,
			`P3 and P2 hold different phrases but both derive 0xb1 on chain ${CHAIN}`,
		])
	})
})

describe("O7, leaks", () => {
	const clean: StructureReading = {
		unsealedRows: [],
		unframedSlots: [],
		prfSalt: [],
		exports: [{ file: "F1", opensWithOwn: true, refusesOther: true }],
	}

	test("an opened file excepts only what it carries by design", () => {
		const backup = carriedBy({ ref: "F2", kind: "backup", phrase: "W2", imported: ["F1"] })
		expect(["W2/entropy-b64", "W2/words", "F1/signing-key"].filter(backup)).toEqual(["W2/entropy-b64", "W2/words", "F1/signing-key"])
		const leaked = ["W1/entropy-b64", "S2/password", "F3/signing-key", "F2/signing-key"].filter((n) => !backup(n))
		console.log(`[break] O7 needles a backup does not carry: ${leaked.join(", ")}`)
		expect(leaked).toHaveLength(4)
		const account = carriedBy({ ref: "F1", kind: "account", phrase: "W1", imported: [] })
		expect(["F1/signing-key", "F1/signing-key-b64", "W1/entropy-b64"].filter(account)).toEqual(["F1/signing-key", "F1/signing-key-b64"])
	})

	test("passes a clean store, and prfSalt in a passkey row", () => {
		expect(checkLeaks([], clean, new Set())).toEqual([])
		expect(checkLeaks([], { ...clean, prfSalt: [`local:nulo:core:profiles@${P1}`] }, new Set([P1]))).toEqual([])
	})

	test.each([
		["a password in session storage", [{ where: "session:nulo:core:session", needle: "S1/password" }], clean],
		["phrase entropy in a log line", [{ where: "log:42", needle: "W1/entropy-hex" }], clean],
		["a sealed family's plaintext row", [], { ...clean, unsealedRows: ["nulo:core:accounts@x"] }],
		["an unframed slot", [], { ...clean, unframedSlots: [`${P1}.secret`] }],
		["prfSalt in a backup", [], { ...clean, prfSalt: ["file:F1"] }],
		["prfSalt in a password row", [], { ...clean, prfSalt: [`local:nulo:core:profiles@${P2}`] }],
		["a backup its file password does not open", [], { ...clean, exports: [{ file: "F1", opensWithOwn: false, refusesOther: true }] }],
		["a backup another password opens", [], { ...clean, exports: [{ file: "F1", opensWithOwn: true, refusesOther: false }] }],
	] as const)("fails %s", (label, hits, s) => {
		expect(shown(`O7 ${label}`, checkLeaks(hits as never, s as StructureReading, new Set([P1]))).length).toBeGreaterThan(0)
	})

	test("finds each needle by name and ignores a value too short to be one", () => {
		const needles = [
			{ name: "S1/password", value: "Chaos-pw-0123456789" },
			{ name: "short", value: "abc" },
		]
		expect(findNeedles('{"x":"Chaos-pw-0123456789"}', needles)).toEqual(["S1/password"])
		expect(findNeedles("abc", needles)).toEqual([])
	})
})

describe("the start state", () => {
	test("is a fresh install under strict mode", () => {
		expect(startWorld("empty")).toMatchObject({ device: { strict: true }, profiles: [], session: { kind: "locked" } })
	})
})

describe("O5, the outcome and the refusal's title", () => {
	const earlier = { outcomes: ["refused" as const], shows: EARLIER_TITLE }

	test("passes the outcome the model allows under the title it names", () => {
		expect(checkOutcome("importEarlierBackup", earlier, { outcome: "refused", shows: EARLIER_TITLE })).toEqual([])
		expect(checkOutcome("lock", { outcomes: ["committed"] }, { outcome: "committed" })).toEqual([])
	})

	test.each([
		["an earlier backup offered for restore", { outcome: "committed" as const, shows: undefined }],
		["an earlier backup refused as unreadable", { outcome: "refused" as const, shows: "Wrong password or corrupted backup" }],
		["an earlier backup refused with no title read", { outcome: "refused" as const, shows: undefined }],
	])("fails %s", (label, seen) => {
		expect(shown(`O5 ${label}`, checkOutcome("importEarlierBackup", earlier, seen)).length).toBeGreaterThan(0)
	})
})

describe("O6, a retired profile", () => {
	const b = bind([
		["P1", P1],
		["P2", P2],
	])
	const w = startWorld("pre-update-retired")
	const calls = Object.fromEntries(RETIRED_REFUSALS.map((c) => [c, "retired"]))
	const openable = {
		ref: "P1" as const,
		wrongRefused: true,
		wrongWrote: [],
		opened: true,
		addresses: ["0xa1"],
		chainId: CHAIN,
		sentinels: [],
	}
	const probe = {
		ref: "P2" as const,
		wrongRefused: true,
		wrongWrote: [] as string[],
		opened: false,
		addresses: [],
		chainId: 0,
		sentinels: [],
		retired: { setupAgain: true, unlockOffered: false, calls },
	}
	b.addresses.set("P1", on(["0xa1"]))

	test("passes a retired profile refused on every call of the matrix, with no write", () => {
		expect(checkVerify(w, [openable, probe], b)).toEqual([])
	})

	test.each([
		["a retired profile that opened", { ...probe, opened: true }],
		[
			"a half-opened retired profile, its phrase exported",
			{ ...probe, retired: { ...probe.retired, calls: { ...calls, exportMnemonic: "answered" } } },
		],
		[
			"a retired profile refused under another error",
			{ ...probe, retired: { ...probe.retired, calls: { ...calls, unlockProfile: "refused: Invalid password" } } },
		],
		["a retired call never made", { ...probe, retired: { ...probe.retired, calls: { ...calls, finalizeRestore: undefined } } }],
		["a retired lock screen offering an unlock", { ...probe, retired: { ...probe.retired, unlockOffered: true } }],
		["a retired lock screen without Set up again", { ...probe, retired: { ...probe.retired, setupAgain: false } }],
		["a probe that wrote", { ...probe, wrongWrote: ["nulo:core:profiles@bbbb2222"] }],
		["a retired profile verified as openable", { ...probe, retired: undefined, opened: false }],
	] as const)("fails %s", (label, reading) => {
		expect(shown(`O6 ${label}`, checkVerify(w, [openable, reading as never], b)).length).toBeGreaterThan(0)
	})

	test("fails an openable profile probed as retired", () => {
		expect(
			shown("O6 an openable profile probed as retired", checkVerify(w, [{ ...openable, retired: probe.retired }, probe], b)).length,
		).toBeGreaterThan(0)
	})
})

describe("O1, the lock screen on a retired profile", () => {
	const b = bind([
		["P1", P1],
		["P2", P2],
	])
	const w = startWorld("pre-update-retired")
	const on = (lockScreen: { setupAgain: boolean; unlockOffered: boolean }) =>
		({ pages: [{ label: "anchor", route: "/popup/auth", anchor: true, lockScreen }], protectedCallRefused: true }) as SessionReading

	test("passes Set up again with no unlock", () => {
		expect(checkSession(w, on({ setupAgain: true, unlockOffered: false }), b)).toEqual([])
	})

	test.each([
		["an unlock offered to a retired profile", { setupAgain: true, unlockOffered: true }],
		["no Set up again on a retired profile", { setupAgain: false, unlockOffered: false }],
	])("fails %s", (label, screen) => {
		expect(shown(`O1 ${label}`, checkSession(w, on(screen), b)).length).toBeGreaterThan(0)
	})

	test.each([
		["Set up again on an openable profile", { setupAgain: true, unlockOffered: true }],
		["an openable profile's lock screen offering no unlock", { setupAgain: false, unlockOffered: false }],
	])("fails %s", (label, screen) => {
		const onP1 = { ...w, selected: "P1" as const }
		expect(shown(`O1 ${label}`, checkSession(onP1, on(screen), b)).length).toBeGreaterThan(0)
	})

	test("passes an openable profile's lock screen offering its unlock", () => {
		expect(checkSession({ ...w, selected: "P1" as const }, on({ setupAgain: false, unlockOffered: true }), b)).toEqual([])
	})
})

describe("the pre-update start from a release whose passkey the candidate retires", () => {
	const b = bind([
		["P1", P1],
		["P2", P2],
	])
	const w = startWorld("pre-update-retired")
	const rowP1 = `{"id":"${P1}","name":"Main","type":"password"}`
	const rowP2 = `{"id":"${P2}","name":"Chaos 1","type":"passkey"}`
	const released = { [`nulo:core:profiles@${P1}`]: rowP1, [`nulo:core:profiles@${P2}`]: rowP2 }
	const listed = [
		{ id: P1, name: "Main", type: "password", retired: false },
		{ id: P2, name: "Chaos 1", type: "passkey", retired: true },
	]

	test("passes both release rows kept byte for byte and listed, the passkey one as retired", () => {
		expect(checkPreUpdate(w, { released, updated: { ...released }, listed, onAuth: true }, b)).toEqual([])
	})

	test.each([
		["a release row missing after the update", { released, updated: { [`nulo:core:profiles@${P1}`]: rowP1 }, listed, onAuth: true }, b],
		[
			"a release row rewritten by the update",
			{ released, updated: { ...released, [`nulo:core:profiles@${P2}`]: `${rowP2} ` }, listed, onAuth: true },
			b,
		],
		[
			"a start with a row missing",
			{ released: { [`nulo:core:profiles@${P1}`]: rowP1 }, updated: { [`nulo:core:profiles@${P1}`]: rowP1 }, listed, onAuth: true },
			b,
		],
		[
			"a retired row listed as openable",
			{ released, updated: { ...released }, listed: [listed[0], { ...listed[1], retired: false }], onAuth: true },
			b,
		],
		["a retired row not listed", { released, updated: { ...released }, listed: [listed[0]], onAuth: true }, b],
		["a profile bound to no release row", { released, updated: { ...released }, listed, onAuth: true }, bind([["P1", P1]])],
		["a start off the lock screen", { released, updated: { ...released }, listed, onAuth: false }, b],
	] as const)("fails %s", (label, r, bindings) => {
		expect(shown(`start ${label}`, checkPreUpdate(w, r as never, bindings)).length).toBeGreaterThan(0)
	})
})

describe("the pre-update start from a release whose passkey still unlocks", () => {
	const K1 = "Y3JlZGVudGlhbC1vbmU="
	const b = bind([
		["P1", P1],
		["P2", P2],
	])
	b.credentials.set("K1", K1)
	const w = startWorld("pre-update-unlocks")
	const released = {
		[`nulo:core:profiles@${P1}`]: `{"id":"${P1}","name":"Main","type":"password"}`,
		[`nulo:core:profiles@${P2}`]: `{"id":"${P2}","name":"Chaos 1","type":"passkey"}`,
	}
	const listed = [
		{ id: P1, name: "Main", type: "password", retired: false },
		{ id: P2, name: "Chaos 1", type: "passkey", retired: false },
	]
	const reading = (credentialId = K1): ProfileReading => ({
		listed,
		rows: [
			{ keyId: P1, id: P1, name: "Main", type: "password", fields: [...PROFILE_ROW_FIELDS.password] },
			{ keyId: P2, id: P2, name: "Chaos 1", type: "passkey", fields: [...PROFILE_ROW_FIELDS.passkey], credentialId },
		],
	})
	const on = (lockScreen: { setupAgain: boolean; unlockOffered: boolean }) =>
		({ pages: [{ label: "anchor", route: "/popup/auth", anchor: true, lockScreen }], protectedCallRefused: true }) as SessionReading

	test("passes both rows kept and listed openable, the passkey row naming the credential bound to K1", () => {
		expect(checkPreUpdate(w, { released, updated: { ...released }, listed, onAuth: true }, b)).toEqual([])
		expect(checkProfiles(w, reading(), b)).toEqual([])
	})

	test("fails the passkey row listed as retired", () => {
		const r = { released, updated: { ...released }, listed: [listed[0], { ...listed[1], retired: true }], onAuth: true }
		const v = shown("start a live passkey row listed as retired", checkPreUpdate(w, r, b))
		expect(v.map((x) => x.message)).toEqual(["P2 is listed as retired after the update"])
	})

	test("fails the passkey row naming another credential than the one bound to K1", () => {
		const v = shown("O2 the release's row naming another credential", checkProfiles(w, reading("b3RoZXI="), b))
		expect(v.map((x) => x.message)).toEqual(["P2's row names another credential than K1"])
	})

	test("passes its lock screen offering an unlock with no Set up again, and fails Set up again on it", () => {
		expect(checkSession(w, on({ setupAgain: false, unlockOffered: true }), b)).toEqual([])
		expect(
			shown("O1 Set up again on a passkey that unlocks", checkSession(w, on({ setupAgain: true, unlockOffered: true }), b)).length,
		).toBeGreaterThan(0)
	})
})

describe("O7, the passkey's output and its salt", () => {
	const clean: StructureReading = { unsealedRows: [], unframedSlots: [], prfSalt: [], exports: [] }
	const home = new Map([["P2/prf-salt", `local:nulo:core:profiles@${P2}`]])

	test("passes a profile's prfSalt value in its own row", () => {
		expect(checkLeaks([{ where: `local:nulo:core:profiles@${P2}`, needle: "P2/prf-salt" }], clean, new Set([P2]), home)).toEqual([])
	})

	test.each([
		["a prfSalt value under another key", [{ where: "local:nulo:core:config@x", needle: "P2/prf-salt" }]],
		["a prfSalt value in another profile's row", [{ where: `local:nulo:core:profiles@${P1}`, needle: "P2/prf-salt" }]],
		["the passkey's output in a log line", [{ where: "log:7", needle: "prf-0/b64" }]],
		["the passkey's output in session storage", [{ where: "session:nulo:core:session", needle: "prf-0/hex" }]],
	] as const)("fails %s", (label, hits) => {
		expect(shown(`O7 ${label}`, checkLeaks(hits as never, clean, new Set([P2]), home)).length).toBeGreaterThan(0)
	})

	test.each([
		["a passkey profile's backup that its file password does not open", { file: "F2", opensWithOwn: false, refusesOther: true }],
		["a passkey profile's backup that another file password opens", { file: "F2", opensWithOwn: true, refusesOther: false }],
	] as const)("fails %s", (label, e) => {
		expect(shown(`O7 ${label}`, checkLeaks([], { ...clean, exports: [e] }, new Set([P2]))).length).toBeGreaterThan(0)
	})
})
