/**
 * The only writer of `src/wallet/storage/stored-shapes/snapshot.json`, and of the MACs in
 * `goldens.json`. `bun run baseline:storage` from the repo root:
 *
 *   (no flag)                rewrites the one stamp before the freeze; after it, appends the stamp
 *                            a registered `+1` migration justifies, or refuses
 *   -- --additive "<reason>" appends a same-version stamp: no stored row reads differently
 *   -- --freeze              prints the first pin to add to `stored-shapes/pins.ts`
 *
 * It never edits a pinned stamp; the rules it applies are `snapshot.test.ts`'s.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { realMigrations } from "@/wallet/storage/migrations"
import {
	type GoldensFile,
	introducedBy,
	type Pin,
	pinOf,
	propose,
	type Snapshot,
	signGoldens,
} from "@/wallet/storage/stored-shapes/baseline"
import { canonicalText } from "@/wallet/storage/stored-shapes/emit"
import { PINNED_STAMPS } from "@/wallet/storage/stored-shapes/pins"

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../../src/wallet/storage/stored-shapes")
const SNAPSHOT = join(DIR, "snapshot.json")
const GOLDENS = join(DIR, "goldens.json")

function argValue(flag: string): string | undefined {
	const at = process.argv.indexOf(flag)
	if (at < 0) return undefined
	const value = process.argv[at + 1]
	if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`)
	return value
}

const BIOME = join(dirname(fileURLToPath(import.meta.url)), "../../../../node_modules/.bin/biome")

/** Written in the repo's JSON format, so the pre-commit check passes on what the generator wrote. */
function writeJson(file: string, value: unknown): void {
	writeFileSync(file, `${JSON.stringify(value, null, "\t")}\n`)
	const format = Bun.spawnSync([BIOME, "format", "--write", file], { stdout: "ignore", stderr: "inherit" })
	if (format.exitCode !== 0) throw new Error(`biome could not format ${file}`)
}
const printPin = (index: number, pin: Pin) =>
	console.log(
		`Add this pin as PINNED_STAMPS[${index}] in stored-shapes/pins.ts:\n\t{ stamp: "${pin.stamp}", goldens: "${pin.goldens}" },`,
	)

async function main(): Promise<number> {
	const additive = argValue("--additive")
	const freeze = process.argv.includes("--freeze")
	const frozen = PINNED_STAMPS.length > 0
	const authored = (JSON.parse(readFileSync(GOLDENS, "utf8")) as GoldensFile).goldens
	const snapshot: Snapshot = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, "utf8")) : { stamps: [] }
	const goldens = await signGoldens(authored)
	const resigned = PINNED_STAMPS.map((_, index) => index).filter(
		(index) => canonicalText(introducedBy(goldens, index)) !== canonicalText(introducedBy(authored, index)),
	)
	if (resigned.length > 0) {
		console.error(`goldens of pinned stamps ${resigned.join(", ")} have no MAC: a pinned golden is never re-signed`)
		return 1
	}
	if (freeze && frozen) {
		console.error("the baseline is already frozen")
		return 1
	}

	const proposal = await propose(snapshot, goldens, { frozen, additive, migrations: realMigrations })
	if (proposal.kind === "refused") {
		console.error(proposal.reasons.join("\n"))
		return 1
	}
	if (canonicalText(goldens) !== canonicalText(authored)) writeJson(GOLDENS, { goldens })
	if (proposal.kind === "unchanged") {
		console.log("stored shapes unchanged")
		return 0
	}
	const stamps = proposal.kind === "rewrite" ? [proposal.stamp] : [...snapshot.stamps, proposal.stamp]
	writeJson(SNAPSHOT, { stamps })
	const index = stamps.length - 1
	console.log(`${proposal.kind === "rewrite" ? "rewrote" : "appended"} stamp ${index} (v${proposal.stamp.version})`)
	if (frozen || freeze) printPin(index, await pinOf(proposal.stamp, goldens, index))
	return 0
}

process.exit(await main())
