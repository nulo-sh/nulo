# send-fixes-2: phase 0

- No plan consult: the lane brief runs no plan audit round at this tier and one Codex pass over the plan and the diff after the build.
- Before captures: the smoke spec's first run failed on two waits that were the kit's, not the wallet's: `createAccount` switches the active account, so Recent rows seeded for the first account do not list (seed after the switch); a settled tx row seeded behind an open Home needs a page reload to list.
- `agent.sh` builds into the same `dist/chrome` as the armed smoke build: rebuild the armed smoke build after a network run, before the next smoke run.
