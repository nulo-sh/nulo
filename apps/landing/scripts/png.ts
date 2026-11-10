/**
 * The PNG facts a changelog card needs: its size, and one `tEXt` chunk naming the inputs it was
 * rendered from. No pixel is decoded and no CRC is checked on read.
 */

import { crc32 } from "node:zlib"

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
/** A chunk's length, type and CRC around its data. */
const FRAME = 12
const IHDR_LENGTH = 13
const PRINTABLE = /^[\x20-\x7e]+$/

export interface PngChunk {
	readonly type: string
	/** Offset of the chunk's length field. */
	readonly start: number
	readonly data: Uint8Array
}

/** Every chunk in file order; throws on anything but a whole PNG. */
export function pngChunks(png: Uint8Array): PngChunk[] {
	if (png.length < SIGNATURE.length || SIGNATURE.some((byte, i) => png[i] !== byte)) throw new Error("not a PNG")
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
	const chunks: PngChunk[] = []
	for (let at = SIGNATURE.length; at < png.length; ) {
		if (at + FRAME > png.length) throw new Error("a PNG chunk is cut short")
		const length = view.getUint32(at)
		if (at + FRAME + length > png.length) throw new Error("a PNG chunk runs past the end of the file")
		chunks.push({ type: String.fromCharCode(...png.subarray(at + 4, at + 8)), start: at, data: png.subarray(at + 8, at + 8 + length) })
		at += FRAME + length
	}
	if (chunks[0]?.type !== "IHDR" || chunks[0].data.length !== IHDR_LENGTH) throw new Error("a PNG opens with IHDR")
	if (chunks.at(-1)?.type !== "IEND") throw new Error("a PNG ends with IEND")
	return chunks
}

export function pngSize(png: Uint8Array): { width: number; height: number } {
	const [ihdr] = pngChunks(png)
	const view = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, ihdr.data.byteLength)
	return { width: view.getUint32(0), height: view.getUint32(4) }
}

/** The text of the first `tEXt` chunk under `keyword`, if any. */
export function pngText(png: Uint8Array, keyword: string): string | undefined {
	const prefix = `${keyword}\0`
	for (const chunk of pngChunks(png)) {
		if (chunk.type !== "tEXt") continue
		const text = new TextDecoder("latin1").decode(chunk.data)
		if (text.startsWith(prefix)) return text.slice(prefix.length)
	}
	return undefined
}

/** A copy of `png` with a `tEXt` chunk right after IHDR. Printable ASCII only, so latin1 and UTF-8 agree. */
export function withPngText(png: Uint8Array, keyword: string, text: string): Uint8Array {
	if (!PRINTABLE.test(keyword) || !PRINTABLE.test(text)) throw new Error("a PNG text chunk here holds printable ASCII")
	const at = pngChunks(png)[0].start + FRAME + IHDR_LENGTH
	const body = new TextEncoder().encode(`tEXt${keyword}\0${text}`)
	const chunk = new Uint8Array(body.length + 8)
	const view = new DataView(chunk.buffer)
	view.setUint32(0, body.length - 4)
	chunk.set(body, 4)
	view.setUint32(body.length + 4, crc32(body))
	const out = new Uint8Array(png.length + chunk.length)
	out.set(png.subarray(0, at))
	out.set(chunk, at)
	out.set(png.subarray(at), at + chunk.length)
	return out
}
