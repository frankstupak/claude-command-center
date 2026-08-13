# Security Policy

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.
Email **lumen@lumennode.uk** with a description of the issue and
reproduction steps. You should get a response within a few days.

## Scope

Claude Command Center is a local Electron shell around claude.ai — it stores
a shared login session (`persist:claude` partition) and reads/writes local
config under `~/.config/Claude Command Center/`. Reports of interest include:
anything that lets injected page content (`styles.css` / `automations.js`)
escape its intended scope, anything that exposes the stored session outside
the local machine, or anything in `main.js`/`preload-*.js` that widens
Electron's context-isolation boundary.

## Supported versions

Only the latest release on `main` is supported.
