# Phase 1: the rows and their tests

- **Red first.** The new and rewritten tests ran on the base card before the `.vue` edit: 3 failed (the transition case, the differing-name control, the long-strings value column), 23 passed; the error case passes on the base too, since it only adds the absence of the new region.
- **Green.** After the edit, `src/popup/windows/execute/`: 23 files, 312 tests passed.
- **Template.** The error block moved from a `<template v-else-if>` around its `Flex` to the `Flex` itself, so `v-else-if` follows the details region's `v-if`; its class and children are unchanged.
