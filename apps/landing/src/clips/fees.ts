import { type Clip, scene } from "./clip"
import { bar, glyph, group, litLine, node, place, plate, record, show, stroke, text } from "./draw"
import timings from "./media/fees.timings.json"
import { lerp, seg } from "./timeline"

const ME = "0x77be…02aa"
const SHARED = "0x2f1c…9e04"

/** A transaction card with its fee tag hanging from the bottom-right corner. */
function transaction(g: SVGGElement, x: number) {
	const card = plate(g, x, 64, 300, 200)
	text(card, 24, 40, "TRANSACTION")
	text(card, 24, 96, "SEND")
	text(card, 24, 134, "40.00 USDC", "c-num c-ink-fill")
	const tag = group(g)
	place(tag, x + 230, 278)
	node(tag, "path", { class: "c-wire", d: "M 18 -14 L 4 0" })
	node(tag, "rect", { class: "c-plate", width: 132, height: 48 })
	glyph(tag, "fee", 12, 12, 24)
	text(tag, 46, 32, "FEE")
	return { card, tag }
}

const networkFee = scene({ fee: ["fee", 0] }, (g, at) => {
	const { tag } = transaction(g, 170)
	return (t) => {
		show(tag, seg(t, at.fee - 0.2, at.fee + 0.3))
	}
})

const feeJuice = scene({ juice: ["juice", 0], bring: ["bring", 0], ethereum: ["ethereum", 0], only: ["only", 0] }, (g, at) => {
	const eth = plate(g, 24, 140, 200, 136)
	text(eth, 20, 36, "ETHEREUM")
	const aztec = plate(g, 416, 140, 200, 136)
	text(aztec, 20, 36, "AZTEC")
	glyph(aztec, "fee", 20, 84, 28)
	const meter = bar(aztec, 60, 96, 120, 14)
	const bridge = stroke(g, "M 224 208 H 416")
	const chip = group(g)
	node(chip, "rect", { class: "c-chip", width: 172, height: 44 })
	text(chip, 14, 29, "FEE JUICE", "c-eb c-ink-fill")
	return (t, local) => {
		show(eth, seg(local, 0, 0.4))
		show(aztec, seg(local, 0.2, 0.6))
		bridge(seg(t, at.bring - 0.2, at.bring + 0.6))
		const cross = seg(t, at.bring + 0.3, at.ethereum + 0.8)
		const drop = seg(t, at.only - 0.2, at.only + 0.6)
		place(chip, lerp(38, 430, cross), lerp(196, 226, drop))
		show(chip, seg(t, at.juice, at.juice + 0.4) * (1 - drop))
		meter(drop)
	}
})

const price = scene({ publishing: ["publishing", 0], running: ["running", 0], shows: ["shows", 0], send: ["send", 0] }, (g, at) => {
	text(g, 40, 112, "DATA")
	const data = bar(g, 40, 126, 150, 16)
	text(g, 40, 190, "WORK")
	const work = bar(g, 40, 204, 110, 16)
	const screen = plate(g, 344, 32, 272, 296)
	text(screen, 20, 36, "SEND")
	text(screen, 20, 84, "40.00 USDC", "c-num c-ink-fill")
	node(screen, "line", { class: "c-rule", x1: 20, x2: 252, y1: 108, y2: 108 })
	text(screen, 20, 148, "NETWORK FEE")
	const feeData = bar(screen, 20, 164, 90, 16)
	const feeWork = bar(screen, 112, 164, 66, 16)
	const button = group(screen)
	node(button, "rect", { class: "c-button", x: 20, y: 224, width: 232, height: 48 })
	text(button, 108, 255, "SEND", "c-eb c-button-text")
	return (t) => {
		data(seg(t, at.publishing, at.publishing + 1))
		work(seg(t, at.running, at.running + 1))
		const sum = seg(t, at.shows - 0.2, at.shows + 0.6)
		feeData(sum)
		feeWork(seg(t, at.shows + 0.2, at.shows + 1))
		show(screen, lerp(0.35, 1, sum))
		show(button, seg(t, at.send - 0.5, at.send))
	}
})

const whoPays = scene(
	{
		pub: ["public", 0],
		names: ["names", 0],
		each: ["each", 0],
		priv: ["private", 0],
		onRecord: ["record", 1],
		many: ["many", 0],
	},
	(g, at) => {
		const pubSide = group(g)
		glyph(pubSide, "public", 24, 54, 28)
		text(pubSide, 64, 76, "PUBLIC FEE JUICE")
		const you = group(pubSide)
		glyph(you, "user", 64, 96, 28)
		text(you, 104, 118, "YOU", "c-eb c-ink-fill")
		const privSide = group(g)
		glyph(privSide, "private", 24, 184, 28)
		text(privSide, 64, 206, "PRIVATE FEE JUICE")
		const people = [0, 1, 2, 3, 4].map((i) => glyph(privSide, "user", 64 + i * 44, 228, 28, "c-dim"))
		const feed = record(g, 336, 24, 280, 312)
		text(feed.g, 16, 68, "FEE PAID BY")
		const payers = [
			[ME, at.names],
			[ME, at.each],
			[ME, at.each + 0.5],
			[SHARED, at.onRecord],
			[SHARED, at.onRecord + 0.6],
		] as const
		const rows = payers.map(([who, from], i) => {
			const line = litLine(feed.g, [who])
			place(line.g, 16, 108 + i * 40)
			const box = who === ME ? node(line.g, "rect", { class: "c-box", x: -6, y: -20, width: 144, height: 28 }) : null
			return { line, box, from }
		})
		return (t) => {
			show(pubSide, seg(t, at.pub - 0.3, at.pub + 0.2))
			show(you, seg(t, at.names, at.names + 0.4))
			show(privSide, seg(t, at.priv - 0.3, at.priv + 0.2))
			for (const [i, person] of people.entries()) show(person, seg(t, at.many + i * 0.12, at.many + i * 0.12 + 0.3))
			for (const { line, box, from } of rows) {
				show(line.g, seg(t, from - 0.2, from + 0.2))
				line.light(0, box ? seg(t, from, from + 0.4) : 0)
				if (box) show(box, seg(t, from, from + 0.4))
			}
		}
	},
)

const sponsored = scene({ sponsored: ["sponsored", 0], someone: ["someone", 0], pays: ["pays", 0] }, (g, at) => {
	const { tag } = transaction(g, 40)
	const sponsor = plate(g, 416, 96, 200, 112)
	glyph(sponsor, "user", 20, 20, 36)
	text(sponsor, 20, 92, "SOMEONE ELSE")
	const hand = stroke(g, "M 516 208 V 302 H 402")
	const paid = glyph(tag, "square-check", 96, 12, 24)
	return (t) => {
		show(sponsor, seg(t, at.sponsored, at.sponsored + 0.4))
		hand(seg(t, at.someone, at.pays))
		show(paid, seg(t, at.pays, at.pays + 0.4))
	}
})

export const fees: Clip = {
	id: "fees",
	seed: 0x66656573,
	timings,
	scenes: { s1: networkFee, s2: feeJuice, s3: price, s4: whoPays, s5: sponsored },
}
