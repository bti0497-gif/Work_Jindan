import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [applicationArg, harnessArg, outputArg] = process.argv.slice(2);
const application = path.resolve(applicationArg ?? '');
const harness = path.resolve(harnessArg ?? '');
const output = path.resolve(outputArg ?? '');
const inside = (child, parent) => child.startsWith(parent + path.sep);
if (!applicationArg || !harnessArg || !outputArg || !inside(application, path.join(root, 'artifacts', 'ready-for-review')) || !inside(harness, path.join(root, 'artifacts')) || !inside(output, path.join(root, 'artifacts')) || inside(output, application) || fs.existsSync(output) || fs.existsSync(output + '.COMMAND.json')) throw Error('Exact owned package, harness and fresh output required.');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const runtime = path.join(application, '.runtime', 'dotnet.exe');
const manifest = path.join(path.dirname(application), 'artifact-manifest.json');
const before = hash(manifest);
const args = [harness, '--package', application, '--output', output, '--require-packaged-bytes', '--remaining70-only'];
const startedAt = new Date().toISOString(); let stdout = '', stderr = '', overflow = false;
const processHandle = spawn(runtime, args, { cwd: root, windowsHide: false, env: { ...process.env, DOTNET_ROOT: path.join(application, '.runtime'), DOTNET_ROOT_X64: path.join(application, '.runtime'), DOTNET_MULTILEVEL_LOOKUP: '0', DOTNET_GENERATE_ASPNET_CERTIFICATE: 'false', DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
processHandle.stdout.on('data', chunk => { if (stdout.length < 8 * 1024 * 1024) stdout += chunk.toString('utf8'); else overflow = true; });
processHandle.stderr.on('data', chunk => { if (stderr.length < 8 * 1024 * 1024) stderr += chunk.toString('utf8'); else overflow = true; });
const exit = await new Promise((resolve, reject) => { processHandle.once('error', reject); processHandle.once('close', resolve); });
fs.writeFileSync(output + '.stdout.log', stdout, { flag: 'wx' }); fs.writeFileSync(output + '.stderr.log', stderr, { flag: 'wx' });
const resultPath = path.join(output, 'ui-result.json'), reopenPath = path.join(output, 'remaining70-reopen-result.json');
const read = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
const first = read(resultPath), fresh = read(reopenPath);
const checks = {
  exitZero: exit === 0, boundedOutput: !overflow, manifestFileUnchanged: before === hash(manifest),
  mainExactNine: first?.phase === 'remaining70' && first?.pass === 9 && first?.fail === 0 && first?.freshProcessExitCode === 0,
  freshExactTwo: fresh?.phase === 'remaining70-reopen' && fresh?.pass === 2 && fresh?.fail === 0,
  mainCommonEight: first?.samples.filter(s => s.name === 'exact packaged assembly').length === 8,
  freshCommonEight: fresh?.samples.filter(s => s.name === 'exact packaged assembly').length === 8,
  mainModulesThree: first?.samples.filter(s => s.name === 'remaining70 exact module binding').length === 3,
  exactFilesModule: first?.samples.some(s => s.name === 'remaining70 exact Files source module') === true,
  exactCadWorker: first?.samples.some(s => s.name === 'remaining70 exact local CAD worker binding') === true,
  dynamicDriveSurface: first?.samples.some(s => s.name === 'remaining70 dynamic Drive cache toolbar' && s.visibleRows > 0 && s.liveDriveConnected === false) === true,
  dashboardInspectorBound: first?.samples.some(s => s.name === 'remaining70 current Dashboard inspector binding' && s.inspectorContainsId && s.rawRtfHidden) === true,
  stripViewportNavigation: first?.samples.some(s => s.name === 'remaining70 loaded strip viewport navigation' && s.loadedTiles === 8 && s.firstAndLastScrolledIntoView && !s.allEightSimultaneouslyVisibleClaim) === true,
  noApproval: first?.reportReady === false && first?.supervisorAccepted === false && fresh?.reportReady === false && fresh?.supervisorAccepted === false,
};
const receipt = { schema: 'owned-remaining70-ui/1', command: [runtime, ...args], launchOptions: { windowsHide: false }, startedAt, endedAt: new Date().toISOString(), pid: processHandle.pid, exit, checks, passed: Object.values(checks).every(Boolean), runtimeSha256: hash(runtime), harnessSha256: hash(harness), artifactManifestSha256: before, results: [resultPath, reopenPath].filter(fs.existsSync).map(file => ({ path: file, sha256: hash(file) })), stdoutSha256: hash(output + '.stdout.log'), stderrSha256: hash(output + '.stderr.log'), captureReviewPending: true, reportReady: false, supervisorAccepted: false };
fs.writeFileSync(output + '.COMMAND.json', JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(stdout.slice(-12000)); if (stderr) console.log(stderr.slice(-3000)); console.log(JSON.stringify(receipt));
process.exitCode = receipt.passed ? 0 : 1;
