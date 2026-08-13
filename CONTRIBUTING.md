# Contributing

## Build and run

```bash
npm install
npm start                          # run the app
CCC_DEBUG=1 npm run start:verbose  # verbose Electron logging
npm run dist                       # package AppImage + .deb
```

There is no automated test suite yet — verify changes by running the app
and exercising the affected tiles/shortcuts manually.

## Branching and commits

- One branch per logical change, named `<type>/<short-kebab-slug>` — e.g.
  `fix/tile-reload`, `feat/broadcast-prompt`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `<type>(<scope>): <imperative summary>`. Types: `feat`, `fix`, `docs`,
  `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Keep PRs under ~400 changed lines where possible. Split unrelated changes
  into separate PRs.

## Pull requests

Open a PR against `main` using the template. Fill in What / Why / How /
Testing / Risk-rollback — describe the change, not who made it.

## Code style

- Plain CommonJS (`main.js`, `preload-*.js`, `src/inject/*.js`) — no build
  step, no bundler. Keep it that way unless there's a real reason to add one.
- Injected selectors (`styles.css`, `automations.js`) should fail soft: a
  claude.ai markup change should no-op a rule, not throw.

## Releases

Versioning and the changelog are automated by
[release-please](https://github.com/googleapis/release-please), which reads
Conventional Commit history on `main` and keeps a standing "Release PR" with
the next version bump and changelog entry up to date as `fix`/`feat`/etc.
commits land.

To cut a release: review and merge the open Release PR (title
`chore(main): release X.Y.Z`). Merging it updates `package.json`,
`CHANGELOG.md`, and `.release-please-manifest.json`, then tags `vX.Y.Z` and
publishes a GitHub Release. No manual version bumps or tags — cutting a
release is a maintainer decision made by merging that PR, not something a
contributor PR should do.
