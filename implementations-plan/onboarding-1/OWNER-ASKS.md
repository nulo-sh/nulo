# onboarding-1: owner asks

## OA-1: what Ready says when a created wallet's recovery phrase is unsaved (#1387)

- **Surface**: the onboarding tab's last page ("You're In", "Open wallet"), reached after Create.
- **Today**: a reload on the recovery phrase step lands here, and so do "Do it later" and the phrase step's timer. The page says nothing about the phrase. Home's Get started card still shows "Save your recovery phrase" as an open step, which leads to Settings.
- **Ships now (arc 1)**: no change on this page. A reload on the phrase step still lands here, and the tab no longer lands here when its own flow made no wallet.
- **Options**:
  - **A (recommended)**: one body line under the heading, shown only for a created wallet whose phrase is unsaved, never after "I saved it" or an import: "Your recovery phrase is not saved yet. Save it from Get started on Home." It reuses the state Home's card reads, so the two never disagree.
  - **B**: a reload on the phrase step shows the phrase step again, behind the unlock Settings uses: a password field, or a passkey prompt, then the 24 words. That needs a new layout on the phrase step and a second reveal flow beside Settings'.
  - **C**: leave the page as it is; Home's card is the only reminder.
- **Recommendation**: A. It is one line, it covers the reload, "Do it later" and the timer alike, and it adds no second place to reveal the words.
- **Your answer**: the option, and for A the wording if you want it changed. Arc 2 builds it and closes #1387.
