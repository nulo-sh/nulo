import { type Clip, scene } from "./clip"
import { glyph, group, litLine, monoWidth, node, note, place, plate, record, show, stroke, text } from "./draw"
import { balanceRow, entry } from "./kit"
import timings from "./media/private-balances.timings.json"
import { clamp, lerp, seg } from "./timeline"

/** Illustrative values: the shapes are what a chain shows, the numbers are made up. */
const ME = "0x77be…02aa"
const HISTORY = [
	["0x3a91…5c2e", "12.00"],
	[ME, "40.00"],
	["0x9c04…e7d1", "250.00"],
	["0x1f6d…8a03", "75.50"],
	[ME, "3.20"],
	["0xb2e7…4410", "9.99"],
	["0x5d38…c1f2", "18.25"],
	[ME, "120.00"],
	["0xe0a4…77d9", "60.00"],
] as const
const ROW = 28
const FEED_TOP = 64
const FEED_SPAN = HISTORY.length * ROW

const transparentChain = scene({ address: ["address", 0], balance: ["balance", 0], every: ["every", 0] }, (g, at) => {
	const feed = record(g, 24, 24, 404, 312)
	const rows = HISTORY.map(([who, amount]) => {
		const line = litLine(feed.g, [who, "  paid ", amount.padStart(6), " USDC"])
		const box = who === ME ? node(line.g, "rect", { class: "c-box", x: -6, y: -20, width: monoWidth(11, 20) + 12, height: 28 }) : null
		return { line, box, mine: who === ME ? 1 : 0 }
	})
	const tag = plate(g, 444, 24, 172, 132)
	text(tag, 14, 34, ME, "c-mono")
	text(tag, 14, 70, "BALANCE")
	text(tag, 14, 108, "1,800.00", "c-num c-ink-fill")
	return (t) => {
		// The feed scrolls until the camera finds the address, then holds still on it.
		const scroll = 16 * Math.min(t, at.address + 0.4)
		const found = seg(t, at.address, at.address + 0.5)
		for (const [i, { line, box, mine }] of rows.entries()) {
			const y = FEED_TOP + ((i * ROW + scroll) % FEED_SPAN)
			place(line.g, 20, y)
			show(line.g, clamp((y - FEED_TOP + 4) / 18) * clamp((304 - y) / 24))
			line.light(0, mine * found)
			line.light(2, mine * seg(t, at.every, at.every + 0.8))
			if (box) show(box, found)
		}
		show(tag, seg(t, at.balance, at.balance + 0.5))
	}
})

const twoBalances = scene(
	{ token: ["token", 0], priv: ["private", 0], only: ["only", 0], pub: ["public", 0], anyone: ["anyone", 0] },
	(g, at) => {
		const card = plate(g, 150, 30, 340, 300)
		text(card, 24, 56, "USDC", "c-head")
		const toPrivate = stroke(card, "M 38 76 V 100")
		const toPublic = stroke(card, "M 38 76 V 104 H 30 V 190")
		const priv = balanceRow(card, "private", "1,800.00")
		place(priv.g, 24, 136)
		const only = text(card, 64, 168, "ONLY YOU CAN SEE IT")
		const pub = balanceRow(card, "public", "650.00")
		place(pub.g, 24, 236)
		const anyone = text(card, 64, 268, "ANYONE CAN SEE IT")
		return (t, local) => {
			show(card, seg(local, 0, 0.4) * lerp(0.5, 1, seg(t, at.token - 0.4, at.token)))
			toPrivate(seg(t, at.priv - 0.3, at.priv))
			toPublic(seg(t, at.pub - 0.3, at.pub))
			show(priv.g, seg(t, at.priv, at.priv + 0.4))
			show(only, seg(t, at.only, at.only + 0.4))
			show(pub.g, seg(t, at.pub, at.pub + 0.4))
			show(anyone, seg(t, at.anyone, at.anyone + 0.4))
			priv.light(seg(t, at.only, at.only + 0.4))
			pub.light(seg(t, at.anyone, at.anyone + 0.4))
		}
	},
)

const NOTES = [
	["5.00", "0x31d0…", "0x6e0b…"],
	["795.00", "0x8f2c…", "0x4d1a…"],
	["1,000.00", "0xc3e9…", "0x0b77…"],
] as const

const sealedNotes = scene({ notes: ["notes", 0], fingerprint: ["fingerprint", 0], copy: ["copy", 0], owner: ["owner", 0] }, (g, at) => {
	const head = balanceRow(g, "private", "1,800.00")
	place(head.g, 24, 64)
	const sealed = NOTES.map((_, i) => glyph(g, "mail-lock", 24 + i * 104, 110, 72))
	const opened = note(g, NOTES[0][0])
	place(opened, 24, 206)
	const feed = record(g, 336, 24, 280, 312)
	const entries = NOTES.map(([, commitment, log], i) => {
		const e = entry(feed.g, 70 + i * 82, "COMMITMENT", commitment)
		const copy = group(e.g)
		glyph(copy, "mail-lock", 100, 10, 22, "c-dim")
		text(copy, 130, 28, log, "c-mono")
		return { e, copy }
	})
	return (t) => {
		const open = seg(t, at.owner, at.owner + 0.6)
		for (const [i, env] of sealed.entries()) {
			show(env, seg(t, at.notes + i * 0.2, at.notes + i * 0.2 + 0.4) * (i === 0 ? 1 - 0.6 * open : 1))
		}
		for (const [i, { e, copy }] of entries.entries()) {
			show(e.g, seg(t, at.fingerprint + i * 0.25, at.fingerprint + i * 0.25 + 0.4))
			show(copy, seg(t, at.copy + i * 0.25, at.copy + i * 0.25 + 0.4))
		}
		show(opened, open)
		head.light(open)
	}
})

const payment = scene(
	{
		worth: ["worth", 0],
		spends: ["spends", 0],
		fresh: ["new", 0],
		person: ["person", 0],
		change: ["change", 0],
		shows: ["shows", 0],
		spent: ["spent", 0],
		which: ["which", 0],
		much: ["much", 0],
	},
	(g, at) => {
		const five = note(g, "5.00")
		place(five, 96, 40)
		const strike = stroke(five, "M 8 26 H 104", "c-strike")
		const split = stroke(g, "M 152 92 V 140 H 80 V 180 M 152 140 H 232 V 180", "c-wire")
		const paid = note(g, "3.50")
		place(paid, 24, 184)
		const person = group(g)
		glyph(person, "send", 24, 248, 26)
		glyph(person, "user", 56, 248, 26)
		const change = note(g, "1.50")
		place(change, 176, 184)
		const changeLabel = text(g, 176, 272, "CHANGE")
		const feed = record(g, 336, 24, 280, 312)
		const lines = [
			entry(feed.g, 70, "NULLIFIER", "0x0c7a…"),
			entry(feed.g, 134, "COMMITMENT", "0x9b41…"),
			entry(feed.g, 198, "COMMITMENT", "0x22e8…"),
		]
		const spentTag = text(feed.g, 176, 70, "SPENT", "c-eb c-ink-fill")
		const which = text(feed.g, 16, 266, "WHICH NOTE   —")
		const much = text(feed.g, 16, 296, "HOW MUCH     —")
		return (t, local) => {
			show(five, seg(local, 0, 0.4) * lerp(1, 0.45, seg(t, at.spends, at.spends + 0.6)))
			strike(seg(t, at.spends, at.spends + 0.6))
			split(seg(t, at.fresh - 0.4, at.fresh + 0.2))
			show(paid, seg(t, at.fresh, at.fresh + 0.4))
			show(change, seg(t, at.fresh + 0.3, at.fresh + 0.7))
			show(person, seg(t, at.person, at.person + 0.4))
			show(changeLabel, seg(t, at.change, at.change + 0.4))
			for (const [i, line] of lines.entries()) show(line.g, seg(t, at.shows + i * 0.3, at.shows + i * 0.3 + 0.4))
			show(spentTag, seg(t, at.spent, at.spent + 0.4))
			lines[0]?.light(seg(t, at.spent, at.spent + 0.4))
			show(which, seg(t, at.which, at.which + 0.4))
			show(much, seg(t, at.much, at.much + 0.4))
		}
	},
)

const goingPublic = scene({ moving: ["moving", 0], balance: ["balance", 0], records: ["records", 0], labels: ["labels", 0] }, (g, at) => {
	const card = plate(g, 24, 48, 296, 264)
	const priv = balanceRow(card, "private", "1,800.00", true)
	place(priv.g, 20, 64)
	const pub = balanceRow(card, "public", "650.00", true)
	place(pub.g, 20, 178)
	const coin = note(g, "40.00", 96)
	const feed = record(g, 336, 24, 280, 312)
	const line = entry(feed.g, 70, "PUBLIC", "40.00 USDC")
	return (t) => {
		const move = seg(t, at.moving, at.balance + 0.4)
		place(coin, 220, lerp(86, 200, move))
		show(coin, seg(t, at.moving - 0.3, at.moving) * (1 - seg(t, at.balance + 0.4, at.balance + 0.8)))
		const landed = t >= at.balance + 0.4
		priv.amount.textContent = landed ? "1,760.00" : "1,800.00"
		pub.amount.textContent = landed ? "690.00" : "650.00"
		show(line.g, seg(t, at.records, at.records + 0.4))
		line.light(seg(t, at.records, at.records + 0.4))
		priv.light(seg(t, at.labels, at.labels + 0.5))
		pub.light(seg(t, at.labels + 0.3, at.labels + 0.8))
	}
})

export const privateBalances: Clip = {
	id: "private-balances",
	seed: 0x70726976,
	timings,
	scenes: { s1: transparentChain, s2: twoBalances, s3: sealedNotes, s4: payment, s5: goingPublic },
}
