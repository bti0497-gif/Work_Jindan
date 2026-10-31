import { useEffect, useRef, useState } from 'react';
import { BookOpen, FileDown, LoaderCircle, ScanText } from 'lucide-react';
import { analyzeReferenceProject } from '../services/report/referenceLearning.js';
import { referenceAnalysisSignature } from '../services/report/referenceProjects.js';

const disciplineLabel = { process: '공정·일반', mechanical: '기계', electrical: '전기' };
export default function ReportReferenceAnalysis({ userId, project, entries, onChanged, onProgress }) {
    const [progress, setProgress] = useState(null), [error, setError] = useState('');
    const controller = useRef(null), alive = useRef(true), active = useRef(false);
    useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
    const analysis = project.analysis;
    const current = analysis?.signature === referenceAnalysisSignature(project, entries) && analysis.version === 1;
    const run = async () => {
        if (active.current) return;
        active.current = true; setError(''); controller.current = new AbortController();
        const initial = { index: 0, total: project.hwpxCount, name: 'HWPX 원본 확인 중' }; setProgress(initial); onProgress?.(initial);
        try {
            await analyzeReferenceProject(userId, project.id, { signal: controller.current.signal, onProgress: value => { if (alive.current) { setProgress(value); onProgress?.(value); } } });
            if (alive.current) onChanged();
        } catch (reason) { if (alive.current && reason.name !== 'AbortError') setError(reason.message); }
        finally { active.current = false; onProgress?.(null); if (alive.current) setProgress(null); }
    };
    const download = () => {
        const blob = new Blob([JSON.stringify(analysis, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), anchor = document.createElement('a');
        anchor.href = url; anchor.download = `${project.name}-양식분석.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    };
    return <section className="studio-analysis" aria-label="보고서 양식 분석과 패턴 저장">
        <header><div><span>양식 학습 · 1단계</span><h2>원본 구조 분석과 패턴 저장</h2><p>HWPX 안의 장·절, 용지·여백, 글꼴·문단 서식, 머리말·꼬리말과 표 구조를 읽습니다.</p></div><button className="studio-analysis-run" aria-label="양식 분석·패턴 저장" disabled={!!progress || !project.hwpxCount || project.status === 'importing'} onClick={run}>{progress ? <LoaderCircle size={16} className="studio-spin" /> : <ScanText size={16} />}{progress ? `${progress.index + 1}/${progress.total}개 분석 중` : analysis ? '양식 다시 분석' : '양식 분석·패턴 저장'}</button></header>
        {progress && <div className="studio-analysis-progress" role="status"><span>{progress.name}</span><progress max={progress.total} value={progress.index} aria-label="양식 분석 진행" /></div>}
        {error && <p className="studio-folder-error" role="alert">{error}</p>}
        {analysis ? <>
            <div className="studio-analysis-state"><strong>{!current ? '원본 구성 변경 · 재분석 필요' : analysis.status === 'partial' ? '일부 분석 실패 · 패턴 후보 저장' : '구조 분석 완료 · 패턴 후보 저장'}</strong><small>{new Date(analysis.createdAt).toLocaleString('ko-KR')}</small><button title="원본 근거가 포함된 양식 분석 결과 내려받기" aria-label="양식 분석 결과 내려받기" onClick={download}><FileDown size={14} />분석 결과</button></div>
            <div className="studio-analysis-counts"><span>분석 HWPX <b>{analysis.summary.totals.files}</b></span><span>논리 장 <b>{analysis.summary.chapters.length}</b></span><span>표 개체 <b>{analysis.summary.totals.tables.toLocaleString()}</b></span><span>그림 개체 <b>{analysis.summary.totals.pictures.toLocaleString()}</b></span></div>
            <div className="studio-analysis-patterns"><div><h3>문서 안에서 찾은 장 구성</h3>{analysis.summary.chapters.length ? <ol>{analysis.summary.chapters.map(chapter => <li key={chapter.number}><span>{chapter.title}</span><small>{disciplineLabel[chapter.discipline]} · 원본 {chapter.files.length}개</small></li>)}</ol> : <p>장 제목을 찾지 못했습니다. 표지·차례 원본인지 확인하세요.</p>}</div><div><h3>용지·글자 서식 후보</h3>{analysis.summary.layouts.slice(0, 3).map((layout, index) => <p key={index}>{layout.widthMm ?? '?'} × {layout.heightMm ?? '?'} mm · 좌우 여백 {layout.marginsMm.left ?? '?'}/{layout.marginsMm.right ?? '?'} mm <small>원본 {layout.files.length}개</small></p>)}{analysis.summary.typography.slice(0, 4).map((font, index) => <p key={index}>{font.font} · {font.sizePt}pt{font.bold ? ' · 굵게' : ''}<small>원본 {font.files.length}개에서 사용</small></p>)}</div></div>
            <details className="studio-analysis-files"><summary>파일별 근거와 분석 결과 {analysis.files.length}개</summary>{analysis.files.map(file => <details key={file.entryId}><summary>{file.error ? '분석 실패 · ' : ''}{file.relativePath}</summary>{file.error ? <p className="studio-folder-error">{file.error}</p> : <><p>문단 {file.profile.counts.paragraphs.toLocaleString()} · 표 {file.profile.counts.tables} · 그림 {file.profile.counts.pictures} · {file.pdfEntryId ? '대응 PDF 연결됨' : '대응 PDF 확인 필요'}</p><p>머리말 {file.profile.headers.length}개 · 꼬리말 {file.profile.footers.length}개 · 쪽 번호 {file.profile.pageNumbers.map(value => `${value.formatType} / ${value.pos}`).join(', ') || '명시 설정 없음'}</p>{file.profile.headings.slice(0, 5).map(heading => <p key={heading.paragraphId}>{heading.text}<small>원본 스타일 {heading.styleId || '없음'} · 문단 서식 {heading.paragraphShapeId || '없음'}</small></p>)}<small className="studio-analysis-hash">원본 SHA-256: {file.sha256}</small></>}</details>)}</details>
        </> : <p className="studio-analysis-empty"><BookOpen size={16} />폴더 등록은 완료됐습니다. 분석을 실행하면 재사용할 양식 후보와 원본 근거를 이 PC에 저장합니다.</p>}
        <p className="studio-analysis-limits">{analysis ? '다음 단계: 대응 PDF와 시각 대조 → 선택한 한 쪽을 편집 개체로 재현 → 동일성 검증 후 양식 확정.' : '학습은 원본에서 양식 규칙을 추출해 축적하는 방식입니다.'} 현재 단계에서 AI 모델 재훈련이나 원본 수정은 수행하지 않습니다. 과거 측정값·판정은 새 보고서 값으로 복사하지 않습니다.</p>
    </section>;
}
