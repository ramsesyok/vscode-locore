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
    context.subscriptions.push(vscode.commands.registerCommand('locore.openCodeReview', () => {
        vscode.window.showInformationMessage('LoCoRe: Open CodeReview command executed!');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('locore.createReview', (reply: vscode.CommentReply) => {
        createReview(reply);
    }));

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

    // データストア（index.json / JSONL）の初期化
    await initializeReviewStores(codeReviewDir);
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
function createReview(reply: vscode.CommentReply) {

}

/**
 * レビューデータストアの初期化
 * - index.json: スレッド索引＋状態（通常の JSON オブジェクト）
 * - JSONL: コメント本文の append-only ログ（review.jsonl）
 * @param codeReviewDir - ワークスペース直下の .codereview ディレクトリ
 */
async function initializeReviewStores(codeReviewDir: string): Promise<void> {
    try {
        await initializeIndexJson(path.join(codeReviewDir, 'index.json'));
    } catch (err) {
        console.warn(`[LoCoRe] index.json 初期化に失敗: ${err}`);
    }

    try {
        await initializeJsonlLog(path.join(codeReviewDir, 'review.jsonl'));
    } catch (err) {
        console.warn(`[LoCoRe] JSONL 初期化に失敗: ${err}`);
    }
}

/**
 * index.json を初期化する（存在しない・壊れている場合は既定スキーマで作成）。
 * @param indexPath - index.json への絶対パス
 */
async function initializeIndexJson(indexPath: string): Promise<void> {
    const defaultIndex = { threads: [] as any[] };
    await fs.promises.mkdir(path.dirname(indexPath), { recursive: true });

    try {
        const buf = await fs.promises.readFile(indexPath, 'utf8');
        const parsed = JSON.parse(buf);
        if (!parsed || !Array.isArray(parsed.threads)) {
            await fs.promises.writeFile(
                indexPath,
                JSON.stringify(defaultIndex, null, 2) + '\n',
                'utf8'
            );
        }
    } catch (e) {
        // ファイルが存在しない or JSON 破損など → 既定スキーマで作成
        await fs.promises.writeFile(
            indexPath,
            JSON.stringify(defaultIndex, null, 2) + '\n',
            'utf8'
        );
    }

    console.log('[LoCoRe] index.json 初期化完了');
}

/**
 * JSONL(review.jsonl) を初期化する（存在しない場合は空ファイルを作成）。
 * @param reviewPath - review.jsonl への絶対パス
 */
async function initializeJsonlLog(reviewPath: string): Promise<void> {
    // 追記モードで一度開いて即閉じすれば存在を確保できる
    await fs.promises.mkdir(path.dirname(reviewPath), { recursive: true });
    const handle = await fs.promises.open(reviewPath, 'a');
    await handle.close();
    console.log('[LoCoRe] JSONL review.jsonl 初期化完了');
}
/**
 * 拡張機能の非アクティベーション関数
 * VS Codeが拡張機能を無効化する際に呼び出される
 */
export function deactivate() { }
