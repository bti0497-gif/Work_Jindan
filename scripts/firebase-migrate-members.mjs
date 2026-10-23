import { loadEnv } from 'vite';
import { adminApi, project } from './firebase-admin-api.mjs';
import { loadLegacyMembers } from './legacy-members.mjs';
import { authPasswordForId, loginEmailForId } from '../src/services/firebaseIdentity.js';

const members = await loadLegacyMembers();
if (members.some(member => !member.person_id || !member.password)) throw new Error('Some legacy members have incomplete credentials. No migration was performed.');
console.log(`Found ${members.length} legacy members. Passwords were not printed.`);
if (!process.argv.includes('--migrate')) {
    console.log('Read-only check completed. Pass --migrate to create missing Firebase accounts/profiles. Existing accounts are never reset.');
    process.exit(0);
}
const api = adminApi();
const key = loadEnv('production', process.cwd(), '').VITE_FIREBASE_API_KEY;
const root = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const accounts = await api(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchGet?maxResults=1000`);
const byEmail = new Map((accounts.users || []).map(user => [user.email, user]));
const profiles = await api(`${root}/jindan_members?pageSize=1000`);
const profileIds = new Set((profiles.documents || []).map(document => document.name.split('/').pop()));
let created = 0;
let linked = 0;
const createdIds = new Set();
for (const member of members) {
    const email = await loginEmailForId(member.person_id);
    const credential = await authPasswordForId(member.person_id, member.password);
    let account = byEmail.get(email);
    if (!account) {
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: credential, returnSecureToken: true }),
        });
        account = await response.json();
        if (!response.ok) throw new Error(`Member creation failed: ${account.error?.message}. Previously completed accounts were preserved.`);
        created++;
        createdIds.add(member.person_id);
    }
    if (!profileIds.has(account.localId)) {
        const now = new Date().toISOString();
        const data = {
            uid: account.localId, person_id: member.person_id, name: member.name || member.person_id,
            email: member.email || '', position: member.position || '', department: member.department || '',
            userLevel: ['admin', 'master'].includes(member.role) || member.position === '관리자' ? 0 : 2,
            isActive: true, createdAt: member.createdAt || member.joinDate || now, updatedAt: now,
        };
        const fields = Object.fromEntries(Object.entries(data).map(([name, value]) => [name,
            typeof value === 'boolean' ? { booleanValue: value } : typeof value === 'number' ? { integerValue: String(value) } : { stringValue: value },
        ]));
        await api(`${root}/jindan_members/${account.localId}?currentDocument.exists=false`, 'PATCH', { fields });
        linked++;
    }
}
// 실제 기존 관리자 비밀번호를 출력하거나 변경하지 않고 로그인 호환성만 검증한다.
const admin = members.find(member => member.person_id === 'admin');
if (admin && createdIds.has(admin.person_id)) {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: await loginEmailForId(admin.person_id), password: await authPasswordForId(admin.person_id, admin.password), returnSecureToken: true }),
    });
    if (!response.ok) throw new Error('Existing admin login check failed. No existing password was reset.');
    console.log('Existing admin ID/password compatibility verified.');
}
console.log(`Migration complete: ${created} accounts created, ${linked} profiles linked. Existing credentials were preserved; no plaintext password was written to Firestore.`);
