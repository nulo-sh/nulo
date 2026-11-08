import "@nulo/design/base.css"
import "./styles/overrides.css"
import "./styles/page.css"
import "./styles/changelog.css"

import { mountPage } from "./feed-dom"

// `cl-motion` gates every hidden-until-revealed state, so a page without script or under reduced
// motion shows everything at once.
const motion = !matchMedia("(prefers-reduced-motion: reduce)").matches
document.documentElement.classList.toggle("cl-motion", motion)

// A module script runs once the document is parsed, so the cards exist now.
if (motion) {
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue
				entry.target.classList.add("in")
				observer.unobserve(entry.target)
			}
		},
		{ rootMargin: "0px 0px -6% 0px" },
	)
	for (const card of document.querySelectorAll("[data-reveal]")) observer.observe(card)
}

document.addEventListener("DOMContentLoaded", () => {
	mountPage()
})
