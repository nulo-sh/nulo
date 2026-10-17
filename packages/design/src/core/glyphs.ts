/**
 * The wallet's one glyph set, original work on a 24-unit grid: square ends, mitred corners, only 0, 45
 * and 90 degree lines, solid blocks for weight, no curves.
 *
 * `s` paths are stroked at the set's weight (see `Icon.vue`). Each `f` entry is one solid, filled
 * even-odd, so an inner subpath is a hole of fixed width; solids inside a glyph never overlap except
 * to cut a hole, since two overlapping subpaths of one even-odd path would cancel.
 *
 * A space follows each `M`: `scripts/ci-cd/workflow-refs.test.ts` reads an `M` glued to a decimal as a
 * milestone tag.
 */
export type Glyph = { readonly s?: readonly string[]; readonly f?: readonly string[] }

const FRAME = "M 4.25 4.25h15.5v15.5H4.25z"

const lock: Glyph = { f: ["M 4.5 10.5h15v10h-15z"], s: ["M 8.25 10.5V4.5H15.75V10.5"] }

export const glyphs = {
	/** A square with one diagonal. */
	home: { s: [FRAME, "M 4.25 19.75L19.75 4.25"] },
	/** Three solid bars ranked by length. */
	holdings: { f: ["M 3.5 4.25h17v3.75h-17z", "M 3.5 10.125h12v3.75h-12z", "M 3.5 16h7v3.75h-7z"] },
	/** A square clock. */
	history: { s: [FRAME, "M 12 7.75V12.5H15.75"] },
	/** Two sliders with square knobs. */
	settings: { s: ["M 3 8H21M 3 16H21"], f: ["M 12.5 5h6v6h-6z", "M 5.5 13h6v6h-6z"] },
	/** An arrow to the top right. */
	send: { s: ["M 6.5 17.5L16.5 7.5", "M 9 6.25H17.75V15"] },
	/** An arrow to the bottom left. */
	receive: { s: ["M 17.5 6.5L7.5 16.5", "M 6.25 9V17.75H15"] },
	/** Two overlapping squares. */
	copy: { s: ["M 9.25 9.25h10.5v10.5H9.25z", "M 14.75 9.25V4.25H4.25V14.75H9.25"] },
	/** A box with an arrow leaving its corner. */
	open: { s: ["M 10.5 4.75H4.75V19.25H19.25V13.5", "M 14 4.75H19.25V10", "M 19.25 4.75L11 13"] },
	/** A square bin with its lid. */
	remove: { s: ["M 3.75 6.75H20.25", "M 9.25 6.75V3.75H14.75V6.75", "M 6.25 6.75V20.25H17.75V6.75"] },
	/** A pencil. */
	edit: { s: ["M 4.75 19.25V15.25L15.25 4.75L19.25 8.75L8.75 19.25Z"] },
	/** An arrow pointing left. */
	back: { s: ["M 19.75 12H5", "M 11 5.75L4.75 12L11 18.25"] },
	/** An arrow pointing right. */
	forward: { s: ["M 4.25 12H19", "M 13 5.75L19.25 12L13 18.25"] },
	/** An X. */
	close: { s: ["M 5.5 5.5L18.5 18.5M 18.5 5.5L5.5 18.5"] },
	/** A bare tick. */
	check: { s: ["M 4.5 12.5L9.5 17.5L19.5 7.5"] },
	/** A solid square with a tick cut out: done, or selected. */
	"square-check": {
		f: ["M 3 3h18v18H3zM 5.73 12.25L10.52 17.04L18.27 8.96L16.46 7.23L10.48 13.46L7.5 10.48Z"],
	},
	/** A square filled on its lower diagonal half: waiting. */
	"square-half": { s: [FRAME], f: ["M 4.25 19.75L19.75 4.25V19.75Z"] },
	/** A square with an X: failed, cancelled or refused. */
	"square-cross": { s: [FRAME, "M 9.25 9.25L14.75 14.75M 14.75 9.25L9.25 14.75"] },
	/** An empty square: not selected. */
	square: { s: [FRAME] },
	/** A solid triangle with an exclamation mark cut out. */
	warning: { f: ["M 12 2.5L22.25 20.5H1.75ZM 10.75 7.75h2.5v7h-2.5zM 10.75 15.75h2.5v2.5h-2.5z"] },
	/** A square with an i. */
	info: { s: [FRAME, "M 12 10.75V16.5"], f: ["M 10.75 6.75h2.5v2.5h-2.5z"] },
	/** A padlock: a solid body under a square shackle. */
	lock,
	/** A private balance: the padlock. */
	private: lock,
	/** A public balance: an octagonal globe with its equator and meridian. */
	public: { s: ["M 8.5 3.75H15.5L20.25 8.5V15.5L15.5 20.25H8.5L3.75 15.5V8.5Z", "M 3.75 12H20.25M 12 3.75V20.25"] },
	/** Three solid squares in a row. */
	more: { f: ["M 3.5 10.25h3.5v3.5h-3.5z", "M 10.25 10.25h3.5v3.5h-3.5z", "M 17 10.25h3.5v3.5h-3.5z"] },
	/** A chevron pointing right. */
	chevron: { s: ["M 9 5.5L15.5 12L9 18.5"] },
	/** An outlined diamond with a square pupil. */
	eye: { s: ["M 2.5 12L12 5.75L21.5 12L12 18.25Z"], f: ["M 9.5 9.5h5v5h-5z"] },
	/** The eye, slashed. */
	"eye-off": { s: ["M 2.5 12L12 5.75L21.5 12L12 18.25Z", "M 4.5 19.5L19.5 4.5"], f: ["M 9.5 9.5h5v5h-5z"] },
	/** A square lens with a 45 degree handle. */
	search: { s: ["M 3.75 3.75h10.5v10.5H3.75z", "M 15.5 15.5L20 20"] },
	/** A plus in a square. */
	add: { s: [FRAME, "M 12 8V16M 8 12H16"] },
	/** A square loop whose arrowhead points into its own gap. */
	refresh: { s: ["M 8 4.25H4.25V19.75H19.75V4.25H14.5"], f: ["M 11 4.25L14.5 0.75V7.75Z"] },
	/** An arrow pointing left from a line that turns down. */
	undo: { s: ["M 19.25 19.25V9H6.5", "M 9.5 4.75L5.25 9L9.5 13.25"] },
	/** A square head over a block of shoulders. */
	user: { s: ["M 8.75 4.25h6.5v6.5h-6.5z"], f: ["M 4 14.25h16v6.75H4z"] },
	/** A person on a card. */
	contacts: { s: ["M 3.25 4.25h17.5v15.5H3.25z"], f: ["M 10 7.75h4v4h-4z", "M 7.25 13.75h9.5v2.75h-9.5z"] },
	/** Four squares. */
	app: {
		s: ["M 4.25 4.25h5.5v5.5h-5.5zM 14.25 4.25h5.5v5.5h-5.5zM 4.25 14.25h5.5v5.5h-5.5zM 14.25 14.25h5.5v5.5h-5.5z"],
	},
	/** An open bracket with an arrow leaving it. */
	"log-out": { s: ["M 10.5 4.25H4.25V19.75H10.5", "M 9.5 12H17.5", "M 14.75 7.75L19 12L14.75 16.25"] },
	/** A bolt of 45 degree strokes. */
	zap: { s: ["M 15 5L8 12H16L9 19"] },
	/** Four corner brackets. */
	expand: { s: ["M 4.25 9.5V4.25H9.5M 14.5 4.25H19.75V9.5M 19.75 14.5V19.75H14.5M 9.5 19.75H4.25V14.5"] },
	/** An arrow down into a tray. */
	download: { s: ["M 4.25 14.5V19.75H19.75V14.5", "M 12 3.75V13", "M 7.75 9.75L12 14L16.25 9.75"] },
	/** An arrow up out of a tray. */
	upload: { s: ["M 4.25 14.5V19.75H19.75V14.5", "M 12 15.5V5.75", "M 7.75 9L12 4.75L16.25 9"] },
	/** A square with a question mark. */
	help: { s: [FRAME, "M 9.25 9.75V7.5H14.75V11.5H12V13.25"], f: ["M 10.75 15.5h2.5v2.5h-2.5z"] },
	/** Angle brackets. */
	code: { s: ["M 8.5 6.5L3 12L8.5 17.5", "M 15.5 6.5L21 12L15.5 17.5"] },
	/** A pin: a square head over a flange and a needle. */
	pin: { s: ["M 5 13.25H19", "M 12 13.25V20.75"], f: ["M 8 3.5h8v7.5H8z"] },
	/** A key with a square bow. */
	passkey: { s: ["M 3.75 8.25h7.5v7.5h-7.5z", "M 11.25 12H20.25V16", "M 16.25 12V15"] },
	/** A puzzle piece with square knobs. */
	extension: { s: ["M 4.25 8.25h11.5v11.5H4.25z"], f: ["M 7.75 3h4.5v5.25h-4.5z", "M 15.75 11.75h5.25v4.5h-5.25z"] },
	/** A solid triangle pointing right. */
	play: { f: ["M 7.75 3.5L16.25 12L7.75 20.5Z"] },
	/** A 45 degree zigzag over a rule. */
	signature: { s: ["M 3.75 11.5L7.75 7.5L11.75 11.5L15.75 7.5L19.75 11.5", "M 3.25 17.25H20.75"] },
	/** An envelope with a small padlock at its corner. */
	"mail-lock": {
		s: ["M 11 15.5H2.75V4.25H17.25V9", "M 4.5 6L10 11.5L15.5 6", "M 15.5 15.75V13.25H19.5V15.75"],
		f: ["M 13.75 15.75h7.5v5.5h-7.5z"],
	},
	/** A tap with a falling drop. */
	faucet: { s: ["M 5.75 9.5H17.75V12.5", "M 11.75 9.5V5.5M 8.75 5.5H14.75"], f: ["M 17.75 15.5L20 17.75L17.75 20L15.5 17.75Z"] },
	/** The public globe with a pencil. */
	"network-edit": {
		s: ["M 6.75 3H12.25L16 6.75V12.25L12.25 16H6.75L3 12.25V6.75Z", "M 3 9.5H16M 9.5 3V16"],
		f: ["M 14 21.5V18.75L19.75 13L22.5 15.75L16.75 21.5Z"],
	},
	/** A square sun with block rays. */
	sun: {
		s: ["M 8.25 8.25h7.5v7.5h-7.5z"],
		f: [
			"M 10.75 1.75h2.5v3.5h-2.5z",
			"M 10.75 18.75h2.5v3.5h-2.5z",
			"M 1.75 10.75h3.5v2.5h-3.5z",
			"M 18.75 10.75h3.5v2.5h-3.5z",
			"M 2.75 2.75h2.5v2.5h-2.5z",
			"M 18.75 2.75h2.5v2.5h-2.5z",
			"M 2.75 18.75h2.5v2.5h-2.5z",
			"M 18.75 18.75h2.5v2.5h-2.5z",
		],
	},
	/** A crescent of straight cuts. */
	moon: { f: ["M 8 3L3 8V16L8 21H16L21 16H13L8 11Z"] },
	/** An outlined funnel: no filter applied. */
	filter: { s: ["M 4.5 4.5H19.5L14 10V19.5H10V10Z"] },
	/** A solid funnel: a filter applied. */
	"filter-solid": { f: ["M 3.25 3.25H20.75L15.25 8.75V20.75H8.75V8.75Z"] },
	/** A box under its lid. */
	package: { s: ["M 3.75 4.25h16.5v4.5H3.75z", "M 5.25 8.75V19.75H18.75V8.75", "M 10 12.5H14"] },
	/** A fuel pump. */
	fee: { s: ["M 4.25 4.25h8v15.5h-8z", "M 12.25 11H16V17.25H19.75V7.5L17.25 5"], f: ["M 6.75 6.75h3v3.5h-3z"] },
	/** A square with two bars. */
	pause: { s: [FRAME, "M 10 8.75V15.25M 14 8.75V15.25"] },
	/** Stepped bars, slashed. */
	"no-signal": { s: ["M 4 4L20 20"], f: ["M 4 15h3v5H4z", "M 10.5 11h3v9h-3z", "M 17 7h3v13h-3z"] },
	/** Two opposed arrows. */
	swap: { s: ["M 4.5 8H17", "M 14.5 4.5L18 8L14.5 11.5", "M 19.5 16H7", "M 9.5 12.5L6 16L9.5 19.5"] },
} as const satisfies Record<string, Glyph>

export type GlyphName = keyof typeof glyphs
