# unicode-1: owner asks

## A1. Which characters a typed address, app alias or settings search loses

**Surface:** Send's recipient field, the capabilities window's "Name for this app" field (and what the app receives), Settings search.

**Why it is asked:** the lane brief says "format characters, bidi controls, zero-width characters are refused or stripped". Read in full, that removes characters that shape what a person sees. The plan ([plan.md](plan.md) D1) removes a narrower set, and the Codex review approves the implementation on condition that the owner, or the orchestrator as scope decision-maker, ratifies that narrowing.

**Options:**
- **A. D1, the narrow set (recommended).** Removed as typed or pasted: the twelve bidi controls (embeddings, overrides, isolates, and the marks LRM, RLM and ALM), the zero-width space, the word joiner, the BOM and the soft hyphen. Kept: joiners, variation selectors, tag characters and every other character. What it looks like: the lab's alias shows and sends its letters and emoji in the order typed; a pasted address with a zero-width space works; a family emoji, a red heart ❤️, a Scottish flag or a Persian word in an alias render as today. A mixed Arabic and Latin alias that relied on a direction mark may show its punctuation in another place.
- **B. The brief in full, every format character (`\p{Cf}`), plus variation selectors.** The same as A, and also: a family emoji in an alias splits into separate faces, ❤️ may draw as a plain text heart, a Scottish flag becomes a black flag, and a Persian word loses its non-joiner, so letters join that should not.
- **C. As B, but keeping the two joiners.** Between A and B: emoji sequences and Persian spelling survive; subdivision flags and Arabic number signs change.

**Recommendation:** A. It fixes everything #1388 and #1395 show, and it changes nothing else a person sees except explicit bidi formatting, which the brief names. The characters it keeps are filed as a closed known limit (plan D5), to reopen on a user report or a decision to strip more.

**What ships now:** A. The arc builds it unchanged; B or C would be a follow-up that widens one regular expression and its tests.
