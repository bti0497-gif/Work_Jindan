const {test}=require('node:test'),assert=require('node:assert/strict');
test('double borders span both observed strokes and gap; partial, dashed or unequal-color pairs do not invent doubles',async()=>{
 const {restoreDoublePdfBorders,hwpxBorderWidth}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfAppearance.js'),{pdfAuthoringPlan,writePdfHwpx}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/pdfHwpxWriter.js'),{readHwpxPackage}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/hwpxPackage.js'),{strFromU8}=require('fflate');
 const strokes=[100,101.08].map(at=>({axis:'h',at,start:60,end:260,widthPt:.36,color:'#000000',dash:[]})),cell={id:'c',row:0,column:0,rowSpan:1,colSpan:1,text:'Header',bbox:[60,80,260,100],borders:{bottom:{type:'SOLID',widthPt:.36,color:'#000000'}}},table={id:'t',rows:1,columns:1,columnWidths:[200],rowHeights:[20],bbox:cell.bbox,cells:[cell]},out=restoreDoublePdfBorders(table,strokes),edge=out.cells[0].borders.bottom;
 assert.equal(edge.type,'DOUBLE_SLIM');assert.ok(Math.abs(edge.widthPt-1.44)<.001);assert.equal(hwpxBorderWidth(edge.widthPt),'0.5 mm');assert.equal(edge.rulingPair.length,2);
 // Normalize a stored old analysis whose double border incorrectly used one stroke.
 assert.ok(Math.abs(restoreDoublePdfBorders({...table,cells:[{...cell,borders:{bottom:{type:'DOUBLE_SLIM',widthPt:.36}}}]},strokes).cells[0].borders.bottom.widthPt-1.44)<.001);
 for(const bad of [strokes.slice(0,1),[strokes[0],{...strokes[1],color:'#FF0000'}],[strokes[0],{...strokes[1],start:100}],[strokes[0],{...strokes[1],dash:[2,2]}]])assert.equal(restoreDoublePdfBorders(table,bad).cells[0].borders.bottom.type,'SOLID');
 const analysis={schema:'jindan-pdf-analysis/1',projectId:'project:border',source:{sha256:'a'.repeat(64)},pages:[{number:1,widthPt:595,heightPt:842,kind:'body',lines:[],images:[],tables:[table],rulingSegments:strokes}]};
 // Directly feed the audited restored table to the writer as analyses may be cached.
 analysis.pages[0].tables=[out];const entries=readHwpxPackage(writePdfHwpx(pdfAuthoringPlan(analysis,{pages:[1]},analysis.projectId,'reference')).bytes);assert.match(strFromU8(entries['Contents/header.xml']),/<hh:bottomBorder type="DOUBLE_SLIM" width="0.5 mm"/);
});
