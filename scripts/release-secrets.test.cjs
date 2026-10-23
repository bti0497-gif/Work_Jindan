const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('release check requires an explicit Drive exception and still blocks other credentials', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jindan-release-check-'));
    const script = path.resolve('scripts/check-release-secrets.mjs');
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^(?:VITE_)?(?:GOOGLE_|SUPABASE_|GEMINI_)/.test(key)) delete env[key];
    try {
        await fs.mkdir(path.join(directory, 'dist'));
        const writeFixture = async other => {
            await fs.writeFile(path.join(directory, '.env.local'), 'GOOGLE_CLIENT_SECRET=synthetic-client\nGOOGLE_REFRESH_TOKEN=synthetic-refresh\n' + (other ? 'SUPABASE_SERVICE_ROLE_KEY=synthetic-service\n' : ''));
            await fs.writeFile(path.join(directory, 'dist', 'app.js'), '"synthetic-client";"synthetic-refresh";' + (other ? '"synthetic-service";' : ''));
        };
        const run = flag => spawnSync(process.execPath, [script, ...(flag ? ['--allow-shared-drive-oauth'] : [])], { cwd: directory, env, encoding: 'utf8' });
        await writeFixture(false);
        assert.equal(run(false).status, 1);
        const accepted = run(true);
        assert.equal(accepted.status, 0);
        assert.match(accepted.stderr, /Explicit shared Drive OAuth distribution exception/);
        assert.equal((accepted.stdout + accepted.stderr).includes('synthetic-client'), false);
        assert.equal((accepted.stdout + accepted.stderr).includes('synthetic-refresh'), false);
        await writeFixture(true);
        const blocked = run(true);
        assert.equal(blocked.status, 1);
        assert.match(blocked.stderr, /SUPABASE_SERVICE_ROLE_KEY/);
        assert.equal((blocked.stdout + blocked.stderr).includes('synthetic-service'), false);
    } finally {
        assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith('jindan-release-check-'));
        await fs.rm(directory, { recursive: true, force: true });
    }
});
