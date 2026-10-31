import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function findRepo(explicit) {
    const starts = explicit ? [path.resolve(explicit)] : [process.cwd(), path.dirname(await fs.realpath(fileURLToPath(import.meta.url)))];
    for (let current of starts) {
        for (;;) {
            try { await fs.access(path.join(current, 'src/services/report/referenceAnalyzer.js')); return current; } catch {}
            if (explicit) break;
            const parent = path.dirname(current); if (parent === current) break; current = parent;
        }
    }
    throw new Error('앱 저장소를 찾을 수 없습니다. --repo로 기술진단팀 협업스튜디오 저장소를 지정하세요.');
}
export const fromRepo = (repo, file) => import(pathToFileURL(path.join(repo, file)).href);
export const samePath = (left, right) => process.platform === 'win32' ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase() : path.resolve(left) === path.resolve(right);
export async function sameFile(left, right) {
    const resolved = await Promise.all([left, right].map(file => fs.realpath(file).catch(() => path.resolve(file))));
    return samePath(...resolved);
}
export async function writeJson(file, value) {
    await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true });
    await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}
