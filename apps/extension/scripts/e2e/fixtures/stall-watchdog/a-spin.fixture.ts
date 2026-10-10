// Spins while its file is collected, before any test or hook event: the watchdog must already be
// armed, and a blocked event loop cannot answer vitest's cancel, so only the kill ends this fork.
for (;;) {}
