# Phase 3: the raw field's case

- 2026-10-14: the case reuses the discovered-authwit case's setup through `rigDelegatedSend` (grant, `ensureStandardPublicChecks`, `deployDelegatedPullRig`, the playground inputs, the token instance); only the discovered case then registers the consumer.
- Failure mode it proves: the raw field of an undecodable call (`execute-op-arg-field`) off its mono `data` role. A cheaper layer cannot: jsdom has no fonts and computes no roles (`OperationCard.fallback.test.ts` covers the toggle only), and no other e2e opens the raw field. Estimate 2-3 min each, mostly the rig deploy.
- 2026-10-14: `agent.sh`, retry 0, proverless, default tree. Chrome: 4/4, the case 33.9 s, the file 130.6 s (run 4 min 25 s). Firefox: 4/4, the case 37.4 s, the file 151.7 s (run 4 min 19 s).
- 2026-10-14: red proof on Chrome, scratch change never committed: the field's `variant="data"` set to `"body"` in `CallArguments.vue`; the case fails in `expectSitesClean` on the site's role class (`type--data`), its mono face and its weight. File restored with `git checkout`, the case rerun green alone (52.6 s: run first, it also pays the PublicChecks publish).
