/**
 * Every `code:` source a clause of the harness cites, with a fragment its line must hold, so a line
 * that moves fails the citation test instead of vouching for whatever now sits there. A path is
 * relative to `apps/extension/` unless it starts with `apps/`.
 *
 * Imports nothing, so the pure modules and their unit test share one table.
 */
export const CITED = new Map<string, string>()

export function cite(path: string, line: number, fragment: string): string {
	const source = `code:${path}:${line}`
	const known = CITED.get(source)
	if (known !== undefined && known !== fragment) throw new Error(`${source} is cited with two fragments`)
	CITED.set(source, fragment)
	return source
}
