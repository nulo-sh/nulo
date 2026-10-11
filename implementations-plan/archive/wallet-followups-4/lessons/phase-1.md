# Phase 1: the scanner refuses the two spellings

## Step 2: the new self-tests on the old scanner

`cd apps/extension && bun run test -- src/utils/log-payload-ban.test.ts --reporter=verbose`, before any scanner change. Five refusing cases red, the controls green, the whole-tree test green (`Tests  5 failed | 48 passed (53)`):

```
 ✓ no sensitive identifier is flattened into a log message
 × catches an error flattened by getErrorData, which hands over its stack
 × catches an error's message read through an optional chain
 × catches an error's stack interpolated into the message
 × an error's message under a benign key is still flattened — trim() never caps it
 ✓ an error passed under a key, a spread, a fixed message and an arity read are not flattening
 ✓ the allowlist admits the redactor, which must name what it redacts
 × the allowlist admits only the redactor, not the rest of the logger directory
```

The four controls (`{ error }`, `{ error: err }` beside `{ message: "fixed" }`, a `{ ...message }` spread, `${err.message.length}`) sit in one case; it is green before and after the change.

## Step 4: the new scanner on the unfixed sources

Same command after the scanner changes. Every self-test green; the whole-tree test red with exactly 21 offenders, the 13 `getErrorData` calls and the 8 direct extractions, nothing else (`Tests  1 failed | 52 passed (53)`):

```
apps/extension/src/composables/full-backup-restore.ts:761 → message flattened into a log string
apps/extension/src/composables/full-backup-restore.ts:769 → message flattened into a log string
apps/extension/src/composables/useFullBackupImport.ts:458 → message flattened into a log string
apps/extension/src/composables/useFullBackupImport.ts:509 → message flattened into a log string
apps/extension/src/offscreen/index.ts:51 → getErrorData flattened into a log string
apps/extension/src/popup/components/modules/send/FeeSettingsCard.vue:383 → getErrorData flattened into a log string
apps/extension/src/popup/components/modules/send/FeeSettingsCard.vue:705 → getErrorData flattened into a log string
apps/extension/src/popup/components/modules/send/FeeSettingsCard.vue:731 → getErrorData flattened into a log string
apps/extension/src/popup/components/modules/settings/contacts/useContactImportExport.ts:130 → message flattened into a log string
apps/extension/src/popup/pages/settings/security/export/account.vue:192 → message flattened into a log string
apps/extension/src/popup/pages/settings/security/export/full.vue:413 → message flattened into a log string
apps/extension/src/popup/windows/capabilities/index.vue:178 → getErrorData flattened into a log string
apps/extension/src/popup/windows/capabilities/index.vue:333 → getErrorData flattened into a log string
apps/extension/src/popup/windows/discover/index.vue:89 → getErrorData flattened into a log string
apps/extension/src/popup/windows/discover/index.vue:115 → getErrorData flattened into a log string
apps/extension/src/popup/windows/network-unavailable/index.vue:82 → getErrorData flattened into a log string
apps/extension/src/utils/files.ts:181 → message flattened into a log string
apps/extension/src/wallet/index.ts:73 → getErrorData flattened into a log string
apps/extension/src/wallet/index.ts:100 → getErrorData flattened into a log string
apps/extension/src/wallet/index.ts:112 → getErrorData flattened into a log string
apps/extension/src/wallet/logger/console-forwarding.ts:21 → getErrorData flattened into a log string
```

Matches F4 and I2. The member-read rule is indexed at the member name, so the arity filter reads what follows it (`err.message.length` stays quiet). `occurrences` moved its two `exec` loops to `matchAll` as the third loop joined them.
