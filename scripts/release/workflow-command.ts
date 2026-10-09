/**
 * Log lines for text a script does not control: API answers, validator output, error messages. The
 * runner reads `::name::data` only at the start of a physical line, and its legacy `##[name]` anywhere.
 */

/** A workflow command whose data is escaped the way the runner unescapes it, so it cannot start another. */
export const command = (name: string, data: string): string =>
	`::${name}::${data.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/##\[/g, "## [")}`

/** An ordinary line: no line break for a `::` command to follow, and no `##[`. */
export const plain = (text: string): string => text.replace(/[\r\n]+/g, " ").replace(/##\[/g, "## [")
