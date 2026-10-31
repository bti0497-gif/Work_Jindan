import {useEffect,useState} from 'react';
import {specificationFromProfile,validateSpecification} from '../services/report/reportSpecification.js';

export default function ReportSpecification({profile,saved,onApply,disabled}) {
    const [draft,setDraft]=useState(()=>saved||specificationFromProfile(profile)),[error,setError]=useState('');
    useEffect(()=>{setDraft(saved||specificationFromProfile(profile));setError('');},[profile,saved]);
    const patch=value=>setDraft(previous=>({...previous,...value}));
    return <section className="studio-property-section studio-report-spec" aria-label="선택 보고서 서식 속성">
        <h2>선택한 보고서의 스펙</h2><small>{profile?.source.filename}</small>
        {profile?.sections?.length>1&&<label>구역<select aria-label="서식 구역 선택" value={draft.section} onChange={event=>{const section=profile.sections.find(item=>item.section===event.target.value);patch({section:section.section,widthMm:section.widthMm,heightMm:section.heightMm,margins:{left:section.marginsMm.left,right:section.marginsMm.right,top:section.marginsMm.top,bottom:section.marginsMm.bottom},header:profile.headers.find(item=>item.section===section.section)?.text||'',footer:profile.footers.find(item=>item.section===section.section)?.text||''});}}>{profile.sections.map((section,i)=><option key={`${section.section}-${i}`} value={section.section}>구역 {i+1} · {section.widthMm}×{section.heightMm}</option>)}</select></label>}
        <div className="studio-property-row">{['widthMm','heightMm'].map((key,i)=><label key={key}>{i?'용지 높이(mm)':'용지 너비(mm)'}<input type="number" aria-label={i?'보고서 용지 높이':'보고서 용지 너비'} value={draft[key]} min="50" max="1200" step=".1" onChange={event=>patch({[key]:Number(event.target.value)})}/></label>)}</div>
        <label>기본 폰트<input aria-label="보고서 기본 폰트" value={draft.fontFamily} maxLength={150} onChange={event=>patch({fontFamily:event.target.value})}/></label>
        <label>본문 글자 크기(pt)<input aria-label="보고서 글자 크기" type="number" min="5" max="72" step=".5" value={draft.fontSizePt} onChange={event=>patch({fontSizePt:Number(event.target.value)})}/></label>
        <div className="studio-property-row">{Object.entries({top:'상',bottom:'하',left:'좌',right:'우'}).map(([key,label])=><label key={key}>{label} 여백(mm)<input aria-label={`보고서 ${label} 여백`} type="number" min="0" max="300" step=".1" value={draft.margins[key]} onChange={event=>patch({margins:{...draft.margins,[key]:Number(event.target.value)}})}/></label>)}</div>
        <label>머릿글<textarea aria-label="보고서 머릿글" rows={2} value={draft.header} onChange={event=>patch({header:event.target.value})}/></label>
        <label>바닥글<textarea aria-label="보고서 바닥글" rows={2} value={draft.footer} onChange={event=>patch({footer:event.target.value})}/></label>
        {Object.entries({headerVisible:'머릿글 표시',footerVisible:'바닥글 표시',chapterTitleVisible:'장 제목 포함',pageNumberVisible:'페이지 번호 표시'}).map(([key,label])=><label className="studio-checkbox" key={key}><input type="checkbox" aria-label={label} checked={draft[key]} onChange={event=>patch({[key]:event.target.checked})}/>{label}</label>)}
        <label>페이지 번호 형식<select aria-label="보고서 페이지 번호 형식" value={draft.pageNumberFormat} onChange={event=>patch({pageNumberFormat:event.target.value})}><option value="DIGIT">숫자</option><option value="ROMAN_CAPITAL">로마 대문자</option><option value="ROMAN_SMALL">로마 소문자</option></select></label>
        <button className="studio-secondary" disabled={disabled} onClick={()=>{try{onApply(validateSpecification(draft));setError('');}catch(reason){setError(reason.message);}}}>서식 저장·미리보기 적용</button>
        {error&&<p className="studio-error" role="alert">{error}</p>}
        <p className="studio-note">원본에서 찾은 서식 후보를 수정합니다. 정밀 쪽 배치·한글 출력 적용은 별도 검증이 필요합니다. 새 장은 홀수 쪽, 빈 쪽은 머릿글·바닥글·번호 숨김을 유지합니다.</p>
    </section>;
}
