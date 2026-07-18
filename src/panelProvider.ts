import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ServerDetails {
    projectPath?: string;
    laravelDetected: boolean;
    phpBinary: string;
    phpVersion?: string;
    connection?: string;
    driver?: string;
    database?: string;
    error?: string;
}

export class PanelProvider {
    public static currentPanel: PanelProvider | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _projectPath: string | undefined;

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

        // Initial path taken from the extension settings (if any).
        const configured = vscode.workspace
            .getConfiguration('laravelTools')
            .get<string>('projectPath');
        this._projectPath = configured && configured.trim() ? configured.trim() : undefined;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'ready':
                    case 'checkStatus': {
                        await this._refreshServerStatus();
                        break;
                    }
                    case 'openFolder': {
                        const uris = await vscode.window.showOpenDialog({
                            canSelectFolders: true,
                            canSelectFiles: false,
                            canSelectMany: false,
                            openLabel: 'Select folder'
                        });
                        if (uris && uris.length > 0) {
                            this._projectPath = uris[0].fsPath;
                            this._panel.webview.postMessage({ command: 'setPath', path: this._projectPath });
                            await this._refreshServerStatus();
                        }
                        break;
                    }
                    case 'run': {
                        console.log('Run code.');
                        break;
                    }
                    case 'editorContent': {
                        console.log('Editor content:', message.text);
                        break;
                    }
                }
            },
            null,
            this._disposables
        );
    }

    private _phpBinary(): string {
        const bin = vscode.workspace
            .getConfiguration('laravelTools')
            .get<string>('phpBinary');
        return bin && bin.trim() ? bin.trim() : 'php';
    }

    /** Runs the connection check and pushes the result to the webview. */
    private async _refreshServerStatus() {
        this._panel.webview.postMessage({ command: 'setServerStatus', status: 'checking' });
        const details = await this._checkServerStatus();
        this._panel.webview.postMessage({
            command: 'setServerStatus',
            status: details.error ? 'offline' : 'online',
            details
        });
    }

    /**
     * Checks whether a working Laravel/PHP environment with a reachable database
     * exists for the selected project. Works with any local stack (Laravel Herd,
     * XAMPP, Valet, ...) as long as the PHP binary can run.
     *
     * "Server online" = PHP boots + Laravel boots + the DB connection responds.
     */
    private async _checkServerStatus(): Promise<ServerDetails> {
        const phpBinary = this._phpBinary();
        const projectPath = this._projectPath;

        const details: ServerDetails = {
            projectPath,
            laravelDetected: false,
            phpBinary
        };

        if (!projectPath) {
            details.error = 'No project folder selected.';
            return details;
        }

        if (!fs.existsSync(path.join(projectPath, 'artisan'))) {
            details.error = 'Not a Laravel project: "artisan" was not found in the selected folder.';
            return details;
        }
        details.laravelDetected = true;

        // Opens the PDO to force a real DB connection and returns the data as JSON.
        const script =
            'DB::connection()->getPdo();' +
            'echo json_encode([' +
            "'php_version'=>PHP_VERSION," +
            "'connection'=>DB::connection()->getName()," +
            "'driver'=>DB::connection()->getDriverName()," +
            "'database'=>DB::connection()->getDatabaseName()" +
            ']);';

        try {
            const { stdout } = await execAsync(
                `${phpBinary} artisan tinker --execute="${script}"`,
                { cwd: projectPath, timeout: 15000, windowsHide: true }
            );
            const json = this._extractJson(stdout);
            if (!json) {
                details.error = 'Could not read the database status from the Artisan output.';
                return details;
            }
            details.phpVersion = json.php_version;
            details.connection = json.connection;
            details.driver = json.driver;
            details.database = json.database;
            return details;
        } catch (err) {
            details.error = this._cleanError(err);
            return details;
        }
    }

    /** Extracts the first JSON object from the output (tinker may add extra text). */
    private _extractJson(output: string): any | undefined {
        const start = output.indexOf('{');
        const end = output.lastIndexOf('}');
        if (start === -1 || end === -1 || end < start) {
            return undefined;
        }
        try {
            return JSON.parse(output.slice(start, end + 1));
        } catch {
            return undefined;
        }
    }

    private _cleanError(err: unknown): string {
        const e = err as { stderr?: string; stdout?: string; message?: string };
        const raw = (e?.stderr || e?.stdout || e?.message || 'Unknown error').toString();
        const trimmed = raw.trim().slice(0, 600);
        return trimmed || 'Unknown error';
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
