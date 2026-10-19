import { type Clip, scene } from "./clip"
import { bar, glyph, group, litLine, node, place, plate, record, show, stroke, text } from "./draw"
import timings from "./media/fees.timings.json"
import { lerp, seg } from "./timeline"

const ME = "0x77be…02aa"
const SHARED = "0x2f1c…9e04"

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

const feeJuice = scene(
	{
		bring: ["bring", 0],
		token: ["aztec", 1],
		over: ["over", 0],
		becomes: ["becomes", 0],
		transferred: ["transferred", 0],
		only: ["only", 0],
	},
	(g, at) => {
		const eth = plate(g, 24, 124, 200, 160)
		text(eth, 20, 36, "ETHEREUM")
		const aztec = plate(g, 416, 124, 200, 160)
		text(aztec, 20, 36, "AZTEC")
		glyph(aztec, "fee", 20, 112, 28)
		const meter = bar(aztec, 60, 124, 120, 14)
		const bridge = stroke(g, "M 224 198 H 416")
		const locked = text(g, 430, 104, "NO TRANSFERS")
		const chip = group(g)
		node(chip, "rect", { class: "c-chip", width: 172, height: 44 })
		const token = text(chip, 14, 29, "$AZTEC", "c-eb c-ink-fill")
		const juice = text(chip, 14, 29, "FEE JUICE", "c-eb c-ink-fill")
		return (t, local) => {
			show(eth, seg(local, 0, 0.4))
			show(aztec, seg(local, 0.2, 0.6))
			bridge(seg(t, at.bring - 0.2, at.bring + 0.6))
			const cross = seg(t, at.over, at.becomes)
			const converted = seg(t, at.becomes, at.becomes + 0.4)
			const drop = seg(t, at.only - 0.2, at.only + 0.6)
			place(chip, lerp(38, 430, cross), lerp(176, 240, drop))
			show(chip, seg(t, at.token, at.token + 0.4) * (1 - drop))
			show(token, 1 - converted)
			show(juice, converted)
			show(locked, seg(t, at.transferred, at.transferred + 0.4))
			meter(drop)
		}
	},
)

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
	const sponsor = plate(g, 408, 96, 208, 112)
	glyph(sponsor, "user", 20, 20, 36)
	text(sponsor, 20, 92, "SOMEONE ELSE")
	const hand = stroke(g, "M 512 208 V 302 H 402")
	const paid = glyph(tag, "square-check", 96, 12, 24)
	return (t) => {
		show(sponsor, seg(t, at.sponsored, at.sponsored + 0.4))
		hand(seg(t, at.someone, at.pays))
		show(paid, seg(t, at.pays, at.pays + 0.4))
	}
})

const METHODS = [
	["public", "PUBLIC FEE JUICE"],
	["private", "PRIVATE FEE JUICE"],
	["user", "SPONSORED"],
] as const
const METHOD_ROW = 56

const inControl = scene({ tells: ["tells", 0], control: ["control", 0] }, (g, at) => {
	const card = plate(g, 152, 28, 336, 304)
	text(card, 24, 40, "PAY THE FEE WITH")
	const rows = METHODS.map(([mark, label], i) => {
		const row = group(card)
		place(row, 0, 52 + i * METHOD_ROW)
		glyph(row, mark, 24, 14, 28)
		text(row, 64, 36, label)
		return row
	})
	// An app may fix the method, so the picture shows the one in use and ends on Send, not on a switch.
	const pick = node(card, "rect", { class: "c-box", x: 12, y: 52 + METHOD_ROW + 4, width: 312, height: 48 })
	const button = group(card)
	node(button, "rect", { class: "c-button", x: 20, y: 236, width: 296, height: 48 })
	text(button, 139, 267, "SEND", "c-eb c-button-text")
	return (t, local) => {
		show(card, seg(local, 0, 0.4))
		for (const [i, row] of rows.entries()) show(row, seg(t, at.tells + i * 0.25, at.tells + i * 0.25 + 0.4))
		show(pick, seg(t, at.tells + 0.8, at.tells + 1.2))
		show(button, seg(t, at.control - 0.5, at.control))
	}
})

export const fees: Clip = {
	id: "fees",
	seed: 0x66656573,
	timings,
	scenes: { s1: networkFee, s2: feeJuice, s3: price, s4: whoPays, s5: sponsored, s6: inControl },
}
