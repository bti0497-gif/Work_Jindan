using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json.Nodes;
using Jindan.Contracts;
using Jindan.Report.Adapter;

var root=Path.GetFullPath(args.FirstOrDefault()??Directory.GetCurrentDirectory());
var node=args.ElementAtOrDefault(1)??(Environment.GetEnvironmentVariable("PATH")??"").Split(Path.PathSeparator).Select(p=>Path.Combine(p,"node.exe")).FirstOrDefault(File.Exists)??throw new FileNotFoundException("Pass the explicit installed Node executable as the second argument.");
var temporary=Path.Combine(Path.GetTempPath(),"jindan-report-adapter66-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(temporary);
var source=Path.Combine(temporary,"synthetic.hwpx");var worker=Path.Combine(root,"src/Jindan.Report.Worker/worker.mjs");
var generator="""
import {writeFile} from 'node:fs/promises';
import {pdfAuthoringPlan,writePdfHwpx} from './src/Jindan.Report.Worker/engine/src/services/report/pdfHwpxWriter.js';
const projectId='project:adapter66-synthetic',table={id:'t1',rows:2,columns:2,bbox:[50,200,400,260],columnWidths:[175,175],rowHeights:[30,30],cells:[['Label',0,0],['Measurement',0,1],['BOD',1,0],['12.3',1,1]].map(([text,row,column])=>({id:`c${row}${column}`,text,row,column,rowSpan:1,colSpan:1,bbox:[50+column*175,200+row*30,225+column*175,230+row*30]}))};
const pdf={schema:'jindan-pdf-analysis/1',projectId,source:{sha256:'a'.repeat(64)},pages:[{number:1,widthPt:595,heightPt:842,kind:'body',discipline:'process',chapter:'Synthetic',images:[],tables:[table],lines:[]}]};
await writeFile(process.argv[2],writePdfHwpx(pdfAuthoringPlan(pdf,{pages:[1]},projectId,'reference')).bytes);
""";
var generatorInfo=new ProcessStartInfo(node){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};generatorInfo.ArgumentList.Add("--input-type=module");generatorInfo.ArgumentList.Add("-");generatorInfo.ArgumentList.Add(source);
using(var process=Process.Start(generatorInfo)!){await process.StandardInput.WriteAsync(generator);process.StandardInput.Close();await process.WaitForExitAsync();if(process.ExitCode!=0)throw new Exception("Synthetic fixture generation failed.");}
var sha=Convert.ToHexStringLower(SHA256.HashData(await File.ReadAllBytesAsync(source)));
var context=new DocumentContext("report66-context","report-studio","project:adapter66-synthetic","synthetic-user");
using var service=new ReportService(temporary,node,worker,10000);
ReportCommand Command(string operation,string? contextPath=null,string? filled=null)=>new(operation,context.ProjectId!,source,sha,ContextPath:contextPath,FilledPath:filled,Parameters:new(){["filename"]="synthetic.hwpx"});
var pass=0;
void Check(bool condition,string name){if(!condition)throw new Exception("FAIL "+name);Console.WriteLine("PASS "+name);pass++;}
foreach(var preserved in new[]{"F:/jindan","F:/jindan-maintenance"}){var attempted=Path.Combine(preserved,"report-guard-"+Guid.NewGuid().ToString("N"));var denied=false;try{using var invalid=new ReportService(attempted,node,worker);}catch(ArgumentException){denied=true;}Check(denied&&!Directory.Exists(attempted),"protected report constructor creates no preserved-root child");}
var invalidRuntimeRoot=Path.Combine(temporary,"invalid-runtime");var runtimeRefused=false;try{using var invalid=new ReportService(invalidRuntimeRoot,Path.Combine(temporary,"missing-node.exe"),worker);}catch(ArgumentException){runtimeRefused=true;}Check(runtimeRefused&&!Directory.Exists(invalidRuntimeRoot),"invalid runtime is rejected before report output directory creation");
async Task<JsonNode> Payload(ReportReply reply){Check(reply.Ok,"successful bound reply");return JsonNode.Parse(await File.ReadAllTextAsync(reply.ResultJsonPath!))!;}
var analyze=await service.ExecuteAsync(context,Command("analyze"));var analyzed=await Payload(analyze);var bundle=analyzed["value"]!;var fingerprint=bundle["fingerprint"]!.GetValue<string>();
Check(analyze.ReportReady==false&&bundle["material"]!["sha256"]!.GetValue<string>()==sha,"exact source SHA and false approval");
Check(service.ActiveWorkerCount==0,"owned process exited before completion");
var plan=await Payload(await service.ExecuteAsync(context,Command("prepareDraft")));Check(plan["value"]!["canWriteDraft"]!.GetValue<bool>()==false,"unreviewed draft remains pending");
Check((await service.ExecuteAsync(context,Command("writeDraft"))).ErrorCode=="ACKNOWLEDGEMENT_REQUIRED","host acknowledgment required");
var items=new JsonObject();foreach(var row in bundle["analysis"]!["sections"]!.AsArray())items[row!["id"]!.GetValue<string>()]=row["text"]!.GetValue<string>()=="12.3"?new JsonObject{["decision"]="replace",["contentRole"]="measurement",["clearValue"]=true}:new JsonObject{["decision"]="keep",["contentRole"]="label",["retentionPurpose"]="static-label"};
var draftContext=new JsonObject{["review"]=new JsonObject{["sourceSha256"]=sha,["items"]=items},["draftMode"]="blank",["materials"]=new JsonArray()};var reviewFile=Path.Combine(temporary,"review-context.json");await File.WriteAllTextAsync(reviewFile,draftContext.ToJsonString());
var wrongAck=false;try{await service.AcknowledgeReviewAsync(context,new string('a',64),fingerprint,reviewFile);}catch{wrongAck=true;}Check(wrongAck,"wrong source acknowledgment rejected");
await service.AcknowledgeReviewAsync(context,sha,fingerprint,reviewFile);
var draft=await Payload(await service.ExecuteAsync(context,Command("writeDraft",reviewFile)));Check(draft["value"]!["review"]!["status"]!.GetValue<string>()=="blank-working-draft","synthetic blank draft actual engine path");
var collection=await Payload(await service.ExecuteAsync(context,Command("exportCollection",reviewFile)));var collectionPath=collection["value"]!["bytes"]!["$workerFile"]!["path"]!.GetValue<string>();
var returned=await Payload(await service.ExecuteAsync(context,Command("importCollection",reviewFile,collectionPath)));Check(returned["value"]!["rows"]!.AsArray().All(r=>r!["value"]!.GetValue<string>()==""),"same-cell blank collection return");
await File.AppendAllTextAsync(reviewFile," ");Check((await service.ExecuteAsync(context,Command("writeDraft",reviewFile))).ErrorCode=="REVIEW_CHANGED","changed context bytes invalidate acknowledgment");
service.Invalidate(context.ContextId);Check((await service.ExecuteAsync(context,Command("prepareDraft"))).ErrorCode=="REANALYSIS_REQUIRED","invalidate clears old bundle");
Check((await service.ExecuteAsync(context with{UserId="other-user"},Command("analyze"))).ErrorCode=="CONTEXT_MISMATCH","same context cannot change owner");
Check((await service.ExecuteAsync(context,Command("analyze")with{SourceSha256=new string('0',64)})).ErrorCode=="FILE_HASH_MISMATCH","file version checked before worker");
var recoveredContextFile=Path.Combine(temporary,"recovery-context.json");await File.WriteAllTextAsync(recoveredContextFile,new JsonObject{["files"]=new JsonArray(new JsonObject{["id"]="source",["role"]="source",["filename"]="synthetic.hwpx",["parentIds"]=new JsonArray(),["fileKey"]="source"}),["state"]=new JsonObject{["untrustedApproval"]=true}}.ToJsonString());
var recovery=await Payload(await service.ExecuteAsync(context,Command("createRecovery",recoveredContextFile)));var archive=recovery["value"]!["bytes"]!["$workerFile"]!;var archivePath=archive["path"]!.GetValue<string>();var archiveSha=archive["sha256"]!.GetValue<string>();
var recovered=await Payload(await service.ExecuteAsync(context,new ReportCommand("recover",context.ProjectId!,archivePath,archiveSha)));Check(recovered["value"]!["manifest"]!["state"]!["untrustedApproval"]!.GetValue<bool>(),"recovery preserves state only as untrusted data");Check((await service.ExecuteAsync(context,Command("writeDraft",reviewFile))).ErrorCode=="REANALYSIS_REQUIRED","recovery never restores old review approval");
Check(Convert.ToHexStringLower(SHA256.HashData(await File.ReadAllBytesAsync(source)))==sha,"original synthetic source remains unchanged");
using var controls=new ReportService(Path.Combine(temporary,"process-controls"),node,worker,500,true);
Check((await controls.ExecuteAsync(context,Command("test:cpu"))).ErrorCode=="TIMEOUT","noncooperative CPU timeout kills owned process");Check(controls.ActiveWorkerCount==0,"timeout awaited process exit");
using var cancel=new CancellationTokenSource();var progress=new InlineProgress(_=>cancel.Cancel());var canceled=await controls.ExecuteAsync(context,Command("test:hang"),progress,cancel.Token);Check(canceled.ErrorCode=="CANCELLED"&&controls.ActiveWorkerCount==0,"cancel owns kill and exit wait");
Check((await controls.ExecuteAsync(context,Command("test:crash"))).ErrorCode=="WORKER_CRASH","worker crash refused");Check((await controls.ExecuteAsync(context,Command("test:echo"))).Ok,"fresh process retry after crash");
var concurrent=await Task.WhenAll(Enumerable.Range(0,3).Select(i=>controls.ExecuteAsync(context with{ContextId="concurrent-"+i},Command("test:echo"))));Check(concurrent.All(r=>r.Ok)&&concurrent.Select(r=>r.RequestId).Distinct().Count()==3,"concurrent requests remain bound");
Check(controls.ActiveWorkerCount==0,"all owned concurrent children exited");
var binaryOutput=await controls.ExecuteAsync(context,Command("test:binary-limit")with{Parameters=new(){["length"]="1024"}});Check(binaryOutput.Ok&&binaryOutput.Artifacts.Any(item=>item.Size==1024&&item.MediaType=="application/octet-stream"),"bounded binary sidecar passes actual C# adapter artifact validation");
Check((await controls.ExecuteAsync(context,Command("test:binary-limit")with{Parameters=new(){["length"]="1025"}})).ErrorCode=="OUTPUT_LIMIT","oversized binary sidecar is refused before successful adapter reply");
using var guarded=new ReportService(Path.Combine(temporary,"authorization"),node,worker,10000,authorize:(_,_,_)=>Task.FromException(new UnauthorizedAccessException("synthetic authorization denial")));
Check(!(await guarded.ExecuteAsync(context,Command("analyze"))).Ok&&guarded.ActiveWorkerCount==0,"injected actor/project authorization rejects before worker launch");
var deniedAck=false;try{await guarded.AcknowledgeReviewAsync(context,sha,fingerprint,reviewFile);}catch(UnauthorizedAccessException){deniedAck=true;}Check(deniedAck,"authorization also enforced for acknowledgment");
var started=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);var older=controls.ExecuteAsync(context,Command("test:cpu"),new InlineProgress(_=>started.TrySetResult()));await started.Task.WaitAsync(TimeSpan.FromSeconds(5));var newest=controls.ExecuteAsync(context,Command("test:echo"));var superseded=await older;Check(superseded.ErrorCode=="CANCELLED"&&(await newest).Ok&&controls.ActiveWorkerCount==0,"new same-document request cancels old CPU generation before any stale success");
using var disposing=new ReportService(Path.Combine(temporary,"dispose-drain"),node,worker,30000,true);var cpuStarted=new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);var inFlight=disposing.ExecuteAsync(context,Command("test:cpu"),new InlineProgress(item=>{if(item.Stage=="test-cpu")cpuStarted.TrySetResult(disposing.ActiveWorkerPids.Single());}));var ownedPid=await cpuStarted.Task.WaitAsync(TimeSpan.FromSeconds(10));disposing.Dispose();var processExited=false;try{using var ownedProcess=Process.GetProcessById(ownedPid);processExited=ownedProcess.HasExited;}catch(ArgumentException){processExited=true;}Check(processExited&&disposing.ActiveWorkerCount==0,"Dispose synchronously drains the actual owned CPU process before returning");Check(!(await inFlight).Ok,"disposed in-flight worker never publishes success");Check((await disposing.ExecuteAsync(context,Command("test:echo"))).ErrorCode=="SERVICE_DISPOSED","disposed service cannot spawn a replacement process");
using var multiDispose=new ReportService(Path.Combine(temporary,"dispose-concurrent"),node,worker,30000,true);var bothStarted=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);var startedCount=0;var multiProgress=new InlineProgress(item=>{if(item.Stage=="test-cpu"&&Interlocked.Increment(ref startedCount)==2)bothStarted.TrySetResult();});var parallelCpu=Enumerable.Range(0,2).Select(i=>multiDispose.ExecuteAsync(context with{ContextId="dispose-concurrent-"+i},Command("test:cpu"),multiProgress)).ToArray();await bothStarted.Task.WaitAsync(TimeSpan.FromSeconds(10));var knownPids=multiDispose.ActiveWorkerPids.ToArray();multiDispose.Dispose();var allExited=knownPids.All(pid=>{try{using var child=Process.GetProcessById(pid);return child.HasExited;}catch(ArgumentException){return true;}});Check(knownPids.Length==2&&allExited&&multiDispose.ActiveWorkerCount==0,"Dispose drains both independently owned concurrent CPU processes before returning");Check((await Task.WhenAll(parallelCpu)).All(reply=>!reply.Ok),"no concurrent disposed operation can publish success");
var raceTrials=new List<object>();
for(var i=0;i<12;i++)
{
    using var racing=new ReportService(Path.Combine(temporary,"dispose-race69-"+i),node,worker,30000,true);
    var raceStarted=new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
    var pending=racing.ExecuteAsync(context with{ContextId="dispose-race69-"+i},Command("test:cpu"),new InlineProgress(item=>{if(item.Stage=="test-cpu")raceStarted.TrySetResult(racing.ActiveWorkerPids.Single());}));
    var pid=await raceStarted.Task.WaitAsync(TimeSpan.FromSeconds(10));
    var drain=Task.Run(racing.Dispose); var reply=await pending; await drain;
    var exited=false;try{using var child=Process.GetProcessById(pid);exited=child.HasExited;}catch(ArgumentException){exited=true;}
    if(!exited||racing.ActiveWorkerCount!=0||reply.Ok)throw new Exception("FAIL owned cancellation/dispose race69 trial "+i);
    raceTrials.Add(new{trial=i,pid,exited,activeWorkers=racing.ActiveWorkerCount,reply.ErrorCode});
}
Check(raceTrials.Count==12,"concurrent Dispose and request cleanup confirm exit without closing another waiter's process handle in12 actual CPU trials");
await File.WriteAllTextAsync(Path.Combine(temporary,"DISPOSE_RACE69.json"),System.Text.Json.JsonSerializer.Serialize(new{trials=raceTrials,reportReady=false,supervisorAccepted=false}));
Console.WriteLine($"RESULT report-adapter66 pass={pass} fail=0 syntheticOnly=true reportReady=false supervisorAccepted=false evidence={temporary}");

sealed class InlineProgress(Action<ReportProgress> action):IProgress<ReportProgress>{public void Report(ReportProgress value)=>action(value);}
