import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';

const env = loadEnv('production', process.cwd(), '');
const allowSharedDriveOAuth = process.argv.includes('--allow-shared-drive-oauth');
const sharedDriveNames = new Set([
    'GOOGLE_CLIENT_SECRET', 'VITE_GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN', 'VITE_GOOGLE_REFRESH_TOKEN'
]);
const secretNames = [
    'GOOGLE_CLIENT_SECRET', 'VITE_GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN', 'VITE_GOOGLE_REFRESH_TOKEN',
    'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY',
    'GEMINI_API_KEY', 'VITE_GEMINI_API_KEY'
].filter(name => env[name]);
const output = path.resolve('dist');
if (!fs.existsSync(output)) {
    console.error('Release check failed: build the app before checking its output.');
    process.exitCode = 1;
} else {
    const findings = new Set();
    const visit = directory => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(file);
            else if (/\.(js|html|css|map)$/.test(entry.name)) {
                const content = fs.readFileSync(file, 'utf8');
                for (const name of secretNames) {
                    if (content.includes(env[name]) || content.includes(JSON.stringify(env[name]).slice(1, -1))) findings.add(name);
                }
            }
        }
    };
    visit(output);
    const blocked = [...findings].filter(name => !allowSharedDriveOAuth || !sharedDriveNames.has(name));
    const accepted = [...findings].filter(name => allowSharedDriveOAuth && sharedDriveNames.has(name));
    if (accepted.length) {
        console.warn(`Explicit shared Drive OAuth distribution exception: ${accepted.join(', ')}.`);
        console.warn('These values remain extractable from the installer. Other credential checks remain enforced.');
    }
    if (blocked.length) {
        console.error(`Release blocked: credentials are embedded in client files (${blocked.join(', ')}).`);
        console.error('Keep credentials on a backend or use user-specific sign-in before publishing. Secret values were not printed.');
        process.exitCode = 1;
    } else {
        console.log(accepted.length ? 'Release credential check passed with the explicit shared Drive OAuth exception.' : 'Release secret check passed for configured credential values.');
    }
}
