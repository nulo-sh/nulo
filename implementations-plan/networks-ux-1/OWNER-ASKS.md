# networks-ux-1 owner asks

No question about a surface: the owner signed the surface on 2026-10-28 (plan.md § UI impact). The lane brief leaves the outlined variant to the lane and says the real list is built from the design package's primitives, so the 26 px outlined button and the row height it brings are stated in the UI impact line and shown in the PR's captures.

## For the orchestrator, before the arc starts: two files outside the brief's list (answered 2026-10-28: A)

- **What:** the brief's scope rule names the list page and its test as the arc's product files. The plan's row shape (D1) also changes the shared row component `apps/extension/src/components/ui/Settings/SettingItem.vue` (an opt-in `controls` prop: a link row holding its own button draws its link as a stretched `RowTarget` under the button) and adds one case to `apps/extension/src/components/ui/Settings/Settings.test.ts`. No other consumer passes the prop, so every other screen renders as before; the existing cases stay unchanged.
- **Options:**
  - **A (recommended):** accept the two files. What a person sees is the signed design, and the list keeps its exact row look.
  - **B:** keep to the list. The page builds its own row around `RowTarget`, either copying `SettingItem`'s layout (the owner's standing instruction rules out a copy) or using the shared settings-row styles, whose padding and title type differ from today's row, a visible change the owner has not signed.
- **Panel:** Codex and Opus both call A the right design; Codex holds that only an explicit acceptance before implementation authorizes it.
- **Answer (the orchestrator, 2026-10-28):** A, accepted on two conditions recorded in plan.md D1.
