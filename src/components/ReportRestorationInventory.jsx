import {useMemo,useState} from 'react';
import {replacementInventory} from '../services/report/restoration.js';

const names={tbl:'표',pic:'그림',line:'직선',rect:'사각형',ellipse:'타원',polygon:'다각형',curve:'곡선',container:'묶음 도형',arc:'호',ole:'OLE 개체',equation:'수식'};
export default function ReportRestorationInventory({document,analysis,restoration,review,onReview,onTarget,onPage,onObject}){
    const [filter,setFilter]=useState('all');
    const inventory=useMemo(()=>replacementInventory(document,analysis,restoration),[document,analysis,restoration]);
    const choices=review?.sourceSha256===inventory.sourceSha256?review.choices||{}:{};
    const items=inventory.items.filter(i=>filter==='all'||i.category===filter);
    const patch=(id,status)=>onReview?.({sourceSha256:inventory.sourceSha256,choices:{...choices,[id]:status}});
    const exportList=()=>{
        const blob=new Blob([JSON.stringify({...inventory,items:inventory.items.map(i=>({...i,decision:choices[i.id]||'pending'}))},null,2)],{type:'application/json'});
        const url=URL.createObjectURL(blob),a=window.document.createElement('a');a.href=url;a.download='교체자료-검토목록.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    return <details className="studio-restoration-inventory"><summary>개체·교체 자료 검토 <span>{inventory.items.length}개 후보</span></summary>
        {restoration&&<div className="studio-object-summary" aria-label="한글 원본 개체 목록">{Object.entries(names).map(([kind,label])=>{const count=restoration.objects.filter(o=>o.kind===kind).length;return count?<span key={kind}>{label} {count}개 · 원본 개체 보존</span>:null;})}</div>}
        <p className="studio-note">원문 위치에 연결한 후보입니다. 교체 여부는 담당자가 결정하며, 측정값·판정은 자동 확정하지 않습니다. 목록의 결정만으로 원문을 변경하지 않습니다.</p>
        <div className="studio-restoration-toolbar"><select aria-label="교체 자료 종류" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">모든 자료</option>{['기간·날짜','측정·운전자료','판정·진단','개선·협의','사진·그래프'].map(c=><option key={c}>{c}</option>)}</select><button className="studio-secondary" onClick={exportList}>교체 자료 목록 저장</button><span>{inventory.items.filter(i=>choices[i.id]&&choices[i.id]!=='pending').length}/{inventory.items.length}개 검토</span></div>
        <ul className="studio-replacement-list">{items.slice(0,200).map(item=><li key={item.id}><button className="studio-replacement-location" onClick={()=>item.target.page?onPage?.(item.target.page):item.target.objectId?onObject?.(item.target.objectId):onTarget?.(item.target)}>{item.category} · {item.context}</button><p>{item.text}</p><label>처리<select aria-label={`${item.id} 교체 여부`} value={choices[item.id]||'pending'} onChange={e=>patch(item.id,e.target.value)}><option value="pending">검토 전</option><option value="replace">금회 자료로 교체</option><option value="keep">현황 확인 후 유지</option><option value="exclude">작성 대상에서 제외</option></select></label></li>)}</ul>
        {(items.length>200||inventory.limited)&&<p className="studio-note">화면에는 앞 200개를 표시합니다. 저장한 목록에서 전체 후보를 확인하세요.{inventory.limited?' 후보가 1,500개 한도에 도달했습니다. 나머지 원문도 검토하세요.':''}</p>}
    </details>;
}
