# Phase 3: pictures

A scratch spec (deleted after) on the smoke fixtures, headful under Xvfb (`HEADLESS=0 xvfb-run -a -s "-screen 0 1440x1000x24"`). It drew the browser window with `window.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, "white")` in chrome scope and saved it through a canvas. Remote content composites, so each picture shows the browser around the sidebar.

| Attempt | Outcome |
|---|---|
| 1 | Six PNGs. The launch came up with `sidebar.revamp` true (run 5 of Phase 0 had it false), so the "default" shots showed the revamped sidebar, and Nulo's launcher entry was the generic puzzle piece. With no `default_icon`, Firefox's `IconDetails` returns its default icon, not the manifest's `icons`: Fact 3 was wrong (D7). |
| 2 | `default_icon` names the add-on's icons; each test sets `sidebar.revamp` explicitly. Five PNGs: the old sidebar at 240 px (lock, Home), at 420 px (Home light, dark), and the revamped sidebar at 340 px (Home, Nulo's icon in the launcher). At 240 px about a third of the page is cut (OA-2). |
