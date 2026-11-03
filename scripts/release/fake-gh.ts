import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export interface GhAnswer {
	/** The whole argument list, joined by spaces, that this answer is for. */
	args: string
	stdout?: string
	stderr?: string
	exit?: number
}

/**
 * A test `gh` first on `PATH`: Bun's `$` resolves it at call time. A call no answer names fails, so a
 * runner that changes its arguments fails its pin. `restore()` puts `PATH` back and removes the script.
 */
export function fakeGh(answers: readonly GhAnswer[]): { restore(): void } {
	const dir = mkdtempSync(join(tmpdir(), "fake-gh-"))
	const cases = answers.map((answer, i) => {
		writeFileSync(join(dir, `out${i}`), answer.stdout ?? "")
		writeFileSync(join(dir, `err${i}`), answer.stderr ?? "")
		return `  '${answer.args}') cat '${dir}/out${i}'; cat '${dir}/err${i}' >&2; exit ${answer.exit ?? 0} ;;`
	})
	const script = `#!/bin/sh\ncase "$*" in\n${cases.join("\n")}\n  *) echo "fake gh: no answer for: $*" >&2; exit 97 ;;\nesac\n`
	writeFileSync(join(dir, "gh"), script)
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
