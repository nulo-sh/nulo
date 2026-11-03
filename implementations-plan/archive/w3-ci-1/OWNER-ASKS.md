# w3-ci-1 owner asks

No ask concerns a screen. One trigger change is stated for the owner to see, as #1493 asks; it ships now.

## OA-1: the smoke lanes stop running on an edit to `_build-extension.yml` alone

- **Surface:** the `smoke-surface` filter of `pr-extension-smoke-e2e.yml` and its Firefox twin (required checks `extension-smoke-e2e-status`, `extension-smoke-e2e-firefox-status`). No screen.
- **Today:** an edit to `.github/workflows/_build-extension.yml` alone starts six smoke shards per browser. None of them calls that file: the PR smoke builds from source in its own job.
- **What ships now:** the derived rule removes the entry. Such an edit still runs `pr-quick`'s two builds, which call the file through its `workflows` filter, under `quality-status`. The release and nightly chains still smoke the artifact it builds.
- **Options:** (a) ship the narrowing, as recommended; (b) keep the entry as a reviewed exception, at the cost of one exception in the derived check and a full smoke run per edit that tests nothing of it.
- **Recommendation:** (a). The PR body states the narrowing; the orchestrator decides at merge.
