# Phase 1: the legend

- Built at `d6fff21d0`. The four new legend assertions (component, window S1, page many and read-only grants) are red on the base component and green after.
- The window suite stubs `Icon` as `<i />`, so its legend case reads the glyph name the stub keeps as an attribute; the component and page suites mount the real `Icon` and read its prop.
- Captures: the ca2 capture page (`782858322`) copied in uncommitted and moved out after the run, with a fake for the page's `DappInteractionServiceClient` (the page now asks it for the contract names). The window frame first drew the table 302 px wide: `--base-width` is 360 px and only `:root[data-fills-window="true"]` gives a window's body the window's width, which the capabilities route sets; the capture's window view sets it too, and the table measures 342 px, as in the real window. The page frame clipped at a 900 px viewport, since the page shell scrolls inside `#app`; a 1400 px viewport holds it.
- Codex, one pass (gpt-6.1-sol, high, read-only), at `d6fff21d0`: approve with comment cleanup; D2 and D4 upheld. Comments trimmed in `653a1f0eb`.
