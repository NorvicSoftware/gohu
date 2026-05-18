import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class PanelProvider {
    public static currentPanel: PanelProvider | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri; 
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (PanelProvider.currentPanel) {
            PanelProvider.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'Laravelgohu',
            'Laravel Gohu',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        PanelProvider.currentPanel = new PanelProvider(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;  
        this._panel.webview.html = this._getHtmlContent();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'openFolder': {
                        const uris = await vscode.window.showOpenDialog({
                            canSelectFolders: true,
                            canSelectFiles: false,
                            canSelectMany: false,
                            openLabel: 'Select folder'
                        });
                        if (uris && uris.length > 0) {
                            const folderPath = uris[0].fsPath;
                            this._panel.webview.postMessage({ command: 'setPath', path: folderPath });
                        }
                        break;
                    }
                    case 'run':
                        console.log('Run code.');
                        break;
                    case 'editorContent':
                        console.log('Editor content:', message.text);
                        break;
                }
            },
            null,
            this._disposables
        );
    }



    public dispose() {
        PanelProvider.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getHtmlContent(): string {
        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'panel.html');
        return fs.readFileSync(htmlPath, 'utf8');
    }
}