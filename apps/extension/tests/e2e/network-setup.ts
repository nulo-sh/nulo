import { getHeapStatistics } from "node:v8"
import { FORK_HEAP_MIB } from "./run-limits"
import { markTestsStarted } from "./sentinel"

// Runs once per test-file worker, before any test body, AFTER global-setup. The
// first worker to load marks that test execution was reached — read by the boot
// classifier so a run where tests actually started is never misclassified as an
// infra-boot failure (exit 86).
markTestsStarted()

// V8 adds its young generation (192 MiB on Node 24) to the old-space cap; a fork the config's
// execArgv never reached reports the default instead (4288 MiB on a hosted runner).
const heapLimitMib = getHeapStatistics().heap_size_limit / 2 ** 20
if (heapLimitMib < FORK_HEAP_MIB || heapLimitMib > FORK_HEAP_MIB + 512) {
	throw new Error(`this fork's V8 heap limit is ${heapLimitMib} MiB, not the ${FORK_HEAP_MIB} MiB cap`)
}
