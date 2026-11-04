const {test}=require('node:test'),assert=require('node:assert/strict');

test('combined PDF table item is assigned by complete painted glyph positions across real cell walls',async()=>{
    const {recoverPdfTables,pdfGraphics}=await import('../src/services/report/pdfStructure.js');
    const segments=[10,30,50].map(at=>({axis:'h',at,start:10,end:110}));segments.push(...[10,60,110].map(at=>({axis:'v',at,start:10,end:50})));
    const item=(text,x,baseline,width)=>({text,x,baseline,size:10,bbox:[x,baseline-10,x+width,baseline+1],font:'SourceFace',color:'#112233'});
    const glyphs=[...['12.3','45.6']].flatMap((text,c)=>[...text].map((t,i)=>item(t,20+c*50+i*5,42,5)));
    const combined=item('12.3 45.6',20,42,70),items=[item('A',20,22,5),item('B',70,22,5),combined],graphics={segments,textGlyphs:glyphs};
    const recovered=recoverPdfTables(items,graphics,1);assert.deepEqual(recovered.tables[0].cells.map(c=>c.text),['A','B','12.3','45.6']);assert.deepEqual(recovered.tables[0].cells[2].fonts,['SourceFace']);assert.equal(recovered.tables[0].cells[3].color,'#112233');assert.deepEqual(recovered.warnings,[]);
    for(const textGlyphs of [[],glyphs.slice(1),[...glyphs,glyphs[0]]]){
        const uncertain=recoverPdfTables(items,{segments,textGlyphs},1);assert.ok(uncertain.warnings.some(w=>w.includes('좌표')));assert.equal(uncertain.tables[0].cells.filter(c=>c.text===combined.text).length,1,'uncertain item must not be invented/distributed');
    }
    // A merged cell has no internal wall: its natural spaces must survive.
    const merged=recoverPdfTables(items,{segments:segments.map(s=>s.axis==='v'&&s.at===60?{...s,end:30}:s),textGlyphs:glyphs},1);assert.equal(merged.tables[0].cells.at(-1).text,combined.text);
    // Operator glyph positions are retained for body/table text as well as headers.
    const OPS={beginText:1,setFont:2,setTextMatrix:3,showText:4},paint=pdfGraphics({fnArray:[1,2,3,4],argsArray:[[],['f',10],[1,0,0,1,20,142],[[{unicode:'1',width:500},-1000,{unicode:'2',width:500}]]] },OPS,{transform:[1,0,0,-1,0,200]});assert.deepEqual(paint.textGlyphs.map(g=>[g.text,g.x,g.baseline]),[['1',20,58],['2',35,58]]);assert.equal(paint.headerGlyphs.length,2);
});

test('native PDF image decoding preserves RGB, transparency and padded 1-bit rows',async()=>{
    const {pdfImageRgba}=await import('../src/services/report/pdfImagePixels.js');
    assert.deepEqual([...pdfImageRgba({width:2,height:1,kind:2,data:new Uint8Array([255,0,0,0,255,0])})],[255,0,0,255,0,255,0,255]);
    assert.deepEqual([...pdfImageRgba({width:1,height:1,kind:3,data:new Uint8Array([5,6,7,0])})],[5,6,7,0]);
    const mono=pdfImageRgba({width:9,height:2,kind:1,data:new Uint8Array([128,128,0,0])});assert.equal(mono[0],255);assert.equal(mono[8*4],255);assert.equal(mono[9*4],0);assert.throws(()=>pdfImageRgba({width:2,height:2,kind:2,data:new Uint8Array(3)}),/색상/);
});

test('a pending original image read can be canceled without leaving the conversion waiting',async()=>{
    const {loadPdfImageObject}=await import('../src/services/report/pdfImagePixels.js');const controller=new AbortController();let callback;
    const pending=loadPdfImageObject({get:(_key,ready)=>{callback=ready;}},'image',controller.signal);controller.abort();await assert.rejects(pending,/취소/);callback({width:1,height:1});
    assert.deepEqual(await loadPdfImageObject({get:(_key,ready)=>ready({width:1,height:1})},'image'),{width:1,height:1});
});

test('PDF extraction keeps the embedded face name and table typography rather than a generic family',async()=>{
    const {pdfTextItems,pdfLines,recoverPdfTables}=await import('../src/services/report/pdfStructure.js'),{pdfFontFamily}=await import('../src/services/report/pdfFonts.js');
    const content={styles:{f:{fontFamily:'serif',sourceFont:'ABCDEF+H2hdrM'}},items:[{str:'제1장 개요',transform:[25,0,0,25,100,600],height:25,width:200,fontName:'f'}]};
    const items=pdfTextItems(content,{transform:[1,0,0,-1,0,842],scale:1}),lines=pdfLines(items);assert.equal(lines[0].fonts[0],'ABCDEF+H2hdrM');assert.equal(pdfFontFamily(lines[0].fonts[0]),'HY헤드라인M');assert.equal(pdfFontFamily('ABCDEF+TTD484DCD5tCID'),'');assert.equal(pdfFontFamily('sans-serif'),'');
    const segments=[10,30,50].map(at=>({axis:'h',at,start:10,end:210}));segments.push(...[10,110,210].map(at=>({axis:'v',at,start:10,end:50})));
    const cellItems=[[20,20,'A'],[120,20,'B'],[20,40,'C'],[120,40,'D']].map(([x,baseline,text])=>({x,baseline,text,size:12,font:'ABCDEF+Gulim',bbox:[x,baseline-10,x+15,baseline+1]}));
    const {tables}=recoverPdfTables(cellItems,{segments},1);assert.equal(tables[0].cells[0].size,12);assert.deepEqual(tables[0].cells[0].fonts,['ABCDEF+Gulim']);
});

test('reference HWPX preserves PDF type sizes, face references, paper size and table width as editable objects',async()=>{
    const {pdfAuthoringPlan,writePdfHwpx}=await import('../src/services/report/pdfHwpxWriter.js'),{analyzeReport}=await import('../src/services/report/sourceParser.js'),{unzipSync,strFromU8}=await import('fflate');
    const source={sha256:'a'.repeat(64)},table={id:'t',rows:2,columns:2,bbox:[50,320,250,360],columnWidths:[80,120],rowHeights:[20,20],cells:[0,1,2,3].map(i=>({id:'c'+i,row:Math.floor(i/2),column:i%2,rowSpan:1,colSpan:1,text:'Cell '+i,size:12,fonts:['ABCDEF+Gulim']}))};
    const pdf={schema:'jindan-pdf-analysis/1',projectId:'project:layout',source,pages:[{number:1,widthPt:612,heightPt:792,kind:'body',lines:[{text:'제1장 개요',size:25.02,fonts:['ABCDEF+H2hdrM'],bbox:[100,100,450,125]},{text:'Editable body',size:12,fonts:['ABCDEF+Gulim'],bbox:[50,200,400,212]}],images:[],tables:[table]}]};
    const plan=pdfAuthoringPlan(pdf,{pages:[1]},pdf.projectId,'reference'),out=writePdfHwpx(plan),files=unzipSync(out.bytes),header=strFromU8(files['Contents/header.xml']),section=strFromU8(files['Contents/section0.xml']);
    assert.ok(header.includes('face="HY헤드라인M"'));assert.ok(header.includes('face="굴림"'));assert.ok(header.includes('height="2502"'));assert.ok(header.includes('height="1200"'));assert.ok(section.includes('width="61200" height="79200"'));assert.ok(section.includes('<hp:sz width="20000"'));
    const doc=await analyzeReport(out.bytes,'restored.hwpx');assert.ok(doc.paragraphs.some(p=>p.text==='Editable body'));assert.equal(doc.tables[0].cells[2].text,'Cell 2');assert.ok(!Object.keys(files).some(p=>p.startsWith('BinData/')));
    const override=unzipSync(writePdfHwpx(plan,{spec:{fontFamily:'바탕',fontSizePt:11}}).bytes);assert.ok(strFromU8(override['Contents/header.xml']).includes('face="바탕"'));assert.ok(!strFromU8(override['Contents/header.xml']).includes('face="HY헤드라인M"'));
});
