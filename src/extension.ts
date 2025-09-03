import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 拡張機能のアクティベーション関数
 * VS Codeが拡張機能を有効化する際に呼び出される
 * @param context - 拡張機能のコンテキスト
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('LoCoRe extension is now active!');

    // 拡張機能有効化時の初期化処理
    initializeExtension(context);

    // Open CodeReviewコマンドの登録
    const disposable = vscode.commands.registerCommand('locore.openCodeReview', () => {
        vscode.window.showInformationMessage('LoCoRe: Open CodeReview command executed!');
    });

    context.subscriptions.push(disposable);
}

/**
 * 拡張機能の初期化処理
 * .codereviewフォルダの作成とCommentAPIの初期化を行う
 * @param context - 拡張機能のコンテキスト
 */
async function initializeExtension(context: vscode.ExtensionContext) {
    // ワークスペースが開かれている場合のみ実行
    if (!vscode.workspace.workspaceFolders) {
        return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const codeReviewDir = path.join(workspaceRoot, '.codereview');

    // .codereviewフォルダが存在しない場合は作成
    if (!fs.existsSync(codeReviewDir)) {
        try {
            fs.mkdirSync(codeReviewDir, { recursive: true });
            console.log('Created .codereview directory');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create .codereview directory: ${error}`);
            return;
        }
    }

    // CommentAPIを初期化
    initializeCommentController(context);
}

/**
 * CommentAPIコントローラーの初期化
 * VS CodeのComment APIを使用してコードレビュー用のコメント機能を有効化する
 * @param context - 拡張機能のコンテキスト
 */
function initializeCommentController(context: vscode.ExtensionContext) {
    // コメントコントローラーの作成
    const commentController = vscode.comments.createCommentController(
        'locore-comments',
        'LoCoRe Code Review'
    );
    
    // コメント範囲の提供設定
    commentController.commentingRangeProvider = {
        /**
         * コメント可能な範囲を提供する
         * @param document - 対象のテキストドキュメント
         * @param token - キャンセレーショントークン
         * @returns コメント可能な範囲の配列
         */
        provideCommentingRanges(document: vscode.TextDocument, token: vscode.CancellationToken) {
            // 全ての行でコメント可能にする
            const lineCount = document.lineCount;
            return [new vscode.Range(0, 0, lineCount - 1, 0)];
        }
    };

    context.subscriptions.push(commentController);
    console.log('CommentAPI initialized');
}

/**
 * 拡張機能の非アクティベーション関数
 * VS Codeが拡張機能を無効化する際に呼び出される
 */
export function deactivate() {}