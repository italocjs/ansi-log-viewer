# JOURNAL

### [2026-05-26 14:00:00 -0300] - Italo Soares (eng)
- Summary: Extensão VS Code criada do zero — visualizador de logs com ANSI, tail e filtro regex.
- Details:
    - Motivação: necessidade de inspecionar `logs/app_egf.log` do simova-marteAnalyzer com cores ANSI renderizadas, follow de EOF e filtragem, sem depender do terminal.
    - Implementação: webview panel com `ansi-to-html` para conversão de escape codes no lado Node, `fs.watch` para tail incremental (só lê bytes novos), filtro regex client-side no HTML da webview.
    - Comportamentos implementados: scroll automático desliga quando usuário sobe manualmente; volta ao ativar Tail; detecção de log rotation (truncamento); `Ctrl+F` foca o filtro; menu de contexto no Explorer para `.log` e `.txt`.
    - Empacotado como `.vsix` e instalado permanentemente (`personal.ansi-log-viewer`).
    - Ferramenta genérica — funciona em qualquer repositório, não acoplada ao simova-marteAnalyzer.
    - Arquivos tocados: `src/extension.ts`, `src/logViewerPanel.ts`, `package.json`, `tsconfig.json`, `.vscode/launch.json`, `.vscode/tasks.json`, `.vscodeignore`, `.gitignore`, `JOURNAL.md`.
