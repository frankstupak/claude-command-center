# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-08-13

### Added
- Tiled multi-session Electron shell for claude.ai — one `BaseWindow`, N
  `WebContentsView` tiles, single shared login (`persist:claude`).
- Width-based auto-columns, slider paging for overflow tiles, MRU
  auto-priority for off-screen chats.
- Session persistence: open tabs and their order survive restart.
- Injected CSS/JS for claude.ai (dropped max-width gutter, in-box table
  scrolling), with selectors that fail soft on markup changes.
- Native Auto-Continue and session-resume automations (no browser
  extensions required).
- Unified bottom bar for Session / Weekly / Fable usage.
- Keyboard shortcuts for new/close/jump/page.
- Optional ntfy notification when a background tile finishes.
- `npm run dist` packaging via electron-builder (AppImage + .deb).
- MIT license, README, CONTRIBUTING, SECURITY, issue/PR templates, CI
  (install, syntax check, unpacked build).

### Known gaps
- No automated test suite.
- Usage-bar token/reset numbers rely on the native usage-panel scrape;
  binding directly to claude.ai's private usage-response JSON is not done.
- Broadcast-prompt, tile solo/zoom, per-tile working/idle indicator, and
  saved layout presets are not implemented yet.

[0.1.0]: https://github.com/frankstupak/claude-command-center/releases/tag/v0.1.0
