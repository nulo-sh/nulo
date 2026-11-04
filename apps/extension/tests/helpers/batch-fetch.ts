import { vi } from "vitest"

type BatchEntry = { id: number }

const answerEach = (calls: BatchEntry[]) => new Response(JSON.stringify(calls.map((c) => ({ jsonrpc: "2.0", id: c.id, result: 7 }))))

/** Stubs the global `fetch` with a node that replies to each JSON-RPC batch through `reply`, by
 *  default answering every entry. Returns the entry count of each request sent so far. The caller
 *  unstubs globals after itself. */
export function stubBatchFetch(reply: (calls: BatchEntry[]) => Response = answerEach): () => number[] {
	const fetch = vi.fn(async (_url: string, init: RequestInit) => reply(JSON.parse(String(init.body)) as BatchEntry[]))
	vi.stubGlobal("fetch", fetch)
	return () => fetch.mock.calls.map(([, init]) => (JSON.parse(String(init.body)) as unknown[]).length)
}
