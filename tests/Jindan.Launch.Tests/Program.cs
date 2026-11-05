using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;

if(args.Length!=2)throw new ArgumentException("Exact application directory and fresh owned output directory required.");
var app=Path.GetFullPath(args[0]);var output=Path.GetFullPath(args[1]);
if(!output.StartsWith(Path.GetFullPath("F:/jindan-dotnet/artifacts/").TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||Directory.Exists(output))throw new ArgumentException("Use a fresh owned artifact output.");
Directory.CreateDirectory(output);var started=DateTimeOffset.UtcNow;
var info=new ProcessStartInfo(Path.Combine(app,".runtime/dotnet.exe")){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
foreach(var arg in new[]{Path.Combine(app,"Jindan.Desktop.dll"),"--installation-root",app,"--workspace",Path.Combine(output,"new-local-workspace")})info.ArgumentList.Add(arg);
info.Environment["DOTNET_ROOT"]=Path.Combine(app,".runtime");info.Environment["DOTNET_ROOT_X64"]=info.Environment["DOTNET_ROOT"];info.Environment["DOTNET_MULTILEVEL_LOOKUP"]="0";
info.Environment["DOTNET_GENERATE_ASPNET_CERTIFICATE"]="false";info.Environment["DOTNET_CLI_TELEMETRY_OPTOUT"]="1";info.Environment["DOTNET_SKIP_FIRST_TIME_EXPERIENCE"]="1";
using var child=Process.Start(info)??throw new IOException("Owned exact product launch failed.");
var stdout=child.StandardOutput.ReadToEndAsync();var stderr=child.StandardError.ReadToEndAsync();
var timer=Stopwatch.StartNew();while(!child.HasExited&&timer.Elapsed<TimeSpan.FromSeconds(30)){child.Refresh();if(child.MainWindowHandle!=0)break;await Task.Delay(50);}
child.Refresh();var title=child.MainWindowTitle;var handle=child.MainWindowHandle;var opened=handle!=0&&title.Contains("로컬 로그인");
// No account/password entry, authentication automation or other process/window inspection.
var requestedClose=handle!=0&&child.CloseMainWindow();
using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(30));var forcedOwnedCleanup=false;try{await child.WaitForExitAsync(timeout.Token);}catch(OperationCanceledException){if(!child.HasExited){child.Kill(false);await child.WaitForExitAsync();forcedOwnedCleanup=true;}}
var pass=opened&&requestedClose&&!forcedOwnedCleanup&&child.ExitCode==0;
await File.WriteAllTextAsync(Path.Combine(output,"stdout.log"),await stdout);await File.WriteAllTextAsync(Path.Combine(output,"stderr.log"),await stderr);
var result=new{schema="jindan-actual-entry66/1",startedAt=started,endedAt=DateTimeOffset.UtcNow,pass=pass?1:0,fail=pass?0:1,pid=child.Id,handle=handle.ToInt64(),title,requestedClose,forcedOwnedCleanup,exit=child.ExitCode,app,hostSha256=Convert.ToHexStringLower(SHA256.HashData(await File.ReadAllBytesAsync(Path.Combine(app,"Jindan.Desktop.dll")))),scope="Actual packaged Program entry and bundled runtime open first-run login, then owned CloseMainWindow normal exit. No authentication input or business workflow inferred.",reportReady=false,supervisorAccepted=false};
await File.WriteAllTextAsync(Path.Combine(output,"RESULT.json"),JsonSerializer.Serialize(result,new JsonSerializerOptions{WriteIndented=true}));Console.WriteLine(JsonSerializer.Serialize(result));return pass?0:1;
