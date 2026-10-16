# Owner asks: harden-quality-fixes-1

The arc changes nothing a person sees, so nothing in it waits on an answer. Recon found one setting that already does nothing. The arc leaves it as it is.

## OA-1. Settings → Display: "Show network name"

**Surface:** Settings → Display, the toggle row "Show network name", caption "Always show network name in the header".

**Today:** the toggle saves its setting (`showNode`), but no screen reads it. The header shows the network chip with its name whenever you are signed in and the network has a name, with the toggle on or off. The only code that read the setting was a header copy that nothing displayed. This arc deletes that copy with the rest of the dead task indicator (#558, decision page 21 P21-05 A). Nothing changes on screen, before or after.

| Option | What you see |
|---|---|
| **A. Remove the row** | Display loses the "Show network name" row. The stored setting is ignored. The header stays as today. |
| **B. Make it work** | Off hides the network name in the header chip and keeps the status dot. On shows it, as today. The default stays on. |
| **C. Leave it** | The row stays and still does nothing. |

**Recommendation: A.** The header has shown the name unconditionally since the first commit, and nobody has noticed the toggle doing nothing. B adds a header state that needs a design and a test.

**What ships now: C** (the row unchanged).
