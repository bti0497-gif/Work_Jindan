const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createReportAiService } = require('../report-ai.cjs');
const fixtureKey = 'synthetic-gemini-key-for-test';
function setup(t, overrides = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jindan-report-ai-'));
    t.after(() => {
        assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(root).startsWith('jindan-report-ai-'));
        fs.rmSync(root, { recursive: true, force: true });
    });
    const envFile = path.join(root, '.env.local');
    fs.writeFileSync(envFile, `GEMINI_API_KEY="${fixtureKey}"\n`);
    const safeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: value => Buffer.from([...Buffer.from(value)].map(n => n ^ 0x37)),
        decryptString: bytes => Buffer.from([...bytes].map(n => n ^ 0x37)).toString(),
    };
    return { root, service: createReportAiService({ userDataPath: root, envFile, env: {}, safeStorage, ...overrides }) };
}
const request = (kind = 'jindan-interpretation-request') => ({
    kind, version: 1, projectId: 'test-project', sourceSha256: 'a'.repeat(64), schemaRevision: 2, inputFingerprint: 'b'.repeat(64),
    data: [{ value: '230', unit: 'V' }], responseContract: { notes: {}, evidenceFieldIds: [], questions: [] },
});
const reply = (content, finishReason = 'STOP') => ({ ok: true, text: async () => JSON.stringify({
    candidates: [{ finishReason, content: { parts: [{ thought: true, text: 'private reasoning is not part of the report' }, { text: JSON.stringify(content) }] } }],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 30 },
}) });
const interpretation = { notes: { diagnosis: '전압 230 V 측정. 기준 확인 필요.', conclusion: '담당자 검토 필요', improvements: '' }, evidenceFieldIds: ['measurement-1'], questions: ['적용 기준은 무엇인가요?'] };

test('API settings keep keys in the main process and encrypted storage, with no API call on startup', t => {
    let calls = 0;
    const { root, service } = setup(t, { fetchImpl: () => { calls++; } });
    assert.deepEqual(service.status(), { configured: true, model: 'gemini-2.5-flash', keySource: 'environment', provider: 'gemini' });
    const saved = service.configure({ model: 'gemini-2.5-flash', apiKey: 'synthetic-new-gemini-key' });
    assert.equal(saved.keySource, 'stored');
    assert.equal(JSON.stringify(saved).includes('synthetic-new'), false);
    assert.equal(fs.readFileSync(path.join(root, 'report-ai-settings.json'), 'utf8').includes('synthetic-new'), false);
    assert.equal(calls, 0);
    assert.throws(() => service.configure({ model: '../../secret' }), /모델/);
    assert.throws(() => service.configure({ model: 'gemini-2.5-flash', apiKey: {} }), /키 형식/);
});
test('model verification sends only an authorization header, without report text or a key in the URL', async t => {
    const { service } = setup(t, { fetchImpl: async (url, options) => {
        assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
        assert.ok(!url.includes(fixtureKey)); assert.equal(options.headers['x-goog-api-key'], fixtureKey);
        assert.equal(options.redirect, 'error');
        return { ok: true, text: async () => JSON.stringify({ models: [
            { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/text-embedding-1', supportedGenerationMethods: ['embedContent'] },
        ] }) };
    } });
    assert.deepEqual(await service.listModels(), [{ id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' }]);
});
test('report requests produce a structured draft, bind trusted identity and reuse identical work', async t => {
    let calls = 0;
    const { service } = setup(t, { fetchImpl: async (url, options) => {
        calls++;
        const body = JSON.parse(options.body);
        assert.ok(url.endsWith('/models/gemini-2.5-flash:generateContent'));
        assert.equal(body.generationConfig.responseMimeType, 'application/json');
        assert.equal(body.generationConfig.responseJsonSchema.properties.notes.type, 'object');
        assert.equal(options.body.includes(fixtureKey), false);
        return reply({ ...interpretation, projectId: 'wrong-project', sourceSha256: 'fake' });
    } });
    const input = request();
    const [first, shared] = await Promise.all([service.execute(input), service.execute(input)]);
    assert.equal(calls, 1);
    assert.deepEqual(first, shared);
    assert.equal(first.response.projectId, input.projectId);
    assert.equal(first.response.sourceSha256, input.sourceSha256);
    assert.equal(first.response.schemaRevision, 2);
    assert.deepEqual(first.response.notes, interpretation.notes);
    assert.equal(first.usage.inputTokens, 12);
    assert.equal((await service.execute(input)).cacheHit, true);
    assert.equal(calls, 1);
    await service.execute({ ...input, data: [{ value: '240', unit: 'V' }] });
    assert.equal(calls, 2);
});
test('analysis uses its schema and returns only field proposals, questions and table requests', async t => {
    const { service } = setup(t, { fetchImpl: async (_, options) => {
        assert.ok(JSON.parse(options.body).generationConfig.responseJsonSchema.properties.fields);
        return reply({ fields: [], questions: ['측정 기간 확인'], needsTableIds: ['table-1'], notes: interpretation.notes });
    } });
    const result = await service.execute(request('jindan-analysis-request'));
    assert.equal(result.response.kind, 'jindan-analysis');
    assert.equal(result.response.notes, undefined);
    assert.deepEqual(result.response.needsTableIds, ['table-1']);
});
test('authentication/quota errors, truncated output and missing credentials never become a successful cached draft', async t => {
    let calls = 0;
    const { service } = setup(t, { fetchImpl: async () => {
        calls++;
        if (calls === 1) return { ok: false, status: 429, text: async () => fixtureKey };
        if (calls === 2) return reply(interpretation, 'MAX_TOKENS');
        return reply(interpretation);
    } });
    await assert.rejects(service.execute(request()), error => error.message.includes('한도') && !error.message.includes(fixtureKey));
    assert.equal(calls, 1, 'No automatic retry and no extra charge');
    await assert.rejects(service.execute(request()), /끊겼습니다/);
    assert.equal((await service.execute(request())).cacheHit, false);
    assert.equal(calls, 3);
    await assert.rejects(service.execute({ ...request(), kind: 'unknown' }), /요청 형식/);
    const noKey = createReportAiService({ userDataPath: path.join(os.tmpdir(), 'jindan-no-key-test'), env: {}, fetchImpl: () => { throw new Error('must not fetch'); } });
    await assert.rejects(noKey.execute(request()), /API 키/);
});
test('cancellation aborts the request and timeout reports a retryable failure without exposing transport details', async t => {
    const neverFinish = async (_, options) => new Promise((resolve, reject) => {
        const abort = () => reject(new Error('transport detail must not escape'));
        if (options.signal.aborted) abort(); else options.signal.addEventListener('abort', abort, { once: true });
    });
    const { service } = setup(t, { fetchImpl: neverFinish, timeoutMs: 20 });
    const controller = new AbortController();
    const pending = service.execute(request(), controller.signal);
    controller.abort();
    await assert.rejects(pending, /취소/);
    await assert.rejects(service.execute(request()), /시간이 초과/);
});
