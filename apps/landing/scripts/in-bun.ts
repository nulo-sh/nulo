/**
 * Test helper: calls an export of a landing build module in a `bun` child, so code that needs Bun's
 * built-ins (`Bun.markdown`, `Bun.TOML`) runs as the build runs it, whichever engine runs the test.
 * Arguments and the result cross as JSON; a throw comes back as an error with the same message.
 */

import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const BRIDGE = `const mod = await import(process.argv[1])
const { fn, args } = JSON.parse(await Bun.stdin.text())
try { console.log(JSON.stringify({ value: mod[fn](...args) })) } catch (error) { console.log(JSON.stringify({ error: String(error?.message ?? error) })) }`

type Fn = (...args: never[]) => unknown

export function bunCaller<M>(moduleUrl: URL) {
	const modulePath = fileURLToPath(moduleUrl)
	return <F extends { [K in keyof M]: M[K] extends Fn ? K : never }[keyof M] & string>(
		fn: F,
		...args: M[F] extends (...a: infer A) => unknown ? A : never
	): M[F] extends (...a: never[]) => infer R ? R : never => {
		// A sync spawn blocks vitest's own test timeout, so the child gets one.
		const run = spawnSync("bun", ["-e", BRIDGE, modulePath], { input: JSON.stringify({ fn, args }), encoding: "utf8", timeout: 30_000 })
		// A reply past spawnSync's buffer arrives cut short with status 0 and only `error` set.
		if (run.error || run.status !== 0) throw new Error(`bun exited ${run.status}: ${run.error ?? run.stderr}`)
		const reply = JSON.parse(run.stdout) as { value: never } | { error: string }
		if ("error" in reply) throw new Error(reply.error)
		return reply.value
	}
}
