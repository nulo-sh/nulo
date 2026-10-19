# Owner asks: landing-explainer-1

**Answered by the owner (2026-10-17/18):** P42-01, P42-02, P42-03 = A (the scripts and card texts as written) and P42-04 = A (the `explainer` skill, narrated with the voice in the owner's ElevenLabs file). Arc 2 made the clips; OA-8 and OA-9 below are what is still open, with OA-10 and OA-11 from the 2026-10-19 retake.

**Settled by the orchestrator (D-orch, 2026-10-17 22:0xZ), on the plan's approval:** OA-5 = A, the page ships unlinked from the home page. OA-6 = A, the owner runs the preview command by hand; nothing enables branch builds. OA-7 = A ships now, quoted in the PR body for the owner to flip. OA-1 to OA-4 stay the owner's: the three scripts and their text versions go on the owner's next decision page verbatim from this file, and the page ships the text versions until the owner picks.

The page `https://nulo.sh/how-aztec-works` ships in arc 1 as the signed drawing `p33-aztec-a` (P33-03 A): the landing's header, grain, plates and footer, the heading "How Aztec works.", the two sentences, then three cards named Private balances, Proofs, Fees. Until a clip exists, each card shows its short text version, never an empty player. The PR stays a draft until you answer OA-1 to OA-3 (P39-11: "I want to approve the explainers though") and a Cloudflare preview of it exists (OA-6).

Every claim below was checked against the Aztec developer docs at v6.0.0-rc.3 and the wallet's own glossary; [recon.md](recon.md) lists the source of each. Two things the clips deliberately do not say: that the record hides who was paid (a first payment to someone new leaves a trace that anyone who knows their address can find), and that transaction sizes are hidden (the current Aztec version does not pad them).

**For all three clips** (one direction, so the three read as a set): 16:9, 40 to 60 seconds, in the landing's look: the dark page, the character "camera feed", plates with corner ticks, mono labels. The feed is the public record: it shows only what a transaction makes public. Captions always available, and the card's text version stays under the clip. Which tool makes them, and whether they are narrated, is OA-4.

## OA-1. Clip 01, Private balances: the script and the card's text

**Surface:** the first card of the new page.

| Narration | Picture |
|---|---|
| On most blockchains, anyone who knows an address can read its balance and every amount it paid. | The feed scrolls; one address lights up with its balance and its history. |
| Nulo shows two balances for each token. Your private balance: only you can see it. Your public balance: anyone can see it, like a balance on Ethereum. | One token splits into two rows: a solid square (private) and a dotted square (public). |
| Your private balance is a set of encrypted notes, like cash in sealed envelopes. The network keeps a fingerprint of each note, and a sealed copy only its owner can open. | Sealed envelopes sit on the feed, each beside a short fingerprint. |
| Say you pay 3.50 from a note worth 5. Nulo spends that note and makes new ones: 3.50 for the person you pay, and 1.50 change for you. In a private payment, the record shows that something was spent. It does not show which note, or how much. | A 5 splits into 3.50 and 1.50; the feed adds two fingerprints and one "spent" line, with no amounts. |
| Moving money to your public balance is your choice, and the public side records the amount. Nulo labels each balance, so you always know which is which. | A coin moves from the solid square to the dotted one; its amount appears on the feed. |

About 150 words, 60 seconds.

**Text version (shown now):** "Your private balance: only you can see it. Your public balance: anyone can see it, like a balance on Ethereum. Nulo labels each one, so you always know which is which."

**Options:** A. Approve as written. B. Approve with your edits (a note). **Recommendation: A.** **What ships now:** the text version in the draft PR; no clip.

## OA-2. Clip 02, Proofs: the script and the card's text

**Surface:** the second card.

| Narration | Picture |
|---|---|
| When you send on Aztec, the private part of the work happens on your computer, not on the network. | A laptop outline lights up; the feed beside it stays still. |
| Nulo runs it right here, with your keys and your notes. Your keys, and what is in your notes, stay on your computer. | Keys and open notes stay inside the laptop's frame. |
| Then your computer builds a proof: math that shows this private part follows the rules, without showing what is in it. | A progress bar fills while the proof takes shape. |
| The proof goes to the network, with sealed notes for the people you pay. The network checks the proof, and if it holds, the transaction joins a block. It never needed your private data to trust it. | A sealed packet travels to the feed; a check mark; a new block. |
| Anything a transaction does in public, the network runs in the open, for everyone to see. | A second, open packet: its contents print on the feed. |
| Later, one proof for a whole batch of blocks is checked on Ethereum. | Many blocks fold into one proof that lands on Ethereum. |
| Building a proof takes real work, so it is the slow step before sending. | The progress bar again, finishing. |

About 140 words, 56 seconds.

**Text version (shown now):** "Your computer proves the private part of a transaction without revealing it, and the network checks the proof instead of your private data. Anything done in public stays visible. Proving is the slow step before sending."

**Options:** A. Approve as written. B. Approve with your edits. **Recommendation: A.** **What ships now:** the text version; no clip.

## OA-3. Clip 03, Fees: the script and the card's text

**Surface:** the third card.

| Narration | Picture |
|---|---|
| Every Aztec transaction pays a network fee, the way Ethereum charges gas. | A transaction card with a small fee tag. |
| The fee is paid in Fee Juice, the token that pays network fees on Aztec. You bring it over from Ethereum, and it is used only for fees. | A bridge from Ethereum; Fee Juice arrives and goes into a fee meter only. |
| The price depends on the work: publishing the transaction's data, and running it on the network. Nulo shows you the fee before you send. | Two bars, data and work, add up to the fee shown on a Send screen. |
| How you pay matters. Pay with public Fee Juice, and the record names you as the payer, each time. Pay with private Fee Juice, and the payer on record is a contract many people share. | The feed shows the payer's address for public; for private it shows one shared payer that is not you. |
| Sometimes the fee is sponsored: someone else pays it for you. | Another hand pays the fee tag. |

About 110 words, 43 seconds.

**Text version (shown now):** "Every transaction pays a network fee in Fee Juice, the token that pays network fees on Aztec. Pay with public Fee Juice and the record names you as the payer. Pay with private Fee Juice and it names a payer many people share."

**For your information:** the wallet's glossary says private Fee Juice "keeps your address hidden". That holds for the fee payment itself. It does not hide your address if the same transaction does something in public, so the clip names what the record shows instead.

**Options:** A. Approve as written. B. Approve with your edits. **Recommendation: A.** **What ships now:** the text version; no clip.

## OA-4. How the clips are made, and the go-ahead

**Surface:** the three cards, once the clips exist (arc 2).

Both tools cost money and send material to an outside service, so each needs your yes in your own words, with a spending cap; a relayed brief cannot start either. You also pick the voice (or captions only) and the look.

| Option | What you get | Cost and trade-offs |
|---|---|---|
| **A. `explainer` skill** | Hand-drawn animated scenes in the landing's own look (the character feed, the plates), played by a small player on the page, with an ElevenLabs voice or captions only. A transcript and chapters come with it. | Sends the narration text to ElevenLabs (none in captions mode). About 1 MB per clip. Exact, and a changed line costs only its narration. It is not a video file: it cannot be downloaded or posted as one. Each scene is built by hand, and the player and scenes become code on the landing, reviewed like any other. |
| **B. `higgsfield-video-explainer`** | An AI-made, illustrated video per clip: a Higgsfield style (from its catalogue or a picture of the landing), an AI narrator, six 10-second shots. The tool works in whole minutes, so each clip runs exactly 60 seconds. | Sends the script and the shot prompts to Higgsfield, and the landing picture too if you pick that style. A real MP4 of 3 to 8 MB per clip, kept in the repository. Each change regenerates paid shots. The pictures can drift from the landing's look; the tool bans text inside the frames. |

**Recommendation: A** (moderate confidence). The page's look is the landing's character feed, which drawn scenes match exactly and generated video only approximates. The clips stay small, exact and easy to correct, and the captions come from the same words. Against: B looks like real video and needs less hand work.

**What ships now:** no clips; each card keeps its text version. Arc 2 starts after your answer, your yes and your cap.

## OA-5. A link to the page from the home page

**Surface:** the home page header (today: "How it works", "Get Nulo") and its footer.

| Option | What it looks like |
|---|---|
| **A. No link** | The page is reached from the wallet's How Aztec works item and from search engines. |
| **B. Header link** | The home header reads "How it works", "How Aztec works", "Get Nulo", as the new page's own header does in the drawing. |
| **C. Footer link** | "how aztec works" joins the footer row (github · chrome · firefox · releases · privacy · terms). |

**Recommendation: B.** The drawing already puts the link in the page's header, and the two headers then match. Against: at 900 px and narrower the header hides every link but Get Nulo, as it hides How it works today, so B reaches desktop visitors only; C reaches phones too. **Settled: A** (orchestrator, D-orch: the lane brief ships the page unlinked by default).

## OA-7. The page's search and share text

**Surface:** what a search result or a shared link shows for the page.

| Option | Title | Description | Share picture |
|---|---|---|---|
| **A. The signed words** | How Aztec works \| NULO | Balances are private unless you make them public. Each transaction is proved on this computer and pays a small fee in Fee Juice. | The home page's card ("You're on camera. You choose what it sees.") |
| **B. Your words** | as A | your description, in a note | as A, or none |

**Recommendation: A.** It reuses copy you signed and the site's one card. Against: "this computer" reads oddly in a search result, and the card shows the home page's headline. **Ships now: A** (orchestrator, D-orch), quoted in the PR body so you can flip it.

## OA-6. The Cloudflare preview (an action only you can take)

No landing branch build has run so far: Workers Builds has built `nulo-landing` from `main` only (no landing build on any `dev` commit or landing PR). So the draft PR cannot show a preview link by itself. You asked to watch the page through a Cloudflare preview, so the PR becomes ready for review only once a preview link for its latest commit serves the page. Until then it carries desktop and phone screenshots (the landing has one theme, dark).

| Option | What you do | Effect |
|---|---|---|
| **A. One preview by hand** | From a checkout of the PR branch, signed in to Cloudflare: `bun install --frozen-lockfile && cd apps/landing && bun run build && bun run deploy:preview -- --preview-alias how-aztec-works` | Prints `https://how-aztec-works-nulo-landing.<your workers.dev subdomain>` for that commit. Never touches nulo.sh. Rerun after each change you want to see. |
| **B. Turn on branch builds** | Cloudflare dashboard → Workers & Pages → nulo-landing → Settings → Builds → Branch control: enable "Builds for non-production branches", with the deploy command `bun run deploy:preview` (the README already names it). | Every pushed branch gets a preview link in its checks. The cost: a branch build runs that branch's build commands with the Workers Builds token, which can also deploy to nulo.sh. Any branch an agent or collaborator pushes would then run with that power, not only reviewed `main`. |

**Recommendation: A** for this page: it keeps production deploys behind a reviewed merge. **Settled: A** (orchestrator, D-orch: production deploys stay behind a reviewed merge). The PR body carries A's command and says the preview appears after you run it; nothing enables branch builds.

## OA-8. Approve the three clips (arc 2)

**Surface:** the player at the top of each card of `nulo.sh/how-aztec-works`.

The clips follow your approved scripts word for word, in the voice from your ElevenLabs file, drawn in the landing's look. The review folder (`REVIEW.md`, relayed by the orchestrator) holds, per clip: a review video of exactly what the page draws, its length, its characters, its captions and transcript, and a still of every scene. It also lists every word drawn inside the clips and what to listen for (how the voice reads "3.50" and "1.50").

| Option | What happens |
|---|---|
| **A. Approve as they are** | The arc 2 PR leaves draft. |
| **B. Approve with changes** | A note per clip. A changed picture costs nothing; a changed word means a new narration of that clip, about 600 to 800 of the 12,821 characters left under the cap. |

**Recommendation: A.** **What ships now:** the arc 2 PR, as a draft.

### Owner's retake note, 2026-10-19 (P53-04 = B)

The note, verbatim:

> General feedback:
> - It feels that it can be a little faster like 1.15x?
>
> Some feedback "The Private / Public balance":
> - It names "one point five zero" instead of saying "one point five" which is the natural thing to say.
> - It needs to update public and private icons, to the new ones selected
>
> On Proofs:
> - I think the "USDC" is too close to one of the borders / envelopes.
>
> On Fees:
> - The token that you bridge to Aztec from Ethereum it's $AZTEC that gets converted to FeeJuice and it's non transferrable once converted to FeeJuice
> - Same on the icon for private / public

What the retake changed, and nothing else:

- **Pace, all three:** 1.15 times faster, by a tempo change on the narration, so nothing was narrated again for it.
- **Clip 01, scene 4, the new line** (only "1.50" became "1.5"): "Say you pay 3.50 from a note worth 5. Nulo spends that note and makes new ones: 3.50 for the person you pay, and 1.5 change for you. In a private payment, the record shows that something was spent. It does not show which note, or how much."
- **Clip 03, scene 2, the new line:** "The fee is paid in Fee Juice, the token that pays network fees on Aztec. You bring the Aztec token over from Ethereum, and it becomes Fee Juice. Once converted, it cannot be transferred, and it is used only for fees." Its picture: a $AZTEC chip crosses the bridge, becomes FEE JUICE on the Aztec side, NO TRANSFERS appears above it, and it drops into the fee meter.
- **The Fees card's text** gains a second sentence: "You bring $AZTEC over from Ethereum, and it becomes Fee Juice, which cannot be transferred."
- **Icons:** the private and public marks are the shield and globe the wallet draws on `dev` (#812), the pair Home's balance view renders.
- **Clip 02:** "40.00 USDC" keeps 14 units from its note's right border, as from its left.
- **Characters:** 455 (239 and 216) of the retake's 5,000.

## OA-10. Labels close to a border that the note did not name

**Surface:** four labels inside the clips, each nearer the right border of its box than the 14 units it keeps on the left: "ONLY YOU CAN SEE IT" 2.7 (clip 01, scene 2), the moving "40.00" coin 4.1 (clip 01, scene 5), "SOMEONE ELSE" 7.4 (clip 03, scene 5), "795.00" 8.5 (clip 02, scenes 2 and 4). Measured in the browser.

| Option | What happens |
|---|---|
| **A. Leave them** | As they play now. |
| **B. Give each the same inset** | The box widens or the label moves; a picture change, no characters. |

**Recommendation: B.** It is the same thing you saw in the USDC note. **What ships now:** A.

## OA-11. The figures in clip 01

**Surface:** scene 4 of Private balances.

- **"3.50", spoken:** your note named only "1.50", so the two "3.50"s kept their words. From the narration's timing alone (nobody has listened), the voice likely reads them as it read "1.50" before, digit by digit: "three point five zero".
- **"1.50", drawn:** the change note on the picture still reads 1.50, as the wallet writes an amount, while the voice says "one point five".

| Option | What happens |
|---|---|
| **A. Keep both** | As they play now. |
| **B. Say "3.50" another way** | Your words, for example "three fifty"; scene 4 is narrated again, about 240 characters. |
| **C. Draw the change as 1.5** | A picture change, no characters. |

**Recommendation:** listen first; B if the voice says "three point five zero". **What ships now:** A.

## OA-9. Chapters under each clip

**Surface:** under each player, a numbered list of the clip's scenes, each one jumping to its start.

Option A of OA-4 named chapters. They need a title per scene, words you have not seen, so arc 2 ships without them.

| Option | What it looks like |
|---|---|
| **A. No chapters** | The player as it ships: picture, captions line, play, position, time. |
| **B. Chapters** | Five to seven short rows under each player, for example "0:00 Public chains", "0:06 Two balances", "0:18 Sealed notes". The titles would come to you first. |

**Recommendation: A.** Each clip runs under a minute, and the cards are narrow. **What ships now:** A.
