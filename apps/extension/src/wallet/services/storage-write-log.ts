import type { StorageArea } from "@nulo/wallet-core/ports"

/**
 * Shared test-only helper: records `set` and `remove` calls on `area` whose key starts with
 * `prefix`, in call order, as `set:<key>` and `remove:<key>`. `beforeSet` runs before a matching set
 * applies and `afterSet` once it has resolved, before its caller resumes, which is where a test
 * lands a racing deletion. A hook that returns a promise holds the set (or its caller) until it
 * settles; one that rejects rejects the set. Imported only by test files, like `composition-harness.ts`.
 */
export function recordWrites(
	area: StorageArea,
	prefix: string,
	afterSet?: (key: string) => unknown,
	beforeSet?: (key: string) => unknown,
): { log: string[]; restore: () => void } {
	const log: string[] = []
	const set = area.set.bind(area)
	const remove = area.remove.bind(area)
	area.set = async (entries) => {
		const keys = Object.keys(entries).filter((key) => key.startsWith(prefix))
		for (const key of keys) {
			const held = beforeSet?.(key)
			// Only a promise is awaited, so a synchronous hook adds no turn before the caller resumes.
			if (held instanceof Promise) await held
		}
		await set(entries)
		for (const key of keys) {
			log.push(`set:${key}`)
			const held = afterSet?.(key)
			if (held instanceof Promise) await held
		}
	}
	area.remove = async (keys) => {
		for (const key of typeof keys === "string" ? [keys] : keys) {
			if (key.startsWith(prefix)) log.push(`remove:${key}`)
		}
		await remove(keys)
	}
	return {
		log,
		restore: () => {
			area.set = set
			area.remove = remove
		},
	}
}
