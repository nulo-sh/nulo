import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export interface GhAnswer {
	/** Answers the first call whose arguments, joined by spaces, contain this text. */
	when: string
	stdout?: string
	stderr?: string
	exit?: number
}

/**
 * A test `gh` first on `PATH`: Bun's `$` resolves it at call time. A call no answer matches exits 0
 * with no output. `restore()` puts `PATH` back and removes the script.
 */
export function fakeGh(answers: readonly GhAnswer[]): { restore(): void } {
	const dir = mkdtempSync(join(tmpdir(), "fake-gh-"))
	const cases = answers.map((answer, i) => {
		writeFileSync(join(dir, `out${i}`), answer.stdout ?? "")
		writeFileSync(join(dir, `err${i}`), answer.stderr ?? "")
		return `  *'${answer.when}'*) cat '${dir}/out${i}'; cat '${dir}/err${i}' >&2; exit ${answer.exit ?? 0} ;;`
	})
	writeFileSync(join(dir, "gh"), `#!/bin/sh\ncase "$*" in\n${cases.join("\n")}\nesac\nexit 0\n`)
	chmodSync(join(dir, "gh"), 0o755)
	const path = process.env.PATH
	process.env.PATH = `${dir}:${path}`
	return {
		restore() {
			process.env.PATH = path
			rmSync(dir, { recursive: true, force: true })
		},
	}
}
