import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
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
                    case 'ready': {
                        // Show the configured project path (if any) as soon as the webview loads.
                        if (this._projectPath) {
                            this._panel.webview.postMessage({ command: 'setPath', path: this._projectPath });
                        }
                        await this._refreshServerStatus();
                        break;
                    }
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
                            // Persist so the path shows by default the next time the panel opens.
                            await vscode.workspace
                                .getConfiguration('laravelTools')
                                .update('projectPath', this._projectPath, vscode.ConfigurationTarget.Global);
                            this._panel.webview.postMessage({ command: 'setPath', path: this._projectPath });
                            await this._refreshServerStatus();
                        }
                        break;
                    }
                    case 'run': {
                        await this._runQuery(typeof message.text === 'string' ? message.text : '');
                        break;
                    }
                    case 'editorContent': {
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

    /** Runs the editor's Eloquent/Query Builder snippet and pushes the JSON result to the webview. */
    private async _runQuery(code: string) {
        this._panel.webview.postMessage({ command: 'queryRunning' });
        const result = await this._executeQuery(code);
        this._panel.webview.postMessage({ command: 'queryResult', result });
    }

    /**
     * Executes the given snippet against the selected Laravel project via Artisan Tinker
     * and returns the parsed JSON result (always an object with a `success` flag).
     *
     * The snippet is written to a temporary PHP runner that Tinker `require`s, so arbitrary
     * user code never touches the shell. Tinker's class-alias autoloader is active, so short
     * model names (`User::get()`) resolve just like in an interactive `php artisan tinker`.
     */
    private async _executeQuery(code: string): Promise<any> {
        const phpBinary = this._phpBinary();
        const projectPath = this._projectPath;

        if (!projectPath) {
            return { success: false, error: 'No project folder selected.' };
        }
        if (!fs.existsSync(path.join(projectPath, 'artisan'))) {
            return { success: false, error: 'Not a Laravel project: "artisan" was not found in the selected folder.' };
        }
        if (!code || !code.trim()) {
            return { success: false, error: 'The editor is empty. Write an Eloquent or Query Builder statement to run.' };
        }

        const scriptPath = this._writeRunnerScript(code);
        const requirePath = scriptPath.replace(/\\/g, '/');

        try {
            const { stdout } = await execAsync(
                `${phpBinary} artisan tinker --execute="require '${requirePath}';"`,
                { cwd: projectPath, timeout: 30000, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }
            );
            const json = this._extractJson(stdout);
            if (!json) {
                return {
                    success: false,
                    error: 'Could not parse the result from Artisan output.\n\n' + stdout.trim().slice(0, 1000)
                };
            }
            return json;
        } catch (err) {
            return { success: false, error: this._cleanError(err) };
        } finally {
            try {
                fs.unlinkSync(scriptPath);
            } catch {
                /* ignore cleanup errors */
            }
        }
    }

    /**
     * Writes a self-contained PHP runner to the OS temp dir. It:
     *  - Receives the raw user snippet through a Nowdoc (no interpolation, no escaping).
     *  - Uses `token_get_all` to find the last top-level statement and turn it into the
     *    returned value (robust against `;` inside strings, comments and closures).
     *  - Limits `data` to the first 20 rows while `total` reflects the full count.
     */
    private _writeRunnerScript(code: string): string {
        // Random Nowdoc delimiter so it never collides with a line of user code.
        const delim = 'GOHU_' + Math.random().toString(36).slice(2, 14).toUpperCase();

        const runner = `<?php
$__gohu_start = microtime(true);
try {
    $__gohu_code = <<<'${delim}'
${code}
${delim};

    $__gohu_result = eval(gohu_returnable($__gohu_code));

    if ($__gohu_result instanceof \\Illuminate\\Database\\Eloquent\\Builder
        || $__gohu_result instanceof \\Illuminate\\Database\\Query\\Builder
        || $__gohu_result instanceof \\Illuminate\\Database\\Eloquent\\Relations\\Relation) {
        $__gohu_result = $__gohu_result->get();
    }

    // Elapsed time of the actual query execution, in milliseconds.
    $__gohu_ms = round((microtime(true) - $__gohu_start) * 1000, 2);

    $__gohu_limit = 20;

    if ($__gohu_result instanceof \\Illuminate\\Support\\Collection) {
        $__gohu_total = $__gohu_result->count();
        $__gohu_data = $__gohu_result->take($__gohu_limit)->values()->toArray();
    } elseif ($__gohu_result instanceof \\Illuminate\\Database\\Eloquent\\Model) {
        $__gohu_total = 1;
        $__gohu_data = $__gohu_result->toArray();
    } elseif (is_array($__gohu_result)) {
        $__gohu_total = count($__gohu_result);
        $__gohu_data = array_slice($__gohu_result, 0, $__gohu_limit);
    } else {
        $__gohu_total = is_null($__gohu_result) ? 0 : 1;
        $__gohu_data = $__gohu_result;
    }

    $__gohu_conn = \\Illuminate\\Support\\Facades\\DB::connection();

    echo json_encode([
        'success' => true,
        'total' => $__gohu_total,
        'query_time' => $__gohu_ms . ' ms',
        'database' => $__gohu_conn->getDatabaseName(),
        'connection_name' => $__gohu_conn->getName(),
        'data' => $__gohu_data,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (\\Throwable $__gohu_e) {
    echo json_encode([
        'success' => false,
        'error' => $__gohu_e->getMessage(),
        'query_time' => round((microtime(true) - $__gohu_start) * 1000, 2) . ' ms',
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function gohu_returnable($code) {
    $code = trim($code);
    $code = preg_replace('/^\\s*<\\?php/i', '', $code);
    $code = preg_replace('/\\?>\\s*$/', '', $code);
    $code = rtrim(trim($code), ';');
    if ($code === '') { return 'return null;'; }

    // True if the snippet has something other than comments/whitespace.
    $meaningful = function ($snippet) {
        foreach (token_get_all('<?php ' . $snippet) as $t) {
            if (is_array($t)) {
                if (!in_array($t[0], [T_OPEN_TAG, T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) { return true; }
            } else {
                return true;
            }
        }
        return false;
    };

    if (!$meaningful($code)) { return 'return null;'; }

    $tokens = token_get_all('<?php ' . $code);
    array_shift($tokens);

    $depth = 0;
    $lastSemi = -1;
    foreach ($tokens as $i => $t) {
        $text = is_array($t) ? $t[1] : $t;
        if ($text === '{' || $text === '(' || $text === '[') { $depth++; }
        elseif ($text === '}' || $text === ')' || $text === ']') { $depth--; }
        elseif ($text === ';' && $depth === 0) { $lastSemi = $i; }
    }

    $render = function ($slice) {
        $out = '';
        foreach ($slice as $t) { $out .= is_array($t) ? $t[1] : $t; }
        return $out;
    };

    if ($lastSemi === -1) {
        $stmt = trim($render($tokens));
        return preg_match('/^return\\b/', $stmt) ? $stmt . ';' : 'return (' . $stmt . ');';
    }

    $head = $render(array_slice($tokens, 0, $lastSemi + 1));
    $tail = trim($render(array_slice($tokens, $lastSemi + 1)));
    if ($tail === '' || !$meaningful($tail)) { return $head; }
    if (preg_match('/^return\\b/', $tail)) { return $head . "\\n" . $tail . ';'; }
    return $head . "\\nreturn (" . $tail . ');';
}
`;

        const file = path.join(os.tmpdir(), `gohu-run-${Date.now()}-${Math.random().toString(36).slice(2)}.php`);
        fs.writeFileSync(file, runner, 'utf8');
        return file;
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
        const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'panel.html');
        return fs.readFileSync(htmlPath, 'utf8');
    }
}
