// @vitest-environment node
import { describe, expect, test } from "vitest"
import type { ArmedInterception, RpcInterception } from "../../tests/e2e/fixtures/browser"
import { standingInterceptions } from "../../tests/e2e/fixtures/browser/standing-interception"

const NODE = "https://node.test/key/path"
const OTHER = "http://localhost:8080"

/** An `arm` that logs every arm and stop, and hands back interceptions with set counts. */
function fakeBrowser() {
	const log: string[] = []
	const armed = new Set<string>()
	let failNextArm = false
	const arm = async (_browser: object, _id: string, fromOrigin: string, mode: RpcInterception): Promise<ArmedInterception> => {
		const name = `${mode.kind} ${new URL(fromOrigin).origin}`
		if (failNextArm) {
			failNextArm = false
			throw new Error(`cannot arm ${name}`)
		}
		if (armed.has(new URL(fromOrigin).origin)) throw new Error(`two interceptions on ${name}`)
		armed.add(new URL(fromOrigin).origin)
		log.push(`arm ${name}`)
		return {
			hits: async () => 2,
			failures: async () => [`lost one under ${mode.kind}`],
			stop: async () => {
				armed.delete(new URL(fromOrigin).origin)
				log.push(`stop ${name}`)
			},
		}
	}
	return { browser: {}, log, arm, failArm: () => (failNextArm = true) }
}

const REDIRECT: RpcInterception = { kind: "redirect", to: "http://127.0.0.1:1" }
const REFUSE: RpcInterception = { kind: "refuse" }

describe("standing interceptions", () => {
	test("a spec's interception on the held origin replaces the launch's until it stops, and the counts carry over", async () => {
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
		expect(await held.hits()).toBe(4)
		expect(await held.failures()).toEqual(["lost one under redirect", "lost one under redirect"])
	})

	test("success control: a spec's interception on another origin leaves the launch's armed", async () => {
		const { browser, log, arm } = fakeBrowser()
		const standing = standingInterceptions(arm)
		await standing.hold(browser, "ext", NODE, REDIRECT)
		const own = await standing.intercept(browser, "ext", OTHER, REFUSE)
		await own.stop()
		expect(log).toEqual(["arm redirect https://node.test", "arm refuse http://localhost:8080", "stop refuse http://localhost:8080"])
	})

	test("a re-arm that fails after a spec's interception is reported by the launch's", async () => {
		const { browser, arm, failArm } = fakeBrowser()
		const standing = standingInterceptions(arm)
		const held = await standing.hold(browser, "ext", NODE, REDIRECT)
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
