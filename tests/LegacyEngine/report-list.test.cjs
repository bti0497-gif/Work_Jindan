const {test}=require('node:test'),assert=require('node:assert/strict');

test('removing a generated report returns to its source and preserves original analysis, evidence and files',async()=>{
    const {removeStudioReport}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/reportList.js'),{studioMaterialIds}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/studioProjects.js');
    const book={reportIds:['pdf','hwpx','styled'],activeReportId:'hwpx',materialIds:['csv'],reportAnalyses:{pdf:{sourceSha256:'hash'},hwpx:{sourceSha256:'native'}},reportMetadata:{hwpx:{pairedMaterialId:'pdf'}},pdfWritingRuns:[{candidateMaterialId:'hwpx',sourceMaterialId:'pdf'}]};
    const next=removeStudioReport(book,'hwpx');assert.deepEqual(next.reportIds,['pdf','styled']);assert.equal(next.activeReportId,'pdf');assert.deepEqual(next.removedReportIds,['hwpx']);assert.equal(next.reportAnalyses,book.reportAnalyses);assert.equal(next.pdfWritingRuns,book.pdfWritingRuns);assert.deepEqual(next.materialIds,['csv']);assert.ok(studioMaterialIds(next).has('hwpx'));assert.deepEqual(book.reportIds,['pdf','hwpx','styled']);
});
test('removed imports stay out of inferred folder lists and explicit registration restores them',async()=>{
    const {studioReportIds,removeStudioReport,addStudioReports}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/reportList.js');
    const original={reportIds:['pdf'],activeReportId:'pdf'},removed=removeStudioReport(original,'pdf'),materials=[{id:'pdf',role:'reference'}],entries=[{materialId:'pdf',filename:'source.pdf'}];
    assert.deepEqual(studioReportIds(removed,materials,entries),[]);assert.equal(removed.activeReportId,'');assert.deepEqual(original.reportIds,['pdf']);
    const restored=addStudioReports(removed,['pdf','pdf']);assert.deepEqual(restored.reportIds,['pdf']);assert.deepEqual(restored.removedReportIds,[]);assert.deepEqual(studioReportIds(restored,materials,entries),['pdf']);
});
test('removing another report preserves the current choice and removing the last report yields an empty workspace',async()=>{
    const {removeStudioReport}=await import('../../src/Jindan.Report.Worker/engine/src/services/report/reportList.js');
    const book={reportIds:['a','b','c'],activeReportId:'b'};
    assert.equal(removeStudioReport(book,'a').activeReportId,'b');assert.equal(removeStudioReport(book,'b').activeReportId,'c');
    const last=removeStudioReport({reportIds:['native'],activeReportId:'native'},'native');assert.deepEqual(last.reportIds,[]);assert.equal(last.activeReportId,'');assert.throws(()=>removeStudioReport(last,'missing'),/찾을 수 없습니다/);
});
