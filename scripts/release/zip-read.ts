/**
 * Reads a zip that came from outside this repository through Info-ZIP `unzip`. Every call has a
 * deadline, and output is counted as it streams: `unzip -p` writes whatever an entry inflates to,
 * whatever size the central directory claims.
 */

const TIMEOUT_MS = 60_000
/** Room for the listing of any archive the caller would accept. */
const LISTING_LIMIT = 8 << 20

async function run(argv: string[], limit: number): Promise<Uint8Array> {
	const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "ignore", timeout: TIMEOUT_MS, killSignal: "SIGKILL" })
	const chunks: Uint8Array[] = []
	let total = 0
	for await (const chunk of proc.stdout) {
		total += chunk.byteLength
		if (total > limit) {
			proc.kill("SIGKILL")
			throw new Error(`${argv.slice(0, 2).join(" ")}: output passed ${limit} bytes`)
		}
		chunks.push(chunk)
	}
	const code = await proc.exited
	if (code !== 0) throw new Error(`${argv.slice(0, 2).join(" ")}: ${proc.signalCode ?? `exit ${code}`}`)
	return Buffer.concat(chunks)
}

/**
 * Entry names as `unzip -Z1` lists them, one per line. The listing prints a control character as `^`
 * and a letter, so a name holding one, or a caret, does not read back as itself.
 */
export async function listEntries(path: string): Promise<string[]> {
	const text = new TextDecoder("utf-8", { fatal: true }).decode(await run(["unzip", "-Z1", path], LISTING_LIMIT))
	return text.split("\n").filter((line) => line !== "")
}

/**
 * One entry's bytes, refused past `limit`. `unzip` reads a name argument as a pattern, and a leading
 * `-` as an option (`-d…` would dump every entry), so only a name that can only mean itself is read.
 */
export async function readEntry(path: string, name: string, limit: number): Promise<Uint8Array> {
	if (/^-|[*?[\]\\^]/.test(name)) throw new Error(`refusing to read ${JSON.stringify(name)}: unzip would not read it literally`)
	return run(["unzip", "-p", path, name], limit)
}
