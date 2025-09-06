import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { generateUuid } from './utils';
import {
    appendJsonl,
    initializeReviewStores,
    readIndexJson,
    writeIndexJson
} from './review-store';
import { threadIdMap, resolveThreadIdFromIndex } from './comment-controller';

/**
 * スレッドの新規作成（最初のコメント）と既存スレッドへの返信を統合した保存処理。
 * - 必要に応じて threadId を採番し index.json を作成
 * - JSONL(review.jsonl) にコメント1件を append
 * - index.json の統計値と lastSeq を更新
 * - UI のスレッドにコメントを追加
 */
export async function upsertReview(reply: vscode.CommentReply): Promise<void> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('ワークスペースが開かれていません。');
        return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const codeReviewDir = path.join(workspaceRoot, '.codereview');
    const indexPath = path.join(codeReviewDir, 'index.json');
    const reviewPath = path.join(codeReviewDir, 'review.jsonl');

    // ストアを準備
    await initializeReviewStores(codeReviewDir);

    const thread = reply.thread;
    const uriStr = thread.uri.toString();
    const range = thread.range ?? new vscode.Range(0, 0, 0, 0);
    const nowIso = new Date().toISOString();

    // index を読み込み、threadId を解決 or 採番
    const indexData = await readIndexJson(indexPath);
    let threadId = threadIdMap.get(thread) || resolveThreadIdFromIndex(indexData, thread);
    const isNewThread = !threadId;
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
        if (!indexData.byUri[uriStr]) indexData.byUri[uriStr] = [];
        if (!indexData.byUri[uriStr].includes(threadId)) indexData.byUri[uriStr].push(threadId);
    }

    // 次の seq を採番（グローバル単調増加）
    const nextSeq = (indexData.lastSeq || 0) + 1;

    // コメントID/著者/本文を作成
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

    // UI へもコメント追加
    const newComment: vscode.Comment = {
        author: { name: author },
        body: new vscode.MarkdownString(body),
        mode: vscode.CommentMode.Preview,
        contextValue: 'locore',
        timestamp: new Date(nowIso)
    } as vscode.Comment;
    thread.comments = [...thread.comments, newComment];
    // 入力ボックスのメニュー出し分け用に contextValue を設定
    thread.contextValue = 'locore:unresolved';

    vscode.window.showInformationMessage(isNewThread ? 'レビューを作成しました。' : '返信を追加しました。');
}

