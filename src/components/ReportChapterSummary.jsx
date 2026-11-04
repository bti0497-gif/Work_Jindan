import {FORMAT_ROLES} from '../services/report/workflowAnalysis.js';

export default function ReportChapterSummary({analysis,selected,onSelect,reviews}){
    const edits=reviews?.sourceSha256===analysis.sourceSha256?reviews.items||{}:{};
    return <section className="studio-chapter-summary" aria-label="챕터별 분석 요약"><p className="studio-note">{analysis.purpose==='restoration'?'한글화할 장 카드를 선택하세요. 선택한 카드를 다시 누르면 해제됩니다. 왼쪽 한글보고서화는 선택한 장의 페이지만 변환합니다.':'새 보고서 작성을 위한 분석입니다. 챕터를 선택하면 오른쪽에서 분류와 서식을 수정할 수 있습니다.'}</p>
        <div className="studio-chapter-cards">{analysis.chapters.map(chapter=>{const count=chapter.counts,edit=edits[chapter.id];return <button key={chapter.id} className={`studio-chapter-card ${selected===chapter.id?'active':''}`} aria-label={`${chapter.title} 분석 요약 선택`} aria-pressed={selected===chapter.id} onClick={()=>onSelect(chapter.id)}>
            <strong>{edit?.title||chapter.title}</strong>{analysis.purpose==='restoration'&&<small>{selected===chapter.id?'선택됨 · 다시 누르면 해제':'장 선택'} · 원본 {chapter.pages.join(', ')}쪽</small>}<dl>{[['표',count.tables],['그림',count.pictures],['머리말 영역',count.headers],['꼬리말 영역',count.footers],['장 제목',count.chapterTitles],['중간·소제목',count.subheadings],['본문 문단',count.bodyParagraphs],['표 제목',count.tableCaptions]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}개</dd></div>)}<div><dt>본문 페이지</dt><dd>{count.bodyPages==null?'실제 쪽 수 미확인':`${count.bodyPages}쪽`}</dd></div>{count.totalPages!=null&&<div><dt>전체 / 공백 / 장 표지</dt><dd>{count.totalPages} / {count.blankPages} / {count.dividerPages}쪽</dd></div>}</dl>
            <span className="studio-chapter-fonts">사용 서체: {chapter.fonts.join(', ')||'확인 필요'}</span>{Object.entries(chapter.roleFonts).map(([role,fonts])=><small key={role}>{FORMAT_ROLES[role]}: {fonts.join(', ')}</small>)}
            {analysis.purpose==='restoration'&&<><small>이미지 글자 영역 {count.imageTextRegions}개 · OCR 없이 그림으로 보존</small><small>글자·표: 편집 개체로 복원할 후보 · 그림: 원문 자산 보존</small><small>복잡한 벡터 도형·정밀 조판: 추가 학습·대조 필요</small><small>실제 출력 재현: 검증 전</small></>}{analysis.purpose==='authoring'&&<small>머리말·꼬리말은 구역 공유 정의 수 · 실제 출력 대조 전</small>}
        </button>;})}</div>
    </section>;
}
