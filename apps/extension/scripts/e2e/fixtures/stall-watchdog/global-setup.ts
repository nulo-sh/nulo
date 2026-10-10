import { spawn } from "node:child_process"
import { writeFileSync } from "node:fs"
import path from "node:path"

const state = (name: string) => path.join(process.env.STALL_STATE_DIR ?? ".", name)

/** Starts a detached process that is no fork, which the watchdog must leave running. */
export default function setup(): () => void {
	const child = spawn("sleep", ["120"], { detached: true, stdio: "ignore" })
	child.unref()
	writeFileSync(state("detached.pid"), String(child.pid))
	return () => writeFileSync(state("teardown-ran"), "")
}
