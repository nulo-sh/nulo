import type { Mock } from "vitest"

/** Every call of the named mocks, as their names in the order the calls were made. */
export function callSequence(mocks: Record<string, unknown>): string[] {
	return Object.entries(mocks)
		.flatMap(([name, fn]) => (fn as Mock).mock.invocationCallOrder.map((at) => [at, name] as const))
		.sort(([a], [b]) => a - b)
		.map(([, name]) => name)
}
