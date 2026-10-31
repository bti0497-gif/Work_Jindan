import { useEffect, useState } from 'react';
import { loadMaterial } from '../services/report/reportLibrary.js';
import { pageTrialSvg, validatePageTrial } from '../services/report/pageReproduction.js';

function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function PageTrialView({ userId, trial, selectedId, onSelect, onImport }) {
    const [reference, setReference] = useState(''), [compare, setCompare] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => {
        let cancelled = false, url; setReference(''); setError('');
        if (trial) loadMaterial(userId, trial.pdfMaterialId).then(blob => {
            if (!cancelled) { url = URL.createObjectURL(blob); setReference(url); }
        }).catch(reason => { if (!cancelled) setError(reason.message); });
        return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
    }, [userId, trial?.pdfMaterialId]);
    const exportPdf = async () => {
        setBusy(true); setError('');
        try {
            if (!window.electron?.invoke) throw new Error('PDF 내보내기는 데스크톱 앱에서 사용할 수 있습니다.');
            const bytes = await window.electron.invoke('report-page-pdf', validatePageTrial(trial.model));
            if (!bytes?.length) throw new Error('PDF 내보내기를 연결하려면 개발 앱을 다시 실행하세요.');
            download(new Blob([bytes], { type: 'application/pdf' }), '한쪽-재현시험.pdf');
        } catch (reason) { setError(reason.message); }
        finally { setBusy(false); }
    };
    if (!trial) return <div className="studio-library"><div className="studio-page-heading"><span>PAGE REPRODUCTION</span><h1>한 쪽 재현시험</h1><p>원본을 분석해 만든 페이지를 불러오면 글자와 도형을 선택해 수정할 수 있습니다.</p></div><button className="studio-secondary" onClick={onImport}>재현 페이지 불러오기</button><p className="studio-note">등록한 HWPX·PDF와 해시가 일치하는 재현 자료(JSON)를 사용합니다.</p></div>;
    const model = trial.model;
    return <div className="studio-page-trial">
        <header className="studio-trial-heading"><span>한 쪽 재현시험 · 편집 가능한 작성본</span><h1>{model.title}</h1><small>{model.width.toFixed(2)} × {model.height.toFixed(2)} pt · 원본 PDF {model.source.pdfPage}쪽 · 글자 {model.objects.filter(o => o.type === 'text').length}개 · 도형 {model.objects.filter(o => o.type === 'panel').length}개</small></header>
        <div className="studio-trial-toolbar"><button className="studio-secondary" aria-pressed={compare} onClick={() => setCompare(value => !value)}>원본 나란히 보기</button><button className="studio-secondary" disabled={busy} onClick={exportPdf}>{busy ? 'PDF 만드는 중' : 'PDF 내보내기'}</button><button className="studio-secondary" onClick={() => download(new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' }), '한쪽-재현시험.json')}>편집본 저장</button><button className="studio-secondary" onClick={onImport}>다른 쪽 불러오기</button></div>
        {error && <p className="studio-error" role="alert">{error}</p>}
        <p className="studio-note">가운데 글자·도형을 클릭하고 오른쪽에서 수정하세요. 변경은 이 PC에 저장됩니다.</p>
        <div className={`studio-trial-pages ${compare ? 'comparing' : ''}`}>
            {compare && <section><h2>원본 PDF · {model.source.pdfPage}쪽</h2>{reference && <iframe title="재현 대조용 원본 PDF" src={`${reference}#page=${model.source.pdfPage}&toolbar=0&navpanes=0&view=FitH`} />}</section>}
            <section><h2>편집 가능한 재현본</h2><div className="studio-trial-paper" onClick={event => { const id = event.target.closest('[data-object-id]')?.getAttribute('data-object-id'); if (id) onSelect(id); }} dangerouslySetInnerHTML={{ __html: pageTrialSvg(model, selectedId) }} /></section>
        </div>
        <p className="studio-note">장 표지의 위치·서체·도형을 대조하는 시험입니다. 복잡한 표·본문의 자동 조판과 HWPX 내보내기는 추가 검증이 필요합니다.</p>
    </div>;
}
export function PageTrialInspector({ trial, selectedId, onSelect, onChange }) {
    if (!trial) return <p className="studio-inspector-help">재현 페이지를 불러오면 글자와 도형을 편집합니다.</p>;
    const object = trial.model.objects.find(o => o.id === selectedId);
    const change = patch => onChange({ ...trial, model: validatePageTrial({ ...trial.model, objects: trial.model.objects.map(o => o.id === selectedId ? { ...o, ...patch } : o) }) });
    const numeric = (key, value, min, max) => { const v = Number(value); if (value !== '' && v >= min && v <= max) change({ [key]: v }); };
    const field = (key, label, min, max) => <label key={key}>{label} (pt)<input aria-label={`재현 ${key}`} type="number" min={min} max={max} step="0.1" value={Math.round(object[key] * 100) / 100} onChange={event => numeric(key, event.target.value, min, max)} /></label>;
    return <>
        <section className="studio-property-section"><h2>페이지 개체</h2><label>선택할 글자·도형<select aria-label="재현 개체 선택" value={selectedId} onChange={event => onSelect(event.target.value)}><option value="">개체를 선택하세요</option>{trial.model.objects.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label></section>
        {object && <section className="studio-property-section" key={object.id}><h2>{object.label}</h2>{object.type === 'text' && <><label>글자 내용<textarea aria-label="재현 글자 내용" value={object.text} rows={4} maxLength={2000} onChange={event => change({ text: event.target.value.replace(/[\r\n]/g, '') })} /></label><label>글꼴<input aria-label="재현 글꼴" value={object.fontFamily} maxLength={100} onChange={event => change({ fontFamily: event.target.value })} /></label>{field('fontSize', '글자 크기', 1, 200)}</>}
            <div className="studio-property-row">{field('x', '가로 위치', -2400, 4800)}{field('y', '세로 위치', -2400, 4800)}</div>
            {object.type === 'panel' && <><div className="studio-property-row">{field('width', '너비', 0.01, 2400)}{field('height', '높이', 0.01, 2400)}</div>{field('radius', '모서리 반경', 0, 500)}</>}
            <label>글자·채우기 색<input aria-label="재현 색" type="color" value={object.fill === 'none' ? '#ffffff' : object.fill} onChange={event => change({ fill: event.target.value })} /></label>
            {object.type === 'panel' && <label>테두리 색<input type="color" value={object.stroke === 'none' ? '#ffffff' : object.stroke} onChange={event => change({ stroke: event.target.value, strokeWidth: object.strokeWidth || 1 })} /></label>}
            {object.type === 'text' && <p className="studio-note">연결된 HWPX 문단 {object.sourceParagraphs.length}개 · 긴 문구는 페이지 안에 들어가는지 확인하세요.</p>}
        </section>}
        <section className="studio-property-section"><h2>재현 근거</h2><p className="studio-note">{trial.model.source.method}</p><p className="studio-note">비교 대상: {trial.model.source.pdfName} {trial.model.source.pdfPage}쪽</p></section>
    </>;
}
