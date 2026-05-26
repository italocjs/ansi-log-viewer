# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

`ansi-log-viewer` is a VS Code extension that opens any log file in a webview panel with:
- **ANSI color rendering** — escape codes converted to HTML spans via `ansi-to-html`
- **Live tail** — `fs.watch` reads only new bytes as they are appended, like `tail -f`
- **Regex filter** — client-side filtering against ANSI-stripped text, live as you type
- **Log rotation detection** — reloads from scratch when the file is truncated

It was created to inspect colorized log files (e.g. from Python's `colorlog`) without leaving VS Code, since the built-in editor strips escape codes.

---

## Architecture

```
src/
  extension.ts       — activate(), registers the logViewer.openFile command
  logViewerPanel.ts  — LogViewerPanel class: file I/O, fs.watch, webview HTML/CSS/JS
package.json         — extension manifest, contributes.commands, contributes.menus
tsconfig.json        — compiles src/ → out/ (CommonJS, ES2020)
.vscodeignore        — controls what goes into the .vsix (excludes src/, maps, tsconfig)
.gitignore           — excludes node_modules/, out/, *.vsix
JOURNAL.md           — work log, updated before every commit
```

### Key design decisions

- **ANSI conversion happens on the Node side** (in `logViewerPanel.ts`) before sending to the webview. The webview receives `{ html, text }` pairs — `html` for rendering, `text` (ANSI-stripped) for filtering.
- **Webview state is retained** (`retainContextWhenHidden: true`) so the panel doesn't reload when you switch tabs.
- **One panel per file** — `LogViewerPanel.panels` is a `Map<filePath, panel>`. Opening the same file twice reveals the existing panel instead of creating a new one.
- **Tail is incremental** — on each `fs.watch` event, only bytes from `_fileSize` onward are read. The full file is never re-read after initial load.

### Message protocol (extension → webview)

| Type | Payload | When |
|------|---------|------|
| `init` | `{ filename, lines: {html,text}[] }` | Initial load or after log rotation |
| `append` | `{ lines: {html,text}[] }` | New bytes detected by `fs.watch` |
| `error` | `{ message }` | File read failure |

The webview never sends messages back to the extension.

---

## How to Develop (F5)

```bash
npm install
```

Open the `ansi-log-viewer` folder in VS Code, then press **F5**. This runs `npm run compile` (tsc) and launches an Extension Development Host. Changes require re-compiling (`npm run compile` or `npm run watch`) and reloading the host (`Ctrl+R`).

## How to Package & Install

```bash
npm run package       # compiles + generates ansi-log-viewer-x.x.x.vsix
npm run install-ext   # installs into VS Code via `code --install-extension`
```

The installed extension ID is `personal.ansi-log-viewer`. To update: bump the version in `package.json`, re-run both commands.

---

## Git Commit Convention

All commits must follow **Conventional Commits**:

```
<type>(<scope>): <short summary>
```

| Type | When |
|------|------|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Maintenance, deps, config |
| `refactor` | Restructure without behavior change |
| `docs` | Documentation only |
| `style` | Formatting, no logic change |

### Rules
- **Update `JOURNAL.md` before committing.** Stage it in the same commit.
- **Only commit when the user explicitly asks.**
- Summary: imperative mood, max ~72 chars, no period at end.

---

## Work Journal (`JOURNAL.md`)

> **Mandatory.** Must be updated before every commit.

```md
### [YYYY-MM-DD HH:MM:SS -0300] - Italo Soares (eng)
- Summary: one-line description.
- Details:
    - Key actions taken.
    - Files touched.
```
