import type { ArmedInterception, RpcInterception } from "./index"

type Arm<B> = (
	browser: B,
	extensionId: string,
	fromOrigin: string,
	mode: RpcInterception,
	backgroundDown?: boolean,
) => Promise<ArmedInterception>

interface Standing {
	origin: string
	extensionId: string
	fromOrigin: string
	mode: RpcInterception
	/** Undefined while a spec's interception or a background kill has the origin. */
	current: ArmedInterception | undefined
	/** Reserved while a spec's interception or a background kill has the origin, until the launch's is re-armed. */
	overridden: boolean
	/** What earlier arms counted, kept across a suspension. */
	hits: number
	failures: string[]
}

/**
 * Interceptions a launch holds for its whole life, one per browser and origin, beside a spec's
 * own. A spec arming an origin the launch holds suspends the launch's until the spec's `stop()`,
 * which re-arms it: two interceptions on one origin would race for each request, and Firefox
 * keeps one per origin. A background kill also suspends them: on Chrome, a session attached to the
 * stopping service worker keeps its host for the successor, which then never starts clean; a spec's
 * own stays armed through a kill, and so carries that hazard. The held
 * interception's `failures` also carry the spec's, a failed re-arm, and a spec's interception still
 * unstopped when they are read. A re-arm that lands after the launch let go is stopped at once, so
 * nothing is left armed unowned.
 */
export function standingInterceptions<B extends object>(arm: Arm<B>) {
	const held = new WeakMap<B, Map<string, Standing>>()
	const isHeld = (browser: B, standing: Standing) => held.get(browser)?.get(standing.origin) === standing

	const drain = async (standing: Standing, interception: ArmedInterception, label = ""): Promise<void> => {
		try {
			standing.failures.push(...(await interception.failures()).map((failure) => `${label}${failure}`))
		} finally {
			await interception.stop()
		}
	}

	const suspend = async (standing: Standing): Promise<void> => {
		const current = standing.current
		standing.current = undefined
		if (!current) return
		try {
			standing.hits += await current.hits()
		} finally {
			await drain(standing, current)
		}
	}

	const resume = async (browser: B, standing: Standing, backgroundDown = false): Promise<void> => {
		if (!isHeld(browser, standing) || standing.current) return
		let rearmed: ArmedInterception
		try {
			rearmed = await arm(browser, standing.extensionId, standing.fromOrigin, standing.mode, backgroundDown)
		} catch (err) {
			standing.failures.push(`re-arming the launch's interception failed: ${String(err)}`)
			return
		}
		if (isHeld(browser, standing) && !standing.current) standing.current = rearmed
		else await rearmed.stop().catch((err) => standing.failures.push(`stopping a re-arm nothing holds failed: ${String(err)}`))
	}

	return {
		/** Runs `run` with the launch's interceptions on `browser` stopped, then re-arms them; a spec's own stays armed. */
		async whileReleased<T>(browser: B, run: () => Promise<T>): Promise<T> {
			const released = [...(held.get(browser)?.values() ?? [])].filter((standing) => !standing.overridden)
			for (const standing of released) standing.overridden = true
			try {
				for (const standing of released) await suspend(standing)
				return await run()
			} finally {
				for (const standing of released) {
					await resume(browser, standing, true).finally(() => {
						standing.overridden = false
					})
				}
			}
		},

		async hold(browser: B, extensionId: string, fromOrigin: string, mode: RpcInterception): Promise<ArmedInterception> {
			const origin = new URL(fromOrigin).origin
			const byOrigin = held.get(browser) ?? new Map<string, Standing>()
			if (byOrigin.has(origin)) throw new Error(`rpc-intercept: the launch already holds ${origin}`)
			const current = await arm(browser, extensionId, fromOrigin, mode)
			const standing: Standing = { origin, extensionId, fromOrigin, mode, current, overridden: false, hits: 0, failures: [] }
			byOrigin.set(origin, standing)
			held.set(browser, byOrigin)
			return {
				hits: async () => standing.hits + ((await standing.current?.hits()) ?? 0),
				failures: async () => [
					...standing.failures,
					...((await standing.current?.failures()) ?? []),
					...(standing.overridden ? [`the launch's interception on ${origin} was not re-armed before this read`] : []),
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
			if (standing.overridden) throw new Error(`rpc-intercept: ${standing.origin} is taken by a spec's interception or a kill`)
			standing.overridden = true
			let own: ArmedInterception
			try {
				await suspend(standing)
				own = await arm(browser, extensionId, fromOrigin, mode)
			} catch (err) {
				await resume(browser, standing).finally(() => {
					standing.overridden = false
				})
				throw err
			}
			let stopping: Promise<void> | undefined
			return {
				...own,
				stop: () => {
					stopping ??= (async () => {
						try {
							await drain(standing, own, "a spec's interception: ")
						} finally {
							await resume(browser, standing).finally(() => {
								standing.overridden = false
							})
						}
					})()
					return stopping
				},
			}
		},
	}
}
