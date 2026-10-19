import { type Clip, scene } from "./clip"
import { bar, glyph, group, node, note, place, plate, record, show, text } from "./draw"
import { entry, laptop } from "./kit"
import timings from "./media/proofs.timings.json"
import { lerp, seg } from "./timeline"

const SCREEN_W = 250
const SCREEN_H = 168

function setting(g: SVGGElement) {
	const lap = laptop(g, 40, 56, SCREEN_W, SCREEN_H)
	text(lap.g, 0, 236, "YOUR COMPUTER")
	const net = record(g, 372, 40, 244, 280, "NETWORK")
	const blocks = [0, 1, 2, 3].map((i) => node(net.g, "rect", { class: "c-block", x: 16 + i * 44, y: 228, width: 32, height: 32 }))
	return { lap, net, blocks }
}

/** A key and two open notes inside the screen: what never leaves the computer. */
function secrets(screen: SVGGElement) {
	const g = group(screen)
	const key = glyph(g, "passkey", 20, 28, 56)
	const notes = [note(g, "5.00", 116), note(g, "795.00", 116)]
	for (const [i, n] of notes.entries()) place(n, 100, 22 + i * 70)
	return { g, key, notes }
}

const onDevice = scene({ computer: ["computer", 0], network: ["network", 0] }, (g, at) => {
	const { lap, net } = setting(g)
	const mark = group(lap.screen)
	glyph(mark, "private", 24, 60, 40)
	text(mark, 80, 88, "PRIVATE")
	return (t) => {
		show(lap.g, lerp(0.35, 1, seg(t, at.computer - 0.3, at.computer + 0.2)))
		show(mark, seg(t, at.computer, at.computer + 0.4))
		show(net.g, lerp(0.8, 0.4, seg(t, at.network - 0.2, at.network + 0.4)))
	}
})

const keysStay = scene({ keys: ["keys", 0], notes: ["notes", 0], stay: ["stay", 0] }, (g, at) => {
	const { lap, net } = setting(g)
	const kept = secrets(lap.screen)
	const fence = node(lap.g, "rect", { class: "c-fence", x: -30, y: -18, width: SCREEN_W + 60, height: SCREEN_H + 50 })
	return (t) => {
		show(net.g, 0.4)
		show(kept.key, seg(t, at.keys, at.keys + 0.4))
		for (const n of kept.notes) show(n, seg(t, at.notes, at.notes + 0.4))
		show(fence, seg(t, at.stay, at.stay + 0.5))
	}
})

/** Cells of the proof's square fill in this fixed scattered order, so the picture is the same on every visit. */
const CELL_ORDER = [
	14, 3, 27, 9, 33, 20, 1, 30, 11, 24, 6, 17, 35, 0, 22, 12, 29, 5, 19, 32, 8, 26, 15, 2, 34, 23, 10, 28, 4, 18, 31, 7, 25, 13, 21, 16,
]

function proofSquare(parent: Element, x: number, y: number): { readonly g: SVGGElement; fill(k: number): void } {
	const g = group(parent)
	place(g, x, y)
	const cells = CELL_ORDER.map((i) =>
		node(g, "rect", { class: "c-cell", x: (i % 6) * 12, y: Math.floor(i / 6) * 12, width: 10, height: 10 }),
	)
	return {
		g,
		fill: (k) => {
			for (const [n, cell] of cells.entries()) show(cell, n < k * cells.length ? 1 : 0.12)
		},
	}
}

const proving = scene({ builds: ["builds", 0], proof: ["proof", 0], without: ["without", 0] }, (g, at) => {
	const { lap, net } = setting(g)
	text(lap.screen, 20, 36, "PROVING")
	const progress = bar(lap.screen, 20, 50, SCREEN_W - 40)
	const square = proofSquare(lap.screen, 24, 76)
	const label = text(lap.screen, 112, 128, "PROOF")
	const wall = glyph(lap.screen, "private", 21, 73, 78)
	return (t) => {
		show(net.g, 0.4)
		const k = seg(t, at.builds, at.without + 1.2)
		progress(k)
		square.fill(k)
		show(label, seg(t, at.proof, at.proof + 0.4))
		// The private mark does not cover the whole grid, so the proof's cells give way to it.
		const closed = seg(t, at.without, at.without + 0.6)
		show(square.g, 1 - closed)
		show(wall, closed)
	}
})

const checked = scene(
	{ goes: ["goes", 0], sealed: ["sealed", 0], checks: ["checks", 0], joins: ["joins", 0], never: ["never", 0] },
	(g, at) => {
		const { lap, blocks } = setting(g)
		const kept = secrets(lap.screen)
		const packet = group(g)
		node(packet, "rect", { class: "c-plate", width: 96, height: 56 })
		glyph(packet, "private", 10, 10, 36)
		const seal = glyph(packet, "mail-lock", 52, 10, 36)
		const tick = glyph(g, "check", 469, 82, 48)
		const block = node(g, "rect", { class: "c-block c-block--new", x: 564, y: 268, width: 32, height: 32 })
		return (t) => {
			const travel = seg(t, at.goes, at.goes + 1.2)
			const join = seg(t, at.joins - 0.2, at.joins + 0.5)
			place(packet, lerp(lerp(300, 446, travel), 562, join), lerp(124, 266, join), lerp(1, 0.36, join))
			show(packet, seg(t, at.goes - 0.4, at.goes) * (1 - join))
			show(seal, seg(t, at.sealed, at.sealed + 0.4))
			show(tick, seg(t, at.checks, at.checks + 0.4) * (1 - join))
			show(block, join)
			for (const b of blocks) show(b, 0.6)
			show(kept.g, lerp(0.35, 1, seg(t, at.never, at.never + 0.6)))
		}
	},
)

const inPublic = scene({ anything: ["anything", 0], open: ["open", 0], everyone: ["everyone", 0] }, (g, at) => {
	const { net } = setting(g)
	const packet = note(g, "40.00 USDC", 184)
	const line = entry(net.g, 76, "PUBLIC", "40.00 USDC", 212)
	const eyes = [0, 1, 2].map((i) => glyph(g, "eye", 420 + i * 56, 6, 32, "c-dim"))
	return (t) => {
		const travel = seg(t, at.anything + 0.3, at.open - 0.3)
		place(packet, lerp(80, 400, travel), 120)
		show(packet, seg(t, at.anything, at.anything + 0.3) * (1 - seg(t, at.open - 0.3, at.open)))
		show(line.g, seg(t, at.open - 0.3, at.open + 0.2))
		line.light(seg(t, at.open, at.open + 0.5))
		for (const [i, eye] of eyes.entries()) show(eye, seg(t, at.everyone + i * 0.15, at.everyone + i * 0.15 + 0.3))
	}
})

const onEthereum = scene({ batch: ["batch", 0], checkedOn: ["checked", 0], ethereum: ["ethereum", 0] }, (g, at) => {
	const blocks = [0, 1, 2, 3, 4, 5, 6, 7].map(() => node(g, "rect", { class: "c-block", width: 40, height: 40 }))
	const proof = group(g)
	node(proof, "rect", { class: "c-plate", width: 64, height: 64 })
	glyph(proof, "private", 12, 12, 40)
	const eth = plate(g, 200, 252, 240, 76)
	text(eth, 20, 46, "ETHEREUM")
	const tick = glyph(eth, "check", 180, 18, 40)
	return (t, local) => {
		const fold = seg(t, at.batch, at.batch + 0.9)
		for (const [i, b] of blocks.entries()) {
			b.setAttribute("x", lerp(64 + i * 66, 300, fold).toFixed(2))
			b.setAttribute("y", "92")
			show(b, seg(local, i * 0.08, i * 0.08 + 0.3) * (1 - seg(t, at.batch + 0.6, at.batch + 0.9)))
		}
		const drop = seg(t, at.checkedOn - 0.4, at.checkedOn + 0.2)
		place(proof, 288, lerp(80, 186, drop))
		show(proof, seg(t, at.batch + 0.6, at.batch + 0.9))
		show(tick, seg(t, at.ethereum, at.ethereum + 0.4))
	}
})

const slowStep = scene({ building: ["building", 0], sending: ["sending", 0] }, (g, at) => {
	const { lap, net } = setting(g)
	text(lap.screen, 20, 36, "PROVING")
	const progress = bar(lap.screen, 20, 50, SCREEN_W - 40)
	const square = proofSquare(lap.screen, 24, 76)
	const send = glyph(lap.screen, "send", 150, 84, 56)
	return (t) => {
		show(net.g, 0.4)
		const k = seg(t, at.building, at.sending)
		progress(k)
		square.fill(k)
		show(send, seg(t, at.sending, at.sending + 0.4))
	}
})

export const proofs: Clip = {
	id: "proofs",
	seed: 0x70726f66,
	timings,
	scenes: { s1: onDevice, s2: keysStay, s3: proving, s4: checked, s5: inPublic, s6: onEthereum, s7: slowStep },
}
