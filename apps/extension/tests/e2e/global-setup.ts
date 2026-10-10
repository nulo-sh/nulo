// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"
import http from "node:http"
import { spawn, type ChildProcess } from "node:child_process"
import type { TestProject } from "vitest/node"
import {
	type AztecTestConfig,
	checkNodeHealth,
	createTestWallet,
	deployTestToken,
	getContractClassId,
	createSponsoredFeeOptions,
	LOCAL_NODE_URL,
} from "./fixtures/aztec"
import {
	type OwnedState,
	REPO_ROOT,
	SANDBOX_SERVICES,
	type SandboxService,
	clearLock,
	isPidAlive,
	readLock,
	withReconcileLock,
	writeLock,
} from "./lockfile"
import { markBootReady, markBootStarted } from "./sentinel"
import { resolveBrowserKind } from "./fixtures/browser/selection"
import { ANVIL_CHAIN_ID, probeAnvil } from "./anvil-probe"
import { assertPackFree, claimedRunId, listenerIsOurs, mayAdopt, waitWhileAlive } from "./boot-guard"
import { identityIsDead, launchEnv, newMarker, ownIdentity, readStartTime } from "./owned-processes"
import {
	createRunDir,
	deletableRunDir,
	plannedRunDir,
	reapPriorRun,
	stopService,
	killChromesLoading,
	stopServiceOnExit,
	sweepDeadRuns,
} from "./sandbox-ownership"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Resolved here so an unusable selector fails before this file boots anvil, a node and a
// playground — the workers would otherwise reject it minutes later.
const BROWSER = resolveBrowserKind()
// `EXTENSION_PATH` points the run at a build other than `dist/<browser>` — for instance an
// artifact unzipped somewhere else.
const EXTENSION_PATH = process.env.EXTENSION_PATH
	? path.resolve(process.env.EXTENSION_PATH)
	: path.resolve(__dirname, "../../dist", BROWSER)
const PLAYGROUND_DIR = path.resolve(__dirname, "../../../playground")
const CONFIG_PATH = path.resolve(__dirname, ".test-config.json")
// ── Aztec toolchain resolution ──────────────────────────────────────────
// Resolve from the repo's `@aztec-labs/aztec.js` pin (the SAME rule CI's
// setup-aztec action uses), NOT from the mutable `~/.aztec/current`
// symlink: ANY `aztec-up install` on the machine re-points `current`
// (other projects, other agents' worktrees), and @aztec-labs/ethereum's
// `resolveFoundryBinary` hard-codes `current/internal-bin/forge` AHEAD of
// PATH — so a mismatched install there kills the L1 deploy for EVERY
// version's boot ("forge script: the following required arguments were
// not provided: --batch"), which the PATH prepend below cannot prevent.
// The FORGE_BIN/ANVIL_BIN env overrides (that resolver's highest-priority
// source) are exported at node spawn to close that hole. Falls back to
// `current` only when the pinned version isn't installed, with a warning
// logged at boot naming the fix.
const AZTEC_PIN_READ: { pin?: string; error?: string } = (() => {
	try {
		const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")) as {
			dependencies?: Record<string, string>
		}
		const pin = pkg.dependencies?.["@aztec-labs/aztec.js"]
		if (typeof pin !== "string" || pin.length === 0) {
			return { error: "dependencies['@aztec-labs/aztec.js'] missing or not a string" }
		}
		return { pin }
	} catch (err) {
		return { error: err instanceof Error ? err.message : String(err) }
	}
})()
const AZTEC_PIN = AZTEC_PIN_READ.pin

function isExecutable(p: string): boolean {
	try {
		fs.accessSync(p, fs.constants.X_OK)
		return true
	} catch {
		return false
	}
}

// The installer's own variable (`aztec-up` reads it too), so a run can use a toolchain installed
// outside the shared `~/.aztec` that other agents' installs re-point.
const AZTEC_HOME = process.env.AZTEC_HOME ? path.resolve(process.env.AZTEC_HOME) : path.resolve(process.env.HOME || "~", ".aztec")
// The pinned root is usable only as a COMPLETE toolchain. A partial install
// (CLI present, internal-bin/forge missing) would let the L1 deploy resolve
// forge through mutable `current` again — the exact hole this closes.
const AZTEC_TOOLCHAIN_RELPATHS = ["node_modules/.bin/aztec", "bin/aztec-anvil", "internal-bin/forge", "internal-bin/anvil"] as const
const AZTEC_PINNED_ROOT = AZTEC_PIN ? path.join(AZTEC_HOME, "versions", AZTEC_PIN) : undefined
const AZTEC_PIN_MISSING: readonly string[] = AZTEC_PINNED_ROOT
	? AZTEC_TOOLCHAIN_RELPATHS.filter((rel) => !isExecutable(path.join(AZTEC_PINNED_ROOT, rel)))
	: AZTEC_TOOLCHAIN_RELPATHS
const AZTEC_PIN_USABLE = AZTEC_PIN_MISSING.length === 0
const AZTEC_ROOT = AZTEC_PIN_USABLE && AZTEC_PINNED_ROOT ? AZTEC_PINNED_ROOT : path.join(AZTEC_HOME, "current")
const AZTEC_BIN = path.join(AZTEC_ROOT, "node_modules/.bin/aztec")
// 5.0 renamed bundled bare binaries to aztec-* on PATH: `anvil` → `aztec-anvil` (drop-in).
const ANVIL_BIN = path.join(AZTEC_ROOT, "bin/aztec-anvil")
// We spawn node_modules/.bin/aztec directly (AZTEC_BIN), bypassing the bin/aztec wrapper that
// prepends `internal-bin` to PATH. Replicate that prepend so subprocesses that DO resolve from
// PATH use the version-matched bundled binaries.
const AZTEC_INTERNAL_BIN = path.join(AZTEC_ROOT, "internal-bin")

/**
 * Port resolution. Falls back to today's defaults if the agent wrapper
 * (`bun run e2e:agent`) hasn't pre-allocated a fresh pack. The wrapper
 * passes ANVIL_PORT/AZTEC_PORT/AZTEC_ADMIN_PORT/AZTEC_P2P_PORT/PLAYGROUND_PORT
 * via env after writing them to .e2e-state/ports.json. Direct `vitest`
 * invocations without the wrapper still work for single-agent dev.
 */
const ANVIL_PORT = Number(process.env.ANVIL_PORT ?? 8545)
const ANVIL_URL = process.env.ANVIL_URL ?? `http://127.0.0.1:${ANVIL_PORT}`
const AZTEC_PORT = Number(process.env.AZTEC_PORT ?? 8080)
const AZTEC_ADMIN_PORT = Number(process.env.AZTEC_ADMIN_PORT ?? 8880)
const AZTEC_P2P_PORT = Number(process.env.AZTEC_P2P_PORT ?? 40400)
const PLAYGROUND_PORT = Number(process.env.PLAYGROUND_PORT ?? 5174)
const PLAYGROUND_URL = process.env.PLAYGROUND_URL ?? `http://localhost:${PLAYGROUND_PORT}/`

/** Per-run aztec run dir; the node's `--data-directory` is its `data` subdir. Mandatory even for
 *  in-memory mode because some aztec subsystems still write to ~/.aztec/data by default — two
 *  agents writing there at the same time will corrupt LMDB. On real disk (`E2E_DATA_ROOT`), NOT
 *  tmpfs. Recorded in the ownership lockfile so a future run — or `e2e:reap` — can clean it up if
 *  this run is killed before teardown. */
let AZTEC_RUN_DIR = plannedRunDir()

/** One launch marker per service, in its spawn environment and in the lock: the only identity
 *  teardown and the orphan reap act on. */
const MARKERS: Record<SandboxService, string> = { anvil: newMarker(), aztec: newMarker(), playground: newMarker() }
/** Set when the pack was claimed in the host registry for this run: nothing on it is adopted. */
const RUN_ID = claimedRunId()

let anvilProcess: ChildProcess | null = null
/** True only when THIS run wrote `.e2e-state/owned.json` (fresh sandbox or progressive partial
 *  lock). Teardown must never clear a lock it does not own: on the REUSE path (and on failures
 *  before any lock write) the file records a PRIOR run's still-live sandbox — deleting it would
 *  orphan those processes beyond reap. */
let weOwnLock = false

let weStartedAnvil = false
let nodeProcess: ChildProcess | null = null
let weStartedNode = false
let playgroundProcess: ChildProcess | null = null
let weStartedPlayground = false
/** Set once the prior lock has been reconciled: until then a live run in this worktree may own
 *  every Chrome the extension-path sweep would match. */
let reconciled = false

/** Probe a URL with HEAD/GET; returns true on any 2xx/3xx/4xx response. */
async function probeHttp(url: string, timeoutMs = 1500): Promise<boolean> {
	return new Promise((resolve) => {
		const req = http.get(url, { timeout: timeoutMs }, (res) => {
			res.resume() // drain
			resolve((res.statusCode ?? 0) > 0)
		})
		req.on("error", () => resolve(false))
		req.on("timeout", () => {
			req.destroy()
			resolve(false)
		})
	})
}

/**
 * Kill orphan Chrome test processes started by THIS extension build only.
 *
 * Scoping by extension path (not just `--test-type`) lets a parallel impl in
 * a different folder run its own Chromes without us murdering each other's
 * test runs.
 */
function killOrphanChromes() {
	killChromesLoading(EXTENSION_PATH)
}

/** Vitest globalSetup contract: with a DEFAULT export present, the named `teardown` export is
 *  IGNORED — the teardown must be the default's RETURN VALUE. The named export stayed dead for
 *  the suite's whole life (cleanup ran only via the best-effort process-exit hook), which is how
 *  half-booted sandboxes could outlive a failed run. The default now returns `teardown`, and a
 *  setup that dies midway (e.g. the node fails after anvil started) tears down what it already
 *  started before rethrowing — the exit-86 classifier reads boot MARKERS, not live processes, so
 *  cleanup cannot mask the boot-failure classification. */
export default async function setupWithTeardown(project: TestProject): Promise<() => Promise<void>> {
	try {
		await setup(project)
	} catch (err) {
		try {
			await teardown()
		} catch (cleanupErr) {
			console.warn("[e2e-setup] teardown after failed setup also failed:", cleanupErr)
		}
		throw err
	}
	return teardown
}

/**
 * Boot coordinator. The ORDER here is the contract: orphan reap + build guard run before the
 * boot-failure (exit 86) window opens; the provisional lock is written under the reconcile lock,
 * before the first spawn;
 * `markBootStarted()` sits between them and the first spawn so a missing-binary FATAL is still a
 * retryable boot failure; on reuse this run owns nothing (no provisional lock, `weOwnLock` stays
 * false) and skips straight to the shared tail.
 */
export async function setup(project: TestProject) {
	// Guard: ensure extension is built
	const manifest = path.join(EXTENSION_PATH, "manifest.json")
	if (!fs.existsSync(manifest)) {
		throw new Error(`No ${BROWSER} extension at ${EXTENSION_PATH}\nRun "bun run build" or "bun run dev" first.`)
	}
	project.provide("extensionPath", EXTENSION_PATH)

	console.log(
		`[e2e-setup] ports: anvil=:${ANVIL_PORT} aztec=:${AZTEC_PORT} (admin :${AZTEC_ADMIN_PORT}, p2p :${AZTEC_P2P_PORT}) playground=:${PLAYGROUND_PORT}`,
	)

	// The provisional lock names this run's owner and every service's marker before the first
	// spawn: from then on no other run's sweep touches what this one starts, and a run killed in
	// the minutes of boot still leaves the markers the next run reaps by.
	const prior = await withReconcileLock(async () => {
		const outcome = await reconcilePriorLock()
		if (outcome === "fresh") writeProvisionalLock()
		return outcome
	})
	reconciled = true
	await reapDeadRuns()
	if (prior === "reused") {
		await finishBoot(project)
		return
	}

	// Sandbox bring-up begins here — this opens the boot-failure (exit 86)
	// window. Manifest validation + orphan reap above are deliberately OUTSIDE
	// it: a failure there is a build/env problem, not an infra-boot flake, so it
	// must NOT be retried.
	markBootStarted()

	if (RUN_ID) {
		await assertPackFree({
			anvil: ANVIL_PORT,
			aztec: AZTEC_PORT,
			aztecAdmin: AZTEC_ADMIN_PORT,
			aztecP2P: AZTEC_P2P_PORT,
			playground: PLAYGROUND_PORT,
		})
	}

	if ((await ensureAnvil()) === "skip") {
		provideWithoutSandbox(project)
		return
	}
	if ((await ensureAztecNode()) === "skip") {
		provideWithoutSandbox(project)
		return
	}

	await ensureDevServer({
		label: "playground",
		title: "Playground",
		cwd: PLAYGROUND_DIR,
		url: PLAYGROUND_URL,
		env: { NODE_ENV: "test", VITE_DISABLE_HMR: "1", PLAYGROUND_PORT: String(PLAYGROUND_PORT) },
		setHandle: (child) => {
			playgroundProcess = child
		},
		setStarted: (started) => {
			weStartedPlayground = started
		},
	})

	await finishBoot(project)
}

/** The permissive skip exits (no sandbox, `E2E_REQUIRE_SETUP` unset): suites gate on
 *  `aztecTestConfig` being undefined; the dev-server URLs are still provided so the rest can run. */
function provideWithoutSandbox(project: TestProject): void {
	project.provide("aztecTestConfig", undefined)
	project.provide("playgroundUrl", PLAYGROUND_URL)
}

/** The shared tail of the reuse and fresh paths. The dev-server URLs are provided even when a
 *  server was not spawned (only the tests that need it fail), then contracts, then the ready
 *  marker. */
async function finishBoot(project: TestProject): Promise<void> {
	project.provide("playgroundUrl", PLAYGROUND_URL)
	await deployContractsAndProvide(project)
	// Sandbox healthy + contracts deployed, BEFORE any test worker starts —
	// this closes the boot-failure (exit 86) window. Any failure from here on
	// (fixture, import, test body) is a real failure, never an infra-boot flake.
	markBootReady()
}

// ── Lockfile: reap orphans or take over a still-healthy pack ───────
// `bun run e2e:agent` always allocates fresh ports, so the prior lock's
// ports never match the current ones — we fall through to reaping
// orphans, then a fresh spawn. Direct vitest invocations with stable
// env can land on the reuse path. Every throw here sits before the boot
// window: a usage problem, never retried as exit 86.
async function reconcilePriorLock(): Promise<"reused" | "fresh"> {
	const priorLock = readLock()
	if (!priorLock) return "fresh"
	if (priorLock.owner && !identityIsDead(priorLock.owner)) {
		throw new Error(
			`[e2e-setup] another run in this worktree holds the sandbox (owner ${priorLock.owner}, see .e2e-state/owned.json); wait for it to finish`,
		)
	}
	if (!RUN_ID && priorPortsMatch(priorLock)) {
		console.log("[e2e-setup] prior ownership lock matches current run — probing for reuse")
		if (await priorPackHealthy(priorLock)) {
			const identityOk = await verifyIdentity(LOCAL_NODE_URL, priorLock.l1ContractAddresses)
			if (identityOk) {
				console.log("[e2e-setup] reusing prior sandbox (identity check passed)")
				weStartedAnvil = false
				weStartedNode = false
				weStartedPlayground = false
				AZTEC_RUN_DIR = priorLock.aztecDataDir
				// The reused services still name their dead first owner; the lock's owner is what
				// keeps every sweep off them while this run lives.
				writeLock({ ...priorLock, owner: ownIdentity() })
				return "reused"
			}
			console.warn("[e2e-setup] prior sandbox identity mismatch — tearing down and starting fresh")
		} else {
			console.warn("[e2e-setup] prior sandbox not all healthy — tearing down")
		}
	} else {
		// Different ports — fresh agent run after a previous one in the
		// same worktree. Reap any orphans on the previous ports.
		console.log("[e2e-setup] prior lock is for different ports — reaping orphans")
	}
	const outcome = await reapPriorRun(priorLock)
	if (!outcome.cleared) throw new Error(`[e2e-setup] the prior run's sandbox could not be reaped: ${outcome.reason}`)
	clearLock()
	return "fresh"
}

/** Processes a prior run of this worktree left: a dead agent run's forks by run marker, and every
 *  Chrome loading this build, which no marker can find. Reconciliation has refused any other live
 *  run in this worktree, so these are not a live run's. */
async function reapDeadRuns(): Promise<void> {
	const status = process.platform === "linux" ? await sweepDeadRuns(REPO_ROOT) : "stopped"
	if (status !== "stopped") console.warn(`[e2e-setup] a dead run's processes are ${status}; \`bun run e2e:reap\` retries`)
	killOrphanChromes()
}

function priorPortsMatch(priorLock: OwnedState): boolean {
	const portsMatch =
		priorLock.ports.anvil === ANVIL_PORT &&
		priorLock.ports.aztec === AZTEC_PORT &&
		priorLock.ports.aztecAdmin === AZTEC_ADMIN_PORT &&
		priorLock.ports.aztecP2P === AZTEC_P2P_PORT &&
		priorLock.ports.playground === PLAYGROUND_PORT
	const urlMatch = priorLock.bakedLocalRpcUrl === LOCAL_NODE_URL
	return portsMatch && urlMatch
}

/** Every recorded process alive AND every endpoint answering, probed in the recorded order. */
async function priorPackHealthy(priorLock: OwnedState): Promise<boolean> {
	const allCoreAlive = SANDBOX_SERVICES.every((service) => isPidAlive(priorLock.pids[service]))
	return allCoreAlive && (await probeAnvil(ANVIL_URL)) && (await checkNodeHealth(LOCAL_NODE_URL)) && (await probeHttp(PLAYGROUND_URL))
}

// ── Anvil (L1) ─────────────────────────────────────────────────────
/** A bare run probes first: an L1 on chain 31337 already speaking JSON-RPC on its port is adopted,
 *  trusting it runs with `--slots-in-an-epoch 1`. An agent run adopts nothing. */
async function ensureAnvil(): Promise<"ready" | "skip"> {
	if (await mayAdopt(RUN_ID, () => probeAnvil(ANVIL_URL))) {
		console.log("[e2e-setup] Anvil already speaking JSON-RPC at", ANVIL_URL)
		weStartedAnvil = false
		return "ready"
	}
	if (!fs.existsSync(ANVIL_BIN)) {
		// Same fail-loud gate as the deploy-failure path below: when invoked
		// via scripts/e2e/agent.sh, missing infrastructure must abort the
		// run, not pass-by-skip. Otherwise CI reports `61 skipped` exit 0
		// and the suite stays silently broken (this once regressed in CI when
		// the setup-aztec action didn't symlink
		// ~/.aztec/current — every PR's network-e2e check was "green" while
		// running zero tests).
		if (process.env.E2E_REQUIRE_SETUP === "1") {
			throw new Error(
				`[e2e-setup] FATAL: anvil binary not found at ${ANVIL_BIN} and E2E_REQUIRE_SETUP=1 is set. ` +
					`Aborting run to prevent silent pass-by-skip. Ensure setup-aztec installed Aztec CLI ` +
					`AND created the ~/.aztec/current symlink (CI: see .github/actions/setup-aztec/action.yml).`,
			)
		}
		console.warn("[e2e-setup] anvil binary not found at", ANVIL_BIN, "— skipping network setup")
		return "skip"
	}
	console.log("[e2e-setup] Starting anvil at", ANVIL_URL, "...")
	anvilProcess = spawn(
		ANVIL_BIN,
		["--host", "127.0.0.1", "--port", String(ANVIL_PORT), "--chain-id", String(ANVIL_CHAIN_ID), "--slots-in-an-epoch", "1", "--silent"],
		{
			stdio: "pipe",
			detached: true,
			env: { ...process.env, ...launchEnv(MARKERS.anvil) },
		},
	)
	weStartedAnvil = true
	recordSpawnedPid()

	anvilProcess.stderr?.on("data", (data: Buffer) => {
		const line = data.toString().trim()
		if (line.includes("error") || line.includes("Error") || line.includes("address already in use")) {
			console.error("[anvil]", line.slice(0, 200))
		}
	})
	anvilProcess.once("exit", (code) => {
		if (weStartedAnvil && code !== 0 && code !== null) {
			console.error(`[anvil] exited unexpectedly with code ${code}`)
		}
	})

	try {
		await waitWhileAlive(
			anvilProcess,
			() => probeAnvil(ANVIL_URL),
			`anvil at ${ANVIL_URL}`,
			30_000,
			250,
			() => listenerIsOurs(ANVIL_PORT, MARKERS.anvil),
		)
		console.log("[e2e-setup] Anvil is ready")
	} catch (error) {
		console.error("[e2e-setup] Failed to start anvil:", error)
		await stopService(anvilProcess, "anvil", weStartedAnvil, MARKERS.anvil)
		anvilProcess = null
		// Under the real agent runner a dead sandbox MUST be a loud
		// failure, not a silent pass-by-skip — a green run where every
		// suite skipped hides exactly the breakage the gate exists for.
		if (process.env.E2E_REQUIRE_SETUP === "1") {
			throw new Error("[e2e-setup] FATAL: anvil failed to become healthy and E2E_REQUIRE_SETUP=1 is set.")
		}
		return "skip"
	}
	return "ready"
}

// ── Aztec (L2) ─────────────────────────────────────────────────────
/** A bare run probes first: a healthy node on its port is adopted. Otherwise the pinned toolchain is checked,
 *  the node is spawned with a per-run data directory, and a node that never becomes healthy is
 *  torn down together with anvil. A missing CLI leaves anvil alive until teardown, as before. */
async function ensureAztecNode(): Promise<"ready" | "skip"> {
	if (await mayAdopt(RUN_ID, () => checkNodeHealth(LOCAL_NODE_URL))) {
		console.log("[e2e-setup] Local Aztec node already running at", LOCAL_NODE_URL)
		weStartedNode = false
		return "ready"
	}
	console.log("[e2e-setup] Starting local Aztec network at", LOCAL_NODE_URL, "...")
	if (!AZTEC_PIN_USABLE) requirePinnedToolchainOrWarn()
	if (!fs.existsSync(AZTEC_BIN)) {
		// See comment above the matching ANVIL_BIN gate for the rationale.
		if (process.env.E2E_REQUIRE_SETUP === "1") {
			throw new Error(
				`[e2e-setup] FATAL: aztec CLI not found at ${AZTEC_BIN} and E2E_REQUIRE_SETUP=1 is set. ` +
					`Aborting run to prevent silent pass-by-skip. Ensure the repo's pinned aztec version is ` +
					`installed under ${path.join(AZTEC_HOME, "versions")} (aztec-up install ${AZTEC_PIN ?? "<pin>"}; ` +
					`CI: see .github/actions/setup-aztec/action.yml).`,
			)
		}
		console.warn("[e2e-setup] aztec CLI not found at", AZTEC_BIN, "— skipping network setup")
		return "skip"
	}

	// Mandatory --data-directory per agent: aztec writes to $HOME/.aztec/data
	// by default for some subsystems, which would corrupt LMDB if two
	// agents run concurrently with the default path.
	const node = spawnAztecNode(createRunDir(AZTEC_RUN_DIR, MARKERS.aztec))

	try {
		await waitWhileAlive(
			node,
			() => checkNodeHealth(LOCAL_NODE_URL),
			`the local Aztec node at ${LOCAL_NODE_URL}`,
			90_000,
			2_000,
			() => listenerIsOurs(AZTEC_PORT, MARKERS.aztec),
		)
		console.log("[e2e-setup] Local Aztec node is ready")
	} catch (error) {
		console.error("[e2e-setup] Failed to start local node:", error)
		await stopService(nodeProcess, "aztec", weStartedNode, MARKERS.aztec)
		nodeProcess = null
		await stopService(anvilProcess, "anvil", weStartedAnvil, MARKERS.anvil)
		anvilProcess = null
		// Same loud-failure contract as the anvil path: a node that never
		// became healthy (e.g. native bb SIGILL) must fail the run, not
		// skip it green.
		if (process.env.E2E_REQUIRE_SETUP === "1") {
			throw new Error("[e2e-setup] FATAL: local Aztec node failed to become healthy and E2E_REQUIRE_SETUP=1 is set.")
		}
		return "skip"
	}
	return "ready"
}

/** The pinned toolchain is unusable. Strict runs fail CLOSED: falling back to the mutable
 *  `current` symlink is exactly the drift that breaks the L1 deploy, and a silent skip/pass would
 *  hide it. Permissive runs warn, naming the fix, and boot from `current`. */
function requirePinnedToolchainOrWarn(): void {
	const reason = AZTEC_PIN
		? `pinned aztec ${AZTEC_PIN} at ${AZTEC_PINNED_ROOT} is missing: ${AZTEC_PIN_MISSING.join(", ")}`
		: `repo aztec pin unreadable (${AZTEC_PIN_READ.error})`
	if (process.env.E2E_REQUIRE_SETUP === "1") {
		throw new Error(
			`[e2e-setup] FATAL: ${reason}, and E2E_REQUIRE_SETUP=1 forbids the ${path.join(AZTEC_HOME, "current")} fallback. Fix: aztec-up install ${AZTEC_PIN ?? "<repo @aztec-labs/aztec.js pin>"}`,
		)
	}
	console.warn(
		`[e2e-setup] ${reason} — falling back to ${path.join(AZTEC_HOME, "current")}, which may mismatch the repo pin. Fix: aztec-up install ${AZTEC_PIN ?? "<pin>"}`,
	)
}

/** Spawn the pinned aztec CLI as its own process group, own it (handle → flag → lock record, in
 *  that order), and pipe its logs. */
function spawnAztecNode(dataDir: string): ChildProcess {
	const node = spawn(
		AZTEC_BIN,
		[
			"start",
			"--local-network",
			"--port",
			String(AZTEC_PORT),
			"--admin-port",
			String(AZTEC_ADMIN_PORT),
			"--p2p.p2pPort",
			String(AZTEC_P2P_PORT),
			"--l1-rpc-urls",
			ANVIL_URL,
			"--data-directory",
			dataDir,
			"--disable-admin-api-key",
		],
		{
			stdio: "pipe",
			detached: true,
			env: {
				...process.env,
				...launchEnv(MARKERS.aztec),
				PATH: `${AZTEC_INTERNAL_BIN}${path.delimiter}${process.env.PATH ?? ""}`,
				SEQ_MIN_TX_PER_BLOCK: "0",
				ETHEREUM_HOSTS: ANVIL_URL,
				// The CLI (scripts/aztec.sh) starts its own anvil on $ANVIL_PORT (8545 when unset);
				// kept on this setup's port, that anvil fails its bind instead of running a second L1.
				ANVIL_PORT: String(ANVIL_PORT),
				AZTEC_PORT: String(AZTEC_PORT),
				// Highest-priority override for @aztec-labs/ethereum's
				// resolveFoundryBinary: without these, the node's L1 deploy
				// reads `~/.aztec/current/internal-bin/forge` regardless of
				// which version's CLI is booting — a `current` re-pointed by
				// any other install on the machine then breaks the deploy
				// with a forge-CLI arg mismatch. A caller-supplied override
				// wins (same rule as the resolver itself); the executable
				// guard matters because the resolver THROWS on a
				// set-but-missing override rather than falling back.
				...(!process.env.FORGE_BIN && isExecutable(path.join(AZTEC_INTERNAL_BIN, "forge"))
					? { FORGE_BIN: path.join(AZTEC_INTERNAL_BIN, "forge") }
					: {}),
				...(!process.env.ANVIL_BIN && isExecutable(path.join(AZTEC_INTERNAL_BIN, "anvil"))
					? { ANVIL_BIN: path.join(AZTEC_INTERNAL_BIN, "anvil") }
					: {}),
			},
		},
	)
	nodeProcess = node
	weStartedNode = true
	recordSpawnedPid()
	console.log(`[e2e-setup] the aztec CLI (scripts/aztec.sh) also starts an anvil on :${ANVIL_PORT}; its bind error at boot is expected`)

	node.stdout?.on("data", (data: Buffer) => {
		const line = data.toString().trim()
		if (line.includes("Aztec") || line.includes("ready") || line.includes("error")) {
			console.log("[aztec-node]", line.slice(0, 200))
		}
	})
	node.stderr?.on("data", (data: Buffer) => {
		const line = data.toString().trim()
		if (line.includes("error") || line.includes("Error")) {
			console.error("[aztec-node]", line.slice(0, 200))
		}
	})
	return node
}

// ── Vite dev server (playground) ─────────────────────────────────
interface DevServerSpec {
	/** Log tag + the lower-case name in "Starting … dev server" / "Failed to start …". */
	label: SandboxService
	/** The capitalised name in "… already running" / "… is ready". */
	title: string
	cwd: string
	url: string
	env: Record<string, string>
	/** Handle ownership stays with the module-level slots; the helper assigns in the strict
	 *  order the provisional lock needs: handle → started flag → `recordSpawnedPid()`. */
	setHandle: (child: ChildProcess | null) => void
	setStarted: (started: boolean) => void
}

/** A bare run adopts a server already answering on its URL. Otherwise spawn `bun run dev`, own it,
 *  pipe its logs and wait up to 30 s. A server that fails to come up is killed; under
 *  `E2E_REQUIRE_SETUP=1` that fails the boot, else only the tests that depend on it fail. */
async function ensureDevServer(spec: DevServerSpec): Promise<void> {
	if (await mayAdopt(RUN_ID, () => probeHttp(spec.url, 1500))) {
		console.log(`[e2e-setup] ${spec.title} already running at`, spec.url)
		spec.setStarted(false)
		return
	}
	console.log(`[e2e-setup] Starting ${spec.label} dev server at`, spec.url, "...")
	let child: ChildProcess | null = null
	try {
		child = spawn("bun", ["run", "dev"], {
			cwd: spec.cwd,
			stdio: "pipe",
			detached: true,
			env: { ...process.env, ...launchEnv(MARKERS[spec.label]), ...spec.env },
		})
		spec.setHandle(child)
		spec.setStarted(true)
		recordSpawnedPid()

		child.stdout?.on("data", (data: Buffer) => {
			const line = data.toString().trim()
			if (line.includes("Local:") || line.includes("error")) {
				console.log(`[${spec.label}]`, line.slice(0, 200))
			}
		})
		child.stderr?.on("data", (data: Buffer) => {
			const line = data.toString().trim()
			if (line.includes("error") || line.includes("Error")) {
				console.error(`[${spec.label}]`, line.slice(0, 200))
			}
		})

		await waitWhileAlive(
			child,
			() => probeHttp(spec.url),
			spec.url,
			30_000,
			500,
			() => listenerIsOurs(PLAYGROUND_PORT, MARKERS[spec.label]),
		)
		console.log(`[e2e-setup] ${spec.title} is ready`)
	} catch (error) {
		console.warn(`[e2e-setup] Failed to start ${spec.label}:`, error)
		await stopService(child, spec.label, true, MARKERS[spec.label])
		spec.setHandle(null)
		if (process.env.E2E_REQUIRE_SETUP === "1") {
			throw new Error(`[e2e-setup] FATAL: ${spec.label} failed to become healthy and E2E_REQUIRE_SETUP=1 is set.`)
		}
	}
}

/**
 * Deploy SponsoredFPC + a test Token, write `.test-config.json`, and write
 * the ownership lock with PIDs + L1 contract addresses + the address book.
 * On reuse the lock's `deployedConfig` lets us recreate `.test-config.json`
 * without redeploying.
 */
async function deployContractsAndProvide(project: TestProject): Promise<void> {
	const existingLock = readLock()
	// A lock written before `tokenClassId` existed carries a config the
	// default-token seeding spec cannot use; redeploy rather than reuse it.
	if (existingLock?.deployedConfig?.nodeUrl === LOCAL_NODE_URL && existingLock.deployedConfig.tokenClassId) {
		fs.writeFileSync(CONFIG_PATH, JSON.stringify(existingLock.deployedConfig, null, 2))
		project.provide("aztecTestConfig", existingLock.deployedConfig as AztecTestConfig)
		console.log("[e2e-setup] reused deployed contracts from lockfile:", existingLock.deployedConfig)
		return
	}

	let l1ContractAddresses: Record<string, string> | undefined
	let config: AztecTestConfig | undefined
	try {
		console.log("[e2e-setup] Deploying test contracts...")
		const { wallet, accounts, node, cleanup } = await createTestWallet(LOCAL_NODE_URL)
		try {
			const nodeInfo = await node.getNodeInfo()
			l1ContractAddresses = serializeL1ContractAddresses(nodeInfo.l1ContractAddresses)
			const minterAddress = accounts[0]
			const { paymentMethod, address: sponsoredFpcAddress } = await createSponsoredFeeOptions(wallet)
			const feeOptions = { paymentMethod }

			const tokenAddress = await deployTestToken(wallet, minterAddress, feeOptions)
			const tokenClassId = await getContractClassId(node, tokenAddress)

			config = {
				nodeUrl: LOCAL_NODE_URL,
				tokenAddress,
				tokenClassId,
				sponsoredFpcAddress,
				minterAddress: minterAddress.toString(),
			}

			fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
			console.log("[e2e-setup] Test contracts deployed:", JSON.stringify(config, null, 2))
		} finally {
			await cleanup()
		}
		project.provide("aztecTestConfig", config)
	} catch (error) {
		console.error("[e2e-setup] Failed to deploy test contracts:", error)
		project.provide("aztecTestConfig", undefined)
		// Env-gated fail-loud. The `bun run e2e:agent` wrapper
		// (`scripts/e2e/agent.sh`) sets `E2E_REQUIRE_SETUP=1` to mark this
		// as a real test invocation where the sandbox is supposed to be
		// available. In that mode we propagate the deploy failure so vitest
		// exits non-zero with a clear message — instead of every test
		// gating on `describe.skipIf(!hasAztecTestConfig)` and silently
		// passing-by-skip. Without this gate, the suite was reporting
		// `61 skipped` exit 0 on every CI run since the public repo opened.
		//
		// For contributor-local invocations without the agent wrapper
		// (e.g. running vitest directly without an Aztec sandbox), the env
		// var is unset and we keep the legacy skip-silently behavior so
		// they aren't blocked from running unrelated tests.
		if (process.env.E2E_REQUIRE_SETUP === "1") {
			throw new Error(
				`[e2e-setup] FATAL: failed to deploy test contracts and E2E_REQUIRE_SETUP=1 is set. ` +
					`Aborting run to prevent silent pass-by-skip. Original error: ` +
					`${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	// Always write the lock once children are alive, even if contract deploy
	// failed — orphan cleanup on a future run is more valuable than the
	// missing identity field.
	if (weOwnLock) {
		writeLock(buildOwnedState({ l1ContractAddresses, deployedConfig: config }))
	} else {
		// REUSE path (this run started nothing): the on-disk lock records the PRIOR run's live pids.
		// Update ONLY the deployment fields in place - overwriting with our (empty) pid map and
		// claiming ownership would let teardown clear a lock whose processes we cannot reap later.
		const prior = readLock()
		if (prior) writeLock({ ...prior, l1ContractAddresses, deployedConfig: config })
	}
}

function buildOwnedState(extra: Partial<OwnedState> = {}): OwnedState {
	const pids = currentPids()
	return {
		startedAt: new Date().toISOString(),
		bakedLocalRpcUrl: LOCAL_NODE_URL,
		ports: {
			anvil: ANVIL_PORT,
			aztec: AZTEC_PORT,
			aztecAdmin: AZTEC_ADMIN_PORT,
			aztecP2P: AZTEC_P2P_PORT,
			playground: PLAYGROUND_PORT,
		},
		pids,
		starts: startTimes(pids),
		aztecDataDir: AZTEC_RUN_DIR,
		markers: MARKERS,
		owner: ownIdentity(),
		...extra,
	}
}

function writeProvisionalLock(): void {
	writeLock(buildOwnedState())
	weOwnLock = true
}

/** The lock's pids and start times, right after each spawn: what tells a later sweep that a
 *  recorded service is still running even once its environ cannot be read. */
function recordSpawnedPid(): void {
	if (!weOwnLock) return
	writeLock(buildOwnedState())
}

function currentPids(): OwnedState["pids"] {
	return {
		anvil: weStartedAnvil ? anvilProcess?.pid : undefined,
		aztec: weStartedNode ? nodeProcess?.pid : undefined,
		playground: weStartedPlayground ? playgroundProcess?.pid : undefined,
	}
}

function startTimes(pids: OwnedState["pids"]): OwnedState["starts"] {
	const starts: OwnedState["starts"] = {}
	for (const service of SANDBOX_SERVICES) {
		const pid = pids[service]
		try {
			const start = pid ? readStartTime(pid) : undefined
			if (start) starts[service] = start
		} catch {
			// Unrecorded, the service is judged by its environ alone.
		}
	}
	return starts
}

function serializeL1ContractAddresses(addrs: unknown): Record<string, string> {
	if (!addrs || typeof addrs !== "object") return {}
	const out: Record<string, string> = {}
	for (const [k, v] of Object.entries(addrs as Record<string, unknown>)) {
		if (v == null) continue
		// AztecAddress / EthAddress instances expose `.toString()`; primitives
		// stringify naturally. Anything else gets serialized as JSON.
		const s = typeof v === "object" && "toString" in v ? String(v) : JSON.stringify(v)
		out[k] = s
	}
	return out
}

/**
 * Identity assertion for the reuse path. Calls `getNodeInfo()` against the
 * candidate sandbox URL and compares its L1 contract addresses to what the
 * lockfile recorded. A foreign aztec on the same port reports different
 * addresses and is rejected.
 */
async function verifyIdentity(url: string, expected: Record<string, string> | undefined): Promise<boolean> {
	if (!expected || Object.keys(expected).length === 0) return false
	try {
		const { createAztecNodeClient } = await import("@aztec-labs/aztec.js/node")
		const node = createAztecNodeClient(url)
		const info = await node.getNodeInfo()
		const got = serializeL1ContractAddresses(info.l1ContractAddresses)
		for (const [k, v] of Object.entries(expected)) {
			if (got[k] !== v) {
				console.warn(`[e2e-setup] identity mismatch on ${k}: lock=${v} actual=${got[k] ?? "<missing>"}`)
				return false
			}
		}
		return true
	} catch (err) {
		console.warn("[e2e-setup] identity check failed:", err)
		return false
	}
}

export async function teardown() {
	try {
		fs.unlinkSync(CONFIG_PATH)
	} catch {
		// ignore
	}

	const playground = await stopService(playgroundProcess, "playground", weStartedPlayground, MARKERS.playground)
	playgroundProcess = null
	const node = await stopService(nodeProcess, "aztec", weStartedNode, MARKERS.aztec)
	nodeProcess = null
	const anvil = await stopService(anvilProcess, "anvil", weStartedAnvil, MARKERS.anvil)
	anvilProcess = null

	// Kept while any service may survive: the lock is the only record a later reap reads, and a
	// store deleted under a live node stays pinned as a deleted-but-open file.
	if (weOwnLock && playground === "stopped" && node === "stopped" && anvil === "stopped") {
		const dir = weStartedNode ? deletableRunDir(AZTEC_RUN_DIR, MARKERS.aztec) : undefined
		if (dir) fs.rmSync(dir, { recursive: true, force: true })
		clearLock()
	}
	if (reconciled) killOrphanChromes()
}

const onExit = () => {
	stopServiceOnExit(playgroundProcess, weStartedPlayground, MARKERS.playground)
	stopServiceOnExit(nodeProcess, weStartedNode, MARKERS.aztec)
	stopServiceOnExit(anvilProcess, weStartedAnvil, MARKERS.anvil)
	// Deliberately NO clearLock here: these are fire-and-forget TERMs. If a TERM-resistant
	// process survives, the lock is the ONLY record the next run's orphan reap can find it by.
	// The awaited teardown() (KILL escalation) remains the sole ownership-gated lock clearer.
}
process.on("SIGINT", onExit)
process.on("SIGTERM", onExit)
process.on("exit", onExit)

declare module "vitest" {
	export interface ProvidedContext {
		extensionPath: string
		aztecTestConfig?: AztecTestConfig
		playgroundUrl: string
	}
}
