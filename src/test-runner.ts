/*
 * 依存不要の簡易テストランナー
 * - 各テストモジュールは `export async function run()` を実装
 * - 本ランナーが順に実行し、例外があればNGとして終了コード1で落とします
 */
import * as path from 'path';

type TestModule = { run: () => Promise<void> };

async function runOne(name: string, loader: () => Promise<TestModule>) {
    const start = Date.now();
    try {
        const mod = await loader();
        await mod.run();
        const ms = Date.now() - start;
        console.log(`✓ ${name} (${ms}ms)`);
    } catch (e: any) {
        console.error(`✗ ${name}:`, e?.stack ?? e);
        throw e;
    }
}

async function main() {
    const tests: Array<[string, () => Promise<TestModule>]> = [
        ['utils.test', () => import(path.join(__dirname, 'tests', 'utils.test.js')) as unknown as Promise<TestModule>],
        ['review-store.test', () => import(path.join(__dirname, 'tests', 'review-store.test.js')) as unknown as Promise<TestModule>],
    ];
    let failed = 0;
    for (const [name, loader] of tests) {
        try {
            await runOne(name, loader);
        } catch {
            failed++;
        }
    }
    if (failed > 0) {
        console.error(`Tests failed: ${failed}`);
        process.exit(1);
    } else {
        console.log('All tests passed');
    }
}

main();
