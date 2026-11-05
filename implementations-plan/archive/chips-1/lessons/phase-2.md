# chips-1 phase 2: the header

- `Header.vue`: the `lock_label` span, its rule and the narrow rule's two Lock blocks went; `.lock_chip` takes `padding: 0 6px` and no gap; `.network_chip` takes `gap: 6px`, `padding: 6px 8px`. `.lock_chip` keeps `composes: type--label-section`: with no text, the role still gives `1lh`, so it stays as tall as the network chip (`header-layout.test.ts` pins it).
- Gate: lint 0, `typecheck:all` 0, `Header.test.ts`, `header-layout.test.ts`, `type-role-ban.test.ts` 102 green and 1 skip (the ban's opt-in "writes the current findings for review"), `build-storybook` 0.
