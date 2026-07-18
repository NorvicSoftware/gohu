"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode2 = __toESM(require("vscode"));

// src/panelProvider.ts
var vscode = __toESM(require("vscode"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var import_child_process = require("child_process");
var import_util = require("util");
var execAsync = (0, import_util.promisify)(import_child_process.exec);
var PanelProvider = class _PanelProvider {
  static currentPanel;
  _panel;
  _extensionUri;
  _disposables = [];
  _projectPath;
  static createOrShow(extensionUri) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : void 0;
    if (_PanelProvider.currentPanel) {
      _PanelProvider.currentPanel._panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "Laravelgohu",
      "Laravel Gohu",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );
    _PanelProvider.currentPanel = new _PanelProvider(panel, extensionUri);
  }
  constructor(panel, extensionUri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._panel.webview.html = this._getHtmlContent();
    const configured = vscode.workspace.getConfiguration("laravelTools").get("projectPath");
    this._projectPath = configured && configured.trim() ? configured.trim() : void 0;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "ready":
          case "checkStatus": {
            await this._refreshServerStatus();
            break;
          }
          case "openFolder": {
            const uris = await vscode.window.showOpenDialog({
              canSelectFolders: true,
              canSelectFiles: false,
              canSelectMany: false,
              openLabel: "Select folder"
            });
            if (uris && uris.length > 0) {
              this._projectPath = uris[0].fsPath;
              this._panel.webview.postMessage({ command: "setPath", path: this._projectPath });
              await this._refreshServerStatus();
            }
            break;
          }
          case "run": {
            console.log("Run code.");
            break;
          }
          case "editorContent": {
            console.log("Editor content:", message.text);
            break;
          }
        }
      },
      null,
      this._disposables
    );
  }
  _phpBinary() {
    const bin = vscode.workspace.getConfiguration("laravelTools").get("phpBinary");
    return bin && bin.trim() ? bin.trim() : "php";
  }
  /** Runs the connection check and pushes the result to the webview. */
  async _refreshServerStatus() {
    this._panel.webview.postMessage({ command: "setServerStatus", status: "checking" });
    const details = await this._checkServerStatus();
    this._panel.webview.postMessage({
      command: "setServerStatus",
      status: details.error ? "offline" : "online",
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
  async _checkServerStatus() {
    const phpBinary = this._phpBinary();
    const projectPath = this._projectPath;
    const details = {
      projectPath,
      laravelDetected: false,
      phpBinary
    };
    if (!projectPath) {
      details.error = "No project folder selected.";
      return details;
    }
    if (!fs.existsSync(path.join(projectPath, "artisan"))) {
      details.error = 'Not a Laravel project: "artisan" was not found in the selected folder.';
      return details;
    }
    details.laravelDetected = true;
    const script = "DB::connection()->getPdo();echo json_encode(['php_version'=>PHP_VERSION,'connection'=>DB::connection()->getName(),'driver'=>DB::connection()->getDriverName(),'database'=>DB::connection()->getDatabaseName()]);";
    try {
      const { stdout } = await execAsync(
        `${phpBinary} artisan tinker --execute="${script}"`,
        { cwd: projectPath, timeout: 15e3, windowsHide: true }
      );
      const json = this._extractJson(stdout);
      if (!json) {
        details.error = "Could not read the database status from the Artisan output.";
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
  _extractJson(output) {
    const start = output.indexOf("{");
    const end = output.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) {
      return void 0;
    }
    try {
      return JSON.parse(output.slice(start, end + 1));
    } catch {
      return void 0;
    }
  }
  _cleanError(err) {
    const e = err;
    const raw = (e?.stderr || e?.stdout || e?.message || "Unknown error").toString();
    const trimmed = raw.trim().slice(0, 600);
    return trimmed || "Unknown error";
  }
  dispose() {
    _PanelProvider.currentPanel = void 0;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
  _getHtmlContent() {
    const htmlPath = path.join(this._extensionUri.fsPath, "src", "webview", "panel.html");
    return fs.readFileSync(htmlPath, "utf8");
  }
};

// src/extension.ts
function activate(context) {
  context.subscriptions.push(
    vscode2.commands.registerCommand("gohu.openPanel", () => {
      PanelProvider.createOrShow(context.extensionUri);
    })
  );
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
