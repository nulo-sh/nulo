# get-started-phrase-1: recon

Read at `origin/dev` f73ce69d6 (includes #743); `f5b7fd5ad` (#950, #951) touches none of the files below. Paths are relative to `apps/extension/` unless they start with `implementations-plan/` or `.claude/`. One Explore agent (sonnet) swept the tree for every other place that states the old rule; the driver read the code below.

## Where the rule lives

- `src/utils/get-started.ts:130-142` `getStartedView` is the single source. `:135-139`: `banner = password && !phraseSaved && funds === "some"`; the phrase step is listed only when `!banner`; `firstProfileSteps` (`:114-125`) lists B (passkey), A, F, R for the install's first created profile, and none when `hidden` or `notFirst`. `:140`: every listed step done → no card; `canHide` while a non-phrase step is listed.
- `src/popup/pages/general.vue:152` renders `BackupReminderBanner` on `reminders?.banner`; `:167-173` renders `GetStartedCard` on `reminders?.steps.length`. Home holds no rule of its own: the lane brief's "Home's banner wiring" needs no edit.
- `src/popup/components/modules/general/GetStartedCard.vue` numbers the steps it is given (`index + 1`), fills the first open one (`aria-current="step"`, class `next`), and shows "n of m done" when more than one step is listed. Nothing in it encodes "of 3"; it needs no change.

## Pins of the old rule (all must follow the new rule)

| File | Case | Today |
|---|---|---|
| `src/utils/get-started.test.ts:142` | "a funded password wallet moves the phrase to the banner" | banner, steps A F R |
| `src/utils/get-started.test.ts:162` | "a saved phrase checks … and ends the banner" | title only; result holds |
| `src/utils/get-started.test.ts:215-221` | "no card once every listed step is done, the banner's phrase aside" (funded case) | banner, no card |
| `src/popup/pages/general.test.ts:140` | token funds raise the banner before the gas read | banner on a first profile |
| `src/popup/pages/general.test.ts:148` | Fee Juice alone is funds | banner + rows A F✓ R |
| `src/popup/pages/general.test.ts:298` | the banner's Save phrase opens the reveal | banner on a first profile |
| `src/utils/get-started.test.ts:205-207` | a later password profile: "the banner once funded" | banner, no row |
| `src/popup/pages/general.test.ts:255` | a later password profile's row alone | unfunded only |
| `tests/e2e/network/hero-prices-unavailable.test.ts:50-63` | import record removed → banner, no phrase row → reveal | banner on a first profile |
| `tests/e2e/network/fee-methods.test.ts:356-358` | "minted tokens raise the banner, which takes the phrase row's place" | rows A F✓ R |
| `.claude/skills/e2e-testing/SKILL.md:595-597` | "A funded password wallet shows the urgent banner above the hero until its phrase is revealed" | prose |

Unaffected, checked: `get-started.test.ts:188-196,211` (Hide and the later passkey profile keep today's results), `general.test.ts:155,171,228-266,308`, `GetStartedCard.test.ts`, `BackupReminderBanner.test.ts`, `tests/e2e/security-backup.test.ts:60` (unfunded: no banner), `tests/e2e/stale-network.test.ts:86` (unfunded), `tests/e2e/network/store-captures.test.ts:326` (phrase import: neither), `tests/e2e/fixtures/profiles.ts:270` `clearGetStarted` (reveals, then Hide: neither, as today), `src/onboarding/pages/create.vue:80`. No doc, glossary entry, store copy, story or active plan names the rule.

## Funded created first profiles in e2e

Only network specs hold funds. Their `tokenReadyExtension` / `feeJuiceReadyExtension` profiles are created first profiles, so every network spec that reaches Home moves from "banner above the hero, card A F R" to "no banner, card P A F R". Only the two specs above assert either; the others select by testid. The specs that read layout do not rest on a funded first card: `network/fiat-send.test.ts:21-30` scrolls into view before measuring, `store-captures` imports its wallet, `snack-placement.test.ts:569` runs `clearGetStarted` first (Opus r1's search). CI's two network lanes run the full suites on the PR (the change trips their path filters) and are the authority for them.

## Closed known limits in the area

#847 (the later-profile mark on rare create paths) and #867 (old chain's Fee Juice after a mid-session reset): neither changes in kind: a profile wrongly marked `notFirst` now shows its phrase row alone, funded or not, so it is still asked for its phrase.
