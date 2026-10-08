import "@nulo/design/base.css"
import "./styles/overrides.css"
import "./styles/page.css"

import { mountPage } from "./feed-dom"
import { mountInstall } from "./install-dom"

// A module script runs once the document is parsed, so the links exist now; waiting for
// DOMContentLoaded would only lengthen the moment the fallback buttons show.
mountInstall()

document.addEventListener("DOMContentLoaded", () => {
	mountPage()
})
