# anti-slop provenance

- Source: https://github.com/dmmulroy/anti-slop
- Revision: https://github.com/dmmulroy/anti-slop/commit/13909c9e07590f5a85d93c62712259fe14a883f7
- Vendored on: 2026-10-25
- Contents: unmodified upstream `src/` (including tests and third-party license/provenance), plus upstream `LICENSE`.
- Local source customizations: none.
- Updated from `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b` to the revision above on 2026-10-25. The spacing rule now keeps consecutive single-line bindings grouped at module scope; bindings with leading comments still start a new group. No dependency or enabled-rule changes were required.

The root `.oxlintrc.json` enables all generic and Effect rules. The plugin runtime
dependency `@oxlint/plugins` is pinned to the same exact version as `oxlint`;
upgrade them together. Vendored source is excluded from lint and formatting.

For updates, stage the new upstream source separately and compare against this
revision before merging. Preserve future local customizations and update this
provenance record rather than blindly replacing the directory.
