import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  appendJsonl,
  initializeIndexJson,
  initializeJsonlLog,
  readAllJsonl,
  readIndexJson,
  writeIndexJson,
  IndexJsonSchemaV1
} from '../review-store';

function tmpDir(): string {
  // ワークスペース直下に一時ディレクトリを作る
  const dir = path.join(process.cwd(), '.tmp-tests', String(Date.now()) + '-' + Math.random().toString(16).slice(2));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function run(): Promise<void> {
  const dir = tmpDir();
  const indexPath = path.join(dir, 'index.json');
  const reviewPath = path.join(dir, 'review.jsonl');

  // index.json 初期化→読み込み
  await initializeIndexJson(indexPath);
  const idx1 = await readIndexJson(indexPath);
  assert.strictEqual(idx1.version, 1, 'index.json: versionが1ではありません');
  assert.strictEqual(typeof idx1.lastSeq, 'number');
  assert.ok(idx1.threads && idx1.byUri, 'index.json: 既定スキーマが不足');

  // writeIndexJson → 読み直し
  const next: IndexJsonSchemaV1 = {
    version: 1,
    lastSeq: 10,
    threads: {},
    byUri: { 'file:///a.ts': [] }
  };
  await writeIndexJson(indexPath, next);
  const idx2 = await readIndexJson(indexPath);
  assert.strictEqual(idx2.lastSeq, 10, 'index.json: lastSeqが反映されていません');
  assert.deepStrictEqual(idx2.byUri['file:///a.ts'], [], 'index.json: byUriが一致しません');

  // review.jsonl: 初期化→append→読み込み
  await initializeJsonlLog(reviewPath);
  await appendJsonl(reviewPath, { threadId: 't1', commentId: 'c1', seq: 1, createdAt: new Date().toISOString(), author: 'u', body: 'hello' });
  // 壊れた行を混ぜる
  await fs.promises.appendFile(reviewPath, '{broken json}\n', 'utf8');
  await appendJsonl(reviewPath, { threadId: 't1', commentId: 'c2', seq: 2, createdAt: new Date().toISOString(), author: 'u', body: 'world' });

  const rows = await readAllJsonl(reviewPath);
  assert.strictEqual(rows.length, 2, 'review.jsonl: 行数が一致しません（壊れた行は除外されるべき）');
  assert.strictEqual(rows[0].threadId, 't1');
  assert.strictEqual(rows[1].commentId, 'c2');
}
