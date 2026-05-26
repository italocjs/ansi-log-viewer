import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import AnsiToHtml from 'ansi-to-html';

const converter = new AnsiToHtml({ escapeXML: true, newline: false });

const STRIP_ANSI = /\x1b\[[0-9;]*m|\x1b\[[0-9;]*[A-Za-z]/g;

export class LogViewerPanel {
    private static readonly panels = new Map<string, LogViewerPanel>();

    private readonly _panel: vscode.WebviewPanel;
    private readonly _filePath: string;
    private _watcher: fs.FSWatcher | undefined;
    private _fileSize = 0;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, fileUri: vscode.Uri) {
        const filePath = fileUri.fsPath;
        const existing = LogViewerPanel.panels.get(filePath);
        if (existing) {
            existing._panel.reveal(vscode.ViewColumn.One);
            return;
        }
        new LogViewerPanel(filePath);
    }

    private constructor(filePath: string) {
        this._filePath = filePath;
        const fileName = path.basename(filePath);

        this._panel = vscode.window.createWebviewPanel(
            'logViewer',
            fileName,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        LogViewerPanel.panels.set(filePath, this);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._buildHtml(fileName);

        // Give the webview a tick to initialize before we flood it with lines
        setTimeout(() => this._loadInitial(), 150);
    }

    // ── File reading ────────────────────────────────────────────────────────

    private _loadInitial() {
        try {
            const raw = fs.readFileSync(this._filePath, 'utf8');
            this._fileSize = fs.statSync(this._filePath).size;
            const lines = this._splitLines(raw);
            this._panel.webview.postMessage({
                type: 'init',
                filename: path.basename(this._filePath),
                lines: lines.map(l => this._convertLine(l))
            });
            this._startWatcher();
        } catch (err) {
            this._panel.webview.postMessage({ type: 'error', message: String(err) });
        }
    }

    private _startWatcher() {
        this._watcher = fs.watch(this._filePath, () => {
            try {
                const stat = fs.statSync(this._filePath);

                // File was truncated/rotated — reload from scratch
                if (stat.size < this._fileSize) {
                    this._fileSize = 0;
                    this._loadInitial();
                    return;
                }

                if (stat.size === this._fileSize) { return; }

                const fd = fs.openSync(this._filePath, 'r');
                const buf = Buffer.alloc(stat.size - this._fileSize);
                fs.readSync(fd, buf, 0, buf.length, this._fileSize);
                fs.closeSync(fd);
                this._fileSize = stat.size;

                const lines = this._splitLines(buf.toString('utf8'));
                if (lines.length === 0) { return; }

                this._panel.webview.postMessage({
                    type: 'append',
                    lines: lines.map(l => this._convertLine(l))
                });
            } catch {
                // File temporarily unavailable during rotation — ignore
            }
        });
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private _splitLines(text: string): string[] {
        return text.split('\n').filter(l => l.length > 0);
    }

    private _convertLine(raw: string): { html: string; text: string } {
        let html: string;
        try {
            html = converter.toHtml(raw);
        } catch {
            html = this._escHtml(raw);
        }
        return { html, text: raw.replace(STRIP_ANSI, '') };
    }

    private _escHtml(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── Webview HTML ────────────────────────────────────────────────────────

    private _buildHtml(filename: string): string {
        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: 'Cascadia Code', 'Fira Code', Consolas, 'Courier New', monospace;
  font-size: 12.5px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Toolbar ── */
#toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
  user-select: none;
}

#filename {
  color: #9cdcfe;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
  flex-shrink: 0;
}

#filter-wrap {
  flex: 1;
  position: relative;
  min-width: 0;
}

#filter {
  width: 100%;
  background: #3c3c3c;
  border: 1px solid #555;
  color: #d4d4d4;
  padding: 3px 28px 3px 8px;
  border-radius: 3px;
  font-family: inherit;
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s;
}
#filter:focus   { border-color: #007acc; }
#filter.invalid { border-color: #f44747; background: #3a1c1c; }

#clear-filter {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: none;
  padding: 0;
}
#clear-filter:hover { color: #d4d4d4; }

#follow-label {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  color: #9cdcfe;
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
}

#count {
  color: #777;
  font-size: 11px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Log area ── */
#log {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  padding: 2px 0;
}

.line {
  padding: 0 10px;
  white-space: pre;
  line-height: 1.55;
  min-height: 1.55em;
}
.line:hover { background: #2a2a2a; }
.line.hidden { display: none; }

/* ── Error banner ── */
#error-banner {
  display: none;
  background: #5a1d1d;
  color: #f48771;
  padding: 6px 10px;
  font-size: 12px;
  border-bottom: 1px solid #f44747;
  flex-shrink: 0;
}

/* ── ANSI colour overrides so they read well on dark bg ── */
.ansi-bright-white-fg { color: #f0f0f0; }
.ansi-white-fg         { color: #c0c0c0; }
.ansi-black-fg         { color: #666; }
</style>
</head>
<body>

<div id="error-banner"></div>

<div id="toolbar">
  <span id="filename">${this._escHtml(filename)}</span>
  <div id="filter-wrap">
    <input id="filter" type="text" placeholder="Filtrar (regex)…" spellcheck="false" autocomplete="off" />
    <button id="clear-filter" title="Limpar filtro">✕</button>
  </div>
  <label id="follow-label" title="Rolar para o final automaticamente">
    <input type="checkbox" id="follow" checked />
    Tail
  </label>
  <span id="count">0 linhas</span>
</div>

<div id="log"></div>

<script>
(function () {
  const logEl      = document.getElementById('log');
  const filterEl   = document.getElementById('filter');
  const clearBtn   = document.getElementById('clear-filter');
  const followEl   = document.getElementById('follow');
  const countEl    = document.getElementById('count');
  const errorEl    = document.getElementById('error-banner');

  // Parallel arrays — index i in allLines matches line div i in logEl.children
  const allLines   = [];   // { html, text }
  let   filterRx   = null;
  let   total      = 0;
  let   visible    = 0;

  // ── Utilities ──────────────────────────────────────────────────────────

  function updateCount() {
    countEl.textContent = filterRx
      ? visible + ' / ' + total + ' linhas'
      : total + ' linhas';
  }

  function scrollBottom() {
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ── Filter ─────────────────────────────────────────────────────────────

  function buildRegex(val) {
    if (!val) { return null; }
    try {
      return new RegExp(val, 'i');
    } catch {
      return undefined; // signals invalid pattern
    }
  }

  function applyFilter() {
    const val = filterEl.value.trim();
    filterEl.classList.remove('invalid');
    clearBtn.style.display = val ? 'block' : 'none';

    const rx = buildRegex(val);
    if (rx === undefined) {
      filterEl.classList.add('invalid');
      return;
    }
    filterRx = rx;

    visible = 0;
    const divs = logEl.children;
    for (let i = 0; i < divs.length; i++) {
      const show = !filterRx || filterRx.test(allLines[i].text);
      divs[i].classList.toggle('hidden', !show);
      if (show) { visible++; }
    }
    updateCount();
    if (followEl.checked) { scrollBottom(); }
  }

  // ── Append lines ───────────────────────────────────────────────────────

  function appendLines(lines) {
    const frag = document.createDocumentFragment();
    for (const line of lines) {
      allLines.push(line);
      const div = document.createElement('div');
      div.className = 'line';
      div.innerHTML = line.html;
      total++;
      const show = !filterRx || filterRx.test(line.text);
      if (!show) {
        div.classList.add('hidden');
      } else {
        visible++;
      }
      frag.appendChild(div);
    }
    logEl.appendChild(frag);
    updateCount();
    if (followEl.checked) { scrollBottom(); }
  }

  // ── Message handler ────────────────────────────────────────────────────

  window.addEventListener('message', ev => {
    const msg = ev.data;

    if (msg.type === 'init') {
      logEl.innerHTML = '';
      allLines.length = 0;
      total   = 0;
      visible = 0;
      appendLines(msg.lines);
      if (followEl.checked) { scrollBottom(); }
      return;
    }

    if (msg.type === 'append') {
      appendLines(msg.lines);
      return;
    }

    if (msg.type === 'error') {
      errorEl.textContent = 'Erro: ' + msg.message;
      errorEl.style.display = 'block';
    }
  });

  // ── Event listeners ────────────────────────────────────────────────────

  filterEl.addEventListener('input', applyFilter);

  clearBtn.addEventListener('click', () => {
    filterEl.value = '';
    applyFilter();
    filterEl.focus();
  });

  // When user scrolls up manually, disable tail; re-enable on scroll to bottom
  logEl.addEventListener('scroll', () => {
    const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 4;
    if (!atBottom && followEl.checked) {
      followEl.checked = false;
    }
  });

  followEl.addEventListener('change', () => {
    if (followEl.checked) { scrollBottom(); }
  });

  // Keyboard shortcut: Ctrl+F focuses the filter
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      filterEl.focus();
      filterEl.select();
    }
  });
})();
</script>
</body>
</html>`;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    public dispose() {
        LogViewerPanel.panels.delete(this._filePath);
        this._watcher?.close();
        this._panel.dispose();
        this._disposables.forEach(d => d.dispose());
    }
}
