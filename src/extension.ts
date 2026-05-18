import * as vscode from 'vscode';
import { PanelProvider } from './panelProvider';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('gohu.openPanel', () => {
            PanelProvider.createOrShow(context.extensionUri);
        })
    );
}

// This method is called when your extension is deactivated
export function deactivate() {}
