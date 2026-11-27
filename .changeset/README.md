# Changesets

A changeset is a small Markdown file in this folder that says which package a change affects, whether it is a
patch, a minor or a major change, and what to tell the people who use it. `invoices-cli` is the only package that
is published, so it is the only one that takes changesets; the web app and the shared package are private and are
not versioned.

Add one with a change that reaches the CLI, including a change to `packages/shared` that alters what it renders:

```sh
bun run changeset
```

On `main`, the Version workflow gathers the pending changesets into a "Version Packages" pull request that bumps
`apps/cli/package.json` and writes `apps/cli/CHANGELOG.md`. Merging it sets the version; the manual Release workflow
then publishes that version to npm.
