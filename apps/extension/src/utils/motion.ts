/** Whether motion should be skipped: the OS asks for reduced motion, or the person turned on
 *  Disable animations, which the popup applies as the root `.noanimations` class. */
export const isCalm = (): boolean =>
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true || document.documentElement.classList.contains("noanimations")
