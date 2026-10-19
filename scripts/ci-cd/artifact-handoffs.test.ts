/**
 * Every artifact a smoke or a publisher takes is its producer job's own upload, named by the id that
 * upload returned. Any job of the run holds the artifact token and can replace an artifact under its
 * name; a download by id takes that one upload or fails, and the action checks the archive against
 * the digest the service recorded. Each check also runs on a mutated copy, because a check that
 * finds nothing on any input passes on the real files too.
 *
 * Wired into CI via the root `test:ci-gating` script.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..", "..")

type Step = { id?: string; uses?: string; if?: unknown; env?: Record<string, unknown>; with?: Record<string, unknown>; run?: string }
type Job = {
	uses?: string
	needs?: unknown
	"continue-on-error"?: unknown
	with?: Record<string, unknown>
	outputs?: Record<string, unknown>
	steps?: Step[]
}
type Workflow = { on?: { workflow_call?: { outputs?: Record<string, { value?: unknown }> } }; jobs: Record<string, Job> }
type Tree = Record<string, Workflow>

const FILES = ["_build-extension.yml", "_extension-smoke-e2e.yml", "nightly.yml", "release.yml"]
const TREE: Tree = Object.fromEntries(
	FILES.map((file) => [file, Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows", file), "utf8")) as Workflow]),
)
const SMOKE = "./.github/workflows/_extension-smoke-e2e.yml"
const DOWNLOAD = "actions/download-artifact@"
const UPLOAD = "actions/upload-artifact@"
/** The id check before each download: an empty `artifact-ids` downloads every artifact of the run. */
const CHECK = `[[ "$ARTIFACT_ID" =~ ^[1-9][0-9]*$ ]] || { echo "::error::artifact id '$ARTIFACT_ID' is not a positive integer, and an empty one downloads every artifact of the run"; exit 1; }`

const CALLER = "the caller's artifact_id"
const STEP_KEYS = ["name", "if", "env", "run", "uses", "with"]
/** Each consumer's downloads, by destination path, and the artifact each must be. */
const CONSUMERS: Record<string, Record<string, string>> = {
	"_extension-smoke-e2e.yml#smoke": { "_e2e-extension": CALLER },
	"release.yml#attach-assets": {
		"dist/release/chrome": "extension-chrome",
		"dist/release/firefox": "extension-firefox",
		"dist/release": "published-assets",
		"dist/notes": "release-notes",
	},
	"release.yml#publish-chrome-store": { "dist/release": "release-${{ env.VERSION }}" },
	"release.yml#publish-firefox-amo": { "dist/release": "release-${{ env.VERSION }}" },
	"nightly.yml#publish-nightly": {
		"dist/release/chrome": "extension-chrome",
		"dist/release/firefox": "extension-firefox",
		"dist/notes": "nightly-notes",
	},
}

const BUILD = (browser: string) => `build-${browser} → _build-extension.yml#build#upload-${browser}`
/** The one upload step, by job and step id, that each artifact a consumer takes may come from. */
const PRODUCERS: Record<string, Record<string, string>> = {
	"release.yml": {
		"extension-chrome": BUILD("chrome"),
		"extension-firefox": BUILD("firefox"),
		"published-chrome": "select-assets#upload-chrome",
		"published-firefox": "select-assets#upload-firefox",
		"published-assets": "select-assets#upload-assets",
		"release-notes": "release-notes#upload",
		"release-${{ env.VERSION }}": "attach-assets#upload-release",
	},
	"nightly.yml": {
		"extension-chrome": BUILD("chrome"),
		"extension-firefox": BUILD("firefox"),
		"nightly-notes": "nightly-notes#upload",
	},
}
/** How a resolved upload reads in a finding, and what a pinned one must read. */
const label = (name: unknown, where: string | undefined): string => `${String(name)} from ${where}`
const pinned = (file: string, name: string): string => label(name, PRODUCERS[file]?.[name])

const needsOf = (job: Job): string[] => [job.needs ?? []].flat() as string[]
const reference = (expression: unknown): string | undefined => /^\$\{\{ ([\w.-]+) \}\}$/.exec(String(expression))?.[1]

/** The upload an `${{ steps.<id>.outputs.artifact-id }}` output names in `job`, labelled `<name> from <where>#<id>`. */
function uploadOf(job: Job | undefined, where: string, output: unknown): string | undefined {
	const step = /^steps\.([\w-]+)\.outputs\.artifact-id$/.exec(reference(output) ?? "")?.[1]
	const upload = job?.steps?.find((s) => s.id === step)
	return upload?.uses?.startsWith(UPLOAD) ? label(upload.with?.name, `${where}#${step}`) : undefined
}

/** The upload `needs.<job>.outputs.<output>` resolves to, through a reusable workflow's outputs too. */
function producedBy(tree: Tree, file: string, consumer: Job, ref: string): string | undefined {
	const [, producer, output] = /^needs\.([\w-]+)\.outputs\.([\w-]+)$/.exec(ref) ?? []
	if (!producer || !needsOf(consumer).includes(producer)) return undefined
	const job = tree[file].jobs[producer]
	if (!job?.uses) return uploadOf(job, producer, job?.outputs?.[output])
	const calledFile = job.uses.replace("./.github/workflows/", "")
	const called = tree[calledFile]
	const [, inner, innerOutput] =
		/^jobs\.([\w-]+)\.outputs\.([\w-]+)$/.exec(reference(called?.on?.workflow_call?.outputs?.[output]?.value) ?? "") ?? []
	const innerJob = called?.jobs[inner]
	return uploadOf(innerJob, `${producer} → ${calledFile}#${inner}`, innerJob?.outputs?.[innerOutput])
}

function downloadFindings(tree: Tree, where: string, job: Job, steps: Step[], index: number): string[] {
	const [file] = where.split("#")
	const download = steps[index]
	const path = String(download.with?.path)
	const findings: string[] = []
	if (!Bun.deepEquals(Object.keys(download.with ?? {}).sort(), ["artifact-ids", "path"]))
		findings.push(`${where} → ${path}: takes ${Object.keys(download.with ?? {}).join(", ")}, not one id and a path`)
	const name = CONSUMERS[where][path]
	const want = name === CALLER ? CALLER : pinned(file, name)
	const ref = reference(download.with?.["artifact-ids"])
	const got = ref === "inputs.artifact_id" ? CALLER : ref && producedBy(tree, file, job, ref)
	if (got !== want) findings.push(`${where} → ${path}: downloads ${got ?? "no producer's upload"}, not ${want}`)
	const check = steps[index - 1]
	if (check?.env?.ARTIFACT_ID !== download.with?.["artifact-ids"] || check?.run?.trim() !== CHECK || check.if !== download.if)
		findings.push(`${where} → ${path}: no id check of its own right before it`)
	// Any status function, `success()` in `success() || true` too, replaces the implicit `success()`,
	// so the download would run past a failed check; GitHub matches their names in any case.
	if (/\b(success|always|failure|cancelled)\s*\(/i.test(String(download.if ?? "")))
		findings.push(`${where} → ${path}: its download runs whether its check passed or not`)
	// A shell or `continue-on-error` of its own would let the step pass whatever the id.
	const extra = [...Object.keys(check ?? {}), ...Object.keys(download)].filter((key) => !STEP_KEYS.includes(key))
	if (extra.length) findings.push(`${where} → ${path}: its check or download also sets ${extra.join(", ")}`)
	return findings
}

function consumerFindings(tree: Tree): string[] {
	return Object.entries(CONSUMERS).flatMap(([where, paths]) => {
		const [file, name] = where.split("#")
		const job = tree[file]?.jobs[name]
		if (!job) return [`${where}: missing`]
		if (job["continue-on-error"] !== undefined) return [`${where}: continues on error`]
		const steps = job.steps ?? []
		const downloads = steps.flatMap((s, i) => (s.uses?.startsWith(DOWNLOAD) ? [i] : []))
		const seen = downloads.map((i) => String(steps[i].with?.path))
		const findings = downloads.flatMap((i) =>
			paths[String(steps[i].with?.path)] === undefined ? [] : downloadFindings(tree, where, job, steps, i),
		)
		if (!Bun.deepEquals([...seen].sort(), Object.keys(paths).sort())) findings.push(`${where}: downloads into ${seen.join(", ")}`)
		return findings
	})
}

/** A value's condition and branches: `${{ c && a || b }}` is `c` and [a, b]; anything else its one branch. */
function choice(value: unknown): { when?: string; branches: string[] } {
	const text = String(value ?? "")
	const ternary = /^\$\{\{ (.+) && (\S+) \|\| (\S+) \}\}$/.exec(text)
	if (ternary) return { when: ternary[1], branches: [ternary[2], ternary[3]] }
	return { branches: [reference(text) ?? text] }
}

/** A caller that smokes an artifact passes, on the same condition, the id of the upload each `artifact_name` branch names. */
function callerFindings(tree: Tree): string[] {
	const findings: string[] = []
	for (const [file, wf] of Object.entries(tree)) {
		for (const [name, job] of Object.entries(wf.jobs)) {
			if (job.uses !== SMOKE || !job.with?.artifact_name) continue
			const named = choice(job.with.artifact_name)
			const ids = choice(job.with.artifact_id)
			const names = named.branches.map((branch) => pinned(file, branch.replace(/^'(.*)'$/, "$1")))
			const produced = ids.branches.map((ref) => producedBy(tree, file, job, ref) ?? `${ref || "nothing"} (no upload)`)
			if (named.when !== ids.when) findings.push(`${file}#${name}: chooses its id on another condition than its name`)
			else if (!Bun.deepEquals(produced, names))
				findings.push(`${file}#${name}: smokes ${names.join(" or ")} by the id of ${produced.join(" or ")}`)
		}
	}
	return findings
}

const handoffFindings = (tree: Tree): string[] => [...consumerFindings(tree), ...callerFindings(tree)]

function mutated(edit: (tree: Tree) => void): Tree {
	const copy = structuredClone(TREE)
	edit(copy)
	return copy
}

const stepsOf = (tree: Tree, where: string): Step[] => {
	const [file, name] = where.split("#")
	return tree[file].jobs[name].steps ?? []
}
const downloadInto = (tree: Tree, where: string, path: string): Step =>
	stepsOf(tree, where).find((s) => s.uses?.startsWith(DOWNLOAD) && s.with?.path === path) as Step

describe("artifact handoffs", () => {
	test("every smoke and publisher download takes its producer's upload by a checked id", () => {
		expect(handoffFindings(TREE)).toEqual([])
	})

	test.each([
		[
			"a download by name",
			(t: Tree) =>
				Object.assign(downloadInto(t, "release.yml#attach-assets", "dist/release/chrome"), {
					with: { name: "extension-chrome", path: "dist/release/chrome" },
				}),
		],
		[
			"a digest mismatch let through",
			(t: Tree) =>
				Object.assign(downloadInto(t, "nightly.yml#publish-nightly", "dist/notes").with ?? {}, { "digest-mismatch": "warn" }),
		],
		[
			"an id from another producer's upload",
			(t: Tree) =>
				Object.assign(downloadInto(t, "release.yml#attach-assets", "dist/release/chrome").with ?? {}, {
					"artifact-ids": "${{ needs.build-firefox.outputs.firefox_artifact_id }}",
				}),
		],
		[
			"an id from a job the consumer does not wait on",
			(t: Tree) => Object.assign(t["release.yml"].jobs["publish-chrome-store"], { needs: ["resolve"] }),
		],
		[
			"a producer output that is not an upload's id",
			(t: Tree) =>
				Object.assign(t["release.yml"].jobs["release-notes"].outputs ?? {}, {
					artifact_id: "${{ steps.upload.outputs.artifact-url }}",
				}),
		],
		[
			"a reusable workflow output mapped to the other upload",
			(t: Tree) =>
				Object.assign(t["_build-extension.yml"].jobs.build.outputs ?? {}, {
					chrome_artifact_id: "${{ steps.upload-firefox.outputs.artifact-id }}",
				}),
		],
		[
			"the smoke's download taking the name",
			(t: Tree) =>
				Object.assign(downloadInto(t, "_extension-smoke-e2e.yml#smoke", "_e2e-extension").with ?? {}, {
					"artifact-ids": "${{ inputs.artifact_name }}",
				}),
		],
		[
			"the same name uploaded by another job",
			(t: Tree) => {
				const build = t["_build-extension.yml"]
				build.jobs.replace = {
					outputs: { id: "${{ steps.up.outputs.artifact-id }}" },
					steps: [{ id: "up", uses: `${UPLOAD}x`, with: { name: "extension-chrome", overwrite: true } }],
				}
				Object.assign(build.on?.workflow_call?.outputs?.chrome_artifact_id ?? {}, { value: "${{ jobs.replace.outputs.id }}" })
			},
		],
		[
			"a smoke caller passing the other browser's id",
			(t: Tree) =>
				Object.assign(t["nightly.yml"].jobs["smoke-against-artifact"].with ?? {}, {
					artifact_id: "${{ needs.build-firefox.outputs.firefox_artifact_id }}",
				}),
		],
		[
			"a smoke caller choosing its id on another condition",
			(t: Tree) =>
				Object.assign(t["release.yml"].jobs["smoke-against-artifact"].with ?? {}, {
					artifact_id:
						"${{ needs.select-assets.outputs.source != 'published' && needs.select-assets.outputs.published_chrome_artifact_id || needs.build-chrome.outputs.chrome_artifact_id }}",
				}),
		],
		[
			"a smoke caller passing no id",
			(t: Tree) => Object.assign(t["release.yml"].jobs["smoke-firefox-against-artifact"].with ?? {}, { artifact_id: undefined }),
		],
		[
			"a download with no id check",
			(t: Tree) => {
				const steps = stepsOf(t, "release.yml#publish-firefox-amo")
				steps.splice(steps.indexOf(downloadInto(t, "release.yml#publish-firefox-amo", "dist/release")) - 1, 1)
			},
		],
		[
			"an id check that reads another id",
			(t: Tree) => {
				const steps = stepsOf(t, "release.yml#attach-assets")
				const check = steps[steps.indexOf(downloadInto(t, "release.yml#attach-assets", "dist/notes")) - 1]
				Object.assign(check.env ?? {}, { ARTIFACT_ID: "${{ needs.build-chrome.outputs.chrome_artifact_id }}" })
			},
		],
		[
			"an id check that accepts any value",
			(t: Tree) => {
				const steps = stepsOf(t, "nightly.yml#publish-nightly")
				Object.assign(steps[steps.indexOf(downloadInto(t, "nightly.yml#publish-nightly", "dist/release/firefox")) - 1], {
					run: "true",
				})
			},
		],
		[
			"an id check on another path than its download",
			(t: Tree) => {
				const steps = stepsOf(t, "release.yml#attach-assets")
				steps[steps.indexOf(downloadInto(t, "release.yml#attach-assets", "dist/release")) - 1].if = undefined
			},
		],
		[
			"an id check that may fail and go on",
			(t: Tree) => {
				const steps = stepsOf(t, "_extension-smoke-e2e.yml#smoke")
				Object.assign(steps[steps.indexOf(downloadInto(t, "_extension-smoke-e2e.yml#smoke", "_e2e-extension")) - 1], {
					"continue-on-error": true,
				})
			},
		],
		...["always() && ", "ALWAYS() && ", "(success() || true) && "].map(
			(prefix) =>
				[
					`a check and download under \`${prefix}…\`, which run whether the check passed or not`,
					(t: Tree) => {
						const steps = stepsOf(t, "_extension-smoke-e2e.yml#smoke")
						const index = steps.indexOf(downloadInto(t, "_extension-smoke-e2e.yml#smoke", "_e2e-extension"))
						for (const step of steps.slice(index - 1, index + 1)) step.if = `${prefix}${step.if}`
					},
				] as const,
		),
		[
			"a publisher that continues on error",
			(t: Tree) => Object.assign(t["nightly.yml"].jobs["publish-nightly"], { "continue-on-error": true }),
		],
		[
			"a download this test does not pin",
			(t: Tree) => {
				stepsOf(t, "release.yml#publish-chrome-store").push({ uses: `${DOWNLOAD}x`, with: { pattern: "*", path: "dist/extra" } })
			},
		],
	])("finds %s", (_, edit) => {
		expect(handoffFindings(mutated(edit)).length).toBeGreaterThan(0)
	})

	test.each([
		["", 1],
		["0", 1],
		["012", 1],
		["12a", 1],
		["1,2", 1],
		[" 12", 1],
		["12", 0],
		["4521098765", 0],
	] as const)("the id check on %p exits %p", (id, exit) => {
		const run = Bun.spawnSync(["bash", "-e", "-c", CHECK], { env: { ...process.env, ARTIFACT_ID: id }, stdout: "pipe", stderr: "pipe" })
		expect(run.exitCode).toBe(exit)
	})
})
