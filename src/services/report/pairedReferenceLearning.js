import {pdfFontFamily} from './pdfFonts.js';
import {pdfFurnitureRegion} from './pdfRestoration.js';
import {learnTableMargins,applyTableMargins} from './pairedTableMargins.js';
const canonical=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'');
const own=p=>p.textSlots?.map(s=>s.text).join('')||'';
const sameStyle=styles=>{const values=styles.filter(Boolean),keys=new Set(values.map(s=>JSON.stringify([s.font,s.sizePt,s.widthPercent,s.spacingPercent,s.bold,s.italic,s.color,s.useFontSpace])));return values.length&&keys.size===1&&!/확인 필요/.test(values[0].font)?values[0]:null;};
const bodyLine=(line,page)=>!pdfFurnitureRegion(line.bbox,page,line.text)&&!page.tables.some(t=>line.bbox[0]>=t.bbox[0]-2&&line.bbox[1]>=t.bbox[1]-2&&line.bbox[2]<=t.bbox[2]+2&&line.bbox[3]<=t.bbox[3]+2);

export function learnPairedReference(pdf,document,profile,referenceMaterial){
    if(pdf?.schema!=='jindan-pdf-analysis/1'||document?.format!=='hwpx'||profile?.source?.sha256!==document.source?.sha256||referenceMaterial?.sha256!==document.source.sha256||!referenceMaterial.id)throw new Error('학습할 원본 PDF와 HWPX의 버전을 확인하세요.');
    const source=document.paragraphs.filter(p=>own(p).trim()&&canonical(p.text)===canonical(own(p))).map(p=>({p,text:canonical(own(p)),style:sameStyle(p.textSlots.filter(s=>s.text.trim()).map(s=>profile.characterStyles?.[s.charShapeId]))})).filter(p=>p.style),exact=new Map(),votes=new Map();
    for(const value of source){const list=exact.get(value.text)||[];list.push(value);exact.set(value.text,list);}
    // Full editable paragraphs can contain several character-spacing runs.
    // Keep the original run boundaries instead of rejecting the paragraph and
    // letting independently positioned PDF lines wrap over their neighbours.
    const paragraphExact=new Map();
    for(const p of document.paragraphs){
        const slots=p.textSlots?.filter(s=>s.text)||[];
        if(p.tableId||p.area&&p.area!=='body'||!slots.length||slots.some(s=>!s.plain||!s.textOnly)||canonical(p.text)!==canonical(own(p))||own(p).includes('\t'))continue;
        const runs=slots.map(s=>({text:s.text,typography:profile.characterStyles?.[s.charShapeId]})),visible=runs.filter(r=>r.text.trim()),style=visible[0]?.typography;
        if(!style||runs.some(r=>!r.typography?.reconstructionSupported||/확인 필요/.test(r.typography.font))||visible.some(r=>r.typography.sizePt!==style.sizePt))continue;
        // Uniform paragraphs retain their original explicit line-break text.
        // A mixed-run source whose owned slots omit a control boundary needs
        // explicit boundary mapping; do not silently flatten that boundary.
        const exactRuns=runs.map(r=>r.text).join('')===p.text;
        if(!exactRuns&&!sameStyle(visible.map(r=>r.typography)))continue;
        const text=canonical(own(p)),hits=paragraphExact.get(text)||[];hits.push({p,text,style,runs,exactRuns});paragraphExact.set(text,hits);
    }
    const fontVote=(row,anchor)=>{
        const text=canonical(row.text),fonts=row.sourceFonts||row.fonts||[];if(text.length<2||fonts.length!==1)return;
        const hits=exact.get(text)||(text.length>=8?source.filter(p=>p.text.includes(text)):[]),faces=new Set(hits.filter(p=>Math.abs(p.style.sizePt-(row.size||p.style.sizePt))<.4).map(p=>p.style.font));
        if(faces.size!==1)return;const face=[...faces][0],font=fonts[0],previous=votes.get(font)||new Map(),item=previous.get(face)||{sourceFont:font,referenceFont:face,anchors:[],texts:new Set()};
        item.texts.add(text);if(item.anchors.length<20)item.anchors.push({...anchor,referenceParagraphId:hits[0].p.id});previous.set(face,item);votes.set(font,previous);
    };
    for(const page of pdf.pages){page.lines.forEach((line,lineIndex)=>fontVote(line,{page:page.number,line:lineIndex}));for(const table of page.tables)for(const cell of table.cells)fontVote(cell,{page:page.number,tableId:table.id,cellId:cell.id});}
    const fonts=[],conflicts=[];
    for(const [font,choices]of votes){if(choices.size!==1){conflicts.push({sourceFont:font,reason:'서로 다른 원본 서체가 대응됨'});continue;}const item=[...choices.values()][0],known=pdfFontFamily(font);if(known&&known!==item.referenceFont){conflicts.push({sourceFont:font,referenceFont:item.referenceFont,reason:'PDF에 기록된 서체와 원본 한글 서체가 다름'});continue;}if(item.texts.size>=2)fonts.push({...item,matchCount:item.texts.size,texts:undefined});}
    const paragraphs=[],used=new Set();
    for(const page of pdf.pages){const lines=page.lines.map((l,index)=>({...l,index})).filter(l=>bodyLine(l,page));
        for(let start=0;start<lines.length;start++){if(used.has(`${page.number}:${lines[start].index}`))continue;let text='';
            for(let end=start;end<Math.min(lines.length,start+30);end++){const line=lines[end];if(line.vertical||end>start&&line.baseline-lines[end-1].baseline>Math.max(line.size,lines[end-1].size)*3)break;text+=canonical(line.text);if(text.length>15000)break;const hits=paragraphExact.get(text)||[];
                const selectedHits=line.manualReference?hits.filter(h=>h.p.id===line.manualReference.referenceParagraphId):hits;if(text.length<12&&!line.manualReference||selectedHits.length!==1)continue;const hit=selectedHits[0],style=profile.paragraphStyles?.[hit.p.paragraphShapeId],selected=lines.slice(start,end+1),nativeFonts=new Set(hit.runs.filter(r=>r.text.trim()).map(r=>r.typography.font));if(!style||hit.style.reconstructionSupported===false||selected.some(l=>Math.abs(l.size-hit.style.sizePt)>.4||(l.sourceFonts||l.fonts||[]).some(f=>pdfFontFamily(f)&&!nativeFonts.has(pdfFontFamily(f)))))continue;
                // Space-positioned native lines cannot be rebuilt from trimmed
                // paragraph text. Keep their observed PDF x and baseline.
                if(/^[ \t]{2,}/.test(own(hit.p)))continue;
                const appearance=selected.length===1&&selected[0].manualReference?.referenceParagraphId===hit.p.id?selected[0].manualReference.appearanceOverride:null;
                paragraphs.push({page:page.number,lineIndices:selected.map(l=>l.index),referenceParagraphId:hit.p.id,referenceSection:hit.p.anchor.section,text:hit.p.text,runs:hit.exactRuns?hit.runs.map(r=>({...r,typography:{...r.typography,...appearance}})):undefined,typography:{...hit.style,...appearance},appearanceOverride:appearance,paragraphStyle:style,referenceMargins:profile.sections.find(s=>s.section===hit.p.anchor.section)?.marginsHwpUnit});selected.forEach(l=>used.add(`${page.number}:${l.index}`));break;
            }
        }
    }
    // A paragraph's aggregate display text can include a nested caption/control.
    // For line emphasis alone, match its own editable text slots, never copy the
    // aggregate controls or relax the stricter whole-paragraph reconstruction.
    const emphasisExact=new Map();
    for(const p of document.paragraphs){
        if(p.tableId||p.area&&p.area!=='body'||!p.textSlots?.length||p.textSlots.some(s=>!s.plain||!s.textOnly))continue;
        const text=canonical(own(p)),style=sameStyle(p.textSlots.filter(s=>s.text.trim()).map(s=>profile.characterStyles?.[s.charShapeId]));
        if(!text||!style)continue;const list=emphasisExact.get(text)||[];list.push({p,style});emphasisExact.set(text,list);
    }
    const emphasis=[];
    for(const page of pdf.pages)page.lines.forEach((line,lineIndex)=>{
        if(!bodyLine(line,page)||line.manualReference||canonical(line.text).length<4)return;
        const hits=(emphasisExact.get(canonical(line.text))||[]).filter(h=>h.style.reconstructionSupported!==false);
        if(hits.length!==1)return;const hit=hits[0],known=(line.sourceFonts||line.fonts||[]).map(pdfFontFamily).filter(Boolean);
        if(hit.style.bold!==true||Math.abs(hit.style.sizePt-line.size)>.4||known.some(f=>f!==hit.style.font))return;
        emphasis.push({page:page.number,line:lineIndex,text:line.text,referenceParagraphId:hit.p.id,bold:true,typography:{...hit.style}});
    });
    const furniture=[];
    for(const page of pdf.pages)page.lines.forEach((line,lineIndex)=>{
        const area=pdfFurnitureRegion(line.bbox,page,line.text);if(!['header','footer'].includes(area)||canonical(line.text).length<4)return;
        const hits=(exact.get(canonical(line.text))||[]).filter(h=>h.p.area===area&&h.style.reconstructionSupported!==false);
        if(hits.length!==1)return;const hit=hits[0],known=(line.sourceFonts||line.fonts||[]).map(pdfFontFamily).filter(Boolean);
        if(Math.abs(hit.style.sizePt-line.size)>1||known.some(f=>f!==hit.style.font))return;
        furniture.push({page:page.number,line:lineIndex,area,text:line.text,referenceParagraphId:hit.p.id,typography:hit.style});
    });
    const matchedIds=new Set(paragraphs.map(p=>p.referenceParagraphId)),unmatchedParagraphs=source.filter(v=>!v.p.tableId&&(!v.p.area||v.p.area==='body')&&!matchedIds.has(v.p.id)).slice(0,2000).map(v=>({referenceParagraphId:v.p.id,text:own(v.p).trim().slice(0,4000),typography:v.style}));
    return {schema:'jindan-paired-reference-learning/1',pdfSourceSha256:pdf.source.sha256,referenceMaterialId:referenceMaterial.id,referenceSha256:referenceMaterial.sha256,fonts,paragraphs,emphasis,furniture,tables:learnTableMargins(pdf,profile),conflicts,unmatchedParagraphs,createdAt:new Date().toISOString(),status:'matched-source-evidence',verified:false};
}

export function applyPairedReference(pdf,learning){
    if(learning?.schema!=='jindan-paired-reference-learning/1'||learning.pdfSourceSha256!==pdf?.source?.sha256)throw new Error('서식 학습의 PDF 원본 버전이 다릅니다.');
    const mappings=new Map(learning.fonts.map(m=>[m.sourceFont,m.referenceFont])),style=row=>({...row,sourceFonts:row.sourceFonts||row.fonts,fonts:(row.sourceFonts||row.fonts||[]).map(f=>mappings.get(f)||f)});
    return {...pdf,pages:pdf.pages.map(page=>({...page,lines:page.lines.map((line,index)=>{const base={...line};if(base.pairedEmphasisSource){base.bold=base.pairedEmphasisSource.originalBold;delete base.pairedEmphasisSource;delete base.pairedTypography;delete base.pairedTypographySource;}const mapped=style(base),emphasis=learning.emphasis?.find(e=>e.page===page.number&&e.line===index&&canonical(e.text)===canonical(line.text));if(emphasis){mapped.bold=emphasis.bold;if(emphasis.typography){mapped.pairedTypography=emphasis.typography;mapped.pairedTypographySource=emphasis.referenceParagraphId;}mapped.pairedEmphasisSource={referenceParagraphId:emphasis.referenceParagraphId,referenceSha256:learning.referenceSha256,originalBold:base.bold};}const match=learning.furniture?.find(f=>f.page===page.number&&f.line===index&&canonical(f.text)===canonical(line.text));return match?{...mapped,pairedTypography:match.typography,pairedTypographySource:match.referenceParagraphId}:mapped;}),tables:page.tables.map(table=>applyTableMargins({...table,cells:table.cells.map(style)},page.number,learning))})),pairedLearning:learning};
}
