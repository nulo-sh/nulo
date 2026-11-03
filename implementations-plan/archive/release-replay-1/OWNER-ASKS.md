# release-replay-1: owner asks

No ask concerns a surface a person sees: the lane changes one test fixture.

## OA-1: the live update scenario from v1.1.0 is red on both browsers, and it holds the 1.2.0 promote

- **What:** both live runs fail at the egress guard's close on v1.1.0's own Testnet host, which #1622 left undeclared (#1636). The guard's error replaces the body's, so whether the update itself passes is unknown. Both replays pass with the new recording.
- **Options:** (a) a test lane declares the host as a refusal (#1636's Possible fix) and reruns both live scenarios before the promote; (b) promote on the replays alone, which the release runbook's step 1 does not allow while `dev` is on v1.1.0's Aztec line.
- **Recommendation:** (a). It is a test-only change of a few lines.
- **What ships now:** the refreshed recording, so the replays run until about 2026-11-10 17:56 UTC.
