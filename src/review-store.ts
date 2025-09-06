import * as fs from 'fs';
import * as path from 'path';

/**
 * スレッドの索引情報（index.json に保存）
 * - どのファイル（uri）のどの範囲（range）にスレッドがあるか
 * - スレッドの状態（open/closed）やコメント件数等のメタ情報
 */
export interface IndexThreadEntry {
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

/**
 * index.json 全体スキーマ（version:1）。
 */
export interface IndexJsonSchemaV1 {
    version: 1;
    lastSeq: number;
    threads: { [threadId: string]: IndexThreadEntry };
    byUri: { [uri: string]: string[] };
}

/**
 * review.jsonl の1行（append-only ログ）。
 * - コメント本文は JSON Lines 形式で蓄積。
 */
export interface ReviewLogRow {
    threadId: string;
    commentId: string;
    seq: number;
    createdAt: string;
    author: string;
    body: string;
}

/**
 * index.json を読み込み、必要であれば既定スキーマに整える。
 * 壊れている・存在しない場合は既定値を返す。
 */
export async function readIndexJson(indexPath: string): Promise<IndexJsonSchemaV1> {
    try {
        const buf = await fs.promises.readFile(indexPath, 'utf8');
        const parsed = JSON.parse(buf);
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('index.json 不正');
        }
        if (!('version' in parsed)) {
            return { version: 1, lastSeq: 0, threads: {}, byUri: {} };
        }
        return parsed as IndexJsonSchemaV1;
    } catch {
        return { version: 1, lastSeq: 0, threads: {}, byUri: {} };
    }
}

/**
 * index.json を保存（整形して末尾改行付き）。
 */
export async function writeIndexJson(indexPath: string, data: IndexJsonSchemaV1): Promise<void> {
    await fs.promises.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.promises.writeFile(indexPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * review.jsonl に1行追記（append-only）。
 */
export async function appendJsonl(reviewPath: string, row: Record<string, any>): Promise<void> {
    const line = JSON.stringify(row);
    await fs.promises.mkdir(path.dirname(reviewPath), { recursive: true });
    await fs.promises.appendFile(reviewPath, line + '\n', 'utf8');
}

/**
 * review.jsonl 全行を読み込み、パースできた行のみ返す。
 * 壊れた行は読み飛ばす。
 */
export async function readAllJsonl(reviewPath: string): Promise<ReviewLogRow[]> {
    try {
        const buf = await fs.promises.readFile(reviewPath, 'utf8');
        const rows: ReviewLogRow[] = [];
        for (const raw of buf.split(/\r?\n/)) {
            const line = raw.trim();
            if (!line) continue;
            try {
                const obj = JSON.parse(line);
                if (obj && typeof obj.threadId === 'string') {
                    rows.push(obj as ReviewLogRow);
                }
            } catch {
                // ignore broken line
            }
        }
        return rows;
    } catch {
        return [];
    }
}

/**
 * ストアの存在確保：index.json / review.jsonl を初期化。
 */
export async function initializeReviewStores(codeReviewDir: string): Promise<void> {
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
 * index.json を既定スキーマで初期化（存在しない・壊れている場合）。
 */
export async function initializeIndexJson(indexPath: string): Promise<void> {
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
            await fs.promises.writeFile(indexPath, JSON.stringify(defaultIndex, null, 2) + '\n', 'utf8');
        }
    } catch {
        await fs.promises.writeFile(indexPath, JSON.stringify(defaultIndex, null, 2) + '\n', 'utf8');
    }
}

/**
 * review.jsonl を空で作成（存在確保）。
 */
export async function initializeJsonlLog(reviewPath: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(reviewPath), { recursive: true });
    const handle = await fs.promises.open(reviewPath, 'a');
    await handle.close();
}

