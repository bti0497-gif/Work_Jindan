import {PARAGRAPH_NUMBERS,PARAGRAPH_FLAGS} from '../services/report/paragraphFormatting.js';

export default function ReportParagraphControls({value={},original={},onChange,disabled=false,prefix='보고서'}){
    const set=(key,next)=>{const patch={...value};if(next==='')delete patch[key];else patch[key]=next;onChange(patch,key);};
    return <details className="studio-paragraph-controls"><summary>문단 모양 · 들여쓰기와 줄 나눔</summary>
        <p className="studio-note">빈 항목은 원본 설정을 유지합니다. 첫 줄 값은 양수로 들여쓰기, 음수로 내어쓰기를 지정합니다.</p>
        {Object.entries(PARAGRAPH_NUMBERS).map(([key,{label,min,max}])=><label key={key}>{label}<input aria-label={`${prefix} ${label}`} type="number" step=".1" min={min} max={max} disabled={disabled} placeholder={original[key]==null?'원본 유지':String(original[key])} value={value[key]??''} onChange={e=>set(key,e.target.value===''?'':Number(e.target.value))}/></label>)}
        <label>문단 정렬<select aria-label={`${prefix} 문단 정렬`} value={value.paragraphAlign||''} disabled={disabled} onChange={e=>set('paragraphAlign',e.target.value)}><option value="">원본 유지</option>{Object.entries({LEFT:'왼쪽',RIGHT:'오른쪽',CENTER:'가운데',JUSTIFY:'양쪽',DISTRIBUTE:'배분',DISTRIBUTE_SPACE:'나눔'}).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
        {Object.entries(PARAGRAPH_FLAGS).map(([key,label])=><label key={key}>{label}<select aria-label={`${prefix} ${label}`} disabled={disabled} value={value[key]==null?'':value[key]?'1':'0'} onChange={e=>set(key,e.target.value===''?'':e.target.value==='1')}><option value="">원본 유지{original[key]==null?'':original[key]?' · 켜짐':' · 꺼짐'}</option><option value="1">켜기</option><option value="0">끄기</option></select></label>)}
    </details>;
}
