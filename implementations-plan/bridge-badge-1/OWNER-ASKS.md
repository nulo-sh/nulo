# bridge-badge-1: owner asks

## Answers

Page 196, signed 2026-11-19 23:13:36Z (head 93877b8b1), then the owner's message of 2026-11-19 at about 23:25Z:

- **A1 = (a)**, a badge at every size (P196-01 = a).
- **A2 = (a)**, the warning keeps the top right (P196-02 = a).
- **A3, Shield**: P196-03 note: "Can't we source it from their page? Happy to ask if needed though." Then: "Raise the cap. Or try to compress via a library. But it doesn't sound plausible. So raise the cap." Shield's picture is its published app icon, `https://shield.human.tech/icon.svg`, byte for byte, unaltered; `bridgeIcon` gets its own, larger size cap (plan § Format, D13); `icon` keeps 3,072.
- **A3, Raven House = (b)** (P196-04 = b): the raven cut from the wordmark on a white disc, 2,578 characters, as frames `bb-pic-b-*` show.
- **A4**: P196-05 note: "I've already talked with everyone except Circle, and it's ok." Then: "We got Circle's approval. Move on." All three permissions are recorded by the owner on 2026-11-19: human.tech and Raven House before page 196's sign-off, Circle after it. Arc 3 is not gated (D11 does not apply).
- **A5 = (b)** (P196-06 = b): cWETH's diamond under CC BY 4.0, no letter to the Ethereum Foundation.
- **A6 = (a)** (P196-07 = a): keep the page-colour outline.

The asks as put to the owner follow, unchanged.

The pick these asks follow: P194-03 = b, with the note "Also, do the same for cWETH" (page 194, 2026-11-19 22:13Z). Frames, 360 px at 2x, light and dark, are kept outside the repository with `captions.json` (the capture-page method: the real `TokenList`, `TokenMark` and `ContractChip`, the badge drawn as arc 2 would draw it). They are mock-ups: neither bridge has licensed its mark.

**What ships without waiting.** Arc 1 (the list format) and arc 2 (the wallet) build now. Arc 2 draws a badge only for a list entry that carries a bridge picture, and no served list carries one until arc 3, so a release carrying arc 2 changes nothing anyone sees. Arc 3 (the entries and pictures) waits for A4.

## A1. Small sizes

Surface: every place the mark draws below 32 px: the token page header (20 px mark, 10 px badge), contract chips in the dApp, fee and activity windows, and activity title rows (16 px mark, 8 px badge).

- **(a) A badge at every size**, as picked: "16 px in a row and 8 px on a chip". At 8 px the badge cannot be read; it shows only that something sits there. Frames `bb-size-a-light`, `bb-size-a-dark`. **Ships now.**
- **(b) No badge below 20 px**: chips and activity title rows draw the token's picture alone; rows and the token page keep it. Frames `bb-size-b-*`.
- **(c) No badge below 32 px**: only Home, Holdings and Send picker rows and the Send card draw it. Frames `bb-size-c-*`.

Recommendation: **(b)**. The 8 px badge says nothing, crowds a 16 px mark and sits on dApp windows where the chip's job is to name the contract. Either (b) or (c) is one condition in `TokenMark`.

## A2. The warning badge's place

Surface: the red warning on a token flagged as a scam, on every mark.

A listed token can never be flagged: the list refuses to list and flag one pair. So no real token carries both badges. The frames stage the clash on rUSDC to show each place.

- **(a) The warning keeps the top right**; if a token ever carried both, the warning is drawn and the bridge badge is not. Nothing changes for a flagged token. Frames `bb-scam-a-*`. **Ships now.** Recommended.
- **(b) The warning moves to the bottom right** on every flagged token. Frames `bb-scam-b-*`.
- **(c) The warning moves to the top left** on every flagged token. Frames `bb-scam-c-*`.

## A3. The two bridge pictures

Surface: the badge itself. The list takes one SVG of at most 3,072 characters per picture; README § Pictures says issuers' marks are "used as published, unaltered and never recoloured".

- **Shield** (cUSDC, cWETH). Its app icon (`https://shield.human.tech/icon.svg`) takes 13,238 characters as published, and 5,434 even with every coordinate rounded. It does not fit as published.
  - (a) Ask human.tech for a file that fits (the draft letter asks). Nothing is altered. Recommended.
  - (b) Nulo redraws it to fit. That alters the mark, so human.tech must approve the exact file, and README § Pictures needs a rule for redrawn bridge pictures.
- **Raven House** (rUSDC). It publishes no raven alone: a PNG favicon (the list takes SVG only) and a wordmark.
  - (a) The raven cut from the wordmark, no background (2,442 characters). On the dark page its dark wing and eye fade. Frames `bb-pic-a-*`.
  - (b) The same raven on a white disc (2,578 characters), the plate the P194 mock-up showed. Frames `bb-pic-b-*`.
  - (c) Ask Raven House for a symbol file that reads on both themes (the draft letter asks). Recommended.
  - Both (a) and (b) alter the published lockup, so Raven House must approve the exact file.

Recommendation: each bridge supplies its own file, so no picture of theirs is altered. The frames use (b) for the raven.

## A4. The permission letters and the ship gate

Nothing goes out until the owner sends these. The ship gate: **no list publish that carries a bridge picture (`bridgeIcon`), and no merge of arc 3, until the owner records all three written permissions** (four, if A5 is (a)). Arc 3's PR stays a draft until then. Arcs 1 and 2 may merge and release: they draw nothing on the served list.

One thing to weigh before sending the Circle letter: it states the sizes the wallet draws USDC's mark at, two of them below Circle's 32 px digital minimum. That use predates this ask, and P194-04 = a says to act only if Circle asks. Sending the letter draws Circle's attention to it.

### To Circle (trademarks@circle.com)

> Subject: Request for written permission: a bridge badge over the USDC Token Logo in the Nulo wallet
>
> Hello,
>
> Nulo is a self-custodial wallet for the Aztec network, published as a browser extension on the Chrome Web Store and Firefox Add-ons. It lists two bridged forms of USDC on Aztec: cUSDC, bridged by human.tech's Shield, and rUSDC, bridged by Raven House. Both show Circle's USDC Token Logo, unaltered, from your pressroom kit (`usdc.zip`, `Token Logo/USDC Token.svg`).
>
> To tell the two apart, we ask permission to draw each bridge's own icon as a small badge over the top right corner of the USDC Token Logo. Your Brand Use Policy asks us not to superimpose graphics on your Brand Assets, and your USDC guide asks for clear space around the symbol, so we ask before doing it.
>
> - What: the bridge's icon (Shield's for cUSDC, Raven House's for rUSDC), drawn beside and partly over the logo's top right corner, inside its clear space. The logo file itself is not changed. [If A6 = a:] A thin outline in the page's background colour separates the badge from the logo.
> - Sizes: the logo at 16, 20, 32 and 36 px; the badge at half that, 8 to 18 px.
> - Where: the wallet's token rows (Home, Holdings, the Send token picker and card), the token's own page, the contract chips in transaction approval windows, and the activity list.
> - The symbols already follow your naming guide for bridged USDC (a prefix to "USDC"), and the wallet makes no claim that Circle issues or endorses these tokens.
>
> On your request we would remove the badge from every list we publish after it; a wallet keeps showing the copy it already holds until it takes the next list. May we have your written permission, or your conditions?
>
> Kind regards,
> [name], Nulo

### To human.tech (Shield)

Public channel: Shield's support site names only its Discord (`https://discord.gg/humantech`); use a direct contact if you have one, and ask for the reply in writing.

> Subject: Permission to show the Shield app icon as a badge on cUSDC and cWETH in the Nulo wallet
>
> Hello,
>
> Nulo is a self-custodial wallet for the Aztec network (Chrome Web Store and Firefox Add-ons). Its signed default token list includes Shield's Clean USDC (cUSDC) and Clean WETH (cWETH) on Aztec mainnet, at the addresses on your contracts page.
>
> We ask permission to show Shield's app icon as a small badge over the top right corner of each token's picture, so people can see the token comes through Shield.
>
> - Sizes: the token picture at 16, 20, 32 and 36 px; the badge at half that, 8 to 18 px.
> - Where: token rows (Home, Holdings, the Send picker and card), the token page, contract chips in approval windows, and the activity list.
> - The file: our list carries each picture as an SVG of at most about 2.2 KB, with no embedded images, filters or links. Your published `icon.svg` is 9.9 KB. Could you send, or approve, an SVG of the app icon within that size that reads on both light and dark backgrounds? We would show it unaltered [if A6 = a: with a thin outline in the page's background colour].
>
> On your request we would remove the badge from every list we publish after it; a wallet keeps showing the copy it already holds until it takes the next list. May we have your written permission?
>
> Kind regards,
> [name], Nulo

### To Raven House (ravenhousenft@gmail.com, the address on ravenhouse.xyz)

> Subject: Permission to show the Raven House raven as a badge on rUSDC in the Nulo wallet
>
> Hello,
>
> Nulo is a self-custodial wallet for the Aztec network (Chrome Web Store and Firefox Add-ons). Its signed default token list includes rUSDC on Aztec mainnet, at `0x03b8cb72f54ada0a9766da3c4a9316d05bef05b755bd58f74c1f8325b83ea3bd`.
>
> We ask permission to show Raven House's raven as a small badge over the top right corner of rUSDC's picture, so people can see the token comes through Raven House.
>
> - Sizes: the token picture at 16, 20, 32 and 36 px; the badge at half that, 8 to 18 px.
> - Where: token rows (Home, Holdings, the Send picker and card), the token page, contract chips in approval windows, and the activity list.
> - The file: we found the raven only inside your wordmark and as a PNG favicon. Our list carries an SVG of at most about 2.2 KB, with no embedded images, filters or links. Could you send, or approve, an SVG of the raven alone that reads on both light and dark backgrounds? We would show it unaltered [if A6 = a: with a thin outline in the page's background colour].
> - Please also confirm that rUSDC at the address above is Raven House's token.
>
> On your request we would remove the badge from every list we publish after it; a wallet keeps showing the copy it already holds until it takes the next list. May we have your written permission?
>
> Kind regards,
> [name], Nulo

## A5. cWETH's base picture

Surface: cWETH's mark. Its picture is Ethereum's diamond, used under ethereum.org's CC BY 4.0 terms; those terms reserve "the Foundation logo and all related names, logos" to the Ethereum Foundation's "prior written permission" (README § Pictures). A badge over it is the same overlay the Circle letter asks about.

- (a) Send a fourth, short letter to the Ethereum Foundation, worded as the Circle letter. Recommended: the cost is one email, and the README already records the reservation.
- (b) Rely on CC BY 4.0, which permits adaptations of the image; it licenses no trademark. My confidence that a badge needs no permission here: low.

## A6. The outline around the badge

Surface: the badge on every mark. The P194 mock-up drew each badge with a thin outline in the page colour. On a contract chip, which sits on its own surface, and on a hovered row, that outline shows as a halo, as the warning badge's plate already does today.

- **(a) Keep the page-colour outline** (1 px on marks under 24 px, 1.5 px from 24 px). Frames `bb-ring-a-light`, `bb-ring-a-dark` (the rUSDC row hovered; chips below). **Ships now.**
- **(b) No outline**: the badge sits directly on the token's picture. Frames `bb-ring-b-*`.

Recommendation: (a). At these sizes the outline is what keeps a badge from merging into the token's picture, and the warning badge already looks this way. A bridge file with its own backing (A3) helps either way.
