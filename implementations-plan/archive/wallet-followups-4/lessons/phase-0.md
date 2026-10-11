# Phase 0: planning consults and evidence

## The member-read scan behind F4

A rough model of the scanner's call window, run over `git ls-files` of `apps/extension/src/**` and `packages/*/src/**` (`.ts`, `.js`, `.vue`; no tests, no `.d.ts`). On 27af8d7 it printed exactly eight calls: `full-backup-restore.ts:761,769`, `useFullBackupImport.ts:458,509`, `useContactImportExport.ts:130`, `export/account.vue:192`, `export/full.vue:413`, `utils/files.ts:181`.

The model counts parens without blanking string contents or templates, so a quoted paren can end a window early or late: it can report more or fewer than the real scanner. Both audit legs then ran the scanner's own functions in memory with the plan's three changes and got exactly 21 offenders (these 8 and the 13 `getErrorData` calls). Phase 1 step 4 is the authoritative run.

```perl
use strict; use warnings;
my $opener = qr/(?<!\bMath)\s*\??\.\s*(?:log|logDebug|logInfo|logWarn|logError)\s*\(|\bconsole\s*\??\.\s*(?:log|warn|error|info|debug|trace)\s*\(|(?<![.\w\$])log(?:Debug|Info|Warn|Error)?\s*\??\.?\s*\(/;
for my $f (@ARGV) {
  open my $fh, '<', $f or next; my @l = <$fh>; close $fh;
  for my $i (0..$#l) {
    next unless $l[$i] =~ $opener;
    my $start = $-[0] + length($&) - 1; my $depth = 0; my $win = '';
    for my $j ($i..$#l) {
      my $s = $j == $i ? substr($l[$j], $start) : $l[$j];
      $win .= $s; my $done = 0;
      for my $ch (split //, $s) { $depth++ if $ch eq '('; $depth-- if $ch eq ')'; if ($depth <= 0) { $done = 1; last } }
      last if $done || $j - $i > 40;
    }
    (my $code = $win) =~ s{//[^\n]*}{}g;
    if ($code =~ /\.\s*(message|stack)\b/) { (my $one = $win) =~ s/\s+/ /g; printf "%s:%d: %s\n", $f, $i+1, substr($one,0,160); }
  }
}
```

Run: `git ls-files 'apps/extension/src/**' 'packages/*/src/**' | grep -E '\.(ts|js|vue)$' | grep -v -E '\.test\.|\.d\.ts$' | xargs perl <script>`.

## Consults

- **Recon** (one Explore agent, sonnet): every claim of #299 holds at 27af8d7; found 5 more direct extractions, 5 locals bound from a flattener, the allowlist covering `console-forwarding.ts`, and the `LOG_CALL` openers it does not read. Persisted as `recon.md`.
- **Codex round 1** (gpt-6.1-sol, high, read-only, session `01a12b4f`): reject. High: non-`Error` values under `error` are not bounded (proposed a redactor change); High: `runtime.ts` and `opfs-store.ts` left out without cause. Medium: alias sites need pins; D8 overstated coverage. Low: F4's domain, computed access, `[full-backup]` colons, a duplicate unit pass. Reproduced 21 offenders.
- **Opus 5.5 Plan lens** (parallel to Codex round 1): conditional approve. Medium: red runs after the helper's deletion fail for the wrong reason; I3 misstated; pins belong at the scanner-invisible sites. Low: the regex matched spreads; D3's upstream-port reason unverified; this note's direction; `runtime.ts`'s reason can carry a `JSON.parse` excerpt of a stored row; line numbers. Reproduced 21 offenders.
- **Codex round 1 resumed** (same session): conditional approve. Withdrew the redactor change (no producer found; disproportionate to #299) and the `opfs-store.ts` move (with the residual recorded); agreed to `runtime.ts`'s fixed category, the pin settlement, the red-run order, the spread lookbehind and D3's new reason; corrected the Phase 3 claim (`test:all` already includes `@nulo/extension`). All three conditions are in the plan.
