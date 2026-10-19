/** Test-only. Reads the run of a discovery for a suite that replaces `./discovery-flow` with a
 *  pass-through `handleDiscovery` spy (`vi.mock` is hoisted per file, so each suite declares it). */
import { vi } from "vitest"
import { handleDiscovery } from "./discovery-flow"

/** The run of `requestId`'s latest discovery, as the spy returned it: it settles once that discovery
 *  is answered, and never while it is parked. It does not cover work the run starts and drops. */
export function discoveryRun(requestId: string): Promise<void> {
	const { calls, results } = vi.mocked(handleDiscovery).mock
	return results[calls.findLastIndex(([discovery]) => discovery.requestId === requestId)].value as Promise<void>
}
