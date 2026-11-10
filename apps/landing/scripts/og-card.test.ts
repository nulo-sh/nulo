import { existsSync, readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { crc32 } from "node:zlib"
import { describe, expect, test } from "vitest"
import type * as OgCard from "./og-card"
import { CARD_HEIGHT, CARD_WIDTH } from "./changelog-pages"
import { RENDER_COMMAND, STAMP_KEYWORD, checkCard } from "./og-card"
import { bunCaller } from "./in-bun"
import { pngChunks, pngSize, pngText, withPngText } from "./png"

// Planning parses the TOML with `Bun.TOML`, so it runs in Bun as the renderer does.
const inBun = bunCaller<typeof OgCard>(new URL("./og-card.ts", import.meta.url))

/** Signature, IHDR and IEND only: what the readers walk, with no pixel data. */
function tinyPng(width: number, height: number): Uint8Array {
	const chunk = (type: string, data: Uint8Array) => {
		const body = new Uint8Array([...new TextEncoder().encode(type), ...data])
		const out = new Uint8Array(body.length + 8)
		const view = new DataView(out.buffer)
		view.setUint32(0, data.length)
		out.set(body, 4)
		view.setUint32(body.length + 4, crc32(body))
		return out
	}
	const ihdr = new Uint8Array(13)
	new DataView(ihdr.buffer).setUint32(0, width)
	new DataView(ihdr.buffer).setUint32(4, height)
	return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", ihdr), ...chunk("IEND", new Uint8Array())])
}

describe("png", () => {
	test("a text chunk goes in right after IHDR, with its CRC, and reads back", () => {
		const png = withPngText(tinyPng(1200, 630), STAMP_KEYWORD, "abc123")
		const chunks = pngChunks(png)
		expect(chunks.map((c) => c.type)).toEqual(["IHDR", "tEXt", "IEND"])
		const text = chunks[1] as (typeof chunks)[number]
		expect(new DataView(png.buffer).getUint32(text.start + 8 + text.data.length)).toBe(
			crc32(png.subarray(text.start + 4, text.start + 8 + text.data.length)),
		)
		expect(pngText(png, STAMP_KEYWORD)).toBe("abc123")
		expect(pngText(png, "other")).toBeUndefined()
		expect(pngSize(png)).toEqual({ width: 1200, height: 630 })
	})

	const whole = tinyPng(1200, 630)
	test.each([
		["another format", new TextEncoder().encode("GIF89a, not a PNG at all"), /not a PNG/],
		["a file cut inside a chunk", whole.subarray(0, whole.length - 3), /cut short|past the end/],
		["a file cut after a whole chunk", whole.subarray(0, 8 + 25), /ends with IEND/],
		["a first chunk other than IHDR", new Uint8Array([...whole.subarray(0, 8), ...whole.subarray(8 + 25)]), /opens with IHDR/],
	])("refuses %s", (_name, bytes, message) => {
		expect(() => pngChunks(bytes)).toThrow(message)
	})
})

describe("checkCard", () => {
	const stamped = (width: number, height: number, hash: string) => withPngText(tinyPng(width, height), STAMP_KEYWORD, hash)

	test("passes the picture of the current document", () => {
		expect(checkCard("1.2.0.og.png", stamped(CARD_WIDTH, CARD_HEIGHT, "f00d"), "f00d")).toBeUndefined()
	})

	test.each([
		["a missing card", undefined, `1.2.0.og.png is missing: run ${RENDER_COMMAND}`],
		["a card that is no PNG", new TextEncoder().encode("not a picture"), "is not a readable PNG (not a PNG)"],
		["a card of the wrong size", stamped(1200, 600, "f00d"), "is 1200×600, not 1200×630"],
		["a card with no stamp", tinyPng(CARD_WIDTH, CARD_HEIGHT), `is stale against its inputs: run ${RENDER_COMMAND}`],
		["a card stamped for other inputs", stamped(CARD_WIDTH, CARD_HEIGHT, "beef"), `is stale against its inputs: run ${RENDER_COMMAND}`],
	])("refuses %s", (_name, png, message) => {
		expect(checkCard("1.2.0.og.png", png, "f00d")).toContain(message)
	})
})

const toml = (title: string) =>
	`version = "1.2.0"\ndate = "2026-11-05"\ntitle = "${title}"\nlede = "A lede."\n\n${[1, 2, 3]
		.map((n) => `[[change]]\nicon = "send"\narea = "Area ${n}"\ntitle = "Change ${n}"\nline = "Line ${n}."\n`)
		.join("\n")}`
const FONTS = { headline: "data:font/woff2;base64,AA==", mono: "data:font/woff2;base64,AA==" }

describe("planCards", () => {
	test("a card per release and the index from the newest; TOML text is escaped, never markup", () => {
		const cards = inBun("planCards", [{ version: "1.2.0", toml: toml("<b>Bold</b> & more.") }], FONTS)
		expect(cards.map((c) => c.file)).toEqual(["1.2.0.og.png", "index.og.png"])
		for (const card of cards) {
			expect(card.document).toContain("&lt;b&gt;Bold&lt;/b&gt; &amp; more.")
			expect(card.document).not.toContain("<b>Bold")
		}
	})
})

describe("the committed cards", () => {
	const dir = fileURLToPath(new URL("../content/changelog/", import.meta.url))
	const sources = readdirSync(dir).flatMap((file) => {
		const version = /^(\d+\.\d+\.\d+)\.toml$/.exec(file)?.[1]
		return version === undefined ? [] : [{ version, toml: readFileSync(resolve(dir, file), "utf8") }]
	})
	const planned = inBun("planCards", sources, inBun("readCardFonts"))

	test("every release and the index has a current card, and no card outlives its release", () => {
		expect(planned.length).toBe(sources.length + 1)
		for (const { file, hash } of planned) {
			const path = resolve(dir, file)
			expect(checkCard(file, existsSync(path) ? new Uint8Array(readFileSync(path)) : undefined, hash), file).toBeUndefined()
		}
		expect(
			readdirSync(dir)
				.filter((f) => f.endsWith(".og.png"))
				.sort(),
		).toEqual(planned.map((c) => c.file).sort())
	})
})
