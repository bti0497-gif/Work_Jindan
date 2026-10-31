const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createDriveAuth } = require('../drive-auth.cjs');
const safeStorage = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from('encrypted:' + text), decryptString: bytes => bytes.toString().slice(10) };
function fixture(run) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jindan-drive-auth-'));
    return Promise.resolve().then(() => run(directory)).finally(() => {
        assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith('jindan-drive-auth-'));
        fs.rmSync(directory, { recursive: true, force: true });
    });
}
const settings = { clientId: 'fixture-client-id', clientSecret: 'fixture-client-secret', refreshToken: 'fixture-refresh-token' };
test('Drive credentials use encrypted local settings; status exposes no credentials and missing settings never send OAuth requests', () => fixture(async directory => {
    let calls = 0;
    const service = createDriveAuth({ userDataPath: directory, safeStorage, env: {}, fetchImpl: async () => { calls++; } });
    assert.equal(service.status().configured, false); await assert.rejects(service.getToken(), /설정되지/); assert.equal(calls, 0);
    service.configure(settings); assert.deepEqual(service.status(), { configured: true, storage: 'encrypted-local' });
    const stored = fs.readFileSync(path.join(directory, 'drive-connection.json'), 'utf8');
    assert.ok(!stored.includes(settings.clientSecret) && !stored.includes(settings.refreshToken));
    assert.equal(createDriveAuth({ userDataPath: directory, safeStorage, env: {} }).status().configured, true);
}));
test('Drive token refresh is shared, reused until expiry and forced after a rejected access token', () => fixture(async directory => {
    let calls = 0, time = 0;
    const service = createDriveAuth({ userDataPath: directory, safeStorage, env: {}, now: () => time,
        fetchImpl: async (url, options) => { calls++; assert.equal(url, 'https://oauth2.googleapis.com/token'); assert.equal(options.body.get('refresh_token'), settings.refreshToken); await new Promise(r=>setTimeout(r,5)); return {ok:true,status:200,json:async()=>({access_token:'fixture-access-'+calls,expires_in:3600})}; } });
    service.configure(settings);
    assert.deepEqual(await Promise.all([service.getToken(),service.getToken()]),['fixture-access-1','fixture-access-1']);assert.equal(calls,1);
    assert.equal(await service.getToken(),'fixture-access-1');assert.equal(calls,1);
    assert.equal(await service.getToken({force:true}),'fixture-access-2');time=3600000;assert.equal(await service.getToken(),'fixture-access-3');
}));
test('OAuth failures never echo provider payloads or credentials, and rejected requests can be retried', () => fixture(async directory => {
    let calls = 0;
    const service = createDriveAuth({ userDataPath: directory, safeStorage, env: {}, fetchImpl: async () => { calls++;return {ok:false,status:400,json:async()=>({error:'invalid_grant',error_description:settings.refreshToken})}; } });
    service.configure(settings);
    for(let i=0;i<2;i++)await assert.rejects(service.getToken(), error => /再接続|再連結|재연결/.test(error.message) && !error.message.includes(settings.refreshToken));
    assert.equal(calls,2);
    const unavailable=createDriveAuth({userDataPath:path.join(directory,'unavailable'),safeStorage:{isEncryptionAvailable:()=>false},env:{}});
    assert.throws(()=>unavailable.configure(settings),/저장/);
}));
