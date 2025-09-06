import * as vscode from 'vscode';
import * as path from 'path';
import {
    IndexJsonSchemaV1,
    readIndexJson,
    readAllJsonl,
    writeIndexJson
} from './review-store';
import { generateUuid } from './utils';

/**
 * コメントコントローラ（CommentController）は拡張機能のライフサイクル中で1つだけ保持。
 * - ここで生成して他モジュールから使えるようにする。
 */
let controller: vscode.CommentController | undefined;

/**
 * VS Code が生成した CommentThread と永続ID(threadId)の関連付け。
 * - WeakMap により GC を妨げない。
 */
export const threadIdMap = new WeakMap<vscode.CommentThread, string>();

/** 生成済みのコントローラを取得（未生成なら undefined）。 */
export function getCommentController(): vscode.CommentController | undefined {
    return controller;
}

/**
 * コメントコントローラの初期化（1回だけ呼び出す）。
 * - 全行をコメント可能範囲にする簡易実装。
 */
export function createCommentController(context: vscode.ExtensionContext): vscode.CommentController {
    if (controller) return controller;
    controller = vscode.comments.createCommentController('locore-comments', 'LoCoRe Code Review');
    controller.commentingRangeProvider = {
        provideCommentingRanges(document: vscode.TextDocument) {
            const lineCount = document.lineCount;
            return [new vscode.Range(0, 0, lineCount - 1, 0)];
        }
    };
    context.subscriptions.push(controller);
    return controller;
}

/**
 * コメントコントローラを安全に破棄する。
 * - UI上の全スレッドが消え、入力ボックス等も閉じられます。
 * - 再度使う場合は createCommentController を呼び直してください。
 */
export function disposeCommentController(): void {
    try {
        controller?.dispose();
    } finally {
        controller = undefined;
    }
}

/**
 * index.json に保存されたスレッドを UI に復元し、review.jsonl のコメントも表示する。
 */
export async function restoreExistingThreads(codeReviewDir: string): Promise<void> {
    const commentController = getCommentController();
    if (!commentController) return;

    const indexPath = path.join(codeReviewDir, 'index.json');
    const reviewPath = path.join(codeReviewDir, 'review.jsonl');

    const indexData = await readIndexJson(indexPath);
    const jsonlRows = await readAllJsonl(reviewPath);

    // threadId ごとにコメントをまとめて seq 昇順に
    const byThread = new Map<string, typeof jsonlRows>();
    for (const r of jsonlRows) {
        if (!byThread.has(r.threadId)) byThread.set(r.threadId, []);
        byThread.get(r.threadId)!.push(r);
    }
    for (const [, list] of byThread) list.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

    for (const threadId of Object.keys(indexData.threads)) {
        const t = indexData.threads[threadId];
        try {
            const uri = vscode.Uri.parse(t.uri);
            const range = new vscode.Range(
                new vscode.Position(t.range.start.line, t.range.start.character),
                new vscode.Position(t.range.end.line, t.range.end.character)
            );
            const thread = commentController.createCommentThread(uri, range, []);
            threadIdMap.set(thread, threadId);
            // 再読み込み時は折りたたみ（閉じる）。状態も復元。
            thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
            const isClosed = t.state === 'closed';
            thread.state = isClosed ? vscode.CommentThreadState.Resolved : vscode.CommentThreadState.Unresolved;
            thread.contextValue = isClosed ? 'locore:resolved' : 'locore:unresolved';

            const rows = byThread.get(threadId) ?? [];
            thread.comments = rows.map((r) => ({
                author: { name: r.author },
                body: new vscode.MarkdownString(r.body),
                mode: vscode.CommentMode.Preview,
                contextValue: 'locore',
                timestamp: new Date(r.createdAt)
            } as vscode.Comment));
        } catch (e) {
            console.warn(`[LoCoRe] スレッド復元に失敗 threadId=${threadId}: ${e}`);
        }
    }
}

/**
 * index.json の state を open/closed に更新し、UI 側のスレッド状態も同期する。
 */
export async function setThreadState(thread: vscode.CommentThread, state: 'open' | 'closed', codeReviewDir: string): Promise<void> {
    if (!thread?.uri) throw new Error('無効なスレッド（URI が未定義）');

    const indexPath = path.join(codeReviewDir, 'index.json');
    const indexData = await readIndexJson(indexPath);

    // threadId を既存マップか index.json から解決。無ければ新規採番し登録。
    let threadId = threadIdMap.get(thread) || resolveThreadIdFromIndex(indexData, thread);
    const nowIso = new Date().toISOString();
    const uriStr = thread.uri.toString();
    const r = thread.range ?? new vscode.Range(0, 0, 0, 0);

    if (!threadId) {
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

    // 状態を更新して保存
    const t = indexData.threads[threadId];
    t.state = state;
    t.updatedAt = nowIso;
    await writeIndexJson(indexPath, indexData);

    // UI 側に反映
    const isClosed = state === 'closed';
    thread.state = isClosed ? vscode.CommentThreadState.Resolved : vscode.CommentThreadState.Unresolved;
    thread.contextValue = isClosed ? 'locore:resolved' : 'locore:unresolved';
}

/**
 * index.json から、与えられた UI スレッド（URI・Range）に一致する threadId を探す。
 */
export function resolveThreadIdFromIndex(indexData: IndexJsonSchemaV1, thread: vscode.CommentThread): string | undefined {
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
