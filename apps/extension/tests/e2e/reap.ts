/**
 * `bun run e2e:reap` — session-end cleanup for local e2e runs.
 *
 * The teardown stack + next-run orphan reap only fire when a run exits cleanly or when the NEXT run
 * boots. When you stop running e2e (walk away after a burst, `git worktree remove` a throwaway
 * baseline), the last runs' sandboxes are never reaped — and each orphaned aztec process holds its
 * multi-GB data dir open, which under the old tmpfs layout pinned that space in RAM until the box
 * thrashed. This script is the explicit "clean up after myself" step:
 *
 *   1. Reap THIS worktree's sandbox (from `.e2e-state/owned.json`) once the run holding it is dead:
 *      stop every process carrying a service's marker whose own owner is dead, then remove the
 *      stamped run dir and clear the lock.
 *   2. Stop every process of a dead agent run of this worktree (forks) by its run marker and, unless
 *      a live run holds the worktree, every Chrome loading its `dist/chrome`: Chrome shows no marker.
 *   3. Release Firefox launches (geckodriver, its Firefox, the profile) whose owning test run is
 *      gone — otherwise they wait for the next Firefox launch on this host to sweep them.
 *   4. Sweep {@link E2E_DATA_ROOT} for `nulo-aztec-<pid>-*` dirs nothing uses any more.
 *   5. Drop this worktree's rows from the host port registry whose owning run is dead. Never a row
 *      by the run id `ports.json` names: that file is writable by anything, and a live run's rows
 *      must outlast any reap.
 *
 * Ownership-scoped by design: it signals only processes whose own environment names this worktree's
 * markers and a dead owner — never a blanket `pkill -f aztec` that could hit another agent.
 */
import { reapOrphanLaunches } from "./fixtures/browser/ownership"
import path from "node:path"
import { REPO_ROOT, clearLock, readLock, withReconcileLock } from "./lockfile"
import { identityIsDead } from "./owned-processes"
import { releaseDeadRows } from "./port-registry"
import { killChromesLoading, reapPriorRun, sweepDeadRuns, sweepOrphanDataDirs } from "./sandbox-ownership"

/** Under the reconcile lock, so a setup in this worktree cannot adopt the sandbox mid-reap. */
async function reapOwnedRun(): Promise<boolean> {
	const lock = readLock()
	if (!lock) return false
	console.log("[e2e:reap] found owned.json — reaping this worktree's sandbox")
	const outcome = await reapPriorRun(lock)
	if (!outcome.cleared) {
		console.warn(`[e2e:reap] kept owned.json: ${outcome.reason}`)
		return false
	}
	clearLock()
	console.log("[e2e:reap] stopped the sandbox and cleared the lock")
	return true
}

const reaped = await withReconcileLock(reapOwnedRun)
const runs = process.platform === "linux" ? await sweepDeadRuns(REPO_ROOT) : "stopped"
if (runs !== "stopped") console.warn(`[e2e:reap] a dead run's processes are ${runs}`)
const owner = readLock()?.owner
if (owner === undefined || identityIsDead(owner)) killChromesLoading(path.join(REPO_ROOT, "apps/extension/dist/chrome"))
else console.log(`[e2e:reap] a live run (${owner}) holds this worktree; its Chromes stay`)
const launches = process.platform === "linux" ? await reapOrphanLaunches() : []
const swept = sweepOrphanDataDirs()
for (const dir of swept) console.log(`[e2e:reap] swept orphan data dir ${dir}`)
const rows = (await releaseDeadRows(REPO_ROOT)) ?? 0
console.log(
	`[e2e:reap] done (sandbox reaped: ${reaped}, orphaned Firefox launches released: ${launches.length}, orphan data dirs swept: ${swept.length}, dead registry rows dropped: ${rows})`,
)
