import { getHeapStatistics } from "node:v8"
import { afterAll } from "vitest"
import { markTestsStarted } from "./sentinel"

// Runs once per test-file worker, before any test body, AFTER global-setup. The
// first worker to load marks that test execution was reached — read by the boot
// classifier so a run where tests actually started is never misclassified as an
// infra-boot failure (exit 86).
markTestsStarted()

// Temporary calibration sampler: this fork's peak V8 heap and its default limit.
let peakHeap = 0
const sampleHeap = () => {
	peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed)
}
const heapTimer = setInterval(sampleHeap, 1_000)
heapTimer.unref()
afterAll(() => {
	clearInterval(heapTimer)
	sampleHeap()
	const mib = (n: number) => Math.ceil(n / 2 ** 20)
	console.log(
		`[heap-sample] pid ${process.pid} peak heapUsed ${mib(peakHeap)} MiB, heap_size_limit ${mib(getHeapStatistics().heap_size_limit)} MiB`,
	)
})
