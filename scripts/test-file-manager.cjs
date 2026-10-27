// Run with: node scripts/test-file-manager.cjs
// Uses the application's Electron/Chromium and an isolated, in-memory Drive.
const assert = require('node:assert/strict');
const path = require('node:path');

async function runBrowserChecks() {
    const passed = [];
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const until = async (get, message) => {
        for (let attempt = 0; attempt < 150; attempt++) {
            const result = get();
            if (result) return result;
            await wait(30);
        }
        throw new Error(`Timeout: ${message}; editor=${input()?.value}; active=${document.activeElement?.className}; renames=${JSON.stringify(window.__driveTest?.renames)}; alerts=${document.querySelector('[role="alert"]')?.textContent}`);
    };
    const label = name => [...document.querySelectorAll('.file-name-label')].find(el => el.textContent === name);
    const button = name => document.querySelector(`button[aria-label="${name}"]`);
    const input = () => document.querySelector('.rename-input');
    const explorer = () => document.querySelector('[aria-label="공유 파일 탐색기"]');
    const click = (element, options = {}) => {
        check(element, 'Click target must exist');
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, ...options }));
    };
    const doubleClick = element => {
        click(element);
        click(element, { detail: 2 });
        element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
    };
    const key = (target, name, options = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...options }));
    const fill = (element, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const ready = name => until(() => label(name), `listing ${name}`);
    const currentPath = () => [...document.querySelectorAll('.path-item')].map(el => el.textContent).join('/');
    const editWithF2 = async name => {
        click(await ready(name));
        await wait(30);
        key(explorer(), 'F2');
        return until(input, 'F2 rename editor');
    };
    const finish = name => { passed.push(name); console.log(`PASS ${name}`); };

    await ready('보고서.hwpx');
    check(button('뒤로 가기').disabled && button('상위 폴더로 이동').disabled && button('앞으로 가기').disabled, 'Root navigation buttons must be disabled');
    finish('root navigation bounds');

    click(label('현장 A'));
    await wait(600);
    check(!input(), 'Initial selection must not rename');
    click(label('현장 A'));
    await until(input, 'second single click rename');
    check(document.activeElement === input(), 'Rename editor should receive focus');
    fill(input(), '현장 A 변경');
    await wait(30);
    key(input(), 'Enter');
    await ready('현장 A 변경');
    check(window.__driveTest.renames.length === 1, 'Enter must issue exactly one rename request');
    check(document.querySelector('.file-item.selected .file-name-label')?.textContent === '현장 A 변경', 'Renaming must preserve selection');
    finish('second-click folder rename and single save');

    doubleClick(label('현장 A 변경'));
    await ready('하위 폴더');
    await wait(650);
    check(!input(), 'Double click must open without triggering rename');
    doubleClick(label('하위 폴더'));
    await ready('하위 자료.txt');
    click(button('상위 폴더로 이동'));
    await ready('하위 폴더');
    click(button('뒤로 가기'));
    await ready('하위 자료.txt');
    check(currentPath().endsWith('현장 A 변경/하위 폴더'), 'Back after Up must return to the visited child');
    click(button('앞으로 가기'));
    await ready('하위 폴더');
    click(button('상위 폴더로 이동'));
    await ready('현장 B');
    doubleClick(label('현장 B'));
    await ready('B 자료.txt');
    check(button('앞으로 가기').disabled, 'New navigation must discard forward history');
    key(explorer(), 'ArrowLeft', { altKey: true });
    await ready('보고서.hwpx');
    key(explorer(), 'ArrowRight', { altKey: true });
    await ready('B 자료.txt');
    key(explorer(), 'ArrowUp', { altKey: true });
    await ready('보고서.hwpx');
    finish('double click, separate Back/Up history, Forward and Alt shortcuts');

    let editor = await editWithF2('보고서.hwpx');
    check(editor.selectionStart === 0 && editor.selectionEnd === '보고서'.length, 'F2 should select the filename without its extension');
    fill(editor, '취소.hwpx');
    key(editor, 'Escape');
    await until(() => !input(), 'Escape cancel');
    check(window.__driveTest.renames.length === 1 && label('보고서.hwpx'), 'Escape must preserve the original name');
    editor = await editWithF2('보고서.hwpx');
    fill(editor, '   ');
    await wait(30);
    key(editor, 'Enter');
    await until(() => document.querySelector('[role="alert"]')?.textContent.includes('이름을 입력'), 'empty-name validation');
    fill(editor, '기존.hwpx');
    await wait(30);
    key(editor, 'Enter');
    await until(() => document.querySelector('[role="alert"]')?.textContent.includes('이미 있습니다'), 'duplicate validation');
    fill(editor, '잘못된/이름.hwpx');
    await wait(30);
    key(editor, 'Enter');
    await until(() => document.querySelector('[role="alert"]')?.textContent.includes('사용할 수 없습니다'), 'invalid-character validation');
    check(window.__driveTest.renames.length === 1, 'Invalid names must not reach Drive');
    key(editor, 'Escape');
    finish('F2 extension selection, Escape, empty/duplicate/invalid names');

    editor = await editWithF2('보고서.hwpx');
    window.__driveTest.failNextRename = true;
    fill(editor, '새 보고서.hwpx');
    await wait(30);
    key(editor, 'Enter');
    await until(() => document.querySelector('[role="alert"]')?.textContent.includes('테스트 권한 오류'), 'rename error');
    await until(() => input() && !input().disabled, 'editable retry');
    check(document.activeElement === input(), 'Failed rename must restore input focus');
    check(window.__driveTest.records.find(file => file.id === 'report').name === '보고서.hwpx', 'Failed rename must preserve server data');
    key(input(), 'Enter');
    await ready('새 보고서.hwpx');
    finish('Drive failure retains draft and supports retry');

    const renamesBefore = window.__driveTest.renames.length;
    editor = await editWithF2('새 보고서.hwpx');
    fill(editor, '한글 보고서.hwpx');
    await wait(30);
    key(editor, 'Enter', { isComposing: true, keyCode: 229 });
    await wait(100);
    check(input() && window.__driveTest.renames.length === renamesBefore, 'Korean IME Enter must not save prematurely');
    editor.focus();
    check(document.activeElement === editor, 'The rename input must be focused before blur');
    editor.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: explorer() }));
    await ready('한글 보고서.hwpx');
    finish('Korean composition and blur save');

    click(document.querySelector('button[title="보기 전환"]'));
    await until(() => document.querySelector('.grid-view'), 'grid view');
    click(label('기존.hwpx'));
    await wait(600);
    click(label('기존.hwpx'));
    await until(input, 'grid rename');
    fill(input(), '기존 변경.hwpx');
    await wait(30);
    key(input(), 'Enter');
    await ready('기존 변경.hwpx');
    finish('grid view inline rename');

    const search = document.querySelector('[aria-label="현재 폴더에서 검색"]');
    fill(search, '현장 A');
    await ready('현장 A 변경');
    doubleClick(label('현장 A 변경'));
    await ready('하위 폴더');
    check(search.value === '', 'Folder navigation must clear the previous folder search');
    click(document.querySelector('.path-item'));
    await ready('현장 B');
    fill(search, '존재하지 않는 자료');
    await until(() => document.querySelector('.center-msg.empty p')?.textContent === '검색 결과가 없습니다.', 'empty search state');
    fill(search, '');
    await ready('한글 보고서.hwpx');
    click(label('한글 보고서.hwpx'));
    await wait(600);
    click(label('한글 보고서.hwpx'));
    click(label('기존 변경.hwpx'), { ctrlKey: true });
    await wait(650);
    check(!input() && document.querySelectorAll('.file-item.selected').length === 2, 'Multi-selection must cancel pending rename');
    finish('search reset, breadcrumb navigation, empty results and multiselect');

    window.__driveTest.delays.a = 800;
    const delayedListing = window.__cache.refreshDriveFolder('a', { force: true });
    doubleClick(label('현장 A 변경'));
    await ready('하위 폴더');
    check(!document.querySelector('.center-msg'), 'Cached folders must remain visible during background refresh');
    click(button('뒤로 가기'));
    await ready('현장 B');
    doubleClick(label('현장 B'));
    await ready('B 자료.txt');
    await delayedListing;
    check(label('B 자료.txt') && !label('하위 폴더'), 'Late folder response must not overwrite the active folder');
    finish('rapid navigation rejects stale responses');

    window.__openedFiles = [];
    window.open = (...args) => window.__openedFiles.push(args);
    doubleClick(label('B 자료.txt'));
    await wait(650);
    check(window.__openedFiles.length === 1 && window.__openedFiles[0][0].includes('/b-report/view') && !input(), 'File double click should open the Drive viewer once');
    finish('file double click opens viewer');

    window.__driveTest.delays.a = 20;
    await window.__cache.warmDriveCache({ force: true });
    const cacheStatus = window.__cache.getDriveCacheStatus();
    check(cacheStatus.cachedFolders === 5 && cacheStatus.completed === cacheStatus.total && !cacheStatus.syncing, 'Prewarm should visit all shared folders, including empty ones');
    check(!window.__driveTest.calls.includes('system'), 'System folders must not be recursively scanned');
    check(Array.isArray(window.__cache.readCachedFolder('empty')) && window.__cache.readCachedFolder('empty').length === 0, 'Empty folders must be cached');
    const saved = JSON.parse(localStorage.getItem('jindan_drive_listing_v1:root'));
    check(saved.folders.root.files.some(file => file.name === '한글 보고서.hwpx'), 'Renamed metadata must be persisted');
    finish('recursive prewarm, hidden folders, empty folders and persistence');

    const beforeFresh = window.__driveTest.calls.length;
    await window.__cache.refreshDriveFolder('b');
    check(window.__driveTest.calls.length === beforeFresh, 'Fresh cache must avoid a Drive request');
    const firstRequest = window.__cache.refreshDriveFolder('b', { force: true });
    const secondRequest = window.__cache.refreshDriveFolder('b', { force: true });
    check(firstRequest === secondRequest, 'Concurrent refreshes must share a single request');
    await Promise.all([firstRequest, secondRequest]);
    check(window.__driveTest.calls.length === beforeFresh + 1, 'Concurrent refresh must issue exactly one Drive request');
    finish('fresh-cache reads and in-flight request deduplication');

    window.__driveTest.failedFolders.add('b');
    await window.__cache.refreshDriveFolder('b', { force: true }).catch(() => {});
    check(window.__cache.getDriveCacheStatus().error.includes('테스트 오프라인'), 'Connection failure must be reported');
    check(label('B 자료.txt') && document.querySelector('.drive-cache-status').textContent.includes('캐시 사용 중'), 'Offline refresh must retain the cached listing and explain the state');
    window.__driveTest.failedFolders.delete('b');
    await window.__cache.refreshDriveFolder('b', { force: true });
    check(!window.__cache.getDriveCacheStatus().error, 'Successful retry must clear connection error');
    finish('offline cached browsing and recovery status');

    click(button('상위 폴더로 이동'));
    await ready('한글 보고서.hwpx');
    window.__driveTest.delays.root = 500;
    const staleRoot = window.__cache.refreshDriveFolder('root', { force: true });
    editor = await editWithF2('한글 보고서.hwpx');
    fill(editor, '최종 보고서.hwpx');
    await wait(30);
    key(editor, 'Enter');
    await ready('최종 보고서.hwpx');
    await staleRoot;
    check(label('최종 보고서.hwpx') && window.__cache.readCachedFolder('root').some(file => file.name === '최종 보고서.hwpx'), 'An older response must not undo a successful rename in UI or cache');
    window.__driveTest.delays.root = 20;
    finish('rename wins over an older background response');

    const movingFolder = window.__driveTest.records.find(file => file.id === 'a');
    movingFolder.parent = 'b';
    window.__cache.removeCachedItems(['a'], { discardFolders: false });
    window.__cache.upsertCachedItem('b', { ...movingFolder });
    check(!window.__cache.readCachedFolder('root').some(file => file.id === 'a') && window.__cache.readCachedFolder('b').some(file => file.id === 'a'), 'Moving must update both parent caches');
    check(window.__cache.readCachedFolder('a').some(file => file.id === 'child'), 'Moving a folder must preserve its content cache');
    window.__cache.removeCachedItems(['existing']);
    check(!window.__cache.readCachedFolder('root').some(file => file.id === 'existing'), 'Deleting must remove the cached entry');
    finish('move and delete maintain cached contents');

    const toolbarButtons = [...document.querySelectorAll('.explorer-header button')].filter(el => !el.classList.contains('path-item'));
    check(toolbarButtons.every(el => el.title.trim()), 'Every toolbar and navigation button must explain its function on hover');
    check(button('드라이브 동기화').querySelector('svg.lucide-refresh-cw') && button('새 폴더 만들기').querySelector('svg.lucide-folder-plus'), 'Sync and new folder need distinct icons');
    finish('toolbar tooltip coverage and distinct Sync/New folder icons');

    const originalFetch = window.fetch;
    const listCalls = [];
    let authCalls = 0;
    let firstPageAttempts = 0;
    window.fetch = async url => {
        if (String(url).includes('oauth2.googleapis.com')) {
            authCalls++;
            return new Response(JSON.stringify({ access_token: 'isolated-test-token' }), { status: 200 });
        }
        const parsed = new URL(url);
        listCalls.push(parsed.searchParams.get('pageToken'));
        if (!parsed.searchParams.has('pageToken') && firstPageAttempts++ === 0) return new Response('{}', { status: 401 });
        const payload = parsed.searchParams.has('pageToken')
            ? { files: [{ id: 'page-2', name: '두 번째 페이지' }] }
            : { files: [{ id: 'page-1', name: '첫 번째 페이지' }], nextPageToken: 'next-page' };
        return new Response(JSON.stringify(payload), { status: 200 });
    };
    try {
        const allPages = await window.__realDrive.getFiles('pagination-test');
        check(allPages.length === 2 && listCalls.length === 3 && listCalls[2] === 'next-page' && authCalls === 2, 'Drive listing must fetch every page and retry an expired token once');
    } finally {
        window.fetch = originalFetch;
    }
    finish('Drive pagination and bounded expired-token retry');

    const restoredCache = await window.__reloadCache('restored');
    check(restoredCache.readCachedFolder('root').some(file => file.name === '최종 보고서.hwpx'), 'A new service instance must restore the saved listing without Drive access');
    const savedCache = localStorage.getItem('jindan_drive_listing_v1:root');
    localStorage.setItem('jindan_drive_listing_v1:root', '{invalid json');
    const corruptCache = await window.__reloadCache('corrupt');
    check(corruptCache.readCachedFolder('root') === null, 'Corrupt disk cache must be discarded safely');
    localStorage.setItem('jindan_drive_listing_v1:root', savedCache);
    finish('startup cache restore and corrupt-cache recovery');

    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('Test quota', 'QuotaExceededError'); };
    try {
        window.__cache.renameCachedItem('report', '메모리 보고서.hwpx');
        check(!window.__cache.getDriveCacheStatus().persistent && window.__cache.readCachedFolder('root').some(file => file.name === '메모리 보고서.hwpx'), 'Quota failure must preserve working memory cache');
    } finally {
        Storage.prototype.setItem = originalSetItem;
        window.__cache.renameCachedItem('report', '최종 보고서.hwpx');
    }
    check(window.__cache.getDriveCacheStatus().persistent, 'Persistence must recover when storage becomes available');
    finish('storage-quota fallback preserves working cache');

    window.__driveTest.delays.a = 200;
    const deletingListing = window.__cache.refreshDriveFolder('a', { force: true });
    window.__cache.removeCachedItems(['a']);
    const deletedResult = await deletingListing;
    check(window.__cache.readCachedFolder('a') === null && window.__cache.readCachedFolder('child') === null && deletedResult.length === 0, 'Deleting a folder must discard descendants and ignore an older pending response');
    finish('deleted folder subtree and pending-response invalidation');
    await wait(200);
    check(currentPath() === '공유 드라이브', 'Final navigation state must match the displayed root listing');

    const menu = () => document.querySelector('[role="menu"]');
    const menuItem = text => [...document.querySelectorAll('[role="menuitem"]')].find(element => element.querySelector('span').textContent === text);
    const rightClick = async (element, x = 150, y = 250) => {
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y });
        element.dispatchEvent(event);
        await until(menu, 'context menu');
        check(event.defaultPrevented, 'Custom context menu must replace the browser menu');
    };
    await rightClick(document.querySelector('.explorer-body'), window.innerWidth - 1, window.innerHeight - 1);
    check(menuItem('새 폴더') && menuItem('파일 올리기') && !menuItem('삭제'), 'Blank space must offer folder creation and upload without item actions');
    const menuRect = menu().getBoundingClientRect();
    check(menuRect.right <= innerWidth && menuRect.bottom <= innerHeight, 'Menu must fit inside viewport edges');
    check(document.activeElement === menuItem('새 폴더'), 'First available menu action must receive focus');
    key(menuItem('새 폴더'), 'ArrowDown');
    check(document.activeElement === menuItem('파일 올리기'), 'Arrow keys must move menu focus');
    key(menuItem('파일 올리기'), 'Escape');
    await until(() => !menu(), 'Escape closes menu');
    check(document.activeElement === explorer(), 'Escape must restore explorer focus');
    finish('blank-space context menu, viewport placement and keyboard dismissal');

    doubleClick(await ready('빈 폴더'));
    await until(() => document.querySelector('.center-msg.empty'), 'empty folder');
    window.__uiTest.promptValues.push('우클릭 폴더');
    await rightClick(document.querySelector('.center-msg.empty'));
    click(menuItem('새 폴더'));
    await ready('우클릭 폴더');
    const createdFolder = window.__driveTest.records.find(file => file.name === '우클릭 폴더');
    check(createdFolder.parent === 'empty' && !menu(), 'New folder action must use the current location and close the menu');
    await rightClick(label('우클릭 폴더'));
    click(menuItem('이름 바꾸기'));
    editor = await until(input, 'context rename');
    fill(editor, '메뉴로 변경한 폴더');
    await wait(30);
    const nativeEditMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    editor.dispatchEvent(nativeEditMenu);
    check(!nativeEditMenu.defaultPrevented && !menu(), 'The text editor must retain its native copy/paste menu');
    key(editor, 'Enter');
    await ready('메뉴로 변경한 폴더');
    check(createdFolder.name === '메뉴로 변경한 폴더', 'Context rename must change the right-clicked folder');
    finish('empty-folder creation, context rename and native text-edit menu');

    await rightClick(label('메뉴로 변경한 폴더'));
    click(menuItem('열기'));
    await until(() => currentPath().endsWith('/메뉴로 변경한 폴더') && document.querySelector('.center-msg.empty'), 'context Open');
    click(button('상위 폴더로 이동'));
    await ready('메뉴로 변경한 폴더');
    click(button('상위 폴더로 이동'));
    await ready('최종 보고서.hwpx');
    await rightClick(label('최종 보고서.hwpx'));
    check(document.querySelector('.file-item.selected .file-name-label')?.textContent === '최종 보고서.hwpx', 'Right-click must select an unselected target');
    click(menuItem('다운로드'));
    await until(() => window.__driveTest.downloads.length === 1, 'context file download');
    check(window.__driveTest.downloads[0].join() === 'report', 'Download must use the right-clicked file');
    await until(() => !document.querySelector('.drive-cache-status')?.textContent.includes('다운로드 준비'), 'download finished');
    finish('context Open and download target selection');

    click(label('최종 보고서.hwpx'));
    await wait(30);
    click(label('현장 B'), { ctrlKey: true });
    await wait(30);
    await rightClick(label('현장 B'));
    check(document.querySelectorAll('.file-item.selected').length === 2 && menuItem('이름 바꾸기').disabled && menuItem('열기').disabled, 'Right-clicking a selected item must preserve the selection and disable single-item actions');
    click(menuItem('다운로드'));
    await until(() => window.__driveTest.downloads.length === 2, 'multi download');
    check(window.__driveTest.downloads[1].includes('report') && window.__driveTest.downloads[1].includes('b'), 'Multi download must include the full selected set');
    await until(() => !document.querySelector('.drive-cache-status')?.textContent.includes('다운로드 준비'), 'multi download finished');
    await rightClick(label('현장 B'));
    menu().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    check(menu(), 'Clicking inside the menu must not dismiss it prematurely');
    document.querySelector('.explorer-header').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await until(() => !menu(), 'outside click dismissal');
    finish('multi-selection context actions and outside-click dismissal');

    click(label('최종 보고서.hwpx'));
    await wait(30);
    key(explorer(), 'F10', { shiftKey: true });
    await until(menu, 'Shift+F10 menu');
    key(menuItem('열기'), 'Escape');
    await until(() => !menu(), 'keyboard close');
    finish('Shift+F10 opens the selected item context menu');

    window.__uiTest.allowAlerts = true;
    const disposableFiles = ['delete-1', 'delete-2'].map((id, index) => ({ id, parent: 'root', name: `삭제 검사 ${index + 1}.txt`, mimeType: 'text/plain' }));
    window.__driveTest.records.push(...disposableFiles);
    for (const file of disposableFiles) window.__cache.upsertCachedItem('root', file);
    click(await ready('삭제 검사 1.txt'));
    await wait(30);
    click(label('삭제 검사 2.txt'), { ctrlKey: true });
    await wait(30);
    window.__uiTest.confirmResponse = false;
    await rightClick(label('삭제 검사 1.txt'));
    click(menuItem('삭제'));
    await wait(60);
    check(window.__driveTest.deleted.length === 0 && label('삭제 검사 1.txt'), 'Cancelling delete must preserve all selected files');
    window.__uiTest.confirmResponse = true;
    await rightClick(label('삭제 검사 2.txt'));
    click(menuItem('삭제'));
    await until(() => window.__driveTest.deleted.length === 2 && !label('삭제 검사 1.txt') && !label('삭제 검사 2.txt'), 'confirmed multi delete');
    check(window.__uiTest.confirms.at(-1).includes('2개의 항목') && label('최종 보고서.hwpx'), 'Delete must confirm the correct selected count and preserve unrelated files');
    await until(() => !document.querySelector('.center-msg'), 'delete refresh complete');
    finish('context multi-delete confirmation, cancel and correct targets');

    const archiveFetch = window.fetch;
    const originalCreateURL = URL.createObjectURL;
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    let downloadBlob;
    let downloadName;
    let mediaFailure = false;
    URL.createObjectURL = blob => { downloadBlob = blob; return 'blob:test-archive'; };
    HTMLAnchorElement.prototype.click = function () { downloadName = this.download; };
    const folderFiles = {
        archive: [
            { id: 'inner', name: '하위 폴더', mimeType: 'application/vnd.google-apps.folder' },
            { id: 'empty-archive', name: '빈 폴더', mimeType: 'application/vnd.google-apps.folder' },
            { id: 'doc', name: '검사 문서', mimeType: 'application/vnd.google-apps.document' },
            { id: 'same-1', name: '동일.txt', mimeType: 'text/plain' },
            { id: 'same-2', name: '동일.txt', mimeType: 'text/plain' }
        ],
        inner: [{ id: 'nested', name: '자료.txt', mimeType: 'text/plain' }],
        'empty-archive': []
    };
    window.fetch = async url => {
        const address = new URL(url);
        if (address.hostname === 'oauth2.googleapis.com') return new Response(JSON.stringify({ access_token: 'archive-test-token' }), { status: 200 });
        if (address.pathname === '/drive/v3/files') {
            const parent = address.searchParams.get('q').match(/^'([^']+)'/)[1];
            return new Response(JSON.stringify({ files: folderFiles[parent] || [] }), { status: 200 });
        }
        if (mediaFailure) return new Response('Forbidden', { status: 403 });
        return new Response(address.pathname.endsWith('/export') ? 'exported document' : 'downloaded file', { status: 200 });
    };
    try {
        await window.__realDownload.downloadSelection([{ id: 'archive', name: '검사 폴더', mimeType: 'application/vnd.google-apps.folder' }]);
        const extracted = window.__unzip(new Uint8Array(await downloadBlob.arrayBuffer()));
        check(downloadName === '검사 폴더.zip' && extracted['검사 폴더/하위 폴더/자료.txt'] && extracted['검사 폴더/빈 폴더/'], 'Folder download must preserve nested and empty folders');
        check(extracted['검사 폴더/검사 문서.docx'] && extracted['검사 폴더/동일.txt'] && extracted['검사 폴더/동일 (1).txt'], 'Native documents must be exported and duplicate names preserved');
        finish('real ZIP folder download, nested/empty folders and duplicate filenames');
        await window.__realDownload.downloadSelection([{ id: 'doc', name: '단일 문서', mimeType: 'application/vnd.google-apps.document' }]);
        check(downloadName === '단일 문서.docx' && await downloadBlob.text() === 'exported document', 'Single native document must be exported with the correct filename');
        downloadName = null;
        mediaFailure = true;
        let downloadError;
        try { await window.__realDownload.downloadSelection([{ id: 'archive', name: '검사 폴더', mimeType: 'application/vnd.google-apps.folder' }]); }
        catch (error) { downloadError = error; }
        check(downloadError?.message.includes('403') && downloadName === null, 'Failed archive downloads must not save incomplete ZIP files');
        finish('single-document export and archive failure handling');
    } finally {
        window.fetch = archiveFetch;
        URL.createObjectURL = originalCreateURL;
        HTMLAnchorElement.prototype.click = originalAnchorClick;
    }
    click(button('보기 전환'));
    await until(() => document.querySelector('.list-header'), 'list context view');
    await rightClick(await ready('최종 보고서.hwpx'));
    check(!menuItem('이름 바꾸기').disabled && menuItem('삭제'), 'List view must expose the same item actions as grid view');
    window.dispatchEvent(new Event('scroll'));
    await until(() => !menu(), 'scroll closes context menu');
    finish('list view context menu and scroll dismissal');
    await wait(200);
    return passed;
}

async function browserMain() {
    const { app, BrowserWindow } = require('electron');
    await app.whenReady();
    const browser = new BrowserWindow({
        show: false,
        width: 1100,
        height: 900,
        webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, partition: 'file-manager-test', offscreen: true }
    });
    browser.webContents.on('console-message', (_event, level, message) => {
        if (level >= 2 || message.startsWith('PASS ')) console.log(message);
    });
    browser.webContents.on('render-process-gone', (_event, details) => console.error('Renderer exited:', details.reason));
    try {
        await browser.loadURL(process.env.FILE_MANAGER_TEST_URL);
        const result = await browser.webContents.executeJavaScript(`(${runBrowserChecks.toString()})()`);
        assert.equal(result.length, 29);
        console.log(`FileManager: ${result.length} browser scenarios passed.`);
        if (process.env.FILE_MANAGER_SCREENSHOT) {
            await browser.webContents.executeJavaScript(`(async () => {
                document.querySelector('.file-item.selected').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 480, clientY: 275 }));
                await new Promise(resolve => setTimeout(resolve, 150));
            })()`);
            const image = await browser.webContents.capturePage();
            require('node:fs').writeFileSync(process.env.FILE_MANAGER_SCREENSHOT, image.toPNG());
        }
        app.exit(0);
    } catch (error) {
        console.error(error);
        app.exit(1);
    }
}

async function nodeMain() {
    const { createServer } = await import('vite');
    const { default: react } = await import('@vitejs/plugin-react');
    const { mkdtemp, rm } = require('node:fs/promises');
    const { tmpdir } = require('node:os');
    const { spawn } = require('node:child_process');
    const temporaryEnv = await mkdtemp(path.join(tmpdir(), 'jindan-file-manager-test-'));
    const folderType = 'application/vnd.google-apps.folder';
    const records = [
        { id: 'a', parent: 'root', name: '현장 A', mimeType: folderType },
        { id: 'b', parent: 'root', name: '현장 B', mimeType: folderType },
        { id: 'empty', parent: 'root', name: '빈 폴더', mimeType: folderType },
        { id: 'system', parent: 'root', name: '.system', mimeType: folderType },
        { id: 'report', parent: 'root', name: '보고서.hwpx', mimeType: 'application/octet-stream', size: 1200 },
        { id: 'existing', parent: 'root', name: '기존.hwpx', mimeType: 'application/octet-stream' },
        { id: 'child', parent: 'a', name: '하위 폴더', mimeType: folderType },
        { id: 'child-file', parent: 'child', name: '하위 자료.txt', mimeType: 'text/plain' },
        { id: 'b-report', parent: 'b', name: 'B 자료.txt', mimeType: 'text/plain' }
    ];
    const service = `
        window.__driveTest = { records: ${JSON.stringify(records)}, renames: [], calls: [], delays: {}, failedFolders: new Set(), failNextRename: false, downloads: [], deleted: [] };
        export async function getFiles(parent) {
            window.__driveTest.calls.push(parent);
            const snapshot = window.__driveTest.records.filter(file => file.parent === parent).map(file => ({ ...file }));
            await new Promise(resolve => setTimeout(resolve, window.__driveTest.delays[parent] || 20));
            if (window.__driveTest.failedFolders.has(parent)) throw new Error('테스트 오프라인');
            return snapshot;
        }
        export async function renameFile(id, name) {
            window.__driveTest.renames.push({ id, name });
            await new Promise(resolve => setTimeout(resolve, 60));
            if (window.__driveTest.failNextRename) {
                window.__driveTest.failNextRename = false;
                throw new Error('테스트 권한 오류');
            }
            const file = window.__driveTest.records.find(file => file.id === id);
            file.name = name;
            return { ...file };
        }
        export const uploadFile = async () => { throw new Error('Not used in these tests'); };
        export const createFolder = async (name, parent) => {
            const file = { id: 'created-' + Date.now(), name, parent, mimeType: 'application/vnd.google-apps.folder' };
            window.__driveTest.records.push(file);
            return { ...file };
        };
        export const deleteFile = async id => {
            window.__driveTest.deleted.push(id);
            window.__driveTest.records = window.__driveTest.records.filter(file => file.id !== id);
        };
        export const downloadFile = uploadFile, moveFile = uploadFile;
        export const formatFileSize = value => value + ' B';
    `;
    const entry = `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import FileManager from '/src/components/FileManager.jsx';
        import * as cache from '/src/services/driveCacheService.js';
        import * as realDrive from '/src/services/driveService.js';
        import * as realDownload from '/src/services/driveDownloadService.js';
        import { unzipSync } from 'fflate';
        window.__cache = cache;
        window.__realDrive = realDrive;
        window.__realDownload = realDownload;
        window.__unzip = unzipSync;
        window.__uiTest = { promptValues: [], confirms: [], confirmResponse: true, alerts: [], allowAlerts: false };
        window.__reloadCache = tag => import(/* @vite-ignore */ '/src/services/driveCacheService.js?test-instance=' + tag);
        createRoot(document.getElementById('root')).render(React.createElement(FileManager, {
            showAlert: async message => {
                if (!window.__uiTest.allowAlerts) throw new Error('Unexpected alert: ' + message);
                window.__uiTest.alerts.push(message);
            },
            showConfirm: async message => { window.__uiTest.confirms.push(message); return window.__uiTest.confirmResponse; },
            showPrompt: async () => window.__uiTest.promptValues.shift() || null
        }));
    `;
    const server = await createServer({
        configFile: false,
        root: path.resolve(__dirname, '..'),
        envDir: temporaryEnv,
        define: { 'import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID': JSON.stringify('root') },
        server: { host: '127.0.0.1', port: 0 },
        plugins: [react(), {
            name: 'isolated-file-manager-test',
            enforce: 'pre',
            resolveId(source, importer) {
                if (source === '/__file_manager_test_entry.jsx') return '\0file-manager-test-entry.jsx';
                if (source === '../services/driveDownloadService' && importer?.replaceAll('\\', '/').endsWith('/FileManager.jsx')) return '\0file-manager-test-download';
                if (source.endsWith('/driveService') && /\/(FileManager\.jsx|driveCacheService\.js)$/.test(importer?.replaceAll('\\', '/').split('?')[0] || '')) return '\0file-manager-test-drive';
            },
            load(id) {
                if (id === '\0file-manager-test-entry.jsx') return entry;
                if (id === '\0file-manager-test-drive') return service;
                if (id === '\0file-manager-test-download') return `export async function downloadSelection(items, onProgress) {
                    window.__driveTest.downloads.push(items.map(file => file.id));
                    onProgress('test download');
                    await new Promise(resolve => setTimeout(resolve, 30));
                }`;
            },
            configureServer(vite) {
                vite.middlewares.use(async (request, response, next) => {
                    if (request.url !== '/__file_manager_test') return next();
                    const html = await vite.transformIndexHtml(request.url, '<html lang="ko"><body><div id="root"></div><script type="module" src="/__file_manager_test_entry.jsx"></script></body></html>');
                    response.setHeader('Content-Type', 'text/html; charset=utf-8');
                    response.end(html);
                });
            }
        }]
    });
    try {
        await server.listen();
        const env = { ...process.env, FILE_MANAGER_TEST_URL: `${server.resolvedUrls.local[0]}__file_manager_test` };
        delete env.ELECTRON_RUN_AS_NODE;
        const child = spawn(require('electron'), [__filename], { env, stdio: 'inherit', windowsHide: true });
        const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
        process.exitCode = code ?? 1;
    } finally {
        await server.close();
        assert.equal(path.dirname(path.resolve(temporaryEnv)), path.resolve(tmpdir()));
        assert.ok(path.basename(temporaryEnv).startsWith('jindan-file-manager-test-'));
        await rm(temporaryEnv, { recursive: true, force: true });
    }
}

(process.versions.electron ? browserMain() : nodeMain()).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
