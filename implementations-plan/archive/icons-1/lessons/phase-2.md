# Phase 2: attribution and docs

- `texts/tabler-icons.MIT.txt` fetched from the raw commit URL; `cmp` equal to it and to the package's `LICENSE`.
- Gate: `third-party-notices` tests 66/66; `build:full` exit 0; `check-minimum both` names all 37 expected components in each build; each `THIRD-PARTY-NOTICES.txt` lists `Tabler Icons@3.49.0` (MIT) in its inventory and once as a component, and no `@tabler/icons` package row: the devDependency never reaches the bundle, only the paths (`home`'s first path is in `assets/src-*.js`).
