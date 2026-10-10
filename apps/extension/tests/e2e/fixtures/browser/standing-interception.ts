import type { ArmedInterception, RpcInterception } from "./index"

type Arm<B> = (browser: B, extensionId: string, fromOrigin: string, mode: RpcInterception) => Promise<ArmedInterception>

interface Standing {
	origin: string
	extensionId: string
	fromOrigin: string
	mode: RpcInterception
	/** Undefined while a spec's own interception holds the origin. */
	current: ArmedInterception | undefined
	/** What earlier arms counted, kept across a spec's suspension. */
	hits: number
	failures: string[]
}

/**
 * Interceptions a launch holds for its whole life, one per browser and origin, beside a spec's
 * own. A spec arming an origin the launch holds suspends the launch's until the spec's `stop()`,
 * which re-arms it: two interceptions on one origin would race for each request, and Firefox
 * keeps one per origin. A failed re-arm is reported through the held interception's `failures`.
 */
export function standingInterceptions<B extends object>(arm: Arm<B>) {
	const held = new WeakMap<B, Map<string, Standing>>()

	const suspend = async (standing: Standing): Promise<void> => {
		const current = standing.current
		if (!current) return
		standing.current = undefined
		const [hits, failures] = await Promise.all([current.hits(), current.failures()])
		standing.hits += hits
		standing.failures.push(...failures)
		await current.stop()
	}

	const resume = async (browser: B, standing: Standing): Promise<void> => {
		if (held.get(browser)?.get(standing.origin) !== standing) return
		try {
			standing.current = await arm(browser, standing.extensionId, standing.fromOrigin, standing.mode)
		} catch (err) {
			standing.failures.push(`re-arming after a spec's own interception failed: ${String(err)}`)
		}
	}

	return {
		async hold(browser: B, extensionId: string, fromOrigin: string, mode: RpcInterception): Promise<ArmedInterception> {
			const origin = new URL(fromOrigin).origin
			const byOrigin = held.get(browser) ?? new Map<string, Standing>()
			if (byOrigin.has(origin)) throw new Error(`rpc-intercept: the launch already holds ${origin}`)
			const current = await arm(browser, extensionId, fromOrigin, mode)
			const standing: Standing = { origin, extensionId, fromOrigin, mode, current, hits: 0, failures: [] }
			byOrigin.set(origin, standing)
			held.set(browser, byOrigin)
			return {
				hits: async () => standing.hits + ((await standing.current?.hits()) ?? 0),
				failures: async () => [...standing.failures, ...((await standing.current?.failures()) ?? [])],
				stop: async () => {
					byOrigin.delete(origin)
					const current = standing.current
					standing.current = undefined
					await current?.stop()
				},
			}
		},

		async intercept(browser: B, extensionId: string, fromOrigin: string, mode: RpcInterception): Promise<ArmedInterception> {
			const standing = held.get(browser)?.get(new URL(fromOrigin).origin)
			if (!standing) return arm(browser, extensionId, fromOrigin, mode)
			if (!standing.current) throw new Error(`rpc-intercept: a spec already intercepts ${new URL(fromOrigin).origin}`)
			await suspend(standing)
			let own: ArmedInterception
			try {
				own = await arm(browser, extensionId, fromOrigin, mode)
			} catch (err) {
				await resume(browser, standing)
				throw err
			}
			return {
				...own,
				stop: async () => {
					try {
						await own.stop()
					} finally {
						await resume(browser, standing)
					}
				},
			}
		},
	}
}
