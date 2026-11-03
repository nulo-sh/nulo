// Run by test/methods.test.ts in a plain `bun` process: under `bun test`, foundation's field module
// finds the runner's global `expect` and calls a matcher API it lacks at import time.

import { AztecNodeApiSchema, createAztecNodeClient } from "@aztec-labs/stdlib/interfaces/client"
import { NODE_METHODS } from "../src/methods"
import { createHandler } from "../src/worker"
import { CHROME_ORIGIN, fakeUpstream, IP, makeEnv } from "./fakes"

function throughProxy(env = makeEnv(), upstream = fakeUpstream()): string[] {
	const bodies: string[] = []
	const handle = createHandler(upstream.fetch)
	globalThis.fetch = (async (input: string, init: RequestInit) => {
		const request = new Request(input, init)
		request.headers.set("origin", CHROME_ORIGIN)
		request.headers.set("cf-connecting-ip", IP)
		bodies.push(await request.clone().text())
		return handle(request, env)
	}) as typeof fetch
	return bodies
}

const refusing = () => makeEnv({ IP_LIMITER: { limit: async () => ({ success: false }) } })
const client = () => createAztecNodeClient("https://rpc.nulo.sh/")

const captured = throughProxy(refusing())
await client()
	.getBlockNumber()
	.catch(() => {})
const [{ method }] = JSON.parse(captured[0])
const prefix: string = method.slice(0, -"getBlockNumber".length)

throughProxy(
	makeEnv(),
	fakeUpstream(async (r) => {
		const [entry] = JSON.parse(new TextDecoder().decode(r.body))
		return Response.json([{ jsonrpc: "2.0", id: entry.id, result: 42 }])
	}),
)
const result = Number(await client().getBlockNumber())

const limited = throughProxy(refusing())
const refusal = await client()
	.getBlockNumber()
	.then(
		() => "resolved",
		(error: Error) => error.message,
	)

const missing = Object.keys(AztecNodeApiSchema).filter((name) => !NODE_METHODS.has(`${prefix}${name}`))
console.log(`RESULT ${JSON.stringify({ prefix, missing, result, refusal, limitedRequests: limited.length })}`)
