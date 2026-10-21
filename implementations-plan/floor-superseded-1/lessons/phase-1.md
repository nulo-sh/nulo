# floor-superseded-1: phase 1

- The supersede loop now parses the branch's sequence canonically, so a non-canonical publish branch name is neither read nor closed; the publisher never creates one.
- `runPublish` lists PRs once, after the stale-base guard, and both the floor decision and the find/close loop use that one snapshot.
- Red-on-base: `origin/dev`'s `open-publish-pr.ts` with a scratch fake that also answers `openPublishPrs`; T1 and T2's closed-PR row fail on the commit lacking `floor.json`, not on a type error.
