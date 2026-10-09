import type { ChildProcess } from "node:child_process"
import { createServer } from "node:net"

/**
 * Boot rules for a run whose ports were claimed in the host registry moments before (an agent run,
 * which has a run id). A listener on one of them cannot be this run's, and nothing can prove what
 * it is, so it is refused rather than adopted. A bare run (no run id) still adopts the services a
 * developer started on its fixed ports.
 */

/** The run id `agent.sh` exports once `resolve-ports` has claimed the pack; absent on a bare run. */
export const claimedRunId = (): string | undefined => process.env.NULO_E2E_RUN_ID || undefined

/** Adopting an answering listener is a bare run's convenience only. */
export async function mayAdopt(runId: string | undefined, answers: () => Promise<boolean>): Promise<boolean> {
	return runId === undefined && (await answers())
}

/** Resolves when nothing listens on `port`, on any address. */
function isFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const srv = createServer()
		srv.unref()
		srv.once("error", () => resolve(false))
		// No host: the dual-stack wildcard, which a listener on any local address blocks.
		srv.listen(port, () => srv.close(() => resolve(true)))
	})
}

/** Throws naming the first service whose claimed port something already listens on. */
export async function assertPackFree(ports: Record<string, number>): Promise<void> {
	for (const [service, port] of Object.entries(ports)) {
		if (!(await isFree(port)))
			throw new Error(
				`[e2e-setup] ${service}'s claimed port ${port} is already in use; this run will not adopt a listener it did not start`,
			)
	}
}

const hasExited = (child: ChildProcess) => child.exitCode !== null || child.signalCode !== null

/**
 * Polls `ready` until it answers, failing as soon as `child` has exited: once this run's process is
 * gone, whatever answers the probe is a stranger that bound the port after it.
 */
export async function waitWhileAlive(
	child: ChildProcess,
	ready: () => Promise<boolean>,
	what: string,
	timeoutMs: number,
	pollMs: number,
): Promise<void> {
	const deadline = Date.now() + timeoutMs
	for (;;) {
		const answered = await ready()
		if (hasExited(child))
			throw new Error(
				`${what}: the process this run started exited (code ${child.exitCode}, signal ${child.signalCode}) before it answered`,
			)
		if (answered) return
		if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${what} (${timeoutMs}ms)`)
		await new Promise((resolve) => setTimeout(resolve, pollMs))
	}
}
