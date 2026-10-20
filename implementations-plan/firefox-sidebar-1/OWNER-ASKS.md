# firefox-sidebar-1: owner asks

OA-1 to OA-4 are answered (decision page 71, 2026-10-20). OA-5 is open; what ships now is stated with it, and #889 leaves draft only once it is answered.

## OA-1: how a person opens the sidebar (answered)

P71-03, B: "Add Chrome's "Open as Side Panel" row on Firefox; the toolbar button then opens the sidebar." Built in Phase 5 (#889).

## OA-2: the sidebar's width (answered)

P71-01, B: "Fit every page down to 240 px everywhere: one layout for every width; the popup looks the same." The page added that any pick also signs the sidebar off as pictured, and that the layout change is planned and shown in pictures before it ships. Built in arc 2, its own PR.

## OA-3: the sidebar at install (answered)

P71-04, A: "As in the draft: no sidebar at install; an open one survives restarts only." No change.

## OA-4: is Linux proof enough (answered)

P71-02, A, in chat: the owner unlocks once with a passkey from the sidebar on a Mac, using a build of #889. #889 stays a draft until that report. If the sidebar dies there, the step keeps its window and arc 1 changes.

## OA-5: the first toolbar click after Firefox starts

- **Ships now**: with "Open as Side Panel" on, the toolbar button opens the sidebar. Firefox keeps that choice only while it runs. After a restart with the sidebar closed, the first click opens the popup; opening it wakes the wallet, which re-applies the choice, and every click after that opens the sidebar. A sidebar left open at shutdown comes back by itself.
- **The question**: should the wallet start with Firefox, so that the first click opens the sidebar too?
- **Cost if yes**: the background starts at every Firefox launch, and today the whole wallet boots with it: its migrations, Barretenberg and its services. There are two ways:
  - start it for everyone, which is simpler;
  - start it only while the setting is on, which leans on how Firefox persists a late-registered listener and needs its own test.
  Either is background work at browser start that today waits until the person opens Nulo.
- **Recommendation**: keep what ships. The gap is one click per launch and only with the sidebar closed; the cost is paid at every launch.
- **A second part, also yours**: with the setting on, the wallet can no longer open its toolbar popup by itself after onboarding's "Open wallet" or after a passkey window. Firefox opens nothing when no popup is set.
  - **Ships now**: nothing opens; the person clicks the toolbar button, and the sidebar opens. Filed as a known limit if you accept it.
  - **The alternative**: onboarding's "Open wallet" opens the sidebar from its own click, a change to onboarding's last step. After a passkey window nothing can open the sidebar, since that click happened elsewhere.
  - **Recommendation**: accept what ships. The setting is off on a new install, so onboarding with it on is rare, and the passkey window opens only from the popup, which with the setting on shows only on the first click after a restart.
