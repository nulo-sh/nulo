# Owner asks: proving-grant-row-1

## OA-1: the Mac check of Allow, with the right toggles (a check, not a visible change)

**Surface**: Settings › Proving in Firefox's toolbar panel, on a Mac. The arc changes nothing a person sees.

**Why it is asked again**: the check of 2026-10-20 switched off the two `127.0.0.1` toggles. "Access your data for all websites" stayed on, and it covers `127.0.0.1`. So Nulo kept its loopback access, and the row was right not to show (plan.md § Finding).

**The steps**:
1. **Warning first**: while "all websites" is off, Firefox does not put Nulo's content script into ordinary dApp sites, so they cannot reach the wallet. Allow gives back only the two `127.0.0.1` origins. Run the check with no dApp call pending.
2. Unlock Nulo first. On a Mac, a passkey unlock started in the toolbar panel moves to its own window.
3. Open about:addons, then Nulo, then Permissions.
4. Switch off these three toggles:
   - "Access your data for all websites"
   - "Access your data for https://127.0.0.1"
   - "Access your data for http://127.0.0.1"
5. Leave "Access your data for https://passkey.nulo.sh" on.
6. Open the toolbar panel, then Settings › Proving. The permission row shows.
7. Click Allow.
8. Write down whether the panel stays open under Firefox's prompt.
9. Accept the prompt. Write down where focus is right after the prompt closes: note any ring; if there is none, press Tab once and note where it lands.
10. If the panel stayed open: write down whether the row went and the Presto card came back.
11. If the panel closed: open the toolbar panel again, then Settings › Proving. Do not click Allow again. Write down whether the row is still there. No row means the grant landed.
12. Switch "Access your data for all websites" back on, and reload any open dApp tabs.

**What is known without a Mac**: on Linux (headless Firefox 153.0.4, prompts on), Allow opened Firefox's permission prompt. The toolbar panel stayed open under it. Accepting the prompt granted both origins, and the row gave way to the card. A real OS click and macOS focus were not part of that run.

**What the sidebar (#889) changes**: #889 is still a draft. Once it merges, the same row can be met in Firefox's sidebar. Firefox does not close the sidebar when focus moves, so the prompt cannot close the page under it. That covers only a flow started in the sidebar. It does not verify the toolbar panel, and #889 asks a Mac check of its own.

**Options**:
- (A) Run the check (about 2 minutes) and record the result on #572.
- (B) Accept the Linux result and the sidebar, and skip the Mac check. This accepts the Mac uncertainty: the PR then says `Refs #572`, and #572 is closed as not planned with the `known-limit` label. It reopens on a Mac report of the panel closing under the prompt with the grant lost.

**Recommendation**: (A). It closes the last unknown at little cost. A failure (the panel closes and the grant is lost) is recorded on #572 with a linked successor issue before #572 closes. It does not reopen this arc.

**What ships now**: the arc's e2e pin and the FIREFOX.md line, as a draft PR with `Closes #572`. Nothing in the PR depends on the answer. The PR leaves draft once the answer is recorded on #572, or once the owner picks (B).
