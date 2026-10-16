# Phase 3: composed schemas

- Journal rows are stored as JSON strings (`EntityStorage` over `FakeBrowserApi`), so the test parses the stored value; the stored key order is the old literal's order, because the forwarded metadata is spread where the nine keys stood.
- Proof, not committed: adding `probeField?: string` to `JournalMetadata` fails `vue-tsc` at the shape's `satisfies`, at the forwarding in `service.ts`, and at the test's `satisfies Required<JournalMetadata>`.
- `CHAIN_KINDS` stays module-private: nothing outside `network/spec.ts` needs the tuple. The row schema's "keep the enum in sync" sentence is gone with the second list.
