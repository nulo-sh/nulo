// Imports nothing: the release job that tags a stable version loads this by relative path with no
// dependency installed.

export const PLACEHOLDER = "«FILL"

/** The documents a stable release publishes, repository-relative; a test pins them to `LEGAL_MANIFEST`. */
export const LAUNCH_DOCUMENTS = ["legal/terms.md", "legal/privacy.md"] as const

const VERSION = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/

/**
 * Every line still holding a placeholder, as `file:line: text`, when `version` is a stable release at or
 * above 1.0.0; `[]` for a 0.x release or a prerelease, which ship while the Terms are unfinished.
 * Throws on a version it cannot read, so a malformed one never passes as "not a launch".
 */
export function launchBlanks(version: string, documents: ReadonlyArray<{ path: string; markdown: string }>): string[] {
	const match = VERSION.exec(version)
	if (!match) throw new Error(`not a semantic version: '${version}'`)
	if (match[4] !== undefined || Number(match[1]) < 1) return []
	return documents.flatMap(({ path, markdown }) =>
		markdown.split(/\r?\n/).flatMap((line, index) => (line.includes(PLACEHOLDER) ? [`${path}:${index + 1}: ${line.trim()}`] : [])),
	)
}
