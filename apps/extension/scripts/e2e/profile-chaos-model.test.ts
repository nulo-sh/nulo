import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { AUTH_ENTRY_ROUTES } from "@/popup/should-advance-to-general"
import { ProfileRowSchema, STORED_SHAPES } from "@/wallet/storage/stored-shapes"
import {
	ADVANCES_ON_OPEN,
	ALLOWED_ERRORS,
	allowedFor,
	type Bindings,
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
	checkProfiles,
	checkSession,
	checkSettle,
	checkVerify,
	checkWrites,
	emptyBindings,
	type ErrorEntry,
	FAMILY_GROUPS,
	type FamilyEntry,
	familyOfKey,
	findNeedles,
	ownerOf,
	pageErrorText,
	PROFILE_ROW_FIELDS,
	type ProfileReading,
	type SessionReading,
	type StoredEntry,
	type StructureReading,
	type Violation,
	type WriteContext,
} from "../../tests/e2e/helpers/profile-chaos/checkers"
import {
	ACTIONS,
	type ActionName,
	type Caps,
	CATALOG,
	coverage,
	coverageLine,
	endsOf,
	type ListedStep,
	plan,
	planFromList,
	startWorld,
	type World,
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

const listOf = (steps: { action: ActionName; params: unknown }[]): ListedStep[] =>
	steps.map((s) => ({ action: s.action, params: s.params }) as ListedStep)

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
	])("every planned step respects its preconditions over 1,000 seeds on %s", (_label, caps) => {
		for (const seed of SEEDS) {
			const p = plan(seed, "empty", caps)
			const replayed = planFromList(listOf(p.steps), "empty", caps, seed)
			expect(replayed.steps.map((s) => s.expect)).toEqual(p.steps.map((s) => s.expect))
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
})

describe("a hand-trimmed list", () => {
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
		["a strict toggle on a passkey profile", [passkey, { action: "toggleStrict", params: {} }], "only to an open password profile"],
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
	])("is refused at %s", (_label, list, message) => {
		expect(() => planFromList(list as unknown as ListedStep[], "empty", CHROME)).toThrow(message)
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

	test("a passkey restore is refused while its credential is live and runs once its profile is deleted", () => {
		const exported = [passkey, { action: "exportBackup", params: { file: "F1" } }]
		const restore = { action: "importBackup", params: { file: "F1", variant: "right", ref: "P2", password: "S1" } }
		expect(planFromList([...exported, restore] as ListedStep[], "empty", CHROME).steps.at(-1)?.expect.outcomes).toEqual(["refused"])
		const after = run([...exported, { action: "deleteProfile", params: { via: "settings" } }, restore])
		expect(after.profiles.find((x) => x.ref === "P2")).toMatchObject({ method: "passkey", credential: "K1", deleted: false })
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

	test("the planner mints no more passkey credentials than the authenticator holds", () => {
		for (const seed of SEEDS.slice(0, 300)) {
			const minted = plan(seed, "empty", CHROME).steps.filter((s) => s.action === "createPasskey").length
			expect(minted, `seed ${seed}`).toBeLessThanOrEqual(CHROME.credentialSlots)
		}
	})

	test("a race's outcomes share one successor state", () => {
		const race = run([passkey, { action: "lock", params: {} }, { action: "raceLockDuringUnlock", params: {} }])
		expect(race.session).toEqual({ kind: "locked" })
	})

	test("an import that does not commit leaves the session it entered through the lock screen locked", () => {
		const second = { action: "createPasskey", params: { ref: "P2", name: "y", credential: "K2", double: false } }
		const restore = { action: "importBackup", params: { file: "F1", variant: "right", ref: "P3", password: "S3" } }
		const refused = planFromList(
			[passkey, { action: "exportBackup", params: { file: "F1" } }, second, restore] as ListedStep[],
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

	// A citation that no longer resolves would let a clause outlive the branch it names.
	test("every cited file exists and holds the cited line", () => {
		const cited = new Set(SEEDS.flatMap((seed) => plan(seed, "empty", NETWORK).steps.flatMap((s) => s.expect.sources)))
		for (const source of [...cited].filter((c) => c.startsWith("code:"))) {
			const [, file, line] = /^code:([^:]+)(?::(\d+))?$/.exec(source) ?? []
			const path = join(import.meta.dirname, "../..", file)
			expect(existsSync(path), source).toBe(true)
			if (line) expect(readFileSync(path, "utf8").split("\n")[Number(line) - 1]?.trim(), source).toBeTruthy()
		}
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
		listed: [{ id: P1, name: "Main", type: "password" }],
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
		["an extra profile listed", (r: ProfileReading) => r.listed.push({ id: P2, name: "Ghost", type: "password" })],
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

	test("the row fields are the schema's", () => {
		const shapes = Object.fromEntries(ProfileRowSchema.options.map((o) => [o.shape.type.value, Object.keys(o.shape).sort()]))
		expect({ password: [...PROFILE_ROW_FIELDS.password].sort(), passkey: [...PROFILE_ROW_FIELDS.passkey].sort() }).toEqual(shapes)
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
	])("fails %s", (label, c) => {
		expect(shown(`O3 ${label}`, checkWrites(c)).length).toBeGreaterThan(0)
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
		expect(ownerOf(entry("nulo:config", "x"))).toBeUndefined()
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

		test("passes at any step of a run with no node, and counts what it let through", () => {
			expect(checkErrors([refused, refused], [], allowedFor({ network: false }))).toEqual({
				violations: [],
				warns: {},
				allowed: { [GUARDED_NODE_REFUSAL.source]: 2 },
			})
		})

		test.each([
			["on a run a node answers", [refused], { network: true }],
			[
				"for an error log without the stand-in's text",
				[refusal('["Failed to fetch node info",{"message":"fetch failed"}]')],
				{ network: false },
			],
			["for a page error carrying the stand-in's text", [page("Error: no node answers a guarded e2e run")], { network: false }],
		] as const)("fails %s", (label, entries, caps) => {
			const verdict = checkErrors(entries as unknown as ErrorEntry[], [], allowedFor(caps))
			expect(shown(`O4 the refusal allowance ${label}`, verdict.violations).length).toBeGreaterThan(0)
		})
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
		for (const a of [...ALLOWED_ERRORS, GUARDED_NODE_REFUSAL]) {
			const [, file, line] = /^code:(\S+):(\d+)$/.exec(a.source) ?? []
			expect(file, a.source).toBeTruthy()
			const path = join(import.meta.dirname, "../../../..", file)
			expect(readFileSync(path, "utf8").split("\n")[Number(line) - 1]?.trim(), a.source).toBeTruthy()
			expect(a.reason.length).toBeGreaterThan(20)
		}
	})

	test("a filed finding's error line is marked with its issue; any other error line is not", () => {
		const fenced = (label: string) => ({
			kind: "log" as const,
			level: "error" as const,
			source: "execution",
			text: `["Failed to get ${label} FeeJuice balance",{"message":"pxe op rejected: profile x has no current incarnation (deleted or tombstoned)"}]`,
		})
		expect(checkErrors([fenced("public"), fenced("private")], []).violations.map((v) => v.known)).toEqual([1131, 1131])
		const afterLock = [
			{
				...fenced("private"),
				text: '["Failed to get private FeeJuice balance",{"name":"WalletLockedError","message":"Wallet locked"}]',
			},
			{
				...fenced("public"),
				text: '["Failed to get public FeeJuice balance",{"message":"PXE_STORE_KEY_MISSING: no store key provisioned for profile x"}]',
			},
		]
		expect(checkErrors(afterLock, []).violations.map((v) => v.known)).toEqual([1131, 1131])
		const other = checkErrors([{ ...fenced("public"), text: '["Failed to get public FeeJuice balance",{"message":"boom"}]' }], [])
		expect(shown("O4 an error line beside a filed one's text", other.violations)[0]?.known).toBeUndefined()
		const disconnect = {
			kind: "log" as const,
			level: "error" as const,
			source: "ui",
			text: '[{"name":"Error","message":"Client disconnected"}]',
		}
		expect(checkErrors([disconnect], []).violations[0]?.known).toBe(1132)
		const elsewhere = checkErrors([{ ...disconnect, source: "profile" }], []).violations
		expect(shown("O4 the disconnect line from another source", elsewhere)[0]?.known).toBeUndefined()
		const refused = [
			{
				kind: "log" as const,
				level: "error" as const,
				source: "ui",
				text: '["unhandled rejection",{"error":{"name":"Error","message":"Wallet locked"}}]',
			},
			{ kind: "page-error" as const, page: "anchor", text: "Error: Wallet locked" },
		]
		expect(checkErrors(refused, []).violations.map((v) => v.known)).toEqual([1133, 1133])
		const otherRefusal = checkErrors([{ kind: "page-error", page: "anchor", text: "Error: Wallet locked while x" }], []).violations
		expect(shown("O4 a refusal beside a filed one's text", otherRefusal)[0]?.known).toBeUndefined()
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

describe("the run's verdict", () => {
	const known: Violation = { oracle: "O4", message: "error log from execution: unclassified", known: 1131 }
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

describe("O6, verifyAll", () => {
	const b = bind([
		["P1", P1],
		["P2", P2],
	])
	b.addresses.set("P1", ["0xa1"])
	const w = world([
		pw,
		{ action: "revealPhrase", params: { variant: "right" } },
		{ action: "importPhrase", params: { ref: "P2", phrase: "W1", name: "n", password: "S2", duplicate: "confirm" } },
	])
	const ok = (ref: "P1" | "P2") => ({ ref, wrongRefused: true, wrongWrote: [], opened: true, addresses: ["0xa1"], sentinels: [] })

	test("passes two profiles of one phrase deriving one account", () => {
		expect(checkVerify(w, [ok("P1"), ok("P2")], b)).toEqual([])
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
		[
			"an imported account the model never recorded",
			[{ ...ok("P1"), sentinels: [{ file: "F1", now: "k1", imported: "k1" }] }, ok("P2")],
		],
	] as const)("fails %s", (label, readings) => {
		b.addresses.set("P2", ["0xa1"])
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
	b.addresses.set("P1", ["0xa1", "0xa2"])
	// P2's accounts as first read, before its second one existed: only a sibling check sees index 1.
	b.addresses.set("P2", ["0xa1"])
	b.addresses.set("P3", ["0xc1"])
	const reading = (ref: "P1" | "P2" | "P3", over: object = {}) => ({
		ref,
		wrongRefused: true,
		wrongWrote: [],
		opened: true,
		addresses: ref === "P3" ? ["0xc1"] : ["0xa1", "0xa2"],
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

describe("O7, leaks", () => {
	const clean: StructureReading = {
		unsealedRows: [],
		unframedSlots: [],
		prfSalt: [],
		exports: [{ file: "F1", opensWithOwn: true, refusesOther: true }],
	}

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
