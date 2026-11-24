# Arc 2: lessons

## Phase 3

- The site scan, rerun at the arc's base (9c913679b): no form-section or tab-skin copy was added or changed since the plan's base; only arc 1's own files moved.
- Built-CSS comparison: 6 of 128 files differ (121 names, every file paired once), the same in both browsers: the `ImportFullBackupForm`, `ImportSecretForm`, `change-password`, `create`, `new` and `reset` chunks. Each now holds one copy of a home before the composer's own rules; the minifier keeps one copy per chunk, so the two `import-shared` copies in `ImportSecretForm` and the three section copies in `new` became one, and base's merged `.section,.section_last` became `.section`.
- Any edit inside a sheet, a comment included, renames every class it defines, since Vite hashes the block's source. The cross comment on `export_section_last` renamed all of `CollapsingHeroLayout.vue`'s classes, so the proof opened its five other screens. The review's comment fix on the tab skin renamed that home's classes, so the head build and its proof runs were redone.

## Review

- Codex round 1 (`gpt-6.1-sol` high, read-only) over `9c913679b..cd869d307` and the plan: clean.
- The Opus diff review: no visible defect; three findings, B1-B3 in the plan's Arc 2 review. B1 accepted (9f0e7bb17); B2 and B3 rejected with reasons.
- Codex round 2, resumed over B1's fix and the two rejections: clean.

## Phase 4: how each state is reached

Smoke, on the armed smoke builds; the launch answers the node with its stand-in and nothing reaches a network.

- No profile: the popup's import page from the register page; onboarding's import and create from the onboarding tab. The popup's states run first: opening onboarding marks it unfinished, after which the popup hands off to it.
  - The picker; the phrase form with each unlock method; the full-backup form empty, with an unreadable file (its error block), a plain file with each method, a sealed file (its decrypt step). Each state mounts afresh: the page leaves for another route and returns.
  - The plain file is a synthetic backup of fixed bytes: a pick only reads it and nothing restores it. The sealed file is the v2 tag and a 64-byte frame whose first byte is 0, which the importer reads as sealed without a key.
  - Onboarding create with each tab (the passkey note on Passkey).
- A registered profile: change password, reset, new profile with each method, Restore again with a plain and a sealed file picked, accounts import, the seed and full exports past their agreement, the account export's picker, unlock method.
  - Restore again reads its reminder from storage: the proof writes it as a partial restore leaves it (the plain file's checksum, the active network, no lease), so the page names that network and takes the pick.
- A tab is picked by a scripted click, so no pointer or focus stays on it. Each capture moves the pointer off the page first; the hover pass then hovers both tabs, and the Tab walk focuses the selected one, the tablist's one stop.
- Each capture checks the build it reads: a head page carries the scoped hashes of its screen's homes (form-section, the tab skin, the renamed hero layout) and none of base's; a base page carries the old hero layout's and none of head's.

## Phase 4: what the runs taught

- Firefox's Tab starts from the element last blurred, not from the top, so a walk begun after a hover pass skipped stops and then met them again. Each walk now blurs, focuses and blurs the root first: the anchor rule the `e2e-testing` skill already states (§ A Tab walk from the top starts at an anchor), which the harness copied from arc 1 did not follow. Past the last stop Firefox focuses its own UI, then hands focus back to that last stop: the walk ends on leaving the page.
- Firefox's screenshot, a privileged `drawSnapshot`, takes window focus from the page. A focused `Input` drops its `isFocused` class and its border fades over 0.2 s, so a focused password field's border (the sealed file's decrypt step, the full export) drew mid-fade in some frames: 312 pixels at 360 px, 640 at 720, each matched by a same-build pair.
- Chrome's edge pixels moved between runs as in arc 1. A few stray pixels on the full export matched no pair until another full base run drew them too: a residue first seen on one build is not evidence it follows the build. Targeted reruns of one state on each build closed the rest.
- 148 hover targets per browser never matched `:hover` under the pointer, the same set in both builds; the comparison requires the same set.
- A Firefox diagnostic ran beside a proof run in the background, against the one-run-at-a-time rule. Both failed on the walk above, both were discarded, and every run after it ran alone.
