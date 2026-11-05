import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const source='F:/jindan/src/services/scheduleService.js';
// This original file has no imports, I/O or initialization effects. Do not import
// syncService/dataService: those can initialize actual production services.
const {getSchedule}=await import(pathToFileURL(source));
const today='2026-11-05';
const vectors=[
 ['future',{startDate:'2026-11-06',endDate:'2026-11-20'}],
 ['first-day',{startDate:today,endDate:'2026-11-10'}],
 ['inclusive-last-day',{startDate:'2026-11-01',endDate:today}],
 ['one-day-inclusive',{startDate:today,endDate:today}],
 ['past-incomplete',{startDate:'2026-11-01',endDate:'2026-11-04'}],
 ['past-completed',{startDate:'2026-11-01',endDate:'2026-11-04',isCompleted:true}],
 ['completed-during-period',{startDate:'2026-11-01',endDate:'2026-11-10',isCompleted:true}],
 ['missing',{}],['reversed',{startDate:'2026-11-06',endDate:'2026-11-04'}],
 ['invalid-calendar',{startDate:'2026-02-30',endDate:today}],
 ['invalid-suffix',{startDate:'2026-11-01garbage',endDate:today}],
 ['iso-prefix',{startDate:'2026-11-01T00:00:00+09:00',endDate:today}],
 ['leap-year',{startDate:'2024-02-29',endDate:'2024-03-01'}],
 ['round-away',{startDate:'2026-11-04',endDate:'2026-11-11'}],
].map(([id,record])=>({id,today,fields:Object.fromEntries(Object.entries(record).map(([k,v])=>[k,String(v)])),expected:getSchedule(record,new Date(2026,10,5))}));
await mkdir('tests/fixtures/schedule66',{recursive:true});await writeFile('tests/fixtures/schedule66/golden.json',JSON.stringify({schema:1,source:'F:/jindan/src/services/scheduleService.js',sourceSha256:createHash('sha256').update(await readFile(source)).digest('hex'),vectors},null,2)+'\n');console.log('Wrote '+vectors.length+' preserved-source schedule vectors (new tree only)');
