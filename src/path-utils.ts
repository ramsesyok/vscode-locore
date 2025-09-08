import * as path from 'path';
import * as vscode from 'vscode';

/**
 * ワークスペース基準の相対パスに正規化して返す（保存用のキー）。
 * Windows でも JSON 内では '/' 区切りに統一する。
 */
export function toWorkspaceRelative(fsPath: string, workspaceRoot: string): string {
    const rel = path.relative(workspaceRoot, fsPath);
    return rel.split(path.sep).join('/');
}

/**
 * 保存済みのパス文字列（相対または file:// などのURI文字列）から URI を得る。
 */
export function parseStoredUri(value: string, workspaceRoot: string): vscode.Uri {
    if (/^[a-zA-Z]+:\/\//.test(value)) {
        return vscode.Uri.parse(value);
    }
    const abs = path.resolve(workspaceRoot, value);
    return vscode.Uri.file(abs);
}

/**
 * UIの CommentThread から保存用の相対パスキーを取得する。
 */
export function keyFromThread(thread: vscode.CommentThread, workspaceRoot: string): string {
    return toWorkspaceRelative(thread.uri.fsPath, workspaceRoot);
}

