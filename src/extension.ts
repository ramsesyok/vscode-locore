import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('LoCoRe extension is now active!');

    const disposable = vscode.commands.registerCommand('locore.openCodeReview', () => {
        vscode.window.showInformationMessage('LoCoRe: Open CodeReview command executed!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}