/// <reference types="node" />
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "vitest"

// base.css is HAND-AUTHORED. Unlike tokens.ts and utilities.css (generated + drift-pinned), nothing
// else pins it, yet it carries the look-same risk: token values, the [theme] blocks, @font-face,
// resets, keyframes. A dropped or edited rule changes rendering with no test failure. This pin makes
// every edit deliberate: a real change updates the hash in the same commit, where the diff is
// visually re-verified.
test("base.css content is pinned (edits must be deliberate + visually re-verified)", () => {
	const css = readFileSync(join(process.cwd(), "src/base.css"), "utf8")
	const hash = createHash("sha256").update(css).digest("hex")
	// Deliberate choices the hash also pins: the light barrier scrim follows its text palette;
	// .copyable uses cursor: pointer (copy is a drag-and-drop
	// signal, wrong for click-to-copy); `* { scrollbar-width: none }` stands beside the
	// `::-webkit-scrollbar` rule Firefox ignores, so Firefox matches Chrome; the dark palette is
	// declared once (`:root, [theme="dark"]`), its hairline and scrim tokens at their literals' values,
	// its --txt-danger lighter than --red so it reads 4.5:1 on a pressed row, and --btn-destructive
	// darker than --red so the red buttons' label reads AA; `--log-error-color` is `--txt-danger` in both
	// themes, AA on the line's tint, and the light `--log-warn-color` is `--txt-warning`, AA on its tint;
	// `nav` stays out of the control rule because the landing's is text; line 1 carries the
	// Apache-2.0 §4(b) header.
	expect(hash).toBe("600b7672f8f74bf4ab2719f039a40fcccfdb28f595307fb7ff4f7c84611ff046")
})
