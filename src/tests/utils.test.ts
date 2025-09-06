import * as assert from 'assert';
import { generateUuid } from '../utils';

export async function run(): Promise<void> {
    // 形式: 8-4-4-4-12 のハイフン区切り
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
        const id = generateUuid();
        assert(pattern.test(id), `UUID形式が不正: ${id}`);
        assert(!ids.has(id), 'UUIDが重複しています');
        ids.add(id);
    }
}
