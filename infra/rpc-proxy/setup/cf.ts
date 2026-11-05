/**
 * The Cloudflare v4 client the setup scripts share. The token comes from a keyed run's environment
 * and goes into one header; nothing here prints it, a response body or a query string.
 */
export const API = "https://api.cloudflare.com/client/v4"

export type CfError = { code: number; message: string }
type Envelope<T> = { success: boolean; errors?: CfError[]; result: T }

export class CfRequestError extends Error {
	constructor(
		readonly status: number,
		readonly path: string,
		readonly errors: CfError[],
	) {
		super(`${path}: HTTP ${status}${errors.length ? ` (${errors.map((e) => `${e.code} ${e.message}`).join("; ")})` : ""}`)
	}
}

export const readToken = (env: Record<string, string | undefined> = process.env): string => {
	const value = env.CLOUDFLARE_API_TOKEN
	if (!value) throw new Error("CLOUDFLARE_API_TOKEN is not set: this script runs only as a keyed run (env-exec request)")
	return value
}

export class Cf {
	constructor(
		private readonly bearer: string,
		private readonly say: (line: string) => void = (line) => console.log(line),
	) {}

	/** One call. The log line names the method, the path and the status, never the body. */
	async call<T>(method: string, path: string, body?: unknown): Promise<T> {
		const bare = path.split("?")[0]
		const res = await fetch(`${API}${path}`, {
			method,
			headers: { authorization: `Bearer ${this.bearer}`, "content-type": "application/json", accept: "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		})
		const text = await res.text()
		let parsed: Envelope<T> | undefined
		try {
			parsed = JSON.parse(text) as Envelope<T>
		} catch {
			parsed = undefined
		}
		this.say(`${method} ${bare} -> ${res.status}`)
		if (!res.ok || !parsed?.success) {
			throw new CfRequestError(
				res.status,
				bare,
				parsed?.errors ?? [{ code: 0, message: parsed ? "success: false" : "unreadable body" }],
			)
		}
		return parsed.result
	}

	get<T>(path: string): Promise<T> {
		return this.call<T>("GET", path)
	}

	/** A GET whose target may be absent, read as `null` on the statuses that say so instead of thrown. */
	async maybe<T>(path: string, absent: readonly number[] = [404]): Promise<T | null> {
		try {
			return await this.get<T>(path)
		} catch (error) {
			if (error instanceof CfRequestError && absent.includes(error.status)) return null
			throw error
		}
	}

	put<T>(path: string, body: unknown): Promise<T> {
		return this.call<T>("PUT", path, body)
	}

	post<T>(path: string, body: unknown): Promise<T> {
		return this.call<T>("POST", path, body)
	}

	patch<T>(path: string, body: unknown): Promise<T> {
		return this.call<T>("PATCH", path, body)
	}
}
