# mainnet-seed-1: owner asks

The arc ships without any of these: each "ships now" line is what the draft PR carries. Every answer is applied on the PR's branch before the merge, which waits for the live pair anyway. Pictures are attached to the PR.

## OA-1: README and store-listing wording once Mainnet is seeded

- **Surfaces.** `README.md:8` on GitHub (the banner's network bullet), and `apps/extension/store/listing.md:218-220`, the reviewer note sent to Firefox Add-ons with every version. Also `legal/README.md:77-79`, which says 1.0.0 seeds "no Mainnet, which arrives in a later 1.x": false if this merges before 1.0.0, and edited with whichever answer lands.
- **Ships now:** both unchanged. README: "**The Aztec testnet is the default network.** Its assets are for testing; a mainnet network you add may carry real value. Use only what you can afford to lose entirely. Treat any key material you import as compromised." Listing: "The wallet opens on the Aztec testnet, its only public network, with a zero balance." With the seed, "its only public network" is false.
- **A (recommended).** README: "**The Aztec testnet is the default network.** Its assets are for testing. Aztec Mainnet is also built in, and its assets, like those on any mainnet network you add, may carry real value. Use only what you can afford to lose entirely. Treat any key material you import as compromised." Listing: "The wallet opens on the Aztec testnet with a zero balance. Aztec Mainnet is also listed under Networks."
- **B.** The listing change only; the README line stays, since #893 (launch-prep-1, draft) replaces the whole banner and its Mainnet sentence ("Mainnet comes in a later 1.x release") then needs the same edit.
- **Note.** If #893 lands first, A's README sentence replaces #893's "Mainnet comes in a later 1.x release."

## OA-2: the get-gas link on Mainnet

- **Surfaces.** The send fee card's nudge ("Get Fee Juice" / "Get private gas"), the review sheet's link, and Home's Get started gas row, with Mainnet active. All three open `https://testnet.app.unleashed.systems` on every network (`send/fee-helpers.ts:333`; #77).
- **Ships now:** unchanged; a Mainnet person is sent to the Testnet bridge.
- **A.** Hide the link and the Get started row on Mainnet until unleashed has a Mainnet bridge; the nudge keeps its words without the link.
- **B (recommended until a Mainnet bridge exists).** Keep it, as today's owner call ("on every network").
- **C.** A Mainnet bridge URL the owner names.

## OA-3: a Mainnet account's chain label in dApp windows

- **Surfaces.** The connect window's account rows (`AccountSelectRow.vue:75`) and Settings → Connected apps → an app's details (`connected-apps/[id].vue:60,272`), which name a chain through `getChainName`.
- **Ships now:** "AZTEC:2070860441" for a Mainnet account (the switch knows Testnet and Sandbox only).
- **A (recommended).** "MAINNET", one case in `getChainName`, as "TESTNET" reads today.
- **B.** As ships now.

## OA-4: Privacy § 5.1 beside a keyless Mainnet endpoint

- **Surface.** `legal/privacy.md` § 5.1, "the default endpoint uses a provider account belonging to the Developer", with what the Developer can see through it.
- **Ships now:** unchanged. True of the Testnet endpoint; the keyless Mainnet endpoint uses no account of the Developer's, so the sentence overstates what the Developer can see there (it never understates it).
- **A.** A keyed Mainnet endpoint on the Developer's dRPC account, replaced on the branch: the sentence stays true as written.
- **B.** Keep the keyless endpoint and name Testnet in the sentence: a patch bump of the Privacy Policy (not material: it narrows what the Developer sees).
- **C.** As ships now.
- **Recommendation.** A if the owner wants usage statistics for Mainnet; otherwise B.

## OA-5: the full export's network banner once Mainnet is a default

- **Surface.** Settings → Security → Export → Full backup, the warning "Some imported accounts need their network": "N imported accounts are on networks you added. A restore re-creates only the default networks, so add those networks again to restore them." (`export/full.vue:68-72,256-266`).
- **Ships now (a consequence of the seed, not a code change):** imported accounts on Mainnet's chain (2070860441) leave the count, because a restore now re-creates Mainnet (`useFullBackupExport.ts:121`, `isSeedChain`). Only a person who added that chain by hand before this build, in Developer Mode, sees a lower count or no banner. The banner's words are unchanged and stay true.
- **B.** Keep counting them: a special case that would tell a person a restore does not bring back a network it does. Not recommended.

## OA-6: #808's renewed disposition before the first Mainnet build

- **What.** Known limit #808 (a reset paused in v0.31.0 meets the 6.0.0 rotation) says "reopen … before the first Mainnet build", and this PR is that build. The arc reopens it with the trace and changes no runtime code.
- **The trace.** This build moves no seed and binds no new regime, so neither path gains an instance. Mainnet itself refuses capture and resume (`network-reset/service.ts:83,460`). The non-Mainnet path still stands: a resume skips entries finished under `nulo-v6.1` (`:561`), and mixed regimes withhold the whole profile.
- **A (recommended).** Renew the known limit as written and close it again; reopen on a person's report.
- **B.** A plan of its own for journal reconciliation: a recovery policy with its own obligations, not this lane's.
- **What ships now.** No runtime change; the PR's merge list names this answer.

## OA-7: a seeded "Mainnet" beside a network the person already named "Mainnet"

- **Surface.** Settings → Networks, the switcher and the arrival. Seeding skips the per-profile name check that adding and renaming enforce (`network/service.ts:581`, `seedOneNetworkLocked` from `:321`).
- **Who meets it.** A Developer Mode person who added a custom network named "Mainnet" on another chain (Alpha's 4248422646, say): the update adds the seed beside it, and the arrival names it. Their own row keeps its name; renaming it away frees the name for good.
- **Ships now:** two rows named "Mainnet", on different chains.
- **A (recommended).** Name the seeded row "Aztec Mainnet" when "Mainnet" is taken in the profile; the arrival then names it so.
- **B.** As ships now, a known limit.
