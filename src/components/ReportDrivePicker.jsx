import {useEffect,useRef,useState} from 'react';
import {getFileBlob} from '../services/driveService.js';
import {DRIVE_ROOT_ID,readCachedFolder,refreshDriveFolder,isSharedDriveItem} from '../services/driveCacheService.js';
const folderType='application/vnd.google-apps.folder';
export default function ReportDrivePicker({projectName,initialFolder,onImport,onClose}) {
    const [path,setPath]=useState(initialFolder?.path||[{id:DRIVE_ROOT_ID,name:'파일관리 드라이브'}]),[files,setFiles]=useState([]),[selected,setSelected]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
    const alive=useRef(true),controller=useRef(null),folder=path.at(-1);
    useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
    useEffect(()=>{
        let cancelled=false;setSelected([]);setError('');setFiles(readCachedFolder(folder?.id)||[]);
        if(!folder?.id){setError('드라이브 연결 설정을 확인하세요.');return;}
        refreshDriveFolder(folder.id).then(items=>{if(!cancelled)setFiles(items);}).catch(reason=>{if(!cancelled)setError(reason.message);});
        return()=>{cancelled=true;};
    },[folder?.id]);
    const register=async()=>{
        if(!selected.length||busy)return;setBusy(true);setError('');const abort=new AbortController();controller.current=abort;
        try{
            const inputs=[],origins=[];let total=0;
            for(const [index,id]of selected.entries()){
                const item=files.find(file=>file.id===id);if(!item||Number(item.size)>160*1024*1024)throw new Error('보고서는 파일당 160MB 이하로 선택하세요.');
                setNotice(`${index+1}/${selected.length} · ${item.name} 가져오는 중`);
                const blob=await getFileBlob(id,{signal:abort.signal});total+=blob.size;if(total>512*1024*1024)throw new Error('한 번에 512MB 이하로 나누어 가져오세요.');
                inputs.push(new File([blob],item.name));origins.push({driveFileId:item.id,filename:item.name,modifiedTime:item.modifiedTime||'',folderPath:path.map(p=>p.name).join('/')});
            }
            if(alive.current&&!abort.signal.aborted){await onImport(inputs,origins,{path});if(alive.current)onClose();}
        }catch(reason){if(alive.current&&!abort.signal.aborted)setError(reason.message);}
        finally{controller.current=null;if(alive.current){setBusy(false);setNotice('');}}
    };
    return <div className="studio-preview-backdrop"><section className="studio-drive-picker" role="dialog" aria-modal="true" aria-label="프로젝트 드라이브 보고서 선택"><header><div><h2>{projectName} · 기존 보고서 가져오기</h2><p>이 프로젝트에 해당하는 PDF·HWP·HWPX만 선택하세요.</p></div><button className="studio-secondary" onClick={onClose}>닫기</button></header>
        <nav>{path.map((part,index)=><button key={`${part.id}:${index}`} disabled={busy} onClick={()=>setPath(path.slice(0,index+1))}>{part.name}</button>)}</nav>
        {error&&<p role="alert" className="studio-error">{error}</p>}
        <ul>{files.filter(isSharedDriveItem).filter(item=>item.mimeType===folderType||/\.(?:pdf|hwpx|hwp)$/i.test(item.name)).map(item=><li key={item.id}>{item.mimeType===folderType?<button className="studio-secondary" disabled={busy} onClick={()=>setPath([...path,{id:item.id,name:item.name}])}>📁 {item.name}</button>:<label><input type="checkbox" disabled={busy} checked={selected.includes(item.id)} onChange={event=>setSelected(event.target.checked?[...selected,item.id]:selected.filter(id=>id!==item.id))}/>{item.name}</label>}</li>)}</ul>
        {!files.length&&<p className="studio-note">폴더 목록을 불러오거나 보고서가 없는 폴더입니다.</p>}
        {notice&&<p role="status">{notice}</p>}<footer><span>{selected.length}개 선택 · 원본은 드라이브에 유지</span><button className="studio-secondary" disabled={busy||!selected.length||selected.length>50} onClick={register}>이 프로젝트에 가져오기</button></footer>
    </section></div>;
}
