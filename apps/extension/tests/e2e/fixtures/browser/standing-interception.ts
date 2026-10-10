import type { ArmedInterception, RpcInterception } from "./index"

type Arm<B> = (browser: B, extensionId: string, fromOrigin: string, mode: RpcInterception) => Promise<ArmedInterception>

interface Standing {
	origin: string
	extensionId: string
	fromOrigin: string
	mode: RpcInterception
	/** Undefined while a spec's own interception holds the origin. */
	current: ArmedInterception | undefined
	/** Set while a spec's own interception holds the origin. */
	override: ArmedInterception | undefined
	/** What earlier arms counted, kept across a spec's suspension. */
	hits: number
	failures: string[]
}

/**
 * Interceptions a launch holds for its whole life, one per browser and origin, beside a spec's
 * own. A spec arming an origin the launch holds suspends the launch's until the spec's `stop()`,
 * which re-arms it: two interceptions on one origin would race for each request, and Firefox
 * keeps one per origin. The held interception's `failures` also carry the spec's, a failed re-arm,
 * and a spec's interception still unstopped when they are read.
 */
export function standingInterceptions<B extends object>(arm: Arm<B>) {
	const held = new WeakMap<B, Map<string, Standing>>()
	const isHeld = (browser: B, standing: Standing) => held.get(browser)?.get(standing.origin) === standing

	const drain = async (standing: Standing, interception: ArmedInterception, label = ""): Promise<void> => {
		standing.failures.push(...(await interception.failures()).map((failure) => `${label}${failure}`))
		await interception.stop()
	}

	const resume = async (browser: B, standing: Standing): Promise<void> => {
		if (!isHeld(browser, standing) || standing.current) return
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
			const standing: Standing = { origin, extensionId, fromOrigin, mode, current, override: undefined, hits: 0, failures: [] }
			byOrigin.set(origin, standing)
			held.set(browser, byOrigin)
			return {
				hits: async () => standing.hits + ((await standing.current?.hits()) ?? 0),
				failures: async () => [
					...standing.failures,
					...((await standing.current?.failures()) ?? []),
					...(standing.override ? [`a spec's interception on ${origin} was never stopped`] : []),
				],
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
			if (standing.override) throw new Error(`rpc-intercept: a spec already intercepts ${standing.origin}`)
			const current = standing.current
			standing.current = undefined
			if (current) {
				standing.hits += await current.hits()
				await drain(standing, current)
			}
			let own: ArmedInterception
			try {
				own = await arm(browser, extensionId, fromOrigin, mode)
			} catch (err) {
				await resume(browser, standing)
				throw err
			}
			standing.override = own
			let stopping: Promise<void> | undefined
			return {
				...own,
				stop: () => {
					stopping ??= (async () => {
						try {
							await drain(standing, own, "a spec's interception: ")
						} finally {
							standing.override = undefined
							await resume(browser, standing)
						}
					})()
					return stopping
				},
			}
		},
	}
}
