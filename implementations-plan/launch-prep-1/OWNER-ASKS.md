# launch-prep-1: owner asks

## Answers (decision page 68, 2026-10-19)

- **OA-1 (a), P68-01: B**, "The first line only." Note: "Reads very weirdly." A2 ships "These Terms
  now take effect. The version you accepted was a draft."; that line and two rewordings were drawn
  for the owner's last look before A2 merges (`p69-terms-line-{b,r1,r2}-{light,dark}.png`).
- **OA-1 (b), P68-02: A**, "1.0 never takes effect: "Never in effect", a draft replaced by 1.1."
- **OA-2, P68-03: A**, the five-line banner, plus one bullet from the owner's note: people who used
  0.31.x or any earlier preview build start fresh in 1.0, on a new recovery phrase or a new
  passkey, then move any funds (`p69-readme-final-{light,dark}.png`).
- **OA-3, P68-04: B**, "Replace the box: before the promote, you send from the 1.0.0 candidate on
  the new Testnet."
- **OA-4, P68-05: A**, "Accept the window by name: #385 stays a known limit with its corrected
  condition." Note: "Don't even mention it." The condition lives on #385 only.

The asks as they were put:

A1 depends on none of these: OA-3 and OA-4 leave A1's text as it ships. A2 waits for OA-1 and OA-2
and merges before the 1.0.0 promote; the Terms effective date stays `«FILL»` until the promote,
where the owner gives it once and it goes in three places (`BEFORE-LAUNCH.md` § 3). If OA-2 is
still open when OA-1 is signed, the Terms ship without the banner, which follows alone.

## OA-1: the words of Terms 1.1

- **Surface.** (a) The popup's re-acceptance sheet, shown once to an install that accepted Terms 1.0,
  under "The terms have changed / Here is what changed since the version you accepted on {date}."
  (b) The 1.0 row of the version-history table at the foot of `nulo.sh/terms`, and 1.0's entry in
  the page's "All versions" list. Fresh installs never see (a): they accept 1.1 in onboarding,
  whose consent line names no version (the hint after ticking reads "v1.1").
- **Why it is open.** P62-06 A asks once more at 1.0.0 with a written `changes` entry; the sheet shows
  exactly those lines, to everyone who accepted 1.0, whenever they accepted it. The only text
  change since 2026-10-06 is § 7.5 naming the token list the wallet downloads, on 2026-10-14: 0.31.0
  installs accepted it already, earlier ones did not. 1.0 never takes effect, so its row cannot keep
  a placeholder: `launch-legal` refuses any `«FILL` line in `legal/terms.md` at a 1.0.0 release.
- **(a) Options.**
  - **A (ships now):** two lines, true for both groups. "These Terms now take effect. The version
    you accepted was a draft." and "Since 14 October 2026, section 7.5 names the token list the
    wallet downloads."
  - **B:** the first line only.
- **(b) Options.** Terms § 20 says that declining revised Terms keeps "the previously accepted
  Terms". For someone who accepted 1.0 and declines 1.1, that is a version that never took effect.
  - **A (ships now):** 1.0 never takes effect. Its row reads `| 1.0 | Never in effect | A draft, replaced by 1.1 before it took effect. |`
    and the version list reads "Version 1.0 never in effect". A person who declines 1.1 has no
    Terms in effect; the wallet still lets them view, export and import, by design.
  - **B:** 1.0 takes effect on the same day as 1.1 and is superseded at once, so a person who
    declines 1.1 stays on 1.0. Both rows carry the launch date. This weakens the reason for the
    re-ask (P62-06 A: "they accepted a page marked not in effect"). It also changes A2's build: the
    archived 1.0 copy then carries the launch date in its version line, the manifest's 1.0 entry
    the same date, and `/terms/v1.0/` only the "Superseded" banner; the plan's phases are amended
    before A2 starts.
- **Nightly builds.** Between A2's merge and the promote, a nightly prerelease asks for 1.1 while
  `nulo.sh/terms/v1.1/` is not live yet (the landing deploys from `main`), so a tester can accept
  1.1 without reaching its text. Store builds are not affected: the promote deploys the landing
  before 1.0.0 is uploaded. A2 merges right before the promote to keep this window short.
- **What declining does.** Declining 1.1 gates sending, dApp requests and the token-list download;
  view, every export and backup import stay open. P62-06 A's note said "blocks only sending".
- **Recommendation.** (a) A; (b) A, unless a lawyer reads § 20 otherwise.
- **Pictures** (option A's words on a Chrome build, 2026-10-19), under `~/.cache/nulo-backlog/launch-prep-1/shots/`:
  `sheet-accepted-1.0.png` and `sheet-accepted-1.0-dark.png` (400×600: "Terms v1.1 / The terms have
  changed", the two lines, "I agree to the Terms of Use, version 1.1."); `onboarding-gate.png` and
  `onboarding-gate-dark.png` (1280×800, a fresh install: unchanged but for the hint's version).

## OA-2: README.md's banner (text only)

- **Surface.** The top of `README.md` on GitHub, today "⚠️ DEMO / PREVIEW BUILD — NOT A PRODUCTION
  WALLET" (`README.md:3-13`).
- **A (ships now, recommended):**

  > ## Nulo 1.0
  >
  > **A self-custody wallet for the Aztec network, for Chrome and Firefox. You use it at your own risk.**
  >
  > - **No independent security audit.** The code has been reviewed internally and with automated tools, not by an external security firm.
  > - **The Aztec Testnet is the default network.** Its assets are for testing. Mainnet comes in a later 1.x release. A network you add yourself may carry real value.
  > - **Keep your way back.** From 1.0, a change to how the wallet stores data ships with a migration, but a Testnet reset still clears that network's history. Your recovery phrase, your passkey or a full backup is the only way to restore a lost profile.
  > - **Install only from the official listings**, linked from [nulo.sh](https://nulo.sh).
  > - **No warranty.** Read the [Terms of Use](https://nulo.sh/terms) and the [Privacy Policy](https://nulo.sh/privacy).

- **B (short):**

  > **Nulo 1.0 runs on the Aztec Testnet and has had no independent security audit.** Install it only from the listings linked from [nulo.sh](https://nulo.sh), and read the [Terms of Use](https://nulo.sh/terms) first.

- **Recommendation.** A: it keeps the facts a reader needs before installing.
- **Note.** Lane migration-rule-1 (#865) also edits the banner's storage line; A's third bullet states
  #865's rule, so one signed text serves both.

## OA-3: the live-Testnet send from 0.31.0

- **Surface.** `BEFORE-LAUNCH.md` § 4, "The owner sends from that build on the live Testnet". No issue,
  PR or plan records the send.
- **Options.**
  - **A:** you sent from 0.31.0 on the live Testnet: give the date, and the box is ticked.
  - **B:** retire the box for a § 3 step: send from the 1.0.0 candidate on the 6.0.0 Testnet before
    the promote (the e2e suites reach only a local sandbox).
  - **C:** retire it with no replacement.
- **Recommendation.** B, whatever the answer to A: 1.0.0 ships on a new Aztec line.
- **What ships now.** The box stays unticked; nothing is added.

## OA-4: #385 at launch

- **What.** A leaked token-list signing key verifies until a release without it reaches users. Its
  reopening condition, "production users, where a store review delays the release", is met at
  1.0.0. The key alone delivers nothing: wallets fetch only `tokens.nulo.sh`, which Workers Builds
  deploys from `dev`, so a forged list also needs landing on `dev` (your account, or the release
  App's key), the Cloudflare account, or the user's TLS. A key leaked through the signing job's own
  code may come with `dev` access. A forged list seeds up to 16 tokens per chain per list, can flag
  genuine tokens, and its rows stay after the rotation (#387).
- **Options.**
  - **A:** keep it a known limit with the plan's corrected condition; you accept the window by name.
  - **B:** a 1.x lane builds a revocation the recovery key signs, which outranks the sequence (a list
    format field, a rule on the held list, a keyed run, tests).
- **Recommendation.** A. Until you answer, the plan records A as a recommendation, not your
  acceptance, and nothing is built either way.
