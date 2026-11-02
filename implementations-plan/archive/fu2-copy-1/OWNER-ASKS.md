# fu2-copy-1: owner asks

Two asks, both answered on decision page 98 (signed 2026-11-02 at 19:39 UTC, no note): OA-1 option A, OA-2 option B. OA-1 concerns Settings › Glossary and Settings › Proving (arc 3); OA-2 concerns Home › Get started (arc 2). Arc 1 (Holdings, the duplicate warnings, Disconnect all, Settings › Lock, the store listing) touches neither surface and depends on neither answer.

## OA-1 (arc 3): the words of the ten new Glossary entries

**Answered:** page 98, item OA-1, signed 2026-11-02, option A: the ten entries exactly as the table drafts them (term, definition, where), with both alternatives, so recovery phrase reads "The 24 words that restore your accounts, except the ones you imported." and full backup reads "Your accounts, imported keys, tokens, contacts and history, in one password-protected file."; the term "Alpha"; a new first section "Your wallet" with the eight wallet words in the table's order; FPC last in Fees; Proof first in Transactions, before Proving; the Proof tooltip is one sentence of at most 100 characters.

- **Surface:** Settings › Glossary (`#/popup/settings/glossary`), and the tooltip on "Proofs" on Settings › Proving (`#/popup/settings/proving`).
- **Why it is asked:** P93-34 C signed which words the Glossary gains (profile, account, network, Mainnet, recovery phrase, full backup, passkey, FPC, strict mode), and P93-52 C signed a dotted "Proof". Neither signed a definition, a "where" line or a place. Every Glossary entry so far carries words the owner signed, and its test pins them as such.
- **The draft** (term · definition · where it appears). Four rows reuse words already signed on page 93; two of those are not true in every case, so each has an alternative.

  | Key | Term | Definition | Where | Source and caveat |
  |---|---|---|---|---|
  | `profile` | Profile | Your wallet on this device: its accounts and keys, behind one password or passkey. | Lock screen · Settings | draft. Settings are device-wide, so the line does not claim them |
  | `account` | Account | An address inside a profile, with its own balances and history. | Home · Settings | draft, after P93-30 B ("an address inside a profile") |
  | `network` | Network | The Aztec chain Nulo talks to; each network keeps its own balances and history. | Header · Settings | draft. It does not claim a new address: networks on one L1 chain share addresses (`packages/wallet-crypto/src/derive-account-seed.ts:25-30`) |
  | `alpha` | Alpha | Aztec's main network, also called Mainnet; Testnet and local networks are for trying things out. | Network menu | draft. No screen says "Mainnet": the main network's row is named "Alpha" (`apps/extension/src/wallet/services/network/seeds.ts:61-66`), so the entry names the word a person sees. Term "Mainnet" instead, if preferred |
  | `recovery-phrase` | Recovery phrase | The 24 words that restore your accounts. | Get started · Backup | P93-37 B, signed. **Not true for imported accounts**, which the phrase does not restore (`reset.vue:308` says so). Alternative: "The 24 words that restore your accounts, except the ones you imported." |
  | `full-backup` | Full backup | Everything in this profile, in one password-protected file. | Backup | P93-37 B, signed. **"Everything" is not true**: added networks and fee payers are left out (the backup README's retired slices), and Full Backup's own banners name the imported accounts a backup can miss. Alternative: "Your accounts, imported keys, tokens, contacts and history, in one password-protected file." |
  | `passkey` | Passkey | It unlocks Nulo on this device. Your recovery phrase is what restores it. | Lock screen · Create profile | P93-31 B, signed |
  | `strict-mode` | Strict security mode | Locks whenever Nulo restarts in the background, as well as after the timeout. | Lock settings | P93-23 B, signed. The term matches the row a person reads in Settings › Lock |
  | `fpc` | FPC | A Fee Payment Contract: it settles the network fee, from a sponsor or from your Private Fee Juice. | Fee Payments | draft. Nulo has two kinds: a sponsor pays, or the person's own Private Fee Juice does (`wallet/services/fpc/spec.ts:16-19`), so "pays for you" alone would repeat Sponsored |
  | `proof` | Proof | What your device builds to show a transaction is valid without revealing what's in it. | Proving | draft, from the signed Proving entry's first sentence. A tooltip, so one sentence of at most 100 characters (86) |

- **Placement options:**
  - **A (recommended):** a new first section, "Your wallet", with the eight wallet words in the table's order; FPC last in Fees; Proof first in Transactions, before Proving. The words a person meets first come first.
  - **B:** the same entries, with "Your wallet" as the last section, so the four existing sections keep their place.
- **Recommendation:** the table with both alternatives (recovery phrase, full backup), term "Alpha", placement A. The signed P93-37 lines on Back up profile carry the same two gaps; that is lane fu2-security-1's surface, not this one.
- **What ships now:** nothing on either page. Arc 3 runs on the answer, word for word. If another lane's signed words change, a Glossary row changes only on a newly signed revision.

## OA-2 (arc 2): How Aztec works with "website" cuts its own title at 360 px

**Answered:** page 98, item OA-2, signed 2026-11-02, option B: "“1 min · website” moves under the title as the row's second line, drawn as row 1's “The 24 words that restore this wallet”; the mark takes the chevron's place. The title stays whole; the row is 16 px taller. The words are the pick's." The row's spoken name gains the word "website", as the ask said it would under every option.

- **Surface:** Home › Get started, row 2, at the popup's 360 px width.
- **What happens** (measured in the smoke harness, Chrome, light): P93-03 B puts the outside-link mark and the word "website" beside "1 min". The row's value never shrinks, so the title gives way: "How Aztec works" needs 110 px and gets 101, and reads "How Aztec w…". At 240 px nothing is cut (the value already sits below the title).
- **Pictures:** [today](screenshots/get-started-360-today.png), [A](screenshots/get-started-360-option-a.png), [B](screenshots/get-started-360-option-b.png), [C](screenshots/get-started-360-option-c.png).
- **Options:**
  - **A:** as signed, on one line: "How Aztec w…   1 min · website" with the mark. The title is cut.
  - **B (recommended):** "1 min · website" moves under the title as the row's second line, drawn as row 1's "The 24 words that restore this wallet"; the mark takes the chevron's place. The title stays whole; the row is 16 px taller (72 px). The words are the pick's.
  - **C:** "1 min website" on one line, no dot. Still cut ("How Aztec wor…", 110 px in 108).
- **What ships now:** nothing; the row stays as it is until the answer. Whichever option ships, the row's spoken name gains the word "website" (an accessibility call under the 2026-10-19 delegation), so a screen-reader user hears where the click goes.
