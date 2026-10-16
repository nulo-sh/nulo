# Owner asks: small-ui-fixes-1

The arc does not wait for any answer here. It ships option A, which adds no layout rule.

## OA-1. The header's network chip with "Show network name" off: its height

**Surface:** the header, the network chip at the top right, beside the Lock chip. Settings → Display → "Show network name" is off.

**What P25-09 B settled:** off hides the name and keeps the status dot; on is as today; the default is on. It does not say how tall the chip is with only the dot inside it.

**Today (toggle on):** the chip holds the network name and the dot. One line of the name sets its height.

| Option | What you see with the toggle off |
|---|---|
| **A. The chip fits the dot** | A small bordered rectangle around the dot, about 28 by 20 px. It is shorter than with the name (phase 4 measures both). It is centred in the row. |
| **B. The chip keeps its height** | The same bordered chip as with the name, at the same height, with only the dot centred inside. The row of chips stays level. |

**Recommendation: B.** The row stays level, and switching the setting moves nothing else in the header. It is one style rule, with a test that pins it.

**What ships now: A.** The PR attaches light and dark shots of the chip on and off, and records both chip heights on Chrome and Firefox.
