// Isolated Chromium checks: fixture files only, temporary user storage, no external services.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');

async function browserChecks() {
    const passed = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const until = async (read, name) => { for (let i = 0; i < 200; i++) { const value = await read(); if (value) return value; await wait(30); } throw new Error(`Timeout: ${name}; ${document.querySelector('[role="alert"]')?.textContent || ''}`); };
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const finish = name => { passed.push(name); console.log(`PASS ${name}`); };
    const button = name => [...document.querySelectorAll('button')].find(item => item.textContent.trim() === name || item.getAttribute('aria-label') === name);
    const label = name => [...document.querySelectorAll('.studio-property-section label')].find(item => item.firstChild?.textContent === name)?.querySelector('input,select,textarea');
    const fill = (element, value, blur = false) => {
        check(element, 'Input exists');
        const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
        element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
        if (blur) element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    };
    const upload = async files => {
        const input = document.querySelector('[aria-label="자료 파일 선택"]'), dt = new DataTransfer();
        files.forEach(file => dt.items.add(file)); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
        await until(() => !document.querySelector('.studio-dropzone.working'), 'upload complete');
        await wait(100);
    };
    const bytes = window.__fixture, lib = window.__library;
    const pdf = new File([bytes.pdf], '검증용 종합보고서.pdf', { type: 'application/pdf' });
    const hwpx = new File([bytes.hwpx], '검증용 작성양식.hwpx');
    await until(() => document.querySelector('.studio-dropzone')?.getAttribute('aria-disabled') === 'false', 'ready');
    check(document.querySelector('.studio-navigation') && document.querySelector('.studio-inspector'), 'Three-panel workspace exists');
    const initial = await lib.loadStudio('studio-test');
    check(initial.chapterStartsOdd && initial.blankPageFurniture === false, 'Odd page and blank furniture policy is retained');
    finish('empty studio, three panels and pagination rules');
    const projects=document.querySelector('[aria-label="작성할 시설 보고서"]');
    check(projects.options.length===4&&[...projects.options].slice(1).every(option=>option.value.startsWith('project:')),'Only project-management records are selectable');
    check(button('기존 보고서 선택(다중)').disabled&&button('전기 진단 준비').disabled,'A project is required for report work');
    window.__dbService.setTable('프로젝트관리',[...window.__dbService.getAll('프로젝트관리'),{id:'remote-arrival',title:'서버에서 뒤늦게 받은 프로젝트'},{id:'deleted-project',title:'삭제된 프로젝트',deleted:true}]);
    await until(()=>[...projects.options].some(option=>option.value==='project:remote-arrival'),'project pull refreshes studio');
    check(![...projects.options].some(option=>option.value==='project:deleted-project'),'Deleted projects are not selectable');
    finish('project-management-only selection updates after background pulls without fabricating facilities');

    await upload([pdf, hwpx, new File(['bad'], '지원안함.txt')]);
    await until(() => document.querySelectorAll('.studio-material').length === 2, 'multi file list');
    check(document.querySelector('[role="alert"]')?.textContent.includes('지원안함.txt'), 'Bad file reported while valid files survive');
    let records = await lib.listMaterials('studio-test');
    check(records.length === 2 && (await lib.loadMaterial('studio-test', records.find(r => r.format === 'pdf').id)).size === pdf.size, 'Original bytes were saved');
    finish('multiple uploads, partial failure and original byte storage');

    button('검증용 종합보고서.pdf 자료 정보').click(); await wait(70);
    fill(label('보고서 종류'), 'comprehensive');
    fill(label('시설명'), '검증용 처리시설', true); fill(label('양식 그룹'), '종합 양식 A', true);
    await until(async () => (await lib.listMaterials('studio-test')).find(r => r.format === 'pdf').templateGroup === '종합 양식 A', 'metadata saved');
    await upload([new File([bytes.pdf], '이름만바꾼파일.pdf')]);
    check((await lib.listMaterials('studio-test')).length === 2 && document.querySelector('.studio-notice').textContent.includes('같은 파일'), 'Same bytes are deduplicated');
    check((await lib.listMaterials('studio-test')).find(r => r.format === 'pdf').templateGroup === '종합 양식 A', 'Duplicates must preserve classification');
    finish('classification, template grouping and hash-based duplicate handling');

    const comparisons = document.querySelector('.studio-checkbox input'); comparisons.click();
    await until(async () => !(await lib.listMaterials('studio-test')).find(r => r.format === 'pdf').includeInPatterns, 'comparison selection saved');
    button('본문 입력자료').click(); await wait(40); await upload([hwpx, new File(['월,사용량\n1,100'], '입력데이터.csv')]);
    records = await lib.listMaterials('studio-test');
    check(records.filter(r => r.role === 'data').length === 2 && records.filter(r => r.role === 'reference').length === 2, 'Filled forms and references have separate roles');
    finish('pattern selection and separate filled-form/data uploads');

    let read = false, rejected = false;
    try { await lib.inspectMaterial({ name: '너무큰파일.pdf', size: 161 * 1024 * 1024, arrayBuffer: async () => { read = true; } }, 'reference'); } catch { rejected = true; }
    check(rejected && !read, 'Oversized files are rejected before reading');
    for (const [file, role] of [[new File(['not a PDF'], '가짜.pdf'), 'reference'], [new File([bytes.docx], '가짜.hwpx'), 'reference'], [new File(['\u0000'], '잘못된.csv'), 'data']]) {
        rejected = false; try { await lib.addMaterial('studio-test', file, role); } catch { rejected = true; } check(rejected, `Reject ${file.name}`);
    }
    check((await lib.listMaterials('studio-test')).length === 4, 'Invalid packages leave no metadata behind');
    const xlsx = await lib.addMaterial('studio-test', new File([bytes.xlsx], '측정값.xlsx'), 'data');
    check(xlsx.material.format === 'xlsx', 'Spreadsheet data is accepted');
    finish('size limits, content signatures, ZIP format and XLSX data');

    const originalAdd = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) { if (this.name === 'files') { this.transaction.abort(); return {}; } return originalAdd.apply(this, args); };
    rejected = false;
    try { await lib.addMaterial('studio-test', new File([bytes.pdf + '\nunique'], '저장실패.pdf'), 'reference'); } catch { rejected = true; }
    finally { IDBObjectStore.prototype.add = originalAdd; }
    check(rejected && !(await lib.listMaterials('studio-test')).some(item => item.filename === '저장실패.pdf'), 'Failed binary storage rolls back metadata');
    records = await lib.listMaterials('studio-test');
    check((await lib.listMaterials('other-user')).length === 0, 'Another user cannot list these files');
    rejected = false; try { await lib.loadMaterial('other-user', records[0].id); } catch { rejected = true; }
    check(rejected, 'Another user cannot read original bytes');
    await lib.removeMaterial('other-user', records[0].id);
    check((await lib.loadMaterial('studio-test', records[0].id)).size > 0, 'Another user cannot delete this file');
    finish('atomic failure recovery and account-scoped storage');

    button('검증용 작성양식.hwpx 미리보기').click();
    await until(() => document.querySelector('.studio-structure')?.textContent.includes('제1장 조사 개요'), 'HWPX worker preview');
    check(document.querySelector('.studio-structure')?.textContent.includes('220'), 'Native table cells can be inspected');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await until(() => !document.querySelector('[role="dialog"]'), 'preview closed');
    finish('HWPX structure/table preview and Escape dismissal');

    fill(label('보고서 제목'), '검증용 기술진단 보고서'); fill(label('머리말'), '기술진단 본문'); fill(label('꼬리말'), '검증용 기관');
    button('새 장 추가').click();
    await until(() => document.querySelector('.studio-document h1')?.textContent === '제2장 기계 진단', 'new chapter');
    fill(document.querySelector('.studio-body-editor'), '채운 조사양식을 바탕으로 작성할 본문 메모');
    await until(async () => (await lib.loadStudio('studio-test')).chapters.some(c => c.text.includes('본문 메모')), 'body saved');
    button('제2장 기계 진단 위로 이동').click();
    await until(async () => (await lib.loadStudio('studio-test')).chapters[2].title === '제1장 기계 진단', 'chapter order');
    check(document.querySelector('.studio-paper-header').textContent === '기술진단 본문' && document.querySelector('.studio-paper-footer').textContent === '검증용 기관', 'Headers and footers update the composition');
    finish('chapter creation, reordering, body notes and live settings');

    const dt = new DataTransfer(); dt.items.add(new File([bytes.image], '표지.png', { type: 'image/png' }));
    const imageInput = document.querySelector('input[aria-label="표지 이미지 파일 선택"]'); imageInput.files = dt.files; imageInput.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => document.querySelector('.studio-cover img')?.naturalWidth === 1, 'cover image');
    check(document.querySelector('.studio-cover h2').textContent === '검증용 기술진단 보고서', 'Report title is shown on the cover');
    const stored = await lib.loadStudio('studio-test'); check(stored.coverId, 'Cover selection is stored');
    finish('cover image upload, assignment and title preview');

    button('자료 등록').click(); await until(() => button('본문 입력자료'), 'library tabs'); button('본문 입력자료').click(); await wait(50);
    const before = (await lib.listMaterials('studio-test')).length;
    window.__studioTest.confirm = false; button('입력데이터.csv 삭제').click(); await wait(80);
    check((await lib.listMaterials('studio-test')).length === before, 'Cancel keeps data');
    window.__studioTest.confirm = true; button('입력데이터.csv 삭제').click();
    await until(() => !button('입력데이터.csv 자료 정보'), 'delete complete');
    check((await lib.listMaterials('studio-test')).length === before - 1, 'Delete removes only requested material');
    finish('confirmed deletion and cancellation');
    button('참고 보고서').click(); await wait(50);
    button('검증용 종합보고서.pdf 미리보기').click();
    await until(() => document.querySelector('.studio-preview iframe')?.src.startsWith('blob:'), 'PDF preview');
    button('미리보기 닫기').click(); await wait(40);
    button('검증용 종합보고서.pdf 자료 정보').click(); await wait(40);
    const originalClick = HTMLAnchorElement.prototype.click; let downloaded;
    HTMLAnchorElement.prototype.click = function () { downloaded = this.download; };
    try { button('원본 내려받기').click(); await until(() => downloaded, 'download'); }
    finally { HTMLAnchorElement.prototype.click = originalClick; }
    check(downloaded === '검증용 종합보고서.pdf', 'Download has the original name');
    finish('PDF preview and original download action');
    button('본문 입력자료').click(); await wait(40);
    const pwvXml='<PQData xmlns="http://tempuri.org/PQData.xsd"><PQSites><PQSite Name="검증 측정지점"/></PQSites><PQInstruments><PQInstrument><Company>Metrel</Company><Model>MI 2883</Model></PQInstrument></PQInstruments><PQDataRecords><PQDataSingleRecord><PQRecordProperties><Name>새 측정 기록</Name><SubType>General</SubType></PQRecordProperties><PQTimeAxis><NumberOfSamples>1</NumberOfSamples></PQTimeAxis><PQRecord><PQChannels><PQChannel ID="v"><QuantityInfo QuantityType="Voltage" PhaseNumber="1"/><PQMeasurements ID="m"><BinaryData Compression="None" DataType="Single" Encoding="Base64Binary">AABfQw==</BinaryData><IntervalType>RmsAvg</IntervalType><UnitInfo Unit="Volts"/><ConversionConstants Gain="1"/></PQMeasurements></PQChannel></PQChannels></PQRecord></PQDataSingleRecord></PQDataRecords></PQData>';
    await upload([new File([pwvXml],'검증용 전력품질.pwv')]);
    button('검증용 전력품질.pwv 미리보기').click();
    await until(()=>document.querySelector('[aria-label="PowerView 측정자료 확인"]')?.textContent.includes('223'),'PowerView worker preview');
    check(document.querySelector('.studio-powerview').textContent.includes('MI 2883') && document.querySelector('.studio-powerview').textContent.includes('자동 반영'), 'Device information and unverified state are explicit');
    button('미리보기 닫기').click(); await wait(40);
    const pwvRecord=(await lib.listMaterials('studio-test')).find(m=>m.format==='pwv');await lib.removeMaterial('studio-test',pwvRecord.id);
    finish('PWV input upload and worker-based measurement preview');
    return passed;
}

async function folderChecks() {
    const passed = [], refs = window.__references, lib = window.__library, bytes = window.__fixture;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const until = async (read, name) => { for (let i = 0; i < 200; i++) { const result = await read(); if (result) return result; await wait(30); } throw new Error(`Timeout: ${name}; ${document.querySelector('.studio-folder-error')?.textContent || ''}`); };
    const check = (condition, name) => { if (!condition) throw new Error(name); };
    const finish = name => { passed.push(name); console.log(`PASS ${name}`); };
    const named = name => [...document.querySelectorAll('[aria-label]')].find(element => element.getAttribute('aria-label') === name);
    const select = (name, value) => {
        const element = named(name); check(element, `Exists: ${name}`);
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(element, value);
        element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const fixture = (path, invalid = false) => {
        const file = new File([invalid ? 'invalid' : path.endsWith('.pdf') ? bytes.pdf : bytes.hwpx], path.split('/').at(-1));
        Object.defineProperty(file, 'webkitRelativePath', { value: path }); return file;
    };
    const paths = ['HWPX/표지.hwpx', 'PDF/표지.pdf', 'HWPX/책등.hwpx', 'HWPX/목차.hwpx', 'HWPX/제1장.hwpx', 'PDF/제1장.pdf', 'HWPX/제10장.hwpx', '전체보고서.pdf'];
    const files = paths.map(path => fixture(`검증 프로젝트/${path}`));
    files.push(fixture('검증 프로젝트/메모.txt'));
    const picker = named('기존 보고서 프로젝트 폴더 선택');
    check(picker?.hasAttribute('webkitdirectory') && picker.multiple, 'Directory picker is in the left sidebar');
    const dt = new DataTransfer(); files.forEach(file => dt.items.add(file)); picker.files = dt.files;
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => document.querySelector('.studio-reference-view h1')?.textContent === '검증 프로젝트', 'folder import view');
    await until(() => !named('기존 보고서 프로젝트 폴더 추가').disabled, 'folder import complete');
    let project = (await refs.listReferenceProjects('studio-test'))[0];
    let entries = await refs.listReferenceEntries('studio-test', project.id);
    check(entries.length === 8 && project.hwpxCount === 5 && project.pdfCount === 3 && project.ignoredCount === 1, 'All eligible paths were imported');
    check(new Set(entries.map(entry => entry.relativePath)).size === 8 && new Set(entries.map(entry => entry.materialId)).size === 2, 'Shared bytes retain distinct project paths');
    check(refs.buildReferenceParts(entries).filter(part => part.original && part.pdf).length === 2, 'Cover and chapter pairs match across format folders');
    check(document.querySelector('.studio-reference-view').textContent.includes('학습 전') && document.querySelectorAll('.studio-reference-card').length === 6, 'Registration is not mislabeled as completed learning');
    finish('left directory picker, nested paths, component detection and HWPX/PDF pairing');

    const chapter = entries.find(entry => entry.relativePath === 'HWPX/제10장.hwpx'), pdf = entries.find(entry => entry.relativePath === 'PDF/제1장.pdf');
    select(`${chapter.relativePath} 대응 PDF 선택`, pdf.id);
    await until(async () => (await refs.listReferenceEntries('studio-test', project.id)).find(entry => entry.id === chapter.id).pdfChoice === pdf.id, 'manual PDF selection');
    await until(() => !named(`${chapter.relativePath} 구성 분류`).disabled, 'manual save done');
    select(`${chapter.relativePath} 구성 분류`, 'appendix');
    await until(async () => (await refs.listReferenceEntries('studio-test', project.id)).find(entry => entry.id === chapter.id).componentKind === 'appendix', 'component override');
    await until(() => !named('전체 보고서 PDF 선택').disabled, 'component save done');
    const whole = entries.find(entry => entry.relativePath === '전체보고서.pdf');
    check(named('전체 보고서 PDF 선택').value === whole.id, 'Whole PDF automatically selected');
    select('전체 보고서 PDF 선택', '');
    await until(async () => !(await refs.listReferenceProjects('studio-test')).find(item => item.id === project.id).wholePdfEntryId, 'clear whole PDF');
    await until(() => !named('전체 보고서 PDF 선택').disabled, 'whole PDF save done');
    select('전체 보고서 PDF 선택', whole.id);
    await until(() => !named('전체 보고서 PDF 보기').disabled, 'whole PDF chosen');
    named('전체 보고서 PDF 보기').click();
    await until(() => document.querySelector('.studio-preview iframe')?.src.startsWith('blob:'), 'whole PDF preview');
    named('미리보기 닫기').click();
    named('HWPX/표지.hwpx HWPX 확인').click();
    await until(() => document.querySelector('.studio-structure')?.textContent.includes('제1장 조사 개요'), 'project HWPX preview');
    named('미리보기 닫기').click();
    finish('editable classification, manual PDF selection and original previews');

    const repeat = await refs.importReferenceFolder('studio-test', files);
    check(repeat.duplicate && repeat.project.id === project.id, 'Same folder is reused');
    entries = await refs.listReferenceEntries('studio-test', project.id);
    check(entries.find(entry => entry.id === chapter.id).pdfChoice === pdf.id && entries.find(entry => entry.id === chapter.id).componentKind === 'appendix', 'Reimport preserves manual changes');
    const alternate = await refs.importReferenceFolder('studio-test', paths.map(path => fixture(`다른 프로젝트/${path}`)));
    check(!alternate.duplicate && alternate.project.id !== project.id, 'Different projects with shared content remain distinct');
    let rejected = false;
    try { await refs.updateReferenceEntry('studio-test', alternate.project.id, (await refs.listReferenceEntries('studio-test', alternate.project.id))[0].id, { pdfChoice: pdf.id }); } catch { rejected = true; }
    check(rejected, 'PDF from another project is rejected');
    check(!(await refs.listReferenceProjects('other-user')).length && !(await refs.listReferenceEntries('other-user', project.id)).length, 'Project metadata is account scoped');
    rejected = false; try { await lib.removeMaterial('studio-test', chapter.materialId); } catch { rejected = true; }
    check(rejected && (await lib.loadMaterial('studio-test', chapter.materialId)).size > 0, 'Linked originals cannot be removed behind project entries');
    await refs.removeReferenceProject('studio-test', alternate.project.id);
    check((await refs.listReferenceEntries('studio-test', alternate.project.id)).length === 0 && (await lib.loadMaterial('studio-test', chapter.materialId)).size > 0, 'Unlink removes only associations');
    finish('reimport, project/account isolation and linked-original protection');

    const partial = await refs.importReferenceFolder('studio-test', [fixture('일부 실패/제1장.hwpx'), fixture('일부 실패/고장.pdf', true)]);
    check(partial.project.status === 'partial' && partial.project.count === 1 && partial.project.errors[0].relativePath === '고장.pdf', 'Partial failures preserve valid originals and report paths');
    await refs.removeReferenceProject('studio-test', partial.project.id);
    const many = await refs.importReferenceFolder('studio-test', Array.from({ length: 51 }, (_, index) => fixture(`많은 장/하위/제${index + 1}장.hwpx`)));
    check(many.project.count === 51 && (await refs.listReferenceEntries('studio-test', many.project.id)).length === 51, 'Folder import supports more than the generic 50-file limit');
    await refs.removeReferenceProject('studio-test', many.project.id);
    check((await lib.loadStudio('legacy-user')).title === '이전 저장 자료' && (await lib.loadMaterial('legacy-user', 'legacy-file')).size === 6, 'Version 1 storage survives upgrade');
    finish('partial failures, large folders and existing storage migration');
    named('양식 분석·패턴 저장').click();
    const analysis = await until(async () => (await refs.listReferenceProjects('studio-test')).find(item => item.id === project.id).analysis, 'source analysis saved');
    await until(() => document.querySelector('.studio-analysis-state')?.textContent.includes('구조 분석 완료'), 'analysis results displayed');
    check(analysis.summary.totals.files === 5 && analysis.summary.totals.tables === 5, 'Every HWPX is structurally analyzed');
    check(analysis.verification.pdfVisualComparison === 'pending' && analysis.verification.pageReconstruction === 'pending', 'Structure extraction is distinct from PDF or reconstruction verification');
    check(analysis.files.every(file => file.profile.source.sha256 === file.sha256), 'Pattern evidence is bound to original hashes');
    let staleRejected = false;
    try { await refs.saveReferenceAnalysis('studio-test', project.id, { ...analysis, signature: 'stale' }); } catch { staleRejected = true; }
    check(staleRejected, 'Stale results cannot overwrite stored analysis');
    staleRejected = false; try { await refs.saveReferenceAnalysis('other-user', project.id, analysis); } catch { staleRejected = true; }
    check(staleRejected, 'Analysis cannot be written to another account');
    select(`${chapter.relativePath} 구성 분류`, 'chapter');
    await until(() => document.querySelector('.studio-analysis-state')?.textContent.includes('재분석 필요'), 'stale analysis notice');
    await until(() => !named(`${chapter.relativePath} 구성 분류`).disabled, 'classification save done');
    select(`${chapter.relativePath} 구성 분류`, 'appendix');
    await until(() => document.querySelector('.studio-analysis-state')?.textContent.includes('구조 분석 완료'), 'analysis source signature current again');
    finish('worker-based pattern analysis, original-hash provenance and stale/account protection');
    window.__referenceTest = { projectId: project.id, chapterId: chapter.id, pdfId: pdf.id };
    return passed;
}

async function pageTrialChecks() {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const until = async read => { for (let i=0;i<200;i++) { if(await read()) return; await wait(30); } throw new Error('Page trial check timed out'); };
    const check = (value, message) => { if (!value) throw new Error(message); };
    const records = await window.__library.listMaterials('studio-test');
    const pdf = records.find(m => m.format === 'pdf'), hwpx = records.find(m => m.format === 'hwpx');
    const model = { schema: 'jindan-editable-page/1', title: '제7장 재현시험', width: 595.22, height: 842,
        source: { pdfSha256:pdf.sha256, hwpxSha256:hwpx.sha256, pdfPage:1, pdfName:pdf.filename, hwpxName:hwpx.filename, method:'검증용 원본 연결' },
        objects: [{id:'heading',type:'text',label:'장 제목',x:72,y:180,text:'제7장 새 프로젝트',originalText:'제7장 새 프로젝트',fontFamily:'Arial',fontSize:25,originalFontSize:25,originalWidth:250,fill:'#000000',sourceParagraphs:[{section:'Contents/section0.xml',index:0,id:'fixture'}]},
            {id:'shape',type:'panel',label:'시험 도형',x:72,y:300,width:450,height:200,radius:20,corner:'bottom',fill:'#dddddd',stroke:'none',strokeWidth:0}] };
    const input = document.querySelector('[aria-label="재현 페이지 파일 선택"]'), dt = new DataTransfer();
    dt.items.add(new File([JSON.stringify(model)],'trial.json')); input.files=dt.files; input.dispatchEvent(new Event('change',{bubbles:true}));
    await until(() => document.querySelector('.studio-trial-paper text')?.textContent === '제7장 새 프로젝트');
    check(!document.querySelector('.studio-trial-paper image'), 'Reproduction must have editable text/vector objects, no PDF background');
    const editor = document.querySelector('[aria-label="재현 글자 내용"]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,'제7장 수정한 프로젝트'); editor.dispatchEvent(new Event('input',{bubbles:true}));
    await until(async () => (await window.__library.loadStudio('studio-test')).pageTrial?.model.objects[0].text === '제7장 수정한 프로젝트');
    check(document.querySelector('.studio-trial-paper text').textContent === '제7장 수정한 프로젝트', 'Inspector edits must reach the rendered page');
    document.querySelector('[data-object-id="shape"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await until(() => document.querySelector('[aria-label="재현 width"]'));
    const width=document.querySelector('[aria-label="재현 width"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(width,'410');width.dispatchEvent(new Event('input',{bubbles:true}));
    await until(async () => (await window.__library.loadStudio('studio-test')).pageTrial.model.objects[1].width===410);
    [...document.querySelectorAll('button')].find(b => b.textContent==='원본 나란히 보기').click();
    await until(() => document.querySelector('[title="재현 대조용 원본 PDF"]')?.src.includes('#page=1'));
    check(!(await window.__library.loadStudio('other-user')).pageTrial, 'Page trial stays in its user scope');
    console.log('PASS editable page import, text/shape edits, original comparison and account scope');
    return ['editable page import, text/shape edits, original comparison and account scope'];
}

async function electricalChecks() {
    const passed = [], lib = window.__library, refs = window.__references;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const until = async (read, name) => { for (let i = 0; i < 220; i++) { if (await read()) return; await wait(30); } throw new Error(`Electrical timeout: ${name}; ${document.querySelector('[role="alert"]')?.textContent}`); };
    const named = label => document.querySelector(`[aria-label="${label}"]`);
    const fill = (label, value) => {
        const input = named(label), prototype = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    };
    const check = (value, message) => { if (!value) throw new Error(message); };
    const finish = name => { passed.push(name); console.log(`PASS ${name}`); };
    const example = (await refs.listReferenceProjects('studio-test')).find(item => item.name === '검증 프로젝트');
    fill('작성할 시설 보고서', 'project:yeonpyeong');
    await until(() => named('전기 기준 보고서'), 'registered project start');
    check(named('전기 기준 보고서').options.length===1&&!document.querySelector('.studio-report-sidebar li'),'Learning examples never become project previous reports');
    const exampleEntries=await refs.listReferenceEntries('studio-test',example.id);
    const projectFiles=await Promise.all(exampleEntries.map(async entry=>({file:new File([await lib.loadMaterial('studio-test',entry.materialId)],entry.filename),relativePath:`금회 기준 폴더/${entry.relativePath}`})));
    const project=(await refs.importReferenceFolder('studio-test',projectFiles,()=>{},'project:yeonpyeong')).project;
    const scopedBook=await lib.loadStudio('studio-test','project:yeonpyeong');
    await lib.saveStudio('studio-test',{...scopedBook,referenceProjectIds:[project.id]},'project:yeonpyeong');
    fill('작성할 시설 보고서','');await until(()=>document.querySelector('.studio-dropzone'),'example workspace');
    fill('작성할 시설 보고서','project:yeonpyeong');
    await until(() => named('전기 기준 보고서')?.options.length > 1, 'facility start');
    fill('전기 기준 보고서', project.id);
    await until(() => [...document.querySelectorAll('button')].find(item => item.textContent === '교체 위치 분석')?.disabled === false, 'source entries');
    [...document.querySelectorAll('button')].find(item => item.textContent === '교체 위치 분석').click();
    await until(async () => (await lib.loadStudio('studio-test', 'project:yeonpyeong')).electrical.plan?.files.length === 5, 'actual worker analysis');
    const plan = (await lib.loadStudio('studio-test', 'project:yeonpyeong')).electrical.plan;
    check(plan.reportReady === false && plan.files.every(file => file.source.sha256.length === 64), 'Candidate plan remains unapproved and source-bound');
    const target = document.querySelector('.electrical-target input');
    check(target, 'Actual source candidates are displayed'); target.click();
    await until(async () => Object.values((await lib.loadStudio('studio-test', 'project:yeonpyeong')).electrical.targets.quality || {}).includes(true), 'replacement target saved');
    check((await lib.loadStudio('studio-test', 'project:yeonpyeong')).electrical.plan.reportReady === false, 'Target selection is not authorization or completed report');
    finish('facility electrical baseline uses actual HWPX worker and source hashes');
    check(named('한전 자료 적용 여부').value === 'auto' && named('한전 항목 분석 결과').textContent.includes('후보가 없어') && !named('한전 자료 시작일') && !named('최근 3개년 한전 플래너 자료 선택'), 'KEPCO is omitted by complete baseline analysis when not found');
    fill('한전 자료 적용 여부', 'include');
    fill('한전 자료 시작일', '2023-11-01'); fill('한전 자료 종료일', '2026-10-31');
    const dt = new DataTransfer(); dt.items.add(new File(['월,전력량\n2026-01,1234'], '금회 한전.csv'));
    const picker = named('최근 3개년 한전 플래너 자료 선택'); picker.files = dt.files; picker.dispatchEvent(new Event('change', { bubbles: true }));
    await until(async () => (await lib.loadStudio('studio-test', 'project:yeonpyeong')).electrical.inputs.kepco?.length === 1, 'linked input');
    await until(() => !named('작성할 시설 보고서').disabled, 'upload complete');
    fill('최근 3개년 한전 플래너 진단 메모', '금회 사용 특성 검토 중');
    fill('개선사항 협의 상태', 'discussing'); fill('개선사항 합의 내용', '시설 담당자와 개선안 검토 예정');
    await until(async () => (await lib.loadStudio('studio-test', 'project:yeonpyeong')).electrical.notes.improvement?.agreement, 'notes saved');
    fill('작성할 시설 보고서', 'project:baengnyeong');
    await until(() => document.querySelector('.studio-electrical h1')?.textContent.includes('백령도'), 'second facility');
    check(document.querySelector('.studio-library-link b').textContent==='0'&&named('전기 기준 보고서').options.length===1&&!document.querySelector('.studio-report-sidebar li'),'Other project sources, examples and measurements are not offered');
    check(named('한전 자료 적용 여부').value === 'auto' && !named('최근 3개년 한전 플래너 진단 메모') && !named('한전 자료 시작일'), 'New facility starts without copied historical inputs');
    fill('한전 자료 적용 여부', 'exclude'); fill('한전 자료 적용 근거', '금회 범위에서 제외 검토');
    fill('작성할 시설 보고서', 'project:daecheong');
    await until(() => document.querySelector('.studio-electrical h1')?.textContent.includes('대청도'), 'third facility');
    check(named('한전 자료 적용 여부').value === 'auto' && !named('최근 3개년 한전 플래너 진단 메모'), 'Third report is independent');
    fill('작성할 시설 보고서', 'project:yeonpyeong');
    await until(() => named('최근 3개년 한전 플래너 진단 메모')?.value === '금회 사용 특성 검토 중', 'restore first facility');
    check(named('한전 자료 시작일').value === '2023-11-01' && named('개선사항 협의 상태').value === 'discussing', 'Periods and consultation are restored');
    fill('한전 자료 적용 여부', 'exclude');
    await until(async () => (await lib.loadStudio('studio-test', 'project:yeonpyeong')).electrical.kepcoMode === 'exclude', 'KEPCO exclusion stored');
    check(!named('한전 자료 시작일') && (await lib.loadStudio('studio-test', 'project:yeonpyeong')).electrical.inputs.kepco.length === 1, 'Exclusion hides optional input without deleting evidence');
    fill('한전 자료 적용 여부', 'include');
    check(!(await lib.loadStudio('other-user', 'project:yeonpyeong')).electrical.inputs.kepco, 'Another user cannot read facility attachments');
    finish('three report scopes preserve attachments, periods, diagnoses and consultation separately');
    const first = await lib.loadStudio('studio-test', 'project:yeonpyeong'), link = first.electrical.inputs.kepco[0];
    named(`${link.filename} 최근 3개년 한전 플래너 연결 해제`).click();
    await until(async () => !(await lib.loadStudio('studio-test', 'project:yeonpyeong')).electrical.inputs.kepco.length, 'unlink');
    check((await lib.loadMaterial('studio-test', link.materialId)).size > 0, 'Unlink preserves original');
    let protectedProjectFile=false;try{await lib.removeMaterial('studio-test',link.materialId);}catch{protectedProjectFile=true;}
    check(protectedProjectFile,'Unlinked project evidence remains protected in the byte store');
    finish('facility input unlink preserves original material bytes');
    const thermalPicker = named('열화상 측정 자료 선택'), thermalDt = new DataTransfer();
    thermalDt.items.add(new File([window.__fixture.bmt], '검증용 열화상.BMT')); thermalPicker.files = thermalDt.files; thermalPicker.dispatchEvent(new Event('change',{bubbles:true}));
    await until(async () => (await lib.loadStudio('studio-test', 'project:yeonpyeong')).electrical.inputs.thermal?.length === 1, 'BMT linked');
    await until(() => !named('작성할 시설 보고서').disabled, 'BMT upload complete');
    const thermalExtras = new DataTransfer();thermalExtras.items.add(new File([window.__fixture.xlsx],'측정점 결과.xlsx'));thermalExtras.items.add(new File([window.__fixture.image],'최종 사진.png'));
    thermalPicker.files=thermalExtras.files;thermalPicker.dispatchEvent(new Event('change',{bubbles:true}));
    await until(async () => (await lib.loadStudio('studio-test','project:yeonpyeong')).electrical.inputs.thermal?.length===3,'thermal results imported');
    await until(() => !named('작성할 시설 보고서').disabled, 'thermal results upload done');
    [...document.querySelectorAll('button')].find(b=>b.textContent==='열화상 결과 묶음 추가').click();
    await until(()=>named('열화상 묶음 1 bmt'),'delivery editor');
    const thermalMaterials=(await lib.listMaterials('studio-test')), thermalLinks=(await lib.loadStudio('studio-test','project:yeonpyeong')).electrical.inputs.thermal;
    const sourceFor=format=>thermalMaterials.find(m=>m.format===format&&thermalLinks.some(l=>l.materialId===m.id));
    fill('열화상 묶음 1 bmt',sourceFor('bmt').id);fill('열화상 묶음 1 measurements',sourceFor('xlsx').id);fill('열화상 묶음 1 image',sourceFor('png').id);
    fill('열화상 묶음 1 탐지점 이름','M1=R, M2=S, M3=T, M4=N');
    named('열화상 묶음 1 탐지점 확인').click();named('열화상 묶음 1 사진 배치 확인').click();
    await until(async()=>{const d=(await lib.loadStudio('studio-test','project:yeonpyeong')).electrical.thermalDeliveries?.[0];return d?.pointsConfirmed&&d.imageConfirmed;},'thermal manual preparation saved');
    fill('열화상 묶음 1 image','');
    await until(async()=>!(await lib.loadStudio('studio-test','project:yeonpyeong')).electrical.thermalDeliveries[0].pointsConfirmed,'changed output invalidates manual preparation');
    [...document.querySelectorAll('.electrical-inputs button')].find(button=>button.textContent==='검증용 열화상.BMT').click();
    await until(()=>named('Testo 열화상 원본 확인')?.textContent.includes('2023-02-24'), 'BMT worker preview');
    check(named('Testo 열화상 원본 확인').textContent.includes('환산 검증 대기'), 'Native grid is not presented as Celsius');
    await until(()=>[...document.querySelectorAll('.studio-thermal-images img')].length===2 && [...document.querySelectorAll('.studio-thermal-images img')].every(img=>img.complete&&img.naturalWidth>0), 'embedded image decoding');
    named('미리보기 닫기').click();
    const thermalLink=(await lib.loadStudio('studio-test','project:yeonpyeong')).electrical.inputs.thermal[0];
    named(`${thermalLink.filename} 열화상 측정 연결 해제`).click();
    await until(async()=>!(await lib.loadStudio('studio-test','project:yeonpyeong')).electrical.inputs.thermal.some(link=>link.materialId===thermalLink.materialId),'thermal unlink');
    let protectedSource=false;try{await lib.removeMaterial('studio-test',thermalLink.materialId);}catch{protectedSource=true;}
    check(protectedSource&&(await lib.loadMaterial('studio-test',thermalLink.materialId)).size>0,'Project-owned original survives unlink and cannot be deleted from the shared byte store');
    const extraLinks=(await lib.loadStudio('studio-test','project:yeonpyeong')).electrical.inputs.thermal;
    for(const link of extraLinks){named(`${link.filename} 열화상 측정 연결 해제`).click();await wait(50);}
    finish('optional KEPCO scope and native BMT upload, source metadata and embedded images');
    fill('작성할 시설 보고서', '');
    await until(() => document.querySelector('.studio-dropzone')?.getAttribute('aria-disabled') === 'false', 'legacy workspace restored');
    check((await lib.loadStudio('studio-test')).title === '검증용 기술진단 보고서', 'Legacy draft is preserved');
    return passed;
}

async function projectWorkbenchChecks() {
    const lib=window.__library,archives=window.__archives,passed=[];
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const until=async(read,name)=>{for(let i=0;i<250;i++){if(await read())return;await wait(30);}throw new Error(`Project timeout: ${name}; ${document.querySelector('[role="alert"]')?.textContent}`);};
    const named=name=>document.querySelector(`[aria-label="${name}"]`);
    const button=name=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===name||b.getAttribute('aria-label')===name);
    const fill=(name,value)=>{const input=named(name),proto=input.tagName==='SELECT'?HTMLSelectElement.prototype:input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));};
    const check=(condition,message)=>{if(!condition)throw new Error(message);};
    const finish=name=>{passed.push(name);console.log(`PASS ${name}`);};
    fill('작성할 시설 보고서','project:daecheong');await until(()=>document.querySelector('.studio-electrical h1')?.textContent.includes('대청도'),'project selection');
    const dt=new DataTransfer();dt.items.add(new File([window.__fixture.hwpx],'금회 기준.hwpx'));dt.items.add(new File([window.__fixture.pdf],'금회 기준.pdf'));
    const reportPicker=named('프로젝트 기존 보고서 파일 선택');reportPicker.files=dt.files;reportPicker.dispatchEvent(new Event('change',{bubbles:true}));
    await until(()=>named('선택 보고서 서식 속성'),'automatic report analysis');
    let book=await lib.loadStudio('studio-test','project:daecheong');check(book.reportIds.length===2,'Multiple reports belong to selected project');
    check(document.querySelector('.studio-navigation').firstElementChild.textContent.includes('프로젝트 선택'),'Project selection is first in the sidebar');
    fill('보고서 기본 폰트','맑은 고딕');fill('보고서 좌 여백','18');fill('보고서 머릿글','금회 전기 진단');button('서식 저장·미리보기 적용').click();
    await until(async()=>(await lib.loadStudio('studio-test','project:daecheong')).reportSpecs?.[book.activeReportId]?.margins.left===18,'spec saved');
    check(document.querySelector('.studio-source-paper').style.fontFamily.includes('맑은 고딕'),'Saved report spec reaches middle workspace');
    check(getComputedStyle(document.querySelector('.studio-source-table td button')).color===getComputedStyle(document.querySelector('.studio-source-paper')).color,'Source table text remains readable on the white report page');
    finish('project-first sidebar, multiple reports, automatic analysis and editable specification');
    button('전기 진단 준비').click();await until(()=>named('운전전류 직접 측정 자료 선택'),'measurement input');
    const inputs=new DataTransfer();inputs.items.add(new File(['설비,R상(A)\nP-1,12.5'],'금회 운전전류.csv'));const picker=named('운전전류 직접 측정 자료 선택');picker.files=inputs.files;picker.dispatchEvent(new Event('change',{bubbles:true}));
    await until(async()=>(await lib.loadStudio('studio-test','project:daecheong')).electrical.inputs.current?.length===1,'measurement binding');
    await until(()=>!named('작성할 시설 보고서').disabled,'input ready');
    book=await lib.loadStudio('studio-test','project:daecheong');const originalId=book.activeReportId,material=(await lib.listMaterials('studio-test')).find(m=>m.id===originalId);
    named(`${material.filename} 보고서 작업 열기`).click();await until(()=>button('데이터 적용 작업 시작')?.disabled===false,'application button');button('데이터 적용 작업 시작').click();
    await until(()=>[...document.querySelectorAll('.studio-data-application td button')].some(b=>b.textContent==='12.5'),'CSV extraction through worker');
    [...document.querySelectorAll('.studio-data-application td button')].find(b=>b.textContent==='12.5').click();
    const option=[...named('보고서 적용 위치').options].find(o=>o.textContent.includes('2행 2열'));fill('보고서 적용 위치',option.value);
    button('선택 위치에 적용한 HWPX 후보 만들기').click();
    await until(async()=>(await lib.loadStudio('studio-test','project:daecheong')).applicationChanges?.length===1,'candidate created');
    await until(()=>named('선택 보고서 서식 속성')&&document.querySelector('.studio-source-paper')?.textContent.includes('12.5'),'candidate displayed');
    book=await lib.loadStudio('studio-test','project:daecheong');check(book.activeReportId!==originalId,'Original report is preserved');check(book.reportSpecs[book.activeReportId].margins.left===18,'Preview spec carries to candidate');
    const originalDoc=await window.__sourceParser.analyzeReport(await(await lib.loadMaterial('studio-test',originalId)).arrayBuffer(),'original.hwpx');
    const candidateDoc=await window.__sourceParser.analyzeReport(await(await lib.loadMaterial('studio-test',book.activeReportId)).arrayBuffer(),'candidate.hwpx');
    check(originalDoc.tables[0].cells.find(c=>c.row===1&&c.column===1).text==='220'&&candidateDoc.tables[0].cells.find(c=>c.row===1&&c.column===1).text==='12.5','Only the chosen target is replaced in actual HWPX');
    finish('measurement extraction starts a review and creates a source-preserving HWPX candidate');
    const bytes=await archives.exportProjectArchive('studio-test',book,'대청 통합 검증'),read=await archives.readProjectArchive(bytes);
    check(read.manifest.materials.length===4,'Archive includes two reports, measurement and candidate only');
    const archiveInput=named('통합 프로젝트 파일 선택'),data=new DataTransfer();data.items.add(new File([bytes],'통합 검증.jindanproj'));archiveInput.files=data.files;archiveInput.dispatchEvent(new Event('change',{bubbles:true}));
    await until(()=>!archiveInput.isConnected&&named('작성할 시설 보고서')?.value==='project:daecheong'&&document.querySelector('.studio-save')?.textContent.includes('이 PC'),'archive restored into selected registered project');
    await until(()=>named('선택 보고서 서식 속성'),'restored report opened');
    const restoredId=named('작성할 시설 보고서').value,restored=await lib.loadStudio('studio-test',restoredId);
    check(restored.applicationChanges.length===1&&restored.reportSpecs[restored.activeReportId].margins.left===18,'Archive restores changes and report settings');
    check((await lib.loadMaterial('studio-test',restored.activeReportId)).size>0,'Archive restores candidate bytes');
    check((await lib.listStudioProjects('studio-test')).some(project=>project.id.startsWith('archive:')),'Previous project workspace is backed up before restore');
    check(![...named('작성할 시설 보고서').options].some(option=>option.value.startsWith('archive:')),'Archives and backups never invent project-management entries');
    const other=await archives.importProjectArchive('archive-other-user',bytes);check((await lib.loadMaterial('archive-other-user',other.book.activeReportId)).size>0,'Portable bundle restores to another account scope');
    check(!(await lib.listStudioProjects('unrelated-user')).length,'Project restore is account scoped');
    finish('portable project file roundtrip preserves originals, measurements, specs and application history');
    return passed;
}

async function browserMain() {
    const { app, BrowserWindow } = require('electron');
    app.setPath('userData', process.env.REPORT_STUDIO_TEST_DATA);
    await app.whenReady();
    const deadline = setTimeout(() => { console.error('Studio browser checks exceeded 90 seconds'); app.exit(1); }, 90000);
    const window = new BrowserWindow({ show: false, width: 1520, height: 1050, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
    window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => callback({ cancel: new URL(details.url).hostname !== '127.0.0.1' }));
    window.webContents.on('console-message', (_event, level, message) => { if (message.startsWith('PASS') || level >= 3) console.log(message); });
    try {
        await window.loadURL(process.env.REPORT_STUDIO_TEST_URL);
        await window.webContents.executeJavaScript('new Promise((resolve,reject) => {let tries=0;const timer = setInterval(() => {if(document.querySelector(".studio-dropzone")?.getAttribute("aria-disabled") === "false"){clearInterval(timer);resolve();}else if(++tries>300){clearInterval(timer);reject(new Error("Studio did not start"));}},30);})');
        const output = path.join(__dirname, '..', '.firebase', 'report-studio-check'); await fs.mkdir(output, { recursive: true });
        const capture = async name => {
            const painted = new Promise(resolve => window.webContents.once('paint', resolve));
            window.webContents.invalidate(); await Promise.race([painted, new Promise(resolve => setTimeout(resolve, 800))]);
            await fs.writeFile(path.join(output, name), (await window.webContents.capturePage()).toPNG());
        };
        await capture('empty.png');
        const passed = await window.webContents.executeJavaScript(`(${browserChecks.toString()})()`);
        await new Promise(resolve => setTimeout(resolve, 180));
        await capture('populated.png');
        await window.webContents.executeJavaScript(`document.querySelectorAll('.studio-pane-tabs button')[1].click(); document.querySelectorAll('.studio-chapter-open')[2].click();`);
        await new Promise(resolve => setTimeout(resolve, 180));
        await capture('document.png');
        passed.push(...await window.webContents.executeJavaScript(`(${folderChecks.toString()})()`));
        await new Promise(resolve => setTimeout(resolve, 180));
        await capture('reference-project.png');
        passed.push(...await window.webContents.executeJavaScript(`(${pageTrialChecks.toString()})()`));
        await capture('reproduction.png');
        const loaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve)); window.reload(); await loaded;
        await window.webContents.executeJavaScript(`new Promise((resolve,reject) => { let tries=0; const timer=setInterval(()=>{ const root=document.querySelector('.report-studio'); if(root && document.querySelector('.studio-save')?.textContent.includes('이 PC')) {clearInterval(timer);resolve();} else if(++tries>200){clearInterval(timer);reject(new Error('Reload timed out'));}},30);})`);
        const reloaded = await window.webContents.executeJavaScript(`(async()=>{const book=await window.__library.loadStudio('studio-test'); const files=await window.__library.listMaterials('studio-test'); return {title:book.title,cover:book.coverId,body:book.chapters.some(c=>c.text.includes('본문 메모')),count:files.length};})()`);
        assert.equal(reloaded.title, '검증용 기술진단 보고서'); assert.ok(reloaded.cover && reloaded.body); assert.equal(reloaded.count, 5);
        const restoredTrial = await window.webContents.executeJavaScript(`window.__library.loadStudio('studio-test').then(b=>b.pageTrial.model.objects.map(o=>({text:o.text,width:o.width})))`);
        assert.equal(restoredTrial[0].text, '제7장 수정한 프로젝트'); assert.equal(restoredTrial[1].width,410);
        passed.push('reload preserves original files, classification, body, settings and editable page');
        const referenceReload = await window.webContents.executeJavaScript(`(async()=>{const projects=await window.__references.listReferenceProjects('studio-test'); const project=projects.find(p=>p.name==='검증 프로젝트'); const entries=await window.__references.listReferenceEntries('studio-test',project.id); document.querySelector('[aria-label="검증 프로젝트 프로젝트 원본 열기"]').click(); return {projects:projects.length,entries:entries.length,manual:entries.some(e=>e.componentKind==='appendix'&&e.pdfChoice),whole:!!project.wholePdfEntryId,analysis:project.analysis?.summary.totals.files};})()`);
        assert.equal(referenceReload.projects, 1); assert.equal(referenceReload.entries, 8); assert.ok(referenceReload.manual && referenceReload.whole); assert.equal(referenceReload.analysis,5);
        passed.push('reload preserves project paths, classification and PDF associations');
        passed.push(...await window.webContents.executeJavaScript(`(${electricalChecks.toString()})()`));
        passed.push(...await window.webContents.executeJavaScript(`(${projectWorkbenchChecks.toString()})()`));
        await capture('project-workbench.png');
        await window.webContents.executeJavaScript(`document.querySelector('[aria-label="작성할 시설 보고서"]').value='project:yeonpyeong'; document.querySelector('[aria-label="작성할 시설 보고서"]').dispatchEvent(new Event('change',{bubbles:true}));`);
        await new Promise(resolve => setTimeout(resolve, 180)); await capture('electrical.png');
        window.setSize(820, 950); await new Promise(resolve => setTimeout(resolve, 150));
        const responsive = await window.webContents.executeJavaScript(`(()=>{const button=document.querySelector('[aria-label="문서 설정 열기"]'); button.click(); return {display:getComputedStyle(button).display,scroll:document.documentElement.scrollWidth,width:innerWidth,overflow:[...document.querySelectorAll('.report-studio *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,6).map(e=>e.className)};})()`);
        await capture('compact.png');
        // Windows fractional scaling can round document width up by one CSS pixel.
        assert.notEqual(responsive.display, 'none', JSON.stringify(responsive)); assert.ok(responsive.scroll <= responsive.width + 1, JSON.stringify(responsive)); passed.push('compact window and accessible settings toggle');
        console.log(JSON.stringify({ scenarios: passed.length, passed, screenshots: output }, null, 2));
    } catch (error) { console.error(error); process.exitCode = 1; }
    finally { clearTimeout(deadline); window.destroy(); app.exit(process.exitCode || 0); }
}

async function nodeMain() {
    const { createServer } = await import('vite'), { default: react } = await import('@vitejs/plugin-react');
    const { spawn } = require('node:child_process'), os = require('node:os');
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'jindan-report-studio-'));
    const stream = 'BT /F1 18 Tf 72 740 Td (Fixture report) Tj ET';
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
    let pdf = '%PDF-1.4\n'; const offsets = [0];
    for (let index = 0; index < objects.length; index++) { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`; }
    const xref = pdf.length; pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const entry = `import React from 'react'; import {createRoot} from 'react-dom/client';
        import ReportStudio from '/src/components/ReportStudio.jsx'; import * as library from '/src/services/report/reportLibrary.js'; import * as references from '/src/services/report/referenceProjects.js'; import {zipSync,strToU8} from 'fflate';
        import '/src/index.css';
        import {dbService} from '/src/services/dbService.js';window.__dbService=dbService;
        dbService.setTable('프로젝트관리',[{id:'yeonpyeong',title:'연평도 검증 프로젝트'},{id:'baengnyeong',title:'백령도 검증 프로젝트'},{id:'daecheong',title:'대청도 검증 프로젝트'}]);
        window.__library=library; window.__references=references; window.__studioTest={confirm:true};
        window.__archives=await import('/src/services/report/projectArchive.js');window.__sourceParser=await import('/src/services/report/sourceParser.js');
        const p=t=>'<hp:p><hp:run><hp:t>'+t+'</hp:t></hp:run></hp:p>';
        const cell=(r,c,t)=>'<hp:tc><hp:subList>'+p(t)+'</hp:subList><hp:cellAddr rowAddr="'+r+'" colAddr="'+c+'"/><hp:cellSpan rowSpan="1" colSpan="1"/></hp:tc>';
        window.__fixture={pdf:${JSON.stringify(pdf)},bmt:Uint8Array.from(${JSON.stringify([...require('./fixtures/thermal-bmt.cjs').fixture()])}),
            hwpx:zipSync({mimetype:strToU8('application/hwp+zip'),'Contents/section0.xml':strToU8('<hs:sec xmlns:hs="sec" xmlns:hp="p">'+p('제1장 조사 개요')+p('[표 1] 전력품질 측정표')+'<hp:p><hp:run><hp:tbl rowCnt="2" colCnt="2"><hp:tr>'+cell(0,0,'설비')+cell(0,1,'전압')+'</hp:tr><hp:tr>'+cell(1,0,'A1')+cell(1,1,'220')+'</hp:tr></hp:tbl></hp:run></hp:p></hs:sec>')}),
            docx:zipSync({'word/document.xml':strToU8('<document/>')}),
            xlsx:zipSync({'[Content_Types].xml':strToU8('<Types/>'),'xl/workbook.xml':strToU8('<workbook/>')}),
            image:Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZl0AAAAASUVORK5CYII='),c=>c.charCodeAt(0))};
        const legacy = await new Promise((resolve,reject)=>{const request=indexedDB.open('jindan-report-studio');request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('materials',{keyPath:'key'}).createIndex('userId','userId');db.createObjectStore('files',{keyPath:'key'});db.createObjectStore('studios',{keyPath:'userId'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
        if(legacy.version===1) await new Promise((resolve,reject)=>{const tx=legacy.transaction(['studios','files'],'readwrite');tx.objectStore('studios').put({userId:'legacy-user',studio:{...library.createStudio(),title:'이전 저장 자료'}});tx.objectStore('files').put({key:JSON.stringify(['legacy-user','legacy-file']),blob:new Blob(['legacy'])});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
        legacy.close();
        createRoot(document.getElementById('root')).render(React.createElement(ReportStudio,{currentUser:{person_id:'studio-test'},onExit:()=>{},showConfirm:async()=>window.__studioTest.confirm,showPrompt:async()=> '제2장 기계 진단'}));`;
    const server = await createServer({ configFile: false, root: path.resolve(__dirname, '..'), envDir: temporary,
        optimizeDeps: { include: ['react', 'react-dom/client', 'lucide-react', 'fflate', 'cfb', 'fast-xml-parser'] },
        server: { host: '127.0.0.1', port: 0 }, plugins: [react(), { name: 'isolated-report-studio-test',
            resolveId(source) { if (source === '/__studio_test.jsx') return '\0studio-test-entry.jsx'; },
            load(id) { if (id === '\0studio-test-entry.jsx') return entry; },
            configureServer(vite) { vite.middlewares.use(async (request, response, next) => {
                if (request.url !== '/__studio_test') return next();
                const html = await vite.transformIndexHtml(request.url, '<html lang="ko"><body><div id="root"></div><script type="module" src="/__studio_test.jsx"></script></body></html>');
                response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html);
            }); },
        }] });
    try {
        await server.listen();
        const env = { ...process.env, REPORT_STUDIO_TEST_URL: `${server.resolvedUrls.local[0]}__studio_test`, REPORT_STUDIO_TEST_DATA: path.join(temporary, 'user-data') }; delete env.ELECTRON_RUN_AS_NODE;
        const child = spawn(require('electron'), [__filename], { env, stdio: 'inherit', windowsHide: true });
        process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
    } finally {
        await server.close();
        assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir())); assert.ok(path.basename(temporary).startsWith('jindan-report-studio-'));
        await fs.rm(temporary, { recursive: true, force: true });
    }
}
(process.versions.electron ? browserMain() : nodeMain()).catch(error => { console.error(error); process.exitCode = 1; });
