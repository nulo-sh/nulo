/// <reference types="node" />
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "vitest"

// base.css is HAND-AUTHORED — a verbatim flatten of the extension's former SCSS partials.
// Unlike tokens.ts and utilities.css (generated + drift-pinned), nothing else pins
// it, yet it carries the look-same risk: token values, the [theme] blocks, @font-face, resets,
// keyframes. A dropped or edited rule changes rendering with no test failure. This pin makes every
// edit deliberate: a real change updates the hash in the same commit, where the diff gets re-verified
// against the pixel-identical constraint.
test("base.css content is pinned (edits must be deliberate + visually re-verified)", () => {
	const css = readFileSync(join(process.cwd(), "src/base.css"), "utf8")
	const hash = createHash("sha256").update(css).digest("hex")
	// Deliberate choices the hash also pins: .copyable uses cursor: pointer (copy is a drag-and-drop
	// signal, wrong for click-to-copy); `* { scrollbar-width: none }` stands beside the
	// `::-webkit-scrollbar` rule Firefox ignores, so Firefox matches Chrome; the dark palette is
	// declared once (`:root, [theme="dark"]`), its hairline and scrim tokens at their literals' values,
	// its --txt-danger lighter than --red so it reads 4.5:1 on a pressed row, and --btn-destructive
	// darker than --red so the red buttons' label reads AA; line 1 carries the Apache-2.0 §4(b) header.
	expect(hash).toBe("107a0312896c9271e382ed4599489b41af81e02967b0628b3a3fc93c158f6336")
})
