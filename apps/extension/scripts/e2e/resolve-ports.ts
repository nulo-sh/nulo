/**
 * Resolve a unique port pack for one parallel e2e run and persist it to
 * `.e2e-state/ports.json`. The agent wrapper (`scripts/e2e/agent.sh`)
 * reads that file to feed both the wallet build (`VITE_LOCAL_NETWORK_RPC_URL`)
 * and the test runner (`AZTEC_NODE_URL` / `ANVIL_URL` / `PLAYGROUND_URL` /
 * `ANVIL_PORT` / `AZTEC_PORT` / `PLAYGROUND_PORT`). Under `NULO_E2E_OWNER_PID` the pack is
 * claimed in the host registry (`tests/e2e/port-registry.ts`) first, so every other run on the
 * host draws around it from that moment, not from the moment something listens on it.
 *
 * Why bind-and-release rather than bind-and-hold:
 *
 *   The wallet is built BEFORE the test runner starts (the build bakes the
 *   aztec URL via `import.meta.env.VITE_LOCAL_NETWORK_RPC_URL`). The build
 *   process and the test runner are sibling shell commands — there is no
 *   handle we can pass for "this socket is mine, please reuse it." Holding
 *   the sockets across the build would require keeping this script alive
 *   for minutes and turning the build/test sequence into its children,
 *   which is unnecessary infrastructure.
 *
 *   So there is an unavoidable resolve→build→bind gap. The danger is not a
 *   foreign dev tool — it is the kernel itself: a listener bound via
 *   `listen(0)` gets a port from the OS *dynamic/ephemeral* range
 *   (`/proc/sys/net/ipv4/ip_local_port_range`, e.g. 32768–60999 on the CI
 *   runner). That is the SAME range the kernel draws from for the source
 *   port of every *outgoing* connection. The wallet build opens many
 *   outgoing sockets; during the gap one of them can be assigned the port
 *   we just released, and because the aztec-node port is baked into the
 *   bundle a collision is unrecoverable — the node's `.listen()` throws
 *   `Address already in use`, the boot classifier maps it to exit 86, and
 *   the retry (fresh ports + rebuild) rolls the same dice again. Across the
 *   ~7 parallel network-e2e jobs this made a fully-green run improbable
 *   (the sticky boot flake).
 *
 *   Fix: draw our listener ports from a STATIC window strictly *below* the
 *   ephemeral floor. The kernel never assigns those as outgoing source
 *   ports, so the resolve→build→bind gap is no longer a race for them. We
 *   bind-test each candidate and, if the static path can't apply (floor
 *   unreadable, window exhausted), fall back to `listen(0)` — never worse
 *   than the prior behavior on any platform.
 */
import { randomBytes } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "node:net"
import { REPO_ROOT } from "../../tests/e2e/lockfile"
import { newMarker, readStartTime } from "../../tests/e2e/owned-processes"
import { PortClaimConflict, type RegistryOptions, claimPorts, registeredPorts, releasePorts } from "../../tests/e2e/port-registry"

export interface PortReservation {
	port: number
	release: () => Promise<void>
}

const DEFAULT_EPHEMERAL_FLOOR = 32768
/** Bottom of the static window. Above the privileged range, clear of common dev ports. */
const STATIC_LO = 10000
/** Guard band kept clear immediately below the ephemeral floor. */
const FLOOR_GUARD = 512
/** Bounded random probes before conceding to the `listen(0)` fallback. */
const MAX_STATIC_TRIES = 256
const MAX_EPHEMERAL_TRIES = 16
/** Fetch's bad ports (fetch.spec.whatwg.org/#port-blocking): browsers refuse them, and Node's fetch
 *  and WebSocket refuse them before opening any connection. */
const FETCH_BAD_PORTS = new Set([
	0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115,
	117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601,
	636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697,
	10080,
])

/**
 * Read the bottom of the OS dynamic/ephemeral port range. Ports at or above
 * this can be handed to outgoing connections; ports below it cannot, which is
 * exactly the property we need for a collision-immune listener.
 */
export async function ephemeralFloor(): Promise<number> {
	try {
		const raw = await readFile("/proc/sys/net/ipv4/ip_local_port_range", "utf-8")
		const lo = Number.parseInt(raw.trim().split(/\s+/)[0] ?? "", 10)
		return Number.isFinite(lo) && lo > STATIC_LO + 256 ? lo : DEFAULT_EPHEMERAL_FLOOR
	} catch {
		return DEFAULT_EPHEMERAL_FLOOR
	}
}

/**
 * Attempt to bind (and hold) one specific port on loopback. Resolves to a
 * reservation on success, or `null` on ANY failure (port taken, permission,
 * teardown race) — never throws, so the caller's probe loop stays simple.
 */
function tryBind(port: number): Promise<PortReservation | null> {
	return new Promise((res) => {
		const srv = createServer()
		srv.unref() // Don't keep the event loop alive on its own.
		let settled = false
		const settle = (v: PortReservation | null) => {
			if (settled) return
			settled = true
			res(v)
		}
		srv.once("error", () => {
			srv.close()
			settle(null)
		})
		srv.listen(port, "127.0.0.1", () => {
			const addr = srv.address()
			if (!addr || typeof addr !== "object") {
				srv.close()
				settle(null)
				return
			}
			settle({
				port: addr.port,
				release: () =>
					new Promise<void>((rs) => {
						srv.close(() => rs())
					}),
			})
		})
	})
}

/** Original OS-assigned ephemeral reservation — retained as the fallback. */
function reserveEphemeral(): Promise<PortReservation> {
	return new Promise((resolveReservation, reject) => {
		const srv = createServer()
		srv.unref()
		srv.listen(0, "127.0.0.1", () => {
			const addr = srv.address()
			if (!addr || typeof addr !== "object") {
				reject(new Error("listen returned no address"))
				return
			}
			resolveReservation({
				port: addr.port,
				release: () =>
					new Promise<void>((rs) => {
						srv.close(() => rs())
					}),
			})
		})
		srv.once("error", reject)
	})
}

/**
 * Reserve one loopback port from the static window below the ephemeral floor,
 * never a Fetch bad port nor one in `exclude` (the ports other runs have claimed
 * but may not have bound yet), randomized to keep parallel local runs apart and
 * bind-tested against already-held siblings so the pack stays distinct. Falls
 * back to an OS-assigned ephemeral port when the static path can't apply.
 */
export async function reservePort(exclude: ReadonlySet<number> = new Set()): Promise<PortReservation> {
	const { lo, hi } = staticWindow(await ephemeralFloor())
	const span = hi - lo
	if (span >= 256) {
		for (let i = 0; i < MAX_STATIC_TRIES; i++) {
			const candidate = lo + Math.floor(Math.random() * span)
			if (FETCH_BAD_PORTS.has(candidate) || exclude.has(candidate)) continue
			const reservation = await tryBind(candidate)
			if (reservation) return reservation
		}
	}
	for (let i = 0; i < MAX_EPHEMERAL_TRIES; i++) {
		const reservation = await reserveEphemeral()
		if (!exclude.has(reservation.port)) return reservation
		await reservation.release()
	}
	throw new Error(`no free port outside the ${exclude.size} the host registry lists`)
}

/** The static window `[lo, hi)` the draw uses under a given ephemeral floor. */
export function staticWindow(floor: number): { lo: number; hi: number } {
	return { lo: STATIC_LO, hi: Math.max(STATIC_LO + 256, floor - FLOOR_GUARD) }
}

export interface PortPack {
	anvil: number
	aztec: number
	aztecAdmin: number
	aztecP2P: number
	playground: number
}

export async function reservePortPack(
	exclude: ReadonlySet<number> = registeredPorts(),
): Promise<{ ports: PortPack; release: () => Promise<void> }> {
	const r = {
		anvil: await reservePort(exclude),
		aztec: await reservePort(exclude),
		aztecAdmin: await reservePort(exclude),
		aztecP2P: await reservePort(exclude),
		playground: await reservePort(exclude),
	}
	const ports: PortPack = {
		anvil: r.anvil.port,
		aztec: r.aztec.port,
		aztecAdmin: r.aztecAdmin.port,
		aztecP2P: r.aztecP2P.port,
		playground: r.playground.port,
	}
	return {
		ports,
		release: async () => {
			await Promise.all([r.anvil.release(), r.aztec.release(), r.aztecAdmin.release(), r.aztecP2P.release(), r.playground.release()])
		},
	}
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORTS_PATH = resolve(__dirname, "../../.e2e-state/ports.json")
/** A conflict means another run claimed a drawn port between the unlocked read and the claim. */
const MAX_CLAIM_DRAWS = 5

/** `undefined` for a bare invocation, which claims nothing. */
function parseOwnerPid(raw: string | undefined): number | undefined {
	if (raw === undefined || raw === "") return undefined
	if (!/^\d+$/.test(raw) || Number(raw) <= 0) throw new Error(`NULO_E2E_OWNER_PID must be a pid, got ${JSON.stringify(raw)}`)
	return Number(raw)
}

async function claimPack(
	runId: string,
	ownerPid: number,
	registry: RegistryOptions,
): Promise<{ ports: PortPack; release: () => Promise<void> }> {
	for (let draw = 1; ; draw++) {
		const pack = await reservePortPack(registeredPorts(registry.file))
		try {
			await claimPorts({ runId, ports: { ...pack.ports }, ownerPid, worktree: REPO_ROOT }, registry)
			return pack
		} catch (err) {
			await pack.release()
			if (!(err instanceof PortClaimConflict) || draw >= MAX_CLAIM_DRAWS) throw err
		}
	}
}

export interface ResolveOptions {
	/** The raw `NULO_E2E_OWNER_PID`: the process the claim lasts as long as. */
	ownerPid?: string
	portsPath?: string
	registry?: RegistryOptions
}

/** The run marker `agent.sh` exports to everything the run starts, and the owner it names: once
 *  that owner is dead, `e2e:reap` and the next run's setup stop whatever still carries the marker. */
function runIdentity(ownerPid: number): Record<string, string> {
	const startTime = readStartTime(ownerPid)
	return { runMarker: newMarker(), ...(startTime ? { runOwner: `${ownerPid}:${startTime}` } : {}), worktree: REPO_ROOT }
}

/**
 * Draws a pack and, when an owner pid is given, claims it in the host registry under a fresh run
 * id before writing `ports.json` with the run's marker. A `ports.json` that cannot be written
 * releases the claim: no run would ever release it.
 */
export async function resolvePorts(opts: ResolveOptions = {}): Promise<{ runId?: string; ports: PortPack }> {
	const { portsPath = PORTS_PATH, registry = {} } = opts
	const ownerPid = parseOwnerPid("ownerPid" in opts ? opts.ownerPid : process.env.NULO_E2E_OWNER_PID)
	const runId = ownerPid === undefined ? undefined : `nulo-e2e-${ownerPid}-${randomBytes(4).toString("hex")}`
	const { ports, release } =
		runId && ownerPid ? await claimPack(runId, ownerPid, registry) : await reservePortPack(registeredPorts(registry.file))
	try {
		await mkdir(dirname(portsPath), { recursive: true })
		const payload = {
			...ports,
			anvilUrl: `http://127.0.0.1:${ports.anvil}`,
			aztecUrl: `http://localhost:${ports.aztec}`,
			playgroundUrl: `http://localhost:${ports.playground}/`,
			...(runId && ownerPid ? { runId, ...runIdentity(ownerPid) } : {}),
			resolvedAt: new Date().toISOString(),
		}
		await writeFile(portsPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8")
	} catch (err) {
		if (runId) await releasePorts(runId, registry)
		throw err
	} finally {
		await release()
	}
	return { runId, ports }
}

async function main() {
	const releaseIndex = process.argv.indexOf("--release")
	if (releaseIndex !== -1) {
		const runId = process.argv[releaseIndex + 1]
		if (!runId) throw new Error("--release needs a run id")
		process.exitCode = (await releasePorts(runId)) ? 0 : 1
		return
	}
	const { runId, ports } = await resolvePorts()
	process.stdout.write(
		`${[
			`[resolve-ports] anvil=:${ports.anvil} aztec=:${ports.aztec} (admin :${ports.aztecAdmin}, p2p :${ports.aztecP2P}) playground=:${ports.playground}`,
			runId
				? `[resolve-ports] claimed in the host registry as ${runId}`
				: "[resolve-ports] NULO_E2E_OWNER_PID is unset: the pack is not claimed in the host registry",
			`[resolve-ports] wrote ${PORTS_PATH}`,
		].join("\n")}\n`,
	)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
	main().catch((err) => {
		console.error("[resolve-ports] failed:", err)
		process.exit(1)
	})
}
