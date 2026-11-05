/** The wallet's input for the pick in flight: appended to the body for one pick and removed when the
 *  pick settles. */
export const PENDING_FILE_INPUT = 'body > input[type="file"]'

/** Whether a chooser filtering on `accept` lists `fileName` by default: an empty list lists every
 *  file, an extension lists a name ending in it, in any case. A MIME type lists nothing here, since
 *  the wallet names extensions only. */
export function acceptLists(accept: string, fileName: string): boolean {
	const tokens = accept
		.split(",")
		.map((token) => token.trim().toLowerCase())
		.filter(Boolean)
	if (tokens.length === 0) return true
	const name = fileName.toLowerCase()
	return tokens.some((token) => token.startsWith(".") && name.endsWith(token))
}
