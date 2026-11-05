const {test}=require('node:test'),assert=require('node:assert/strict');
const source={sha256:'d'.repeat(64)},projectId='project:hwpx-fidelity';
const line=(text,y=100)=>({text,size:10,bbox:[60,y,300,y+12],baseline:y+10,fonts:['Gulim']});
const page=(number,extra={})=>({number,widthPt:595.22,heightPt:842,kind:'body',lines:[line('Editable body')],images:[],tables:[],...extra});
async function output(pages,spec,pictures={}){
    const {pdfAuthoringPlan,writePdfHwpx}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfHwpxWriter.js');
    const {unzipSync,strFromU8}=await import('fflate');
    const plan=pdfAuthoringPlan({schema:'jindan-pdf-analysis/1',projectId,source,pages},{pages:pages.map(p=>p.number)},projectId,'reference'),out=writePdfHwpx(plan,{spec,pictures});
    const entries=unzipSync(out.bytes),xml=Object.fromEntries(Object.entries(entries).filter(([n])=>/\.xml$|content\.hpf$/.test(n)).map(([n,b])=>[n,strFromU8(b)]));
    const {XMLValidator}=await import('fast-xml-parser');for(const [name,text]of Object.entries(xml))assert.equal(XMLValidator.validate(text),true,name);
    return {...out,entries,xml,plan};
}

test('open outside table rules retain first/last columns and infer individual fills, text colors, alignment and rule widths',async()=>{
    const {pdfGraphics,pdfTextItems,recoverPdfTables}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfStructure.js'),{OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const ops=[],args=[],add=(op,value)=>{ops.push(OPS[op]);args.push(value);};
    add('save',[]);add('setFillRGBColor',['#808080']);
    add('constructPath',[OPS.fill,[new Float32Array([0,100,100,1,300,100,1,300,120,1,100,120,4])],[100,100,300,120]]);
    add('setFillRGBColor',['#ffffff']);add('showText',[[{unicode:'A'},{unicode:'B'}]]);add('restore',[]);
    add('showText',[[{unicode:'C'},{unicode:'D'}]]);add('setStrokeRGBColor',['#112233']);add('setLineWidth',[1.5]);
    for(const y of [100,120,140])add('constructPath',[OPS.stroke,[new Float32Array([0,100,y,1,300,y])],[100,y,300,y]]);
    add('constructPath',[OPS.stroke,[new Float32Array([0,200,100,1,200,140])],[200,100,200,140]]);
    const graphics=pdfGraphics({fnArray:ops,argsArray:args},OPS,{transform:[1,0,0,1,0,0]});
    const quadrilateral=pdfGraphics({fnArray:[OPS.constructPath],argsArray:[[OPS.fill,[new Float32Array([0,100,100,1,300,100,1,290,120,1,100,120,4])],[100,100,300,120]]] },OPS,{transform:[1,0,0,1,0,0]});assert.equal(quadrilateral.fills.length,0);
    const content={styles:{f:{sourceFont:'Gulim'}},items:[[145,114,'A'],[245,114,'B'],[102,134,'C'],[287,134,'D']].map(([x,y,str])=>({str,fontName:'f',transform:[10,0,0,10,x,y],height:10,width:10}))};
    const items=pdfTextItems(content,{transform:[1,0,0,1,0,0],scale:1},graphics.textPaints),{tables}=recoverPdfTables(items,graphics,1);
    assert.equal(tables.length,1);assert.equal(tables[0].columns,2);assert.deepEqual(tables[0].cells.map(c=>c.text),['A','B','C','D']);
    const cells=tables[0].cells;assert.equal(cells[0].background,'#808080');assert.equal(cells[0].color,'#FFFFFF');assert.equal(cells[2].color,'#000000');assert.equal(cells[0].align,'CENTER');assert.equal(cells[3].align,'RIGHT');
    assert.equal(cells[0].borders.left.type,'NONE');assert.equal(cells[1].borders.right.type,'NONE');assert.equal(cells[0].borders.top.widthPt,1.5);assert.equal(cells[0].borders.top.color,'#112233');
    const out=await output([page(1,{tables})]);const header=out.xml['Contents/header.xml'],section=out.xml['Contents/section0.xml'];
    for(const cellXml of section.matchAll(/<hp:tc\b[\s\S]*?<\/hp:tc>/g)){
        const text=cellXml[0],value=text.match(/<hp:t>(.*?)<\/hp:t>/)[1],border=text.match(/borderFillIDRef="(\d+)"/)[1],charId=text.match(/charPrIDRef="(\d+)"/)[1];
        const definition=header.match(new RegExp(`<hh:borderFill id="${border}"[^>]*>[\\s\\S]*?<\\/hh:borderFill>`))[0];
        const char=header.match(new RegExp(`<hh:charPr id="${charId}"[^>]*>`))[0];
        if(value==='A'){assert.ok(definition.includes('faceColor="#808080"'));assert.ok(definition.includes('width="0.5 mm" color="#112233"'));assert.ok(definition.includes('<hh:leftBorder type="NONE"'));assert.ok(char.includes('textColor="#FFFFFF"'));}
        if(value==='D')assert.ok(char.includes('textColor="#000000"'));
    }
    const {analyzeReport}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/sourceParser.js'),{createReportTextCandidate}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/applicationData.js');
    const doc=await analyzeReport(out.bytes,'table.hwpx'),table=doc.tables[0];assert.equal(table.cells.length,4);
    const edited=await createReportTextCandidate(out.bytes,'table.hwpx',doc.source.sha256,{tableId:table.id,cellId:table.cells[0].id},'Edited A');
    const reread=await analyzeReport(edited.bytes,'edited.hwpx');assert.equal(reread.tables[0].cells[0].text,'Edited A');
});

test('page sections preserve mixed paper, per-page furniture, blank-page hiding and actual native page-number restart',async()=>{
    const pages=[page(11,{lines:[line('HEADER FIRST',25),line('First body'),line('- 54 -',815)]}),page(12,{kind:'blank',widthPt:842,heightPt:595.22,lines:[]}),page(13,{widthPt:1190.55,heightPt:841.89,lines:[line('HEADER THIRD',25),line('Last body'),line('- 56 -',815)]})];
    const out=await output(pages),header=out.xml['Contents/header.xml'],sections=[0,1,2].map(i=>out.xml[`Contents/section${i}.xml`]);
    assert.ok(header.includes('secCnt="3"'));assert.ok(sections[0].includes('width="59522" height="84200"'));assert.ok(sections[1].includes('width="84200" height="59522"'));assert.ok(sections[2].includes('width="119055" height="84189"'));
    assert.ok(sections[0].includes('HEADER FIRST')&&!sections[0].includes('HEADER THIRD'));assert.ok(sections[2].includes('HEADER THIRD')&&!sections[2].includes('HEADER FIRST'));
    for(const flag of ['hideFirstHeader','hideFirstFooter','hideFirstPageNum'])assert.ok(sections[1].includes(`${flag}="1"`));
    assert.ok(sections[1].includes('pageStartsOn="BOTH"'));assert.ok(sections[1].includes('<hp:newNum num="55" numType="PAGE"'));
    const manifest=out.xml['Contents/content.hpf'];for(let i=0;i<3;i++)assert.ok(manifest.includes(`href="Contents/section${i}.xml"`)&&manifest.includes(`idref="section${i}" linear="yes"`));
    const c=await import('@rhwp/core'),fs=require('node:fs');globalThis.measureTextWidth=(_font,text)=>text.length*6;
    await c.default({module_or_path:fs.readFileSync(require.resolve('@rhwp/core/rhwp_bg.wasm'))});const doc=new c.HwpDocument(out.bytes);
    try{assert.equal(doc.pageCount(),3);assert.deepEqual([0,1,2].map(i=>JSON.parse(doc.getPageInfo(i)).pageNumber),[54,55,56]);assert.ok(JSON.parse(doc.getPageInfo(2)).width>1500);const text=n=>doc.renderPageSvg(n).replace(/<[^>]*>/g,'').replace(/\s/g,'');assert.ok(!text(1).includes('HEADER'));assert.ok(text(2).includes('HEADERTHIRD'));assert.ok(!text(2).includes('HEADERFIRST'));}finally{doc.free();}
    const overridden=await output(pages,{startPageNumber:101,margins:{header:12,footer:13,gutter:2}});assert.ok(overridden.xml['Contents/section2.xml'].includes('<hp:newNum num="103"'));assert.ok(overridden.xml['Contents/section0.xml'].includes('header="3402" footer="3685" gutter="567"'));
});

test('reference geometry retains short rows and rejects overlapping or incomplete merged-cell grids',async()=>{
    const cells=[0,1,2,3].map(i=>({row:Math.floor(i/2),column:i%2,rowSpan:1,colSpan:1,text:String(i)}));
    const table={id:'geometry',rows:2,columns:2,columnWidths:[100.004,100.006],rowHeights:[8,9],bbox:[60,200,260.01,217],cells};
    const out=await output([page(1,{tables:[table]})]);assert.ok(out.xml['Contents/section0.xml'].includes('height="800"'));assert.ok(out.xml['Contents/section0.xml'].includes('<hp:sz width="20001"'));
    await assert.rejects(output([page(1,{tables:[{...table,cells:[...cells,cells[0]]}]})]),/겹칩니다/);
    await assert.rejects(output([page(1,{tables:[{...table,cells:cells.slice(1)}]})]),/누락된 셀/);
});

test('a printed number above the last 45pt becomes a native page field while nearby numeric table data stays in the body',async()=>{
    const {pdfPrintedPageNumber,pdfFurnitureRegion}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfRestoration.js');
    const p=page(20,{lines:[line('Body'),line('- 54 -',788),line('123',780)],tables:[{bbox:[50,770,350,795]}]});
    assert.equal(pdfFurnitureRegion(p.lines[2].bbox,p,'123'),null);
    // The actual page number is outside the body table.
    p.lines[1].bbox=[270,789,315,800];p.tables[0].bbox=[50,770,250,795];assert.equal(pdfPrintedPageNumber(p),54);
    const out=await output([page(20,{lines:[line('Body'),p.lines[1]]})]);assert.ok(out.xml['Contents/section0.xml'].includes('<hp:newNum num="54"'));assert.ok(!out.xml['Contents/section0.xml'].includes('<hp:t>- 54 -</hp:t>'));
    const mixed=await output([page(19),page(20,{lines:[line('Body'),p.lines[1]]})]);assert.ok(!mixed.xml['Contents/section0.xml'].includes('<hp:autoNum '));assert.ok(mixed.xml['Contents/section1.xml'].includes('<hp:autoNum num="54" numType="PAGE"'));
    const following=await output([page(20,{lines:[line('Body'),p.lines[1]]}),page(21)]);assert.ok(following.xml['Contents/section1.xml'].includes('hideFirstPageNum="1"'));
});

test('WordArt shadow layers retain sub-point offsets, embedded face identity and interleaved glyph order',async()=>{
    const {pdfGraphics,pdfTextItems,pdfLines}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfStructure.js'),{OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs'),{pdfFurniture}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfRestoration.js');
    const fnArray=[],argsArray=[],add=(name,args)=>{fnArray.push(OPS[name]);argsArray.push(args);},glyph=(unicode,width=1000)=>({unicode,width});
    for(const [delta,color]of [[.96,'#b2b2b2'],[0,'#000000']]){
        add('setFillRGBColor',[color]);add('beginText',[]);add('setFont',['f',10]);
        add('setTextMatrix',[new Float32Array([1,0,0,1,30+delta,50+delta])]);add('showText',[[glyph('年'),glyph('度'),glyph(' ',300),-700,glyph('大'),glyph('清')]]);
        for(const [x,text]of [[10,'2021'],[50,'('],[80,')']]){add('setTextMatrix',[new Float32Array([1,0,0,1,x+delta,50+delta])]);add('showText',[[...text].map(c=>glyph(c,text.length===4?500:1000))]);}
    }
    const viewport={transform:[1,0,0,1,0,0],scale:1},graphics=pdfGraphics({fnArray,argsArray},OPS,viewport),items=[];
    for(const d of [.96,0])for(const [x,str,width]of [[30,'年度 大清',50],[10,'2021',20],[50,'(',10],[80,')',10]])items.push({str,fontName:'f',transform:[10,0,0,10,x+d,50+d],width,height:10});
    const lines=pdfLines(pdfTextItems({styles:{f:{sourceFont:'HY견고딕'}},items},viewport,graphics.textPaints,graphics.headerGlyphs));
    assert.equal(lines.length,2);assert.ok(lines.every(l=>l.text==='2021年度(大清)'));assert.deepEqual(new Set(lines.map(l=>l.color)),new Set(['#000000','#B2B2B2']));
    const area=pdfFurniture(page(104,{lines}))[0];assert.equal(area.textEffects.length,1);assert.ok(Math.abs(area.textEffects[0].offsetXPt-.96)<.0001);assert.ok(Math.abs(area.textEffects[0].offsetYPt-.96)<.0001);
    const out=await output([page(104,{lines:[...lines,line('Body')]})]),s=out.xml['Contents/section0.xml'],h=out.xml['Contents/header.xml'];assert.equal((s.match(/2021年度\(大清\)/g)||[]).length,2);assert.ok(h.includes('face="HY견고딕"'));assert.ok(h.includes('textColor="#B2B2B2"'));const evidence=JSON.parse(require('fflate').strFromU8(out.entries['Contents/jindan-source.json'])).furnitureCoordinates[0].changes.filter(c=>c.area==='header');assert.deepEqual(evidence.map(c=>c.sourcePaperOffset.x).sort((a,b)=>a-b),[1000,1096]);assert.equal(Math.abs(evidence[0].localOffset.x-evidence[1].localOffset.x),96);for(const c of evidence)assert.ok(s.includes('horzOffset="'+c.localOffset.x+'"'));
    // A partial glyph trace is never substituted for a complete header.
    const partial=pdfLines(pdfTextItems({styles:{f:{}},items},viewport,graphics.textPaints,graphics.headerGlyphs.slice(1)));assert.ok(partial.every(l=>l.text.endsWith('大清()')));
});

test('clipped gradient rectangles and narrow punctuation images survive graphics state restoration',async()=>{
    const {pdfGraphics}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfStructure.js'),{OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs'),fnArray=[],argsArray=[],add=(op,a)=>{fnArray.push(OPS[op]);argsArray.push(a);};
    const rect=(paint,box,repeat=false)=>{const [l,t,r,b]=box;add('constructPath',[OPS[paint],[new Float32Array([0,l,t,1,r,t,1,r,b,1,l,b,...(repeat?[1,l,t]:[4])])],box]);};
    add('save',[]);add('eoClip',[]);rect('endPath',[10,20,100,30]);add('setFillRGBColor',['#808080']);rect('fill',[0,0,200,200],true);add('restore',[]);
    add('setFillRGBColor',['#112233']);rect('fill',[0,40,200,45]);add('transform',[1,0,0,2,80,90]);add('paintImageXObject',['punctuation']);
    const g=pdfGraphics({fnArray,argsArray},OPS,{transform:[1,0,0,1,0,0]});assert.deepEqual(g.fills.map(f=>f.bbox),[[10,20,100,30],[0,40,200,45]]);assert.equal(g.images.length,1);assert.deepEqual(g.images[0].bbox,[80,90,81,92]);
});

test('embedded SFNT font families are bounded and opaque CID names stay unresolved',async()=>{
    const {pdfEmbeddedFontFamily,pdfFontFamily}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfFonts.js');
    const name='HYgtrE',data=Buffer.from(name,'utf16le');data.swap16();const bytes=Buffer.alloc(46+data.length);bytes.writeUInt32BE(0x10000,0);bytes.writeUInt16BE(1,4);bytes.write('name',12);bytes.writeUInt32BE(28,20);bytes.writeUInt32BE(18+data.length,24);bytes.writeUInt16BE(1,30);bytes.writeUInt16BE(18,32);bytes.writeUInt16BE(3,34);bytes.writeUInt16BE(1,36);bytes.writeUInt16BE(0x412,38);bytes.writeUInt16BE(1,40);bytes.writeUInt16BE(data.length,42);data.copy(bytes,46);
    assert.equal(pdfEmbeddedFontFamily(bytes),'HY견고딕');assert.equal(pdfFontFamily('CIDFont+F2'),'');assert.equal(pdfEmbeddedFontFamily(bytes.subarray(0,47)),'');bytes.writeUInt16BE(0,32);assert.equal(pdfEmbeddedFontFamily(bytes),'');
});

test('mixed raster/native pages keep every fragment at PAPER coordinates and remain one native page',async()=>{
    const png=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')),images=[{id:'body',kind:'text-raster',bbox:[130,530,525,542],operator:90},{id:'dot',kind:'text-raster',bbox:[555,600,556,602],operator:91}],pictures=Object.fromEntries(images.map(i=>[i.id,{bytes:png,width:1,height:1}]));
    const table={id:'t',rows:2,columns:2,bbox:[60,200,260,240],columnWidths:[100,100],rowHeights:[20,20],cells:[0,1,2,3].map(i=>({row:Math.floor(i/2),column:i%2,rowSpan:1,colSpan:1,text:'C'+i}))};
    const out=await output([page(104,{lines:[line('Header',40),line('Native heading',460),line('- 104 -',788)],images,tables:[table],decorationFills:[{bbox:[60,58,530,60],color:'#999999',operator:8}],decorationLines:[{axis:'h',at:770,start:60,end:530,widthPt:.8,color:'#999999'}]})],undefined,pictures),s=out.xml['Contents/section0.xml'];
    assert.deepEqual(out.plan.positionedPages,[104]);assert.equal((s.match(/<hp:pic /g)||[]).length,2);assert.ok(s.includes('vertOffset="53000" horzOffset="13000"'));assert.ok(s.includes('vertOffset="60000" horzOffset="55500"'));const footer=JSON.parse(require('fflate').strFromU8(out.entries['Contents/jindan-source.json'])).furnitureCoordinates[0].changes.find(c=>c.area==='footer'&&c.sourcePaperOffset.y===77000);assert.equal(footer.sourcePaperOffset.x,6000);assert.ok(s.includes('vertOffset="'+footer.localOffset.y+'" horzOffset="'+footer.localOffset.x+'"'));assert.ok(s.includes('<hp:autoNum num="104" numType="PAGE"'));assert.ok(!s.includes('<hp:pageNum '));assert.ok(s.includes('prefixChar="" suffixChar=""'));assert.ok(s.includes('<hp:t>- </hp:t><hp:ctrl><hp:autoNum num="104" numType="PAGE"'));assert.ok(s.includes('</hp:autoNum></hp:ctrl><hp:t> -</hp:t>'));
    assert.ok(s.match(/<hp:tbl\b[\s\S]*?vertRelTo="PAPER"/));for(const bytes of Object.entries(out.entries).filter(([n])=>n.startsWith('BinData/')).map(([,b])=>b))assert.deepEqual(bytes,png);
    const c=await import('@rhwp/core'),fs=require('node:fs');globalThis.measureTextWidth=(_font,text)=>text.length*6;await c.default({module_or_path:fs.readFileSync(require.resolve('@rhwp/core/rhwp_bg.wasm'))});const doc=new c.HwpDocument(out.bytes);try{assert.equal(doc.pageCount(),1);const svg=doc.renderPageSvg(0);assert.equal((svg.match(/<image /g)||[]).length,2);assert.ok(svg.replace(/<[^>]*>/g,'').replace(/\s/g,'').includes('Nativeheading'));}finally{doc.free();}
    const {analyzeReport}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/sourceParser.js'),read=await analyzeReport(out.bytes,'native.hwpx');assert.equal(read.tables.length,1);assert.ok(read.paragraphs.some(p=>p.text==='Native heading'));
});
