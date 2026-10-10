// @vitest-environment node
import { describe, expect, test } from "vitest"
import type { ArmedInterception, RpcInterception } from "../../tests/e2e/fixtures/browser"
import { standingInterceptions } from "../../tests/e2e/fixtures/browser/standing-interception"

const NODE = "https://node.test/key/path"
const OTHER = "http://localhost:8080"

/** An `arm` that logs every arm and stop; the nth arm counts n hits and reports one failure. */
function fakeBrowser() {
	const log: string[] = []
	const armed = new Set<string>()
	let arms = 0
	let failNextArm = false
	const arm = async (_browser: object, _id: string, fromOrigin: string, mode: RpcInterception): Promise<ArmedInterception> => {
		const origin = new URL(fromOrigin).origin
		const name = `${mode.kind} ${origin}`
		if (failNextArm) {
			failNextArm = false
			throw new Error(`cannot arm ${name}`)
		}
		if (armed.has(origin)) throw new Error(`two interceptions on ${name}`)
		armed.add(origin)
		const nth = ++arms
		log.push(`arm ${name}`)
		return {
			hits: async () => nth,
			failures: async () => [`arm ${nth} lost one`],
			stop: async () => {
				armed.delete(origin)
				log.push(`stop ${name}`)
			},
		}
	}
	return { browser: {}, log, arm, failArm: () => (failNextArm = true) }
}

const REDIRECT: RpcInterception = { kind: "redirect", to: "http://127.0.0.1:1" }
const REFUSE: RpcInterception = { kind: "refuse" }

describe("standing interceptions", () => {
	test("a spec's interception on the held origin replaces the launch's until it stops; the launch keeps its own counts and the spec's failures", async () => {
		const { browser, log, arm } = fakeBrowser()
		const standing = standingInterceptions(arm)
		const held = await standing.hold(browser, "ext", NODE, REDIRECT)
		const own = await standing.intercept(browser, "ext", NODE, REFUSE)
		await own.stop()
		expect(log).toEqual([
			"arm redirect https://node.test",
			"stop redirect https://node.test",
			"arm refuse https://node.test",
			"stop refuse https://node.test",
			"arm redirect https://node.test",
		])
		expect(await held.hits()).toBe(1 + 3)
		expect(await held.failures()).toEqual(["arm 1 lost one", "a spec's interception: arm 2 lost one", "arm 3 lost one"])
	})

	test("success control: a spec's interception on another origin leaves the launch's armed", async () => {
		const { browser, log, arm } = fakeBrowser()
		const standing = standingInterceptions(arm)
		await standing.hold(browser, "ext", NODE, REDIRECT)
		const own = await standing.intercept(browser, "ext", OTHER, REFUSE)
		await own.stop()
		expect(log).toEqual(["arm redirect https://node.test", "arm refuse http://localhost:8080", "stop refuse http://localhost:8080"])
	})

	test("a spec's interception still unstopped when the launch reads its failures is reported", async () => {
		const { browser, arm } = fakeBrowser()
		const standing = standingInterceptions(arm)
		const held = await standing.hold(browser, "ext", NODE, REDIRECT)
		await standing.intercept(browser, "ext", NODE, REFUSE)
		expect((await held.failures()).at(-1)).toBe("a spec's interception on https://node.test was never stopped")
		await expect(standing.intercept(browser, "ext", NODE, REFUSE)).rejects.toThrow("a spec already intercepts https://node.test")
	})

	test("a stale stop of an earlier spec's interception leaves the next spec's in place", async () => {
		const { browser, log, arm } = fakeBrowser()
		const standing = standingInterceptions(arm)
		await standing.hold(browser, "ext", NODE, REDIRECT)
		const first = await standing.intercept(browser, "ext", NODE, REFUSE)
		await first.stop()
		await standing.intercept(browser, "ext", NODE, REFUSE)
		const before = [...log]
		await first.stop()
		expect(log).toEqual(before)
		expect(log.at(-1)).toBe("arm refuse https://node.test")
	})

	test("a re-arm that fails, after a spec's interception or in place of one that could not arm, is reported by the launch's", async () => {
		const { browser, log, arm, failArm } = fakeBrowser()
		const standing = standingInterceptions(arm)
		const held = await standing.hold(browser, "ext", NODE, REDIRECT)
		failArm()
		await expect(standing.intercept(browser, "ext", NODE, REFUSE)).rejects.toThrow("cannot arm refuse")
		expect(log.at(-1)).toBe("arm redirect https://node.test")
		const own = await standing.intercept(browser, "ext", NODE, REFUSE)
		failArm()
		await own.stop()
		expect((await held.failures()).at(-1)).toMatch(/^re-arming after a spec's own interception failed: Error: cannot arm redirect/)
	})

	test("a spec that stops after the launch let go re-arms nothing", async () => {
		const { browser, log, arm } = fakeBrowser()
		const standing = standingInterceptions(arm)
		const held = await standing.hold(browser, "ext", NODE, REDIRECT)
		const own = await standing.intercept(browser, "ext", NODE, REFUSE)
		await held.stop()
		await own.stop()
		expect(log.at(-1)).toBe("stop refuse https://node.test")
	})
})
