import { describe, expect, test } from "bun:test"
import { assetNames, compareAssets, type LocalAsset, type PlanInput, parseShasums, planAttach, type RemoteAsset } from "./attach-assets"

const SHA = "a".repeat(40)
const LOCAL: LocalAsset[] = assetNames("1.2.3").map((name, i) => ({ name, sha256: String(i + 1).repeat(64) }))
const REMOTE: RemoteAsset[] = LOCAL.map((a, i) => ({ id: i + 10, name: a.name, digest: `sha256:${a.sha256}` }))

const input = (over: Partial<PlanInput>): PlanInput => ({
	tag: "v1.2.3",
	state: { kind: "absent" },
	local: LOCAL,
	workflowSha: SHA,
	tagSha: SHA,
	...over,
})

describe("planAttach", () => {
	test("publishes a new release as a draft first, and finishes an existing draft", () => {
		expect(planAttach(input({}))).toEqual({ action: "publish", createDraft: true })
		expect(planAttach(input({ state: { kind: "draft", id: 1, assets: [] } }))).toEqual({ action: "publish", createDraft: false })
	})

	test("ships a complete published release as it is, whatever commit this run builds", () => {
		const state = { kind: "published" as const, id: 1, immutable: true, assets: REMOTE }
		expect(planAttach(input({ state, workflowSha: "b".repeat(40) }))).toEqual({ action: "use-published" })
	})

	test("refuses more than one release for the tag", () => {
		expect(planAttach(input({ state: { kind: "ambiguous", count: 2 } }))).toMatchObject({
			action: "refuse",
			reason: expect.stringContaining("2 releases"),
		})
	})

	test("refuses to publish a commit the tag does not name, so the attestation cannot name the wrong one", () => {
		const plan = planAttach(input({ workflowSha: "b".repeat(40) }))
		expect(plan).toMatchObject({ action: "refuse", reason: expect.stringContaining("dispatch with --ref v1.2.3") })
	})

	test("refuses an immutable release missing an asset as burned", () => {
		const state = { kind: "published" as const, id: 1, immutable: true, assets: REMOTE.slice(1) }
		expect(planAttach(input({ state }))).toMatchObject({ action: "refuse", reason: expect.stringContaining("burned") })
	})

	test("refuses a mutable release missing an asset, with the way back", () => {
		const state = { kind: "published" as const, id: 1, immutable: false, assets: [] }
		expect(planAttach(input({ state }))).toMatchObject({
			action: "refuse",
			reason: expect.stringContaining("delete the release (keep the tag)"),
		})
	})
})

describe("compareAssets", () => {
	test("accepts exactly the built names and digests", () => {
		expect(compareAssets(REMOTE, LOCAL)).toEqual({ ok: true })
	})

	test.each([
		["a digest-less asset", REMOTE.map((a, i) => (i === 0 ? { ...a, digest: null } : a)), "has no digest"],
		["an extra asset", [...REMOTE, { id: 99, name: "extra.zip", digest: `sha256:${"9".repeat(64)}` }], "unexpected extra.zip"],
		["a missing asset", REMOTE.slice(0, 2), "missing SHASUMS256.txt"],
		[
			"a different asset",
			REMOTE.map((a, i) => (i === 1 ? { ...a, digest: `sha256:${"f".repeat(64)}` } : a)),
			"nulo-firefox-1.2.3.zip is sha256:",
		],
	])("refuses %s", (_, remote, reason) => {
		expect(compareAssets(remote, LOCAL)).toMatchObject({ ok: false, reason: expect.stringContaining(reason) })
	})
})

describe("parseShasums", () => {
	test("reads sha256sum's output", () => {
		const text = `${"1".repeat(64)}  nulo-chrome-1.2.3.zip\n${"2".repeat(64)}  nulo-firefox-1.2.3.zip\n`
		expect(parseShasums(text)).toEqual(
			new Map([
				["nulo-chrome-1.2.3.zip", "1".repeat(64)],
				["nulo-firefox-1.2.3.zip", "2".repeat(64)],
			]),
		)
	})

	test.each([
		["a short hash", `${"1".repeat(63)}  a.zip\n`],
		["a path", `${"1".repeat(64)}  ../a.zip\n`],
		["a repeated name", `${"1".repeat(64)}  a.zip\n${"2".repeat(64)}  a.zip\n`],
	])("refuses %s", (_, text) => {
		expect(parseShasums(text)).toBeNull()
	})
})
