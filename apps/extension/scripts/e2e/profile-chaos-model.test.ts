import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { AUTH_ENTRY_ROUTES } from "@/popup/should-advance-to-general"
import { ProfileRowSchema } from "@/wallet/services/profile/profile-row"
import { STORED_SHAPES } from "@/wallet/storage/stored-shapes"
import {
	ADVANCES_ON_OPEN,
	ALLOWED_ERRORS,
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
	plan,
	planFromList,
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
	])("every planned step respects its preconditions over 1,000 seeds on %s, from either start", { timeout: 120_000 }, (_label, caps) => {
		for (const start of ["empty", "pre-update"] as const) {
			for (const seed of SEEDS) {
				const p = plan(seed, start, caps)
				const replayed = planFromList(listOf(p.steps), start, caps, seed)
				expect(replayed.steps.map((s) => s.expect)).toEqual(p.steps.map((s) => s.expect))
			}
		}
	})

	test("from the pre-update start, the retired profile is never opened, and is deleted and verified as retired", () => {
		const steps = SEEDS.flatMap((seed) => plan(seed, "pre-update", FIREFOX).steps)
		const opensP2 = steps.filter(({ expect: { next } }) => next.session.kind === "open" && next.session.ref === "P2")
		expect(opensP2).toEqual([])
		expect(steps.every((s) => s.expect.next.profiles.find((x) => x.ref === "P2")?.retired)).toBe(true)
		const retiredClause = steps.filter((s) => s.expect.sources.includes("decision:P86-11")).map((s) => s.action)
		expect(new Set(retiredClause)).toEqual(new Set(["deleteProfile", "verifyAll"]))
	})

	test("the same seed plans the same run from the pre-update start, and another start plans another", () => {
		for (const seed of SEEDS.slice(0, 50)) {
			expect(plan(seed, "pre-update", FIREFOX)).toEqual(plan(seed, "pre-update", FIREFOX))
			expect(plan(seed, "pre-update", FIREFOX).steps).not.toEqual(plan(seed, "empty", FIREFOX).steps)
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

	// A citation that no longer resolves would let a clause outlive the branch it names.
	test("every cited line holds the fragment its citation names", () => {
		expect(CITED.size).toBeGreaterThan(40)
		expect(citationMisses(CITED)).toEqual([])
	})

	test("every code source a plan or an allowlist names is a citation with its fragment", () => {
		const starts = ["empty", "pre-update"] as const
		const sources = new Set([
			...starts.flatMap((start) =>
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
		const wr = startWorld("pre-update")
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
		const source = "code:apps/extension/src/composables/full-backup-restore.ts:999"
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
			{ kind: "page-error" as const, page: "second", text: "Error: Profile locked" },
		]
		// The second page's rejection has no forwarded line of its own, so nothing vouches for it.
		expect(checkErrors(refused, []).violations.map((v) => v.known)).toEqual([1133, 1133, undefined])
		const lockedPage = (page: string): ErrorEntry => ({ kind: "page-error", page, text: "Error: Wallet locked" })
		const twice = checkErrors([refused[0] as ErrorEntry, lockedPage("anchor"), lockedPage("second")], []).violations
		expect(shown("O4 two page errors beside one forwarded rejection", twice).map((v) => v.known)).toEqual([1133, 1133, undefined])
		const unpaired = checkErrors([{ kind: "page-error", page: "anchor", text: "Error: Wallet locked" }], []).violations
		expect(shown("O4 a locked page error with no forwarded rejection beside it", unpaired)[0]?.known).toBeUndefined()
		const otherRefusal = checkErrors([{ kind: "page-error", page: "anchor", text: "Error: Wallet locked while x" }], []).violations
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
	const known: Violation = { oracle: "O4", message: "error log from ui: unclassified", known: 1132 }
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
	const w = startWorld("pre-update")
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
	const w = startWorld("pre-update")
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

describe("the pre-update start", () => {
	const b = bind([
		["P1", P1],
		["P2", P2],
	])
	const w = startWorld("pre-update")
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
