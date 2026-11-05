# wrap-2: phase 0 (planning)

## Measurement

- The capture ran the network suite's proverless build (`bun run e2e:agent`): connect the playground without switching, rename the dApp's and the wallet's networks through the network service, request capabilities, read the banner, switch, read again.
- Firefox's BiDi refuses `browsingContext.captureScreenshot` on an extension page ("does not support browsing contexts in privileged scope"), so Firefox gives numbers only and the pictures are Chrome's.
- A trial rule injected as a `<style>` element is refused by the page's CSP (`style-src-elem`), and the CSP recorder fails the launch's close. Setting the property through the CSSOM (`el.style.setProperty`) is allowed and measured the trials.
- The issue's added-networks banner carries no name (counts only), so there was nothing to measure there.

## Consults

- **Codex, gpt-6.1-sol, high, read-only (session 01a18e50), plan round 1: conditional approve.** Findings: recon's "Firefox within 0.1 px" is false for one row (at 400 px with `real25` Chrome fits the action on one line by 0.7 px, Firefox breaks it); Fact 4's labels; D4's "would go red" is a chosen boundary, not an impossibility; two procedural sentences. All accepted.
- **Opus 5.5 (Plan), plan round 1: conditional approve.** Findings: D3 as drafted ("never another window's switch") was false for a profile change made in another window, which re-runs this window's bootstrap; a switch in this window cannot fire the watcher while the page shows. Fact 3 now names the vertical direction. The scratch spec was left untracked in the worktree, where `biome check` would lint it; removed. Also the 1 px bound, D4's reasons, the named departures and several exactness fixes. All accepted but the optional mount pin.
- **Codex, resumed, plan round 2: conditional approve.** Three factual corrections, all accepted: wrap-1's banner is vertical too, and its I1 rests on its nested action row; a deleted row's fallback can be a built-in label (`Sandbox` for chain 0); Firefox's action labels end further right, not left.
- **Codex, resumed, plan round 3: approve.** No remaining finding.
