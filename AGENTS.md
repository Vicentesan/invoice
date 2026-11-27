# Project conventions

- Use Bun for package management and scripts. Keep `packageManager` and `mise.toml` aligned.
- The web app lives in `apps/web` and the CLI in `apps/cli`. Code both need (the invoice domain, the PDF drawing, the
  fonts) lives in `packages/shared`; apps never import each other. Do not add other apps, packages, or examples
  unless the task calls for them.
- The app has no backend: an invoice stays in the browser's storage. Do not add a server, an account, or a network
  call that carries invoice data.
- The preview and the download are the same PDF bytes, and the CLI draws with the same code. Change how an invoice
  looks in `packages/shared/src/pdf`, never in one app only.
- Money, quantities and rates are integers in the domain (`Money`, `Decimal`). Do not introduce floating-point
  arithmetic on amounts.
- Sample data, test fixtures and screenshots use fictional companies and the example bank details banks publish.
  Never commit a real invoice.
- Use Effect v4 APIs. Consult the installed `effect` source and types before writing Effect code; do not assume v3
  APIs apply.
- Agents must also fact-check Effect and Effect UI changes against the source in `.vendor/effect` and
  `.vendor/effect-ui`. Verify compatibility with the installed versions; report if a vendored reference is
  unavailable.
- Keep Effect ecosystem package versions aligned with `effect` (`4.1.7` currently). `@effect/ui` and
  `@effect/ui-kit` are snapshot builds pinned to the commit of `.vendor/effect-ui`.
- The UI is `@effect/ui` components: state in the Model, changes as Messages, effects in Commands, and DOM work
  that the view can't express in a Mount. Colours come from the theme in `apps/web/src/styles.css`. The app is
  light only: do not add a dark theme or a dark PDF.
- Prefer Effect services and layers for dependency injection, typed errors, and scoped resources.
- Use `@effect/vitest` with `it.effect` for Effect tests. Use `it.live` when real time is required. Add focused
  tests with new behavior.
- Run `bun run check` after changes.
- Follow the existing dprint and Oxlint configuration. Preserve vendored lint rules and their license/provenance
  files.
- The website deploys to Cloudflare with Alchemy (`apps/web/alchemy.run.ts`) and the CLI publishes to npm, both from
  the manual Release workflow. Do not deploy or publish unless asked.
- `invoices-cli` is versioned with Changesets. A change that reaches the CLI, including one in `packages/shared`
  that alters what it renders or accepts, comes with a changeset (`bun run changeset`). Never edit its version or
  `CHANGELOG.md` by hand.
- Use Conventional Commits if asked to commit.
