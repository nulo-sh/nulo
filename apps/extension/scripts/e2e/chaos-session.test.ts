import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, test } from "vitest"
import {
	type ActionRecord,
	bindingOf,
	boundValue,
	checkRowsAgree,
	checkSessionRelation,
	compareReplay,
	type EndState,
	findingKey,
	maskIds,
	noteProfiles,
	pauseBefore,
	replayedFile,
	secretFieldKind,
} from "../../tests/e2e/helpers/chaos-session/checks"
import { isLaunchProfile, ownedBy, profileDirOf, SESSION_ENV } from "../../tests/e2e/helpers/chaos-session/processes"
import {
	CommandRefused,
	cmdFile,
	DeadlineExceeded,
	damaged,
	HeldDir,
	holdSessionDirs,
	makeSessionDirs,
	newSessionId,
	parseCommandArgs,
	publishCommand,
	publishFile,
	QUEUE_DIR,
	readCommand,
	readInside,
	SESSION_FILE,
	sessionDir,
	VERB_DEADLINE_MS,
	validateCommand,
	withDeadline,
	writeOwn,
} from "../../tests/e2e/helpers/chaos-session/protocol"
import { PROFILE_ROW_FIELDS, type ProfileReading, type SessionReading } from "../../tests/e2e/helpers/profile-chaos/checkers"
import { runnerEnv } from "./chaos-session"

const ROOT = mkdtempSync(path.join(tmpdir(), "nulo-chaos-session-test-"))
afterAll(() => rmSync(ROOT, { recursive: true, force: true }))

/** A fresh session directory under `ROOT`, as `start` makes one. */
function newSession(): string {
	const dir = path.join(ROOT, newSessionId("unit"))
	makeSessionDirs(dir)
	writeFileSync(path.join(dir, SESSION_FILE), "{}")
	return dir
}

/** The refusal `run` throws, printed so the gate's output shows each one failing. */
function refusal(label: string, run: () => unknown): string {
	try {
		run()
	} catch (err) {
		if (!(err instanceof CommandRefused)) throw err
		console.log(`[refused] ${label}: ${err.message}`)
		return err.message
	}
	throw new Error(`${label} was accepted`)
}

describe("a command", () => {
	test.each([
		["an unknown verb", { verb: "eval" }, /unknown verb/],
		["a testid that could leave its attribute selector", { verb: "click", testid: 'a"],[x="' }, /not a valid testid/],
		["a page that is no page id", { verb: "snapshot", page: "../p0" }, /not a valid page/],
		["a key outside the list", { verb: "press", key: "Control+w" }, /key must be one of/],
		["a route that is no extension route", { verb: "open", surface: "popup", route: "//evil.example/x" }, /not a valid route/],
		["an outside surface", { verb: "open", surface: "https://example.com" }, /popup or onboarding/],
		["a value with a NUL", { verb: "fill", testid: "a", value: "x\0y" }, /holds a NUL/],
		["a value past its length", { verb: "fill", testid: "a", value: "x".repeat(2_001) }, /longer than 2000/],
		["a deadline below the floor", { verb: "click", testid: "a", deadlineMs: 10 }, /deadline must be an integer from 250/],
		["a deadline past the verb's", { verb: "click", testid: "a", deadlineMs: VERB_DEADLINE_MS.click + 1 }, /deadline must be/],
		["a field the verb does not take", { verb: "snapshot", file: "x" }, /snapshot takes no file/],
		["an absolute file", { verb: "pick-file", testid: "a", file: "/etc/passwd" }, /relative to the session directory/],
		["a file that climbs out", { verb: "pick-file", testid: "a", file: "downloads/../../x" }, /leaves the session directory/],
		["a passkey fault outside the list", { verb: "passkey", fault: "forge" }, /passkey takes/],
		["another profile's passkey with no profile named", { verb: "passkey", fault: "other" }, /profile must be a string/],
		["do's file symbol that is a path", { verb: "do", action: "exportBackup", params: { file: "../../x" } }, /not a valid symbol/],
		["do's name that is a path", { verb: "do", action: "rename", params: { name: "a/b" } }, /not a valid word/],
		["do's params nested too deep", { verb: "do", action: "x", params: { a: { b: { c: { d: 1 } } } } }, /nest too deep/],
		["do's params holding a list", { verb: "do", action: "x", params: { a: [1] } }, /unsupported value/],
		["a flag on a verb that takes none", { verb: "fill", testid: "a", value: "v", now: true }, /fill takes no now/],
	])("refuses %s", (label, raw, why) => {
		expect(refusal(label, () => validateCommand(raw))).toMatch(why)
	})

	test("takes each verb's valid form, with the anchor and the verb's deadline by default", () => {
		expect(validateCommand({ verb: "click", testid: "register-submit-btn", nth: 1, now: true })).toEqual({
			verb: "click",
			testid: "register-submit-btn",
			nth: 1,
			now: true,
			page: "p0",
			deadlineMs: VERB_DEADLINE_MS.click,
		})
		expect(
			validateCommand({ verb: "do", action: "exportAccountFile", params: { file: "F2", which: { derivedIndex: 0 } } }),
		).toMatchObject({
			params: { file: "F2", which: { derivedIndex: 0 } },
		})
		expect(validateCommand({ verb: "passkey", fault: "other", profile: "Chaos 2", page: "p3", deadlineMs: 250 })).toMatchObject({
			profile: "Chaos 2",
			page: "p3",
			deadlineMs: 250,
		})
	})

	test.each([
		["a missing value", ["fill", "a"], /usage: fill <testid> <value>/],
		["a flag with no value", ["click", "a", "--deadline"], /--deadline needs a value/],
		["a flag value that is no integer", ["click", "a", "--nth", "-1"], /--nth takes a non-negative integer/],
		["do's params that are no JSON", ["do", "lock", "{x"], /not JSON/],
	])("parses the argv: refuses %s", (label, argv, why) => {
		expect(refusal(label, () => parseCommandArgs(argv))).toMatch(why)
	})

	test("parses the argv into the command the file would hold", () => {
		expect(parseCommandArgs(["fill", "auth-password-input", "two words", "--page", "p2", "--deadline", "5000"])).toEqual({
			verb: "fill",
			testid: "auth-password-input",
			value: "two words",
			page: "p2",
			deadlineMs: 5000,
		})
		expect(
			parseCommandArgs(["pick-file", "import-file-btn", "downloads/1-backup.json.gz", "--truncate", "40", "--flip", "3"]),
		).toMatchObject({
			file: "downloads/1-backup.json.gz",
			truncate: 40,
			flip: 3,
		})
		expect(parseCommandArgs(["click", "x", "--now"])).toMatchObject({ now: true })
	})
})

describe("the session directory", () => {
	test("is found only directly under the root, named as a session, holding its record", () => {
		const dir = newSession()
		expect(sessionDir(ROOT, dir)).toBe(dir)
		const outside = mkdtempSync(path.join(tmpdir(), "nulo-chaos-outside-"))
		const named = path.join(outside, newSessionId("unit"))
		mkdirSync(named)
		writeFileSync(path.join(named, SESSION_FILE), "{}")
		const link = path.join(ROOT, newSessionId("link"))
		symlinkSync(named, link)
		const bare = path.join(ROOT, newSessionId("bare"))
		mkdirSync(bare)
		expect(refusal("a session directory outside the root", () => sessionDir(ROOT, named))).toMatch(/no session directory under/)
		expect(refusal("a link under the root to a directory outside it", () => sessionDir(ROOT, link))).toMatch(
			/no session directory under/,
		)
		expect(refusal("a directory named otherwise", () => sessionDir(ROOT, path.join(dir, QUEUE_DIR)))).toMatch(
			/no session directory under/,
		)
		expect(refusal("a directory with no record", () => sessionDir(ROOT, bare))).toMatch(/holds no session.json/)
		rmSync(outside, { recursive: true, force: true })
	})

	test("pick-file reads a regular file inside it and nothing a link or a directory reaches", () => {
		const dir = newSession()
		const outside = mkdtempSync(path.join(tmpdir(), "nulo-chaos-outside-"))
		writeFileSync(path.join(outside, "secret"), "outside")
		writeFileSync(path.join(dir, "downloads", "1-backup.json"), "inside")
		symlinkSync(path.join(outside, "secret"), path.join(dir, "downloads", "link"))
		symlinkSync(outside, path.join(dir, "files", "away"))
		expect(readInside(dir, "downloads/1-backup.json").toString()).toBe("inside")
		expect(refusal("a link as the file", () => readInside(dir, "downloads/link"))).toMatch(/cannot be opened: ELOOP/)
		expect(refusal("a file through a linked directory", () => readInside(dir, "files/away/secret"))).toMatch(/resolves outside/)
		expect(refusal("a directory", () => readInside(dir, "downloads"))).toMatch(/not a regular file/)
		execFileSync("mkfifo", [path.join(dir, "files", "fifo")])
		expect(refusal("a FIFO, which would block the read", () => readInside(dir, "files/fifo"))).toMatch(/not a regular file/)
		// A file renamed out after the open still names its new place through the descriptor.
		expect(
			refusal("a file whose descriptor names a place outside", () =>
				readInside(dir, "downloads/1-backup.json", () => path.join(outside, "secret")),
			),
		).toMatch(/resolves outside/)
		rmSync(outside, { recursive: true, force: true })
	})

	test("the session writes only new files, under names it cleaned", () => {
		const dir = newSession()
		const dirs = holdSessionDirs(dir)
		expect(writeOwn(dirs, "downloads", "3-../../nulo-backup.json.gz", "x")).toBe(path.join("downloads", "3-.._.._nulo-backup.json.gz"))
		expect(() => writeOwn(dirs, "downloads", "3-../../nulo-backup.json.gz", "y")).toThrow(/EEXIST/)
		symlinkSync(path.join(ROOT, "elsewhere"), path.join(dir, "screenshots", "4-p0.png"))
		expect(() => writeOwn(dirs, "screenshots", "4-p0.png", "z")).toThrow(/EEXIST/)
		expect(existsSync(path.join(ROOT, "elsewhere"))).toBe(false)
		dirs.close()
	})

	test("the session writes into the directories it holds, whatever replaces them later", () => {
		const dir = newSession()
		const dirs = holdSessionDirs(dir)
		const outside = mkdtempSync(path.join(ROOT, "outside-"))
		renameSync(path.join(dir, "screenshots"), path.join(dir, "moved"))
		symlinkSync(outside, path.join(dir, "screenshots"))
		writeOwn(dirs, "screenshots", "5-p0.png", "png")
		expect(readdirSync(outside)).toEqual([])
		expect(readFileSync(path.join(dir, "moved", "5-p0.png"), "utf8")).toBe("png")
		dirs.close()
		expect(() => holdSessionDirs(dir)).toThrow(/ELOOP|ENOTDIR/)
	})

	test("pick-file damages its copy as asked, and refuses a flip past the end", () => {
		const bytes = Uint8Array.from([1, 2, 3, 4])
		expect([...damaged(bytes, 2)]).toEqual([1, 2])
		expect([...damaged(bytes, undefined, 1)]).toEqual([1, 0xfd, 3, 4])
		expect([...bytes]).toEqual([1, 2, 3, 4])
		expect(refusal("a flip past the end", () => damaged(bytes, 2, 3))).toMatch(/past the file's 2 bytes/)
	})
})

describe("the queue", () => {
	test("numbers commands in publication order, each whole, and never reuses a number", () => {
		const dir = newSession()
		const q = holdSessionDirs(dir).q
		const sent = [1, 2, 3].map((i) => publishCommand(dir, validateCommand({ verb: "report", text: `r${i}` })))
		expect(sent).toEqual([1, 2, 3])
		expect(readdirSync(path.join(dir, QUEUE_DIR)).filter((f) => f.startsWith("."))).toEqual([])
		expect([1, 2, 3].map((n) => readCommand(q, n))).toEqual(
			[1, 2, 3].map((i) => ({ cmd: { verb: "report", text: `r${i}`, page: "p0", deadlineMs: VERB_DEADLINE_MS.report } })),
		)
		// Another writer took 4 first: the next publication takes 5, never replacing 4.
		writeFileSync(path.join(dir, QUEUE_DIR, cmdFile(4)), JSON.stringify({ verb: "end" }))
		expect(publishCommand(dir, validateCommand({ verb: "oracle" }))).toBe(5)
		expect(readCommand(q, 4)).toEqual({ cmd: { verb: "end", page: "p0", deadlineMs: VERB_DEADLINE_MS.end } })
		expect(readCommand(q, 6)).toBeUndefined()
		q.close()
	})

	test("the session refuses a published file that is no command, a link, a FIFO or a huge file", () => {
		const dir = newSession()
		const q = path.join(dir, QUEUE_DIR)
		writeFileSync(path.join(q, cmdFile(1)), "{not json")
		writeFileSync(path.join(q, cmdFile(2)), JSON.stringify({ verb: "click", testid: "a", deadlineMs: 1 }))
		writeFileSync(path.join(ROOT, "planted.json"), JSON.stringify({ verb: "end" }))
		symlinkSync(path.join(ROOT, "planted.json"), path.join(q, cmdFile(3)))
		execFileSync("mkfifo", [path.join(q, cmdFile(4))])
		writeFileSync(path.join(q, cmdFile(5)), " ".repeat(65 * 1024))
		const held = HeldDir.open(q)
		const read = [1, 2, 3, 4, 5].map((n) => readCommand(held, n))
		held.close()
		for (const r of read) console.log(`[refused] a queued file: ${JSON.stringify(r)}`)
		expect(read).toEqual([
			{ refused: "the command file is not JSON" },
			{ refused: expect.stringMatching(/deadline must be/) },
			{ refused: "the command file is a link" },
			{ refused: "the command file is not a regular file" },
			{ refused: expect.stringMatching(/is larger than/) },
		])
	})

	test("a result is published whole: a reader sees no file or the complete one", () => {
		const dir = newSession()
		const q = HeldDir.open(path.join(dir, QUEUE_DIR))
		publishFile(q, "1.res.json", '{"n":1}')
		expect(readdirSync(path.join(dir, QUEUE_DIR))).toEqual(["1.res.json"])
		publishFile(q, "1.res.json", '{"n":1,"again":true}')
		expect(readdirSync(path.join(dir, QUEUE_DIR))).toEqual(["1.res.json"])
		q.close()
	})
})

describe("a command's deadline", () => {
	test("ends the wait at the deadline while the late work runs on unobserved", async () => {
		let finish: (v: string) => void = () => {}
		const late = new Promise<string>((resolve, reject) => {
			finish = resolve
			setTimeout(() => reject(new Error("the late work fails after the deadline")), 80)
		})
		const t0 = Date.now()
		const err = await withDeadline(late, 30).catch((e: unknown) => e)
		expect(err).toBeInstanceOf(DeadlineExceeded)
		console.log(`[refused] a command past its deadline: ${(err as Error).message} after ${Date.now() - t0} ms`)
		await new Promise((r) => setTimeout(r, 100))
		finish("ignored")
	})

	test("passes the work's own result or failure when it beats the deadline", async () => {
		await expect(withDeadline(Promise.resolve("done"), 1_000)).resolves.toBe("done")
		await expect(withDeadline(Promise.reject(new Error("refused by the page")), 1_000)).rejects.toThrow("refused by the page")
	})
})

const listed = (id: string, type: string, name = id): ProfileReading["listed"][number] => ({ id, name, type })
const row = (id: string, type: string, fields: string[], name = id): ProfileReading["rows"][number] => ({
	keyId: id,
	id,
	name,
	type,
	fields,
})
const PASSWORD_FIELDS = [...PROFILE_ROW_FIELDS.password]

describe("the session's checks without a model", () => {
	const profiles: ProfileReading = { listed: [listed("a", "password"), listed("b", "passkey")], rows: [] }
	const open = (over: Partial<SessionReading>): SessionReading => ({
		row: { profile: "a", hasBearer: false, hasPasshash: false },
		active: "a",
		pages: [{ label: "p0", route: "/popup/general", anchor: true }],
		...over,
	})
	const locked = (over: Partial<SessionReading>): SessionReading => ({
		pages: [{ label: "p0", route: "/popup/auth", anchor: true }],
		protectedCallRefused: true,
		...over,
	})

	test.each([
		[
			"a row naming another profile",
			open({ row: { profile: "b", hasBearer: false, hasPasshash: false } }),
			false,
			/names b, not the active profile a/,
		],
		[
			"an active profile nobody lists",
			open({ active: "z", row: { profile: "z", hasBearer: false, hasPasshash: false } }),
			false,
			/z is not listed/,
		],
		[
			"a passkey session with a bearer",
			open({ active: "b", row: { profile: "b", hasBearer: true, hasPasshash: false } }),
			false,
			/passkey profile's session row holds a bearer/,
		],
		[
			"a bearer under strict mode",
			open({ row: { profile: "a", hasBearer: true, hasPasshash: false } }),
			true,
			/bearer with strict mode on/,
		],
		["a legacy passhash", open({ row: { profile: "a", hasBearer: false, hasPasshash: true } }), false, /legacy passhash/],
		[
			"an open session with the anchor on the lock screen",
			open({ pages: [{ label: "p0", route: "/popup/auth", anchor: true }] }),
			false,
			/open, but p0 shows/,
		],
		[
			"a locked wallet showing Home",
			locked({ pages: [{ label: "p1", route: "/popup/general", anchor: false }] }),
			false,
			/locked, but p1 shows/,
		],
		["a locked wallet that served a protected call", locked({ protectedCallRefused: false }), false, /was served/],
		[
			"a locked reading that tried no protected call",
			locked({ protectedCallRefused: undefined }),
			false,
			/no call that needs an open session/,
		],
		[
			"a password profile's row left after a lock",
			locked({ row: { profile: "a", hasBearer: false, hasPasshash: false } }),
			false,
			/session row for a remains/,
		],
	])("O1 fails %s", (label, reading, strict, why) => {
		const found = checkSessionRelation(reading, profiles, strict)
		console.log(`[break] O1 ${label}: ${found.map((v) => v.message).join(" | ")}`)
		expect(found.map((v) => v.message).join(" | ")).toMatch(why)
	})

	test("O1 passes an open password session with a bearer while strict is off, and a passkey row outliving a restart", () => {
		expect(checkSessionRelation(open({ row: { profile: "a", hasBearer: true, hasPasshash: false } }), profiles, false)).toEqual([])
		expect(checkSessionRelation(locked({ row: { profile: "b", hasBearer: false, hasPasshash: false } }), profiles, true)).toEqual([])
	})

	test.each([
		["a row nobody lists", { listed: [], rows: [row("a", "password", PASSWORD_FIELDS)] }, /stored but not listed/],
		["a listed profile with no row", { listed: [listed("a", "password")], rows: [] }, /listed but has no stored row/],
		[
			"a name the row does not hold",
			{ listed: [listed("a", "password", "Main")], rows: [row("a", "password", PASSWORD_FIELDS, "Other")] },
			/under another name/,
		],
		[
			"a field the method's row does not hold",
			{ listed: [listed("a", "password")], rows: [row("a", "password", [...PASSWORD_FIELDS, "credentialId"])] },
			/holds the fields/,
		],
		["an unknown method", { listed: [listed("a", "magic")], rows: [row("a", "magic", ["id"])] }, /unknown method magic/],
		[
			"a row under another id's key",
			{ listed: [listed("a", "password")], rows: [{ ...row("a", "password", PASSWORD_FIELDS), id: "b" }] },
			/names id b/,
		],
	])("O2 fails %s", (label, reading, why) => {
		const found = checkRowsAgree(reading)
		console.log(`[break] O2 ${label}: ${found.map((v) => v.message).join(" | ")}`)
		expect(found.map((v) => v.message).join(" | ")).toMatch(why)
	})

	test("O2 passes listed profiles that match their rows", () => {
		expect(
			checkRowsAgree({ listed: [listed("a", "password", "Main")], rows: [row("a", "password", PASSWORD_FIELDS, "Main")] }),
		).toEqual([])
	})

	test.each([
		["register-password-input", undefined, "password"],
		["import-full-backup-decrypt-password-input", "text", "password"],
		["current-password-input", undefined, "password"],
		["import-password-confirm-input", undefined, "password"],
		["import-seed-input", "text", "phrase"],
		["some-field", "password", "password"],
		["register-name-input", "text", undefined],
		["password-strength", undefined, undefined],
	])("a fill into %s (type %s) is a %s needle", (testid, type, kind) => {
		expect(secretFieldKind(testid, type)).toBe(kind)
	})
})

describe("the session's processes", () => {
	const env = (pairs: Record<string, string>) => () => new Map(Object.entries(pairs))
	const noArgs = () => [] as string[]
	const args =
		(...a: string[]) =>
		() =>
			a
	const profile = "/tmp/puppeteer_dev_chrome_profile-AbC123"
	const marks = { dir: "/c/s1", ext: "/c/.ext/s1", userDataDir: profile }
	test("are the processes naming its directory, its dist copy, or its browser's profile exactly", () => {
		expect(ownedBy(1, marks, env({ [SESSION_ENV]: "/c/s1" }), noArgs)).toEqual({ pid: 1, how: "environ" })
		expect(ownedBy(2, marks, () => "unreadable", args("chrome", "--load-extension=/c/.ext/s1"))).toEqual({ pid: 2, how: "cmdline" })
		// A renderer names no extension, only the profile its browser runs on.
		expect(ownedBy(3, marks, () => "unreadable", args("chrome", "--type=renderer", `--user-data-dir=${profile}`))).toEqual({
			pid: 3,
			how: "cmdline",
		})
		expect(ownedBy(4, marks, env({ [SESSION_ENV]: "/c/s10" }), noArgs)).toBeUndefined()
		expect(ownedBy(5, marks, () => "gone", args("chrome", "--load-extension=/c/.ext/s10"))).toBeUndefined()
		expect(ownedBy(6, marks, () => "gone", args("chrome", `--user-data-dir=${profile}9`))).toBeUndefined()
		expect(ownedBy(7, { ...marks, userDataDir: undefined }, () => "gone", args("chrome", `--user-data-dir=${profile}`))).toBeUndefined()
	})

	test("take a browser's profile only as a directory Puppeteer made for one launch", () => {
		expect(profileDirOf(["chrome", `--user-data-dir=${profile}`], "/tmp")).toBe(profile)
		expect(profileDirOf(["firefox", "--profile", "/tmp/puppeteer_dev_firefox_profile-x1"], "/tmp")).toBe(
			"/tmp/puppeteer_dev_firefox_profile-x1",
		)
		for (const dir of ["/var/lib/chrome-profile", "/tmp/puppeteer_dev_chrome_profile-../x", "/tmp/puppeteer_dev_chrome_profile-"])
			expect(isLaunchProfile(dir, "/tmp")).toBe(false)
	})

	test("start from the caller's environment without a GitHub token or a stray e2e switch", () => {
		const env = runnerEnv({ NULO_E2E_CHAOS: "1" }, { PATH: "/bin", GH_TOKEN: "t", GITHUB_TOKEN: "t", NULO_E2E_CHAOS_SEED: "7" })
		expect(env).toEqual({ PATH: "/bin", NULO_E2E_CHAOS: "1" })
	})
})

describe("a replay", () => {
	const shown = {
		n: 4,
		page: "p0",
		items: [
			{ testid: "phrase-grid-word", nth: 0, text: "abandon" },
			{ testid: "phrase-grid-word", nth: 1, text: "ability" },
			{ testid: "phrase-grid-word", nth: 2, text: "able" },
			{ testid: "profile-name", nth: 0, text: "Main" },
		],
	}

	test("binds a typed phrase to the snapshot it was read from, and fills the replay's words there", () => {
		const bound = bindingOf("ability able", [shown])
		expect(bound).toEqual({ snapshot: 4, page: "p0", testid: "phrase-grid-word", nths: [1, 2] })
		expect(bindingOf("Main", [shown])).toEqual({ snapshot: 4, page: "p0", testid: "profile-name", nths: [0] })
		expect(bindingOf("typed by hand", [shown])).toBeUndefined()
		// A value that differs from the join by a byte is a literal, filled as typed.
		for (const literal of [" Main ", "Main ", "ability  able", "ability\table", " ability able"])
			expect(bindingOf(literal, [shown])).toBeUndefined()
		const replayed = { ...shown, items: shown.items.map((i, k) => (k < 3 ? { ...i, text: `w${k}` } : i)) }
		expect(boundValue(bound as NonNullable<typeof bound>, replayed)).toBe("w1 w2")
	})

	test("compares findings by what they say, keeping the symbols the same commands name", () => {
		expect(findingKey("O7", "S1000012/password found in file:downloads/3-x.gz")).toBe(
			"O7 S1000012/password found in file:downloads/<n>-x.gz",
		)
		expect(findingKey("incomplete", "the passkey refuse fault armed on p1 met no prompt")).toContain("on p1 met")
		expect(findingKey("O2", "9e3dc5ac's row holds 4 fields")).toBe("O2 <id>'s row holds <n> fields")
		expect(findingKey("O7", "S1000012/password")).not.toBe(findingKey("O7", "S1000013/password"))
		expect(maskIds("#/popup/settings/networks/abcdefab")).toBe(maskIds("#/popup/settings/networks/e2fb77f7"))
		expect(maskIds("#/popup/settings/accounts")).toBe("#/popup/settings/accounts")
	})

	test("names profiles by the order the session first saw them, whatever order the wallet lists them in", () => {
		const a = { id: "x1", name: "Main", type: "password" }
		const b = { id: "y2", name: "Alt", type: "passkey" }
		const c = { id: "z3", name: "Main", type: "passkey" }
		const one = new Map<string, number>()
		noteProfiles(one, [a])
		noteProfiles(one, [b, a, c])
		const other = new Map<string, number>()
		noteProfiles(other, [{ ...a, id: "q9" }])
		noteProfiles(other, [
			{ ...c, id: "r8" },
			{ ...a, id: "q9" },
			{ ...b, id: "s7" },
		])
		expect([...one.values()]).toEqual([0, 1, 2])
		expect([one.get("x1"), one.get("y2"), one.get("z3")]).toEqual([other.get("q9"), other.get("s7"), other.get("r8")])
	})

	test("keeps the original's pause before each command, bounded", () => {
		const at = (n: number, at: number, elapsedMs: number): ActionRecord => ({ n, command: {}, status: "ok", at, elapsedMs })
		expect(pauseBefore(undefined, at(1, 5_000, 100))).toBe(0)
		expect(pauseBefore(at(1, 5_000, 100), at(2, 9_000, 1_000))).toBe(3_000)
		expect(pauseBefore(at(1, 5_000, 100), at(2, 5_500, 1_000))).toBe(0)
		expect(pauseBefore(at(1, 0, 0), at(2, 900_000, 0))).toBe(120_000)
		expect(pauseBefore(at(1, 5_000, 100), { n: 2, command: {}, status: "ok" })).toBe(0)
	})

	test("picks the replay's own download or copy of the same number", () => {
		const listing = (sub: string) =>
			sub === "downloads" ? ["1-Backup_Main_1792998639.gz", "12-Account.json"] : ["7-1-Backup_Main_1792998639.gz"]
		expect(replayedFile("downloads/1-Backup_Main_1700000000.gz", listing)).toBe("downloads/1-Backup_Main_1792998639.gz")
		expect(replayedFile("files/7-1-Backup_Main_1700000000.gz", listing)).toBe("files/7-1-Backup_Main_1792998639.gz")
		expect(replayedFile("downloads/2-missing.gz", listing)).toBe("downloads/2-missing.gz")
		expect(replayedFile("screenshots/3-p0.png", listing)).toBe("screenshots/3-p0.png")
	})

	const end: EndState = {
		pages: [{ id: "p0", route: "#/popup/general", testids: ["a", "b"] }],
		profiles: [{ name: "Main", type: "password" }],
		session: { open: true, profile: "Main" },
		unfiled: [],
		incomplete: [],
		filed: [],
	}
	const actions: ActionRecord[] = [
		{
			n: 1,
			command: { verb: "snapshot", page: "p0", deadlineMs: 15_000 },
			status: "ok",
			seen: { route: "#/popup/register", testids: ["x"] },
		},
		{
			n: 2,
			command: { verb: "fill", testid: "f", value: "old", page: "p0", deadlineMs: 15_000 },
			status: "ok",
			bound: { snapshot: 1, page: "p0", testid: "w", nths: [0] },
		},
	]

	test("of the same commands to the same end is the same", () => {
		const again = [actions[0], { ...actions[1], command: { ...actions[1].command, value: "new" } }]
		expect(compareReplay({ actions, end }, { actions: again, end })).toEqual([])
		const pick = (file: string): ActionRecord => ({
			n: 3,
			command: { verb: "pick-file", testid: "p", file, page: "p0", deadlineMs: 30_000 },
			status: "ok",
		})
		expect(
			compareReplay(
				{
					actions: [...actions, pick("downloads/1-Backup_1700000000.gz")],
					end: { ...end, unfiled: [findingKey("O2", "9e3dc5ac's row")] },
				},
				{
					actions: [...again, pick("downloads/1-Backup_1792998639.gz")],
					end: { ...end, unfiled: [findingKey("O2", "72ab9851's row")] },
				},
			),
		).toEqual([])
		expect(compareReplay({ actions: [pick("downloads/1-a.gz")], end }, { actions: [pick("downloads/2-a.gz")], end })).toHaveLength(1)
	})

	test.each([
		["a command sent otherwise", { actions: [actions[0], { ...actions[1], bound: undefined }], end }],
		["a status", { actions: [{ ...actions[0], status: "failed" }, actions[1]], end }],
		[
			"a snapshot that saw another screen",
			{ actions: [{ ...actions[0], seen: { route: "#/popup/auth", testids: ["x"] } }, actions[1]], end },
		],
		["a command it never served", { actions: [actions[0]], end }],
		["a command that came to another outcome", { actions: [actions[0], { ...actions[1], path: { outcome: "refused" } }], end }],
		[
			"a command whose checks found otherwise",
			{ actions: [actions[0], { ...actions[1], found: ["O1 locked, but p0 shows #/popup/general"] }], end },
		],
		["another route at the end", { actions, end: { ...end, pages: [{ ...end.pages[0], route: "#/popup/auth" }] } }],
		["a finding the original did not meet", { actions, end: { ...end, unfiled: ["O7 S<n>/password found in log:<n>"] } }],
		["another session at the end", { actions, end: { ...end, session: { open: false } as const } }],
	])("differs on %s", (label, replay) => {
		const diff = compareReplay({ actions, end }, replay)
		console.log(`[break] replay ${label}: ${diff.join(" | ")}`)
		expect(diff.length).toBeGreaterThan(0)
	})
})
