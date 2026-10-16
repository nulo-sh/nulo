# Owner asks: wallet-followups-8

## OA-1: popup start on a custom network whose node does not answer and that has no account yet (#498)

**Answered:** owner, 2026-10-16, decision page 20, option B (open on that network without an account), after this plan was approved. Nothing is built here; #498 stays open for a later lane.

- **Surface**: the popup at start (Home and the Header), for a person whose active network is a custom one, with no account on it yet, while its node does not answer.
- **Today, and what ships now** (no change in this lane): start stops at the account's identity check: after about 6 s with a refused node, or at the popup's 60 s call deadline with a silent one (the background check keeps retrying for up to about 4 minutes). The popup then shows the warning banner "The wallet could not finish starting up." with a RETRY button. The Header's network chip and its shortcut to Settings → Networks stay hidden (they wait for a finished start), so the person cannot switch network or fix the endpoint from there; RETRY fails the same way until the node answers. Read from code (`popup/app.vue:558-568`, `components/Header.vue:155-157, 280`); not reproduced in a browser.
- **Unchanged in every option**: a node that answers with a different L1 identity still stops start, as today. That check stops a poisoned network row from creating an account on the wrong chain.
- **Options**:
  1. **As today.** No change.
  2. **Open on that network without an account.** Start finishes; the Header shows the network chip with its existing "inactive" status dot, so the person can switch network or open Settings → Networks; the account area shows its loading placeholder until an account exists; the next start or switch creates the account once the node answers. No new copy. What Home's own content shows with no account is not checked in a browser; a screenshot comes with the build.
  3. **Open on the profile's primary network instead**, with a new line saying why, for example "<network> is not responding, so the wallet opened <primary network>." New copy, and the wallet changes the active network without the person choosing it.
- **Recommendation**: option 2. It keeps the person's choice, uses only states that exist, and puts the fix (the Networks shortcut) one tap away.
- **If option 2 or 3 is chosen**: the build is small and lives in a later lane or a follow-up arc. `NetworkService.resolveVerifiedL1ChainId` refuses an unreachable node with a typed error, distinct from an identity mismatch; `useProfileBootstrap.initAccount` and `network-switch.ts` `loadAccounts` catch only that type. #498 stays open until then.
