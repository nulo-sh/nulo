# Phase 1: the endpoint row's disposition

- Searched first: `gh issue list --state all --label known-limit --search "endpoint provider"` and `--search "testnet endpoint key"`: no known limit on it; #143 (call volume on the shared key) has another cause.
- Filed #570, labelled `known-limit` and `privacy`, closed as not planned at once: README's five sections, the constant named, no key and no URL, P22-02 B quoted, the reopening conditions in § Record.
- `seeds.ts`: the `endpointLabel` comment now says what Settings does (titles the endpoint row with the label). Documentation only (D12).
- Gate `F` (2026-10-16): `bun run lint`, `bun run typecheck:all`, `bun run test` exit 0 (extension: 800 files passed, 3 skipped).
