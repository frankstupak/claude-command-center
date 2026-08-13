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
