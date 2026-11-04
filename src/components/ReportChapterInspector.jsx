import {useState} from 'react';
import {FORMAT_ROLES} from '../services/report/workflowAnalysis.js';
import {specificationFromProfile,validateSpecification} from '../services/report/reportSpecification.js';
import ReportParagraphControls from './ReportParagraphControls.jsx';

export default function ReportChapterInspector({analysis,chapter,review,onChange,onExport,disabled}){
    const [role,setRole]=useState('body'),[error,setError]=useState('');if(!chapter)return null;
    const current=review?.sourceSha256===analysis.sourceSha256?review.items?.[chapter.id]||{}:{};
    const patch=change=>onChange({sourceSha256:analysis.sourceSha256,items:{...(review?.sourceSha256===analysis.sourceSha256?review.items:{}),[chapter.id]:{...current,...change}}});
    const first=analysis.sections.find(row=>row.chapterId===chapter.id&&row.formatRole===role),original=analysis.profile?.characterStyles?.[first?.charShapeIds?.[0]]||{},originalParagraph=analysis.profile?.paragraphStyles?.[first?.paragraphShapeId]||{},style=current.styles?.[role]||{};
    const exportStyle=()=>{try{if(analysis.limited)throw new Error('부분 분석 상태에서는 챕터 전체 서식을 적용할 수 없습니다. 범위를 나누어 다시 분석하세요.');const roleStyles=Object.fromEntries(Object.entries(current.styles||{}).filter(([,style])=>Object.keys(style).length)),spec={...specificationFromProfile(analysis.profile),applyBodyStyle:false,roleStyles,typographyScope:chapter.paragraphScope};onExport(validateSpecification(spec));setError('');}catch(reason){setError(reason.message);}};
    return <section className="studio-property-section studio-chapter-inspector" aria-label="선택 챕터 편집"><h2>{chapter.title}</h2>
        <label>챕터 이름<input aria-label="챕터 이름 수정" value={current.title??chapter.title} maxLength={160} disabled={disabled} onChange={e=>patch({title:e.target.value})}/></label>
        <label>분야<select aria-label="챕터 분야 수정" value={current.discipline||chapter.discipline} disabled={disabled} onChange={e=>patch({discipline:e.target.value})}>{Object.entries({common:'공통',process:'공정',mechanical:'기계',electrical:'전기',unknown:'미분류'}).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        <label>분석 검토 메모<textarea aria-label="챕터 분석 메모" rows={3} maxLength={2000} value={current.note||''} disabled={disabled} onChange={e=>patch({note:e.target.value})}/></label>
        <p className="studio-note">이름·분야·메모는 분석 분류를 보정합니다. 원문 글자는 자동으로 바꾸지 않습니다.</p>
        {analysis.purpose==='authoring'&&analysis.profile&&chapter.paragraphScope.length>0&&<><h2>이 챕터의 글자 서식</h2><label>대상<select aria-label="챕터 글자 서식 대상" value={role} onChange={e=>setRole(e.target.value)}>{Object.entries(FORMAT_ROLES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
            <p className="studio-note">원문 서체: {chapter.roleFonts[role]?.join(', ')||'확인 필요'}. 바꾼 항목만 선택 챕터의 원본 문단에 적용합니다.</p>
            {Object.entries({fontFamily:'글꼴',fontSizePt:'크기(pt)',widthPercent:'장평(%)',spacingPercent:'자간(%)',lineSpacingPercent:'줄간격(%)'}).map(([key,label])=><label key={`${role}:${key}`}>{label}<input aria-label={`챕터 ${label}`} type={key==='fontFamily'?'text':'number'} maxLength={key==='fontFamily'?150:undefined} placeholder={String(original[{fontFamily:'font',fontSizePt:'sizePt'}[key]||key]??'')} value={style[key]??''} disabled={disabled} onChange={e=>{const next={...style};if(e.target.value==='')delete next[key];else next[key]=key==='fontFamily'?e.target.value:Number(e.target.value);patch({styles:{...current.styles,[role]:next}});}}/></label>)}
            <ReportParagraphControls key={role} value={style} original={originalParagraph} prefix="챕터" disabled={disabled} onChange={next=>patch({styles:{...current.styles,[role]:next}})}/>
            <button className="studio-primary" disabled={disabled||analysis.limited||!Object.values(current.styles||{}).some(s=>Object.keys(s).length)} onClick={exportStyle}>선택 챕터 서식 HWPX 후보 만들기</button><p className="studio-note">용지·여백·머리말·꼬리말은 구역 공유 설정입니다. 아래 ‘구역 공통 서식’에서 수정합니다.</p>
        </>}
        <details><summary>머리말·꼬리말 분석</summary>{chapter.furniture.map(area=><p className="studio-note" key={area.id}>{area.kind==='header'?'머리말':'꼬리말'} · {area.shared?'구역 공유':`${area.applyPageType} 쪽 영역 후보`} · {area.text||'그림·표·쪽 번호 등 개체 영역'}</p>)}</details>
        {analysis.purpose==='restoration'&&<p className="studio-note">PDF의 서체·영역은 복원 근거입니다. 한글화 후보를 만든 후 새 보고서 작성 분석과 서식 편집을 진행합니다.</p>}
        {error&&<p role="alert" className="studio-error">{error}</p>}
    </section>;
}
