import { describe, expect, test, vi } from "vitest"
import { ResponseTooLargeError, readBodyCapped } from "./read-capped"

const encode = (text: string) => new TextEncoder().encode(text)

/** A response streaming `chunks` in order, with a spy on the body's cancel and a count of reads. */
function streamed(chunks: Uint8Array[], { headers, cancel }: { headers?: HeadersInit; cancel?: () => Promise<void> } = {}) {
	const onCancel = vi.fn(cancel ?? (async () => {}))
	let pulls = 0
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			const next = chunks[pulls++]
			if (next) controller.enqueue(next)
			else controller.close()
		},
		cancel: onCancel,
	})
	return { response: new Response(body, { headers }), onCancel, pulls: () => pulls }
}

describe("readBodyCapped", () => {
	test("a body at the budget reads whole, decoded as UTF-8 across chunk boundaries", async () => {
		const bytes = encode('{"name":"café"}')
		const { response, onCancel } = streamed([bytes.slice(0, 13), bytes.slice(13)])
		expect(await readBodyCapped(response, bytes.byteLength)).toBe('{"name":"café"}')
		expect(onCancel).not.toHaveBeenCalled()
	})

	test("chunks count together: one byte past the budget across chunks refuses and cancels the body", async () => {
		const { response, onCancel } = streamed([encode("aaaa"), encode("bbbb"), encode("c")])
		await expect(readBodyCapped(response, 8)).rejects.toBeInstanceOf(ResponseTooLargeError)
		expect(onCancel).toHaveBeenCalledOnce()
	})

	test("a declared content-length over the budget refuses before any read and cancels the body", async () => {
		const { response, onCancel, pulls } = streamed([encode("tiny")], { headers: { "content-length": "9" } })
		const pullsBefore = pulls()
		await expect(readBodyCapped(response, 8)).rejects.toThrowError(new ResponseTooLargeError(8))
		expect(onCancel).toHaveBeenCalledOnce()
		expect(pulls()).toBe(pullsBefore)
	})

	test("a declared content-length at the budget reads (control)", async () => {
		const { response } = streamed([encode("12345678")], { headers: { "content-length": "8" } })
		expect(await readBodyCapped(response, 8)).toBe("12345678")
	})

	test("a cancel that rejects still refuses as oversize", async () => {
		const { response, onCancel } = streamed([encode("123456789")], {
			cancel: async () => {
				throw new Error("cancel failed")
			},
		})
		await expect(readBodyCapped(response, 8)).rejects.toBeInstanceOf(ResponseTooLargeError)
		expect(onCancel).toHaveBeenCalledOnce()
	})

	test("a response with no body reads as an empty string", async () => {
		expect(await readBodyCapped(new Response(null), 8)).toBe("")
	})
})
