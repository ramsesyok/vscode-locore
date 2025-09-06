import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { createCommentController, restoreExistingThreads, setThreadState } from './comment-controller';
import { initializeReviewStores } from './review-store';
import { upsertReview } from './review-service';

/**
 * 拡張機能のアクティベーション関数
 * - ここでは初期化とコマンド登録のみ行い、実装は各モジュールへ委譲します。
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('LoCoRe extension is now active!');
    initializeExtension(context);

    // Open CodeReview（サンプルダイアログ）
    context.subscriptions.push(vscode.commands.registerCommand('locore.openCodeReview', () => {
        vscode.window.showInformationMessage('LoCoRe: Open CodeReview command executed!');
    }));

    // コメント作成 / 返信
    context.subscriptions.push(vscode.commands.registerCommand('locore.createReview', (reply: vscode.CommentReply) => upsertReview(reply)));
    context.subscriptions.push(vscode.commands.registerCommand('locore.replyReview', (reply: vscode.CommentReply) => upsertReview(reply)));

    // スレッドの解決 / 再オープン
    context.subscriptions.push(vscode.commands.registerCommand('locore.resolveThread', async (arg?: any) => {
        const thread = getThreadFromArg(arg);
        const dir = getCodeReviewDir();
        if (!thread || !dir) return;
        await setThreadState(thread, 'closed', dir);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('locore.reopenThread', async (arg?: any) => {
        const thread = getThreadFromArg(arg);
        const dir = getCodeReviewDir();
        if (!thread || !dir) return;
        await setThreadState(thread, 'open', dir);
    }));
}

/** ワークスペースの初期化（.codereview とストアの準備、スレッド復元） */
async function initializeExtension(context: vscode.ExtensionContext) {
    if (!vscode.workspace.workspaceFolders) return; // ワークスペースが無い場合は何もしない

    const dir = getCodeReviewDir();
    if (!dir) return;

    // Comment API を初期化
    createCommentController(context);
    // ストアの初期化
    await initializeReviewStores(dir);
    // 既存コメントの復元
    try {
        await restoreExistingThreads(dir);
    } catch (e) {
        console.warn(`[LoCoRe] 既存コメント復元に失敗: ${e}`);
    }
}

/** 現在のワークスペースから .codereview ディレクトリのパスを返す（無ければ作成）。 */
function getCodeReviewDir(): string | undefined {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('ワークスペースが開かれていません。');
        return undefined;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const codeReviewDir = path.join(workspaceRoot, '.codereview');
    if (!fs.existsSync(codeReviewDir)) {
        try { fs.mkdirSync(codeReviewDir, { recursive: true }); } catch (e) {
            vscode.window.showErrorMessage(`.codereview ディレクトリの作成に失敗しました: ${e}`);
            return undefined;
        }
    }
    return codeReviewDir;
}

/**
 * コメントメニューなどから渡ってくる引数から CommentThread を抽出する。
 * - 直接 `thread` が来る場合と `{ thread }` の形で来る場合に対応。
 */
function getThreadFromArg(arg: any): vscode.CommentThread | undefined {
    if (!arg) return undefined;
    if (typeof arg === 'object' && 'uri' in arg && 'range' in arg) return arg as vscode.CommentThread;
    if (typeof arg === 'object' && 'thread' in arg && arg.thread && 'uri' in arg.thread) return arg.thread as vscode.CommentThread;
    return undefined;
}

/** 拡張機能の非アクティベーション関数 */
export function deactivate() { }
