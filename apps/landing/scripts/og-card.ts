/**
 * The changelog's Open Graph cards: one 1200×630 picture per release and one for the index, drawn from
 * the release's TOML. A card is committed as `content/changelog/<file>`, stamped with the SHA-256 of
 * the document it was rendered from, so CI can tell a stale card without a browser. The document is
 * self-contained (fonts inline, no script, no URL), which is what makes that hash cover everything
 * drawn. Rendering lives in render-og-cards.ts.
 */

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { CARD_HEIGHT, CARD_WIDTH, type Change, type Editorial, byVersionDesc, icon, parseEditorial } from "./changelog-pages"
import { escapeHtml as esc } from "./markdown"
import { pngChunks, pngSize, pngText } from "./png"

/** Every box stays inside this rectangle, which lies within the middle 1200×600 a 2:1 crop keeps. */
export const SAFE = { left: 64, top: 48, right: 1136, bottom: 582 } as const
export const STAMP_KEYWORD = "nulo-og-inputs"
export const RENDER_COMMAND = "bun run --cwd apps/landing og:cards"

export type Card = { readonly kind: "release"; readonly editorial: Editorial } | { readonly kind: "index"; readonly latest: Editorial }

/** `data:` URIs of the two faces a card uses. */
export interface CardFonts {
	readonly headline: string
	readonly mono: string
}

export interface PlannedCard {
	/** The card's name under `content/changelog/`. */
	readonly file: string
	readonly document: string
	readonly hash: string
}

/** Resolved through the package, so the faces are the ones the landing ships. */
export function readCardFonts(): CardFonts {
	const base = import.meta.resolve("@nulo/design/base.css")
	const font = (name: string) => `data:font/woff2;base64,${readFileSync(new URL(`fonts/${name}`, base)).toString("base64")}`
	return { headline: font("SpaceGrotesk-latin.woff2"), mono: font("JetBrainsMono-latin.woff2") }
}

const STYLE = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${CARD_WIDTH}px;height:${CARD_HEIGHT}px;overflow:hidden;background:#0a0908;color:#f5f0e6;font-family:"Space Grotesk",sans-serif}
.card{position:absolute;left:${SAFE.left}px;top:${SAFE.top}px;width:${SAFE.right - SAFE.left}px;height:${SAFE.bottom - SAFE.top}px;display:flex;flex-direction:column;padding:40px 44px;border:1px solid rgba(245,240,230,.22)}
.card::before,.card::after{content:"";position:absolute;width:16px;height:16px;border:2px solid #f5f0e6}
.card::before{left:-1px;top:-1px;border-right:0;border-bottom:0}
.card::after{right:-1px;bottom:-1px;border-left:0;border-top:0}
.top{display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:14px;font-weight:700;font-size:26px;letter-spacing:.06em}
.brand i{width:24px;height:24px;border:2px solid #f5f0e6;border-radius:50%}
.mono{font-family:"JetBrains Mono",monospace}
.url{font-size:18px;letter-spacing:.04em;color:#999187}
.head{margin-top:auto}
.eb{font-size:17px;line-height:24px;letter-spacing:.16em;text-transform:uppercase;color:#999187;white-space:nowrap}
.eb b{color:#f5f0e6;font-weight:500;margin-right:14px}
.title{font-weight:700;letter-spacing:-.03em;margin-top:16px}
.title--release{font-size:74px;line-height:78px}
.title--index{font-size:84px;line-height:88px;white-space:nowrap}
.latest{font-weight:700;font-size:34px;letter-spacing:-.02em;line-height:44px;margin-top:14px;white-space:nowrap}
.chip{display:inline-block;vertical-align:middle;font-weight:500;font-size:19px;letter-spacing:.14em;text-transform:uppercase;line-height:1;padding:10px 14px;margin-right:12px;background:#f5f0e6;color:#0a0908;transform:translateY(-.3em)}
.title--release .chip{transform:translateY(-.55em)}
.changes{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:18px;margin-top:30px;list-style:none}
.changes li{border-top:1px solid rgba(245,240,230,.22);padding-top:16px}
.k-icon{width:46px;height:46px;display:grid;place-items:center;border:1px solid rgba(245,240,230,.22);background:#1d1b1a}
.icons{display:flex;gap:14px;margin-top:30px}
.icons .k-icon{width:56px;height:56px}
.gl{display:block;width:26px;height:26px}
.gl-s{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.gl-f{fill:currentColor}
.change{font-weight:500;font-size:21px;line-height:26px;letter-spacing:-.01em;margin-top:14px}
`

function release(e: Editorial): string {
	const tile = (c: Change) =>
		`<li><span class="k-icon">${icon(c.icon)}</span><p class="change" data-fit="change" data-lines="3">${esc(c.title)}</p></li>`
	return `<div class="head">
<p class="eb mono" data-fit="date" data-lines="1"><b>v${esc(e.version)}</b>${e.dateLabel}</p>
<h1 class="title title--release" data-fit="title" data-lines="2"><span class="chip mono">Nulo ${esc(e.version)}</span>${esc(e.title)}</h1>
</div>
<ul class="changes" style="--n:${e.changes.length}">${e.changes.map(tile).join("")}</ul>`
}

function index(e: Editorial): string {
	return `<div class="head">
<p class="eb mono" data-fit="date" data-lines="1"><b>v${esc(e.version)}</b>${e.dateLabel}</p>
<h1 class="title title--index" data-fit="title" data-lines="1">Changelog</h1>
<p class="latest" data-fit="latest" data-lines="1"><span class="chip mono">Nulo ${esc(e.version)}</span>${esc(e.title)}</p>
</div>
<div class="icons">${e.changes.map((c) => `<span class="k-icon">${icon(c.icon)}</span>`).join("")}</div>`
}

/** The page a card is a screenshot of. Every TOML string is escaped; nothing in it loads from a URL. */
export function cardDocument(card: Card, fonts: CardFonts): string {
	const body = card.kind === "release" ? release(card.editorial) : index(card.latest)
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
@font-face{font-family:"Space Grotesk";font-weight:300 700;src:url(${fonts.headline}) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-weight:400 700;src:url(${fonts.mono}) format("woff2")}${STYLE}</style></head>
<body><main class="card">
<div class="top"><span class="brand"><i></i>NULO</span><span class="url mono">nulo.sh/changelog</span></div>
${body}
</main></body></html>
`
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex")

/** One card per release and one for the index, from the newest release whether or not it is out yet. */
export function planCards(sources: readonly { version: string; toml: string }[], fonts: CardFonts): PlannedCard[] {
	const editorials = sources.map((s) => parseEditorial(s.toml, s.version)).sort(byVersionDesc)
	const cards: { file: string; card: Card }[] = editorials.map((editorial) => ({
		file: `${editorial.version}.og.png`,
		card: { kind: "release", editorial },
	}))
	if (editorials[0]) cards.push({ file: "index.og.png", card: { kind: "index", latest: editorials[0] } })
	return cards.map(({ file, card }) => {
		const document = cardDocument(card, fonts)
		return { file, document, hash: sha256(document) }
	})
}

/** What is wrong with a committed card, or `undefined` when it is the picture of `hash`'s document. */
export function checkCard(file: string, png: Uint8Array | undefined, hash: string): string | undefined {
	const label = `content/changelog/${file}`
	if (png === undefined) return `${label} is missing: run ${RENDER_COMMAND}`
	try {
		pngChunks(png)
	} catch (error) {
		return `${label} is not a readable PNG (${(error as Error).message}): run ${RENDER_COMMAND}`
	}
	const { width, height } = pngSize(png)
	if (width !== CARD_WIDTH || height !== CARD_HEIGHT) return `${label} is ${width}×${height}, not ${CARD_WIDTH}×${CARD_HEIGHT}`
	if (pngText(png, STAMP_KEYWORD) !== hash) return `${label} is stale against its inputs: run ${RENDER_COMMAND}`
	return undefined
}
