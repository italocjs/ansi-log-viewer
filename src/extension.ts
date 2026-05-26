import * as vscode from 'vscode';
import { LogViewerPanel } from './logViewerPanel';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('logViewer.openFile', async (uri?: vscode.Uri) => {
            if (!uri) {
                const picked = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    openLabel: 'Open in Log Viewer',
                    filters: {
                        'Log files': ['log'],
                        'All files': ['*']
                    }
                });
                if (!picked || picked.length === 0) { return; }
                uri = picked[0];
            }
            LogViewerPanel.createOrShow(context.extensionUri, uri);
        })
    );
}

export function deactivate() {}
