import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

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
        upsertReview(reply);
    }));

    // 既存スレッドへの返信（返信ボックスから送信されたテキストを使用）
    context.subscriptions.push(vscode.commands.registerCommand('locore.replyReview', (reply: vscode.CommentReply) => {
        upsertReview(reply);
    }));

}

/**
 * 拡張機能の初期化処理
 * - ワークスペース直下に `.codereview/` ディレクトリを用意（なければ作成）
 * - コメント機能（Comment API）の初期化
 * - レビューデータストア（index.json / review.jsonl）の初期化
 * @param context 拡張機能のコンテキスト
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
 * VS Code の Comment API を用いて、任意の行にコメントスレッドを作成できるようにする。
 * @param context 拡張機能のコンテキスト
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
            // 単純実装: ドキュメント全行をコメント可能範囲にする
            const lineCount = document.lineCount;
            return [new vscode.Range(0, 0, lineCount - 1, 0)];
        }
    };

    context.subscriptions.push(commentController);
    console.log('CommentAPI initialized');
}
// VS Code の CommentThread と永続スレッドIDの紐付け（セッション中のみ保持）
const threadIdMap = new WeakMap<vscode.CommentThread, string>();

interface IndexThreadEntry {
    threadId: string;
    uri: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    state: 'open' | 'closed';
    createdAt: string;
    updatedAt: string;
    commentCount: number;
    summary?: string;
    firstSeq?: number;
    lastSeq?: number;
    anchors?: { before?: string[]; after?: string[] };
}

interface IndexJsonSchemaV1 {
    version: 1;
    lastSeq: number;
    threads: { [threadId: string]: IndexThreadEntry };
    byUri: { [uri: string]: string[] };
}

/**
 * UUID を生成するユーティリティ。
 * Node.js の `crypto.randomUUID` が利用可能ならそれを使い、
 * 利用不可の場合はランダムバイトから RFC4122 v4 風の文字列を生成する。
 * @returns 生成した UUID 文字列
 */
function generateUuid(): string {
    if ((crypto as any).randomUUID) {
        return (crypto as any).randomUUID();
    }
    // Fallback: RFC4122 風の簡易生成
    const rnd = crypto.randomBytes(16);
    rnd[6] = (rnd[6] & 0x0f) | 0x40; // version 4
    rnd[8] = (rnd[8] & 0x3f) | 0x80; // variant
    const hex = rnd.toString('hex');
    return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(20)}`;
}

/**
 * index.json から、指定スレッド（URI と Range）に対応する threadId を探す。
 * 完全一致する Range のスレッドIDを返す。
 * @param indexData index.json のデータ
 * @param thread VS Code のコメントスレッド
 * @returns 見つかった threadId。なければ undefined
 */
function resolveThreadIdFromIndex(indexData: IndexJsonSchemaV1, thread: vscode.CommentThread): string | undefined {
    const uriStr = thread.uri.toString();
    const r = thread.range ?? new vscode.Range(0, 0, 0, 0);
    const ids = indexData.byUri[uriStr] || [];
    for (const id of ids) {
        const t = indexData.threads[id];
        if (!t) continue;
        const tr = t.range;
        if (
            tr.start.line === r.start.line && tr.start.character === r.start.character &&
            tr.end.line === r.end.line && tr.end.character === r.end.character
        ) {
            return id;
        }
    }
    return undefined;
}

/**
 * index.json を読み込み、必要に応じて最小限のマイグレーションを施した
 * 既定スキーマ（version:1）を返す。
 * 壊れている・存在しない場合は既定値を返す。
 * @param indexPath index.json の絶対パス
 * @returns 読み込んだ（または既定の）IndexJsonSchemaV1 オブジェクト
 */
async function readIndexJson(indexPath: string): Promise<IndexJsonSchemaV1> {
    try {
        const buf = await fs.promises.readFile(indexPath, 'utf8');
        const parsed = JSON.parse(buf);
        // 簡易バリデーションとマイグレーション（version 未設定など）
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('index.json 不正');
        }
        if (!('version' in parsed)) {
            // 旧形式からの最低限移行（存在した場合）
            return {
                version: 1,
                lastSeq: 0,
                threads: {},
                byUri: {}
            };
        }
        return parsed as IndexJsonSchemaV1;
    } catch {
        // 存在しない/壊れている → 既定
        return {
            version: 1,
            lastSeq: 0,
            threads: {},
            byUri: {}
        };
    }
}

/**
 * index.json を JSON として書き出す。
 * ディレクトリが無ければ作成する。
 * @param indexPath index.json の絶対パス
 * @param data 保存するデータ
 */
async function writeIndexJson(indexPath: string, data: IndexJsonSchemaV1): Promise<void> {
    await fs.promises.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.promises.writeFile(indexPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * review.jsonl に1行追記する（append-only）。
 * @param reviewPath review.jsonl の絶対パス
 * @param row 追記する1行分のオブジェクト
 */
async function appendJsonl(reviewPath: string, row: Record<string, any>): Promise<void> {
    const line = JSON.stringify(row);
    await fs.promises.mkdir(path.dirname(reviewPath), { recursive: true });
    await fs.promises.appendFile(reviewPath, line + '\n', 'utf8');
}

/**
 * スレッドの新規作成（最初のコメント）と既存スレッドへの返信を統合した保存処理。
 * - 必要に応じて新しい threadId を採番し index.json を作成
 * - JSONL(review.jsonl) にコメント1件を append
 * - index.json の統計値と lastSeq を更新
 * - UI のスレッドにコメントを追加
 * @param reply コメント返信コンテキスト（Comment API の引数）
 */
async function upsertReview(reply: vscode.CommentReply): Promise<void> {
    try {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('ワークスペースが開かれていません。');
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const codeReviewDir = path.join(workspaceRoot, '.codereview');
        const indexPath = path.join(codeReviewDir, 'index.json');
        const reviewPath = path.join(codeReviewDir, 'review.jsonl');

        // ストアの存在保証（index.json / review.jsonl を用意）
        await initializeReviewStores(codeReviewDir);

        const thread = reply.thread;
        const uriStr = thread.uri.toString();
        const range = thread.range ?? new vscode.Range(0, 0, 0, 0);
        const nowIso = new Date().toISOString();

        // index を読み込み、threadId を解決 or 採番
        const indexData = await readIndexJson(indexPath);

        let threadId = threadIdMap.get(thread) || resolveThreadIdFromIndex(indexData, thread);
        const isNewThread = !threadId; // 空スレッド or 未解決
        if (!threadId) {
            threadId = generateUuid();
            threadIdMap.set(thread, threadId);
            // 新規スレッドエントリを作成
            indexData.threads[threadId] = {
                threadId,
                uri: uriStr,
                range: {
                    start: { line: range.start.line, character: range.start.character },
                    end: { line: range.end.line, character: range.end.character }
                },
                state: 'open',
                createdAt: nowIso,
                updatedAt: nowIso,
                commentCount: 0,
                anchors: {}
            };
            // byUri 逆引き索引を更新
            if (!indexData.byUri[uriStr]) indexData.byUri[uriStr] = [];
            if (!indexData.byUri[uriStr].includes(threadId)) indexData.byUri[uriStr].push(threadId);
        }

        // 次の seq を採番（グローバル単調増加）
        const nextSeq = (indexData.lastSeq || 0) + 1;

        // コメントID/著者/本文
        const commentId = generateUuid();
        const author = os.userInfo().username || 'unknown';
        const body = reply.text;

        // JSONL に追記（append-only ログ）
        await appendJsonl(reviewPath, {
            threadId,
            commentId,
            seq: nextSeq,
            createdAt: nowIso,
            author,
            body
        });

        // index 更新（統計と最新シーケンスを反映）
        const t = indexData.threads[threadId];
        t.commentCount += 1;
        t.updatedAt = nowIso;
        if (typeof t.firstSeq !== 'number') t.firstSeq = nextSeq;
        t.lastSeq = nextSeq;
        indexData.lastSeq = nextSeq;

        await writeIndexJson(indexPath, indexData);

        // UI へもコメント追加（スレッドの表示内容に反映）
        const newComment: vscode.Comment = {
            author: { name: author },
            body: new vscode.MarkdownString(body),
            mode: vscode.CommentMode.Preview,
            contextValue: 'locore',
            timestamp: new Date(nowIso)
        } as vscode.Comment;
        thread.comments = [...thread.comments, newComment];

        vscode.window.showInformationMessage(isNewThread ? 'レビューを作成しました。' : '返信を追加しました。');
    } catch (err: any) {
        console.error('[LoCoRe] upsertReview 失敗:', err);
        vscode.window.showErrorMessage(`レビュー保存に失敗しました: ${err?.message ?? err}`);
    }
}

/**
 * 既存スレッドへの返信を保存し、UI に反映する。
 * - CreateReview で作成されたスレッドに所属させる（同一 threadId に紐付ける）
 * - JSONL へ append、index.json を更新
 * @param reply コメント返信コンテキスト（Comment API の引数）
 */
async function replyReview(reply: vscode.CommentReply): Promise<void> {
    try {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('ワークスペースが開かれていません。');
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const codeReviewDir = path.join(workspaceRoot, '.codereview');
        const indexPath = path.join(codeReviewDir, 'index.json');
        const reviewPath = path.join(codeReviewDir, 'review.jsonl');

        // ストアの存在保証
        await initializeReviewStores(codeReviewDir);

        const thread = reply.thread;
        const nowIso = new Date().toISOString();
        const author = os.userInfo().username || 'unknown';
        const body = reply.text;

        // threadId を解決（WeakMap -> index.json 検索 の順）
        let threadId = threadIdMap.get(thread);
        const indexData = await readIndexJson(indexPath);
        if (!threadId) {
            threadId = resolveThreadIdFromIndex(indexData, thread);
        }
        if (!threadId) {
            // 見つからない場合は（範囲変更等）、現位置で新規スレッドとして扱う
            const uriStr = thread.uri.toString();
            const r = thread.range ?? new vscode.Range(0, 0, 0, 0);
            threadId = generateUuid();
            threadIdMap.set(thread, threadId);
            indexData.threads[threadId] = {
                threadId,
                uri: uriStr,
                range: {
                    start: { line: r.start.line, character: r.start.character },
                    end: { line: r.end.line, character: r.end.character }
                },
                state: 'open',
                createdAt: nowIso,
                updatedAt: nowIso,
                commentCount: 0,
                anchors: {}
            };
            if (!indexData.byUri[uriStr]) indexData.byUri[uriStr] = [];
            if (!indexData.byUri[uriStr].includes(threadId)) indexData.byUri[uriStr].push(threadId);
        }

        // 次の seq を採番
        const nextSeq = (indexData.lastSeq || 0) + 1;

        // JSONL に追記
        await appendJsonl(reviewPath, {
            threadId,
            commentId: generateUuid(),
            seq: nextSeq,
            createdAt: nowIso,
            author,
            body
        });

        // index 更新
        const t = indexData.threads[threadId];
        t.commentCount += 1;
        t.updatedAt = nowIso;
        if (typeof t.firstSeq !== 'number') t.firstSeq = nextSeq;
        t.lastSeq = nextSeq;
        indexData.lastSeq = nextSeq;
        await writeIndexJson(indexPath, indexData);

        // UI に反映
        const uiComment: vscode.Comment = {
            author: { name: author },
            body: new vscode.MarkdownString(body),
            mode: vscode.CommentMode.Preview,
            contextValue: 'locore',
            timestamp: new Date(nowIso)
        } as vscode.Comment;
        thread.comments = [...thread.comments, uiComment];

        vscode.window.showInformationMessage('返信を追加しました。');
    } catch (err: any) {
        console.error('[LoCoRe] replyReview 失敗:', err);
        vscode.window.showErrorMessage(`返信に失敗しました: ${err?.message ?? err}`);
    }
}

/**
 * レビューデータストアの初期化
 * - index.json: スレッド索引＋状態（通常の JSON オブジェクト）
 * - review.jsonl: コメント本文の append-only ログ
 * @param codeReviewDir ワークスペース直下の `.codereview` ディレクトリ
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
 * index.json を初期化する。
 * ファイルが存在しない・壊れている場合は既定スキーマ（version:1）で作成する。
 * @param indexPath index.json への絶対パス
 */
async function initializeIndexJson(indexPath: string): Promise<void> {
    const defaultIndex: IndexJsonSchemaV1 = {
        version: 1,
        lastSeq: 0,
        threads: {},
        byUri: {}
    };
    await fs.promises.mkdir(path.dirname(indexPath), { recursive: true });

    try {
        const buf = await fs.promises.readFile(indexPath, 'utf8');
        const parsed = JSON.parse(buf);
        if (!parsed || typeof parsed !== 'object' || !('version' in parsed)) {
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
 * JSONL(review.jsonl) を初期化する。
 * 存在しない場合は空ファイルを作成し、存在確保のみ行う。
 * @param reviewPath review.jsonl への絶対パス
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
