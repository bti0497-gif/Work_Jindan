const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createReportAiService } = require('../report-ai.cjs');
const fixtureKey = 'sk-synthetic-openai-key-for-test';
const defaultModel = 'gpt-6.1-terra';
function setup(t, overrides = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jindan-report-ai-'));
    t.after(() => {
        assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(root).startsWith('jindan-report-ai-'));
        fs.rmSync(root, { recursive: true, force: true });
    });
    const envFile = path.join(root, '.env.local');
    fs.writeFileSync(envFile, `OPENAI_API_KEY="${fixtureKey}"\n`);
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
const reply = (content, status = 'completed') => ({ ok: true, text: async () => JSON.stringify({
    status,output:[{type:'reasoning',summary:[{text:'private reasoning is not part of the report'}]},{type:'message',content:[{type:'output_text',text:JSON.stringify(content)}]}],
    usage: { input_tokens: 12, output_tokens: 30 },
}) });
const interpretation = { notes: { diagnosis: '전압 230 V 측정. 기준 확인 필요.', conclusion: '담당자 검토 필요', improvements: '' }, evidenceFieldIds: ['measurement-1'], questions: ['적용 기준은 무엇인가요?'] };

test('API settings keep keys in the main process and encrypted storage, with no API call on startup', t => {
    let calls = 0;
    const { root, service } = setup(t, { fetchImpl: () => { calls++; } });
    assert.deepEqual(service.status(), { configured: true, model: defaultModel, keySource: 'environment', provider: 'openai' });
    const saved = service.configure({ model: defaultModel, apiKey: 'sk-synthetic-new-openai-key' });
    assert.equal(saved.keySource, 'environment');
    assert.equal(JSON.stringify(saved).includes('synthetic-new'), false);
    assert.equal(fs.readFileSync(path.join(root, 'report-ai-settings.json'), 'utf8').includes('synthetic-new'), false);
    assert.equal(calls, 0);
    assert.throws(() => service.configure({ model: '../../secret' }), /모델/);
    assert.throws(() => service.configure({ model: defaultModel, apiKey: {} }), /키 형식/);
    fs.writeFileSync(path.join(root,'.env.local'),'');assert.equal(service.status().keySource,'stored');
});
test('model verification sends only an authorization header, without report text or a key in the URL', async t => {
    const { service } = setup(t, { fetchImpl: async (url, options) => {
        assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
        assert.equal(url,'https://api.openai.com/v1/models');assert.ok(!url.includes(fixtureKey)); assert.equal(options.headers.Authorization, `Bearer ${fixtureKey}`);
        assert.equal(options.redirect, 'error');
        return { ok: true, text: async () => JSON.stringify({ data: [
            { id: defaultModel },
            { id: 'text-embedding-3-small' },{id:'gpt-image-1'},{id:'gpt-4o-audio-preview'},
        ] }) };
    } });
    assert.deepEqual(await service.listModels(), [{ id: defaultModel, label: defaultModel }]);
});
test('report requests produce a structured draft, bind trusted identity and reuse identical work', async t => {
    let calls = 0;
    const { service } = setup(t, { fetchImpl: async (url, options) => {
        calls++;
        const body = JSON.parse(options.body);
        assert.equal(url,'https://api.openai.com/v1/responses');
        assert.equal(body.model,defaultModel);assert.equal(body.store,false);
        assert.equal(body.text.format.type, 'json_schema');assert.equal(body.text.format.strict,true);
        assert.equal(body.text.format.schema.properties.notes.type, 'object');
        assert.equal(body.input[0].content[0].type,'input_text');
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
        const schema=JSON.parse(options.body).text.format.schema;assert.ok(schema.properties.fields);
        const strict=node=>{if(node.type==='object'){assert.deepEqual([...node.required].sort(),Object.keys(node.properties).sort());assert.equal(node.additionalProperties,false);for(const child of Object.values(node.properties))strict(child);}if(node.items)strict(node.items);};strict(schema);
        assert.deepEqual(schema.properties.fields.items.properties.slotId.type,['string','null']);
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
        if (calls === 2) return reply(interpretation, 'incomplete');
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

test('legacy provider settings lose their old encrypted key without decrypting or sending it',t=>{
    let decryptions=0,calls=0;
    const {root,service}=setup(t,{safeStorage:{isEncryptionAvailable:()=>true,decryptString:()=>{decryptions++;throw new Error('legacy key must not be read');}},fetchImpl:()=>{calls++;throw new Error('must not fetch');}});
    const file=path.join(root,'report-ai-settings.json');
    fs.writeFileSync(file,JSON.stringify({model:'gemini-2.5-flash',encryptedApiKey:Buffer.from('synthetic-legacy-provider-key').toString('base64')}));
    assert.equal(service.status().provider,'openai');assert.equal(service.status().model,defaultModel);assert.equal(decryptions,0);assert.equal(calls,0);
    const migrated=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(migrated.encryptedApiKey,undefined);assert.equal(migrated.provider,'openai');assert.ok(!fs.readFileSync(file,'utf8').includes('gemini'));
});

test('adding an OpenAI key to the local env file after startup enables the configured Terra model without a live call',async t=>{
    let calls=0;const {root,service}=setup(t,{fetchImpl:async(_,options)=>{calls++;assert.equal(options.headers.Authorization,`Bearer ${fixtureKey}`);assert.equal(JSON.parse(options.body).model,defaultModel);return reply(interpretation);}});
    const file=path.join(root,'.env.local');fs.writeFileSync(file,`GEMINI_API_KEY=synthetic-legacy-key\nOPENAI_API_KEY=\nOPENAI_MODEL=${defaultModel}\n`);
    assert.equal(service.status().configured,false);assert.equal(calls,0);
    fs.writeFileSync(file,`OPENAI_API_KEY='${fixtureKey}'\nOPENAI_MODEL=${defaultModel}\n`);
    assert.equal(service.status().configured,true);assert.equal(service.status().keySource,'environment');assert.equal(calls,0);
    assert.equal((await service.execute(request())).model,defaultModel);assert.equal(calls,1);
});

test('collection, refusal and failed Responses output are handled without exposing internal reasoning or caching failures',async t=>{
    let calls=0;const {service}=setup(t,{fetchImpl:async(_,options)=>{
        calls++;const body=JSON.parse(options.body);assert.ok(body.text.format.schema.properties.cells);
        if(calls===1)return {ok:true,text:async()=>JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:fixtureKey}]}]})};
        if(calls===2)return reply({},'failed');
        return reply({cells:[{fieldId:'f1',evidenceId:'e1',value:'12'}],questions:[]});
    }});
    const input={...request('jindan-collection-request'),source:{contentHash:'c'.repeat(64)}};
    await assert.rejects(service.execute(input),error=>error.message.includes('OpenAI')&&!error.message.includes(fixtureKey));await assert.rejects(service.execute(input),/완성하지 못/);
    const result=await service.execute(input);assert.equal(result.cacheHit,false);assert.equal(result.response.captureHash,input.source.contentHash);assert.equal(result.response.kind,'jindan-collection-result');assert.equal(result.response.cells[0].value,'12');
});

test('renderer blocks old provider IPC before sending a new OpenAI key or report request',async t=>{
    const previous=global.window;t.after(()=>{if(previous===undefined)delete global.window;else global.window=previous;});
    const calls=[];global.window={electron:{invoke:async(channel,data)=>{calls.push({channel,data});return {provider:'gemini',configured:true};}}};
    const client=await import('../src/services/report/reportAiClient.js');
    await assert.rejects(client.configureReportAi({model:defaultModel,apiKey:fixtureKey}),/다시 실행/);
    await assert.rejects(client.listReportAiModels(),/다시 실행/);await assert.rejects(client.startReportAi(request()).result,/다시 실행/);
    assert.ok(calls.every(item=>item.channel==='report-ai-status'&&item.data===undefined));
});
