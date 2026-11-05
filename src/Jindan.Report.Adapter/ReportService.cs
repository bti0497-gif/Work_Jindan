using System.Collections.Concurrent;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Jindan.Contracts;

namespace Jindan.Report.Adapter;

/// <summary>Local immutable-file transport and per-document fresh-review gate.
/// Program acknowledgement is a host action, never human/native approval.</summary>
public sealed class ReportService : IReportService, IDisposable
{
    private const long FileLimit = 160L * 1024 * 1024, BundleLimit = 192L * 1024 * 1024;
    private readonly string _root, _node, _worker;
    private readonly int _timeoutMs;
    private readonly bool _testOperations;
    private readonly Func<DocumentContext, string, CancellationToken, Task>? _authorize;
    private readonly ConcurrentDictionary<string, SessionState> _states = new();
    private readonly object _lifecycle = new();
    private readonly ConcurrentDictionary<int, Process> _ownedProcesses = new();
    private int _disposed;
    public int ActiveWorkerCount => _ownedProcesses.Count;
    public IReadOnlyList<int> ActiveWorkerPids => _ownedProcesses.Keys.ToArray();
    public int? LastCompletedWorkerPid { get; private set; }
    private sealed class SessionState(DocumentContext context)
    {
        public DocumentContext Context = context;
        public long Generation;
        public CancellationTokenSource? Running;
        public string? SourceSha, BundlePath, BundleSha, Fingerprint, AcknowledgedContextSha;
    }
    private sealed class BoundaryException(string code) : Exception("Local report boundary rejected the operation.") { public string Code = code; }
    private static readonly HashSet<string> DraftOperations = ["writeDraft", "exportCollection", "importCollection"];
    private static readonly HashSet<string> BoundOperations = ["prepareDraft", "writeDraft", "exportCollection", "importCollection", "restore", "pairReference", "discipline", "electrical", "specification", "locate"];

    public ReportService(string dataRoot, string nodePath, string workerPath, int timeoutMs = 120000, bool enableTestOperations = false, Func<DocumentContext, string, CancellationToken, Task>? authorize = null)
    {
        if (!Path.IsPathFullyQualified(dataRoot) || dataRoot.StartsWith("\\\\", StringComparison.Ordinal) || dataRoot.StartsWith("//", StringComparison.Ordinal)) throw new ArgumentException("An absolute local report data root is required."); var fullRoot = Path.GetFullPath(dataRoot); var relative = fullRoot[Path.GetPathRoot(fullRoot)!.Length..]; if (relative.Contains(':') || relative.Split([Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar], StringSplitOptions.None).Any(part => part.EndsWith(' ') || part.EndsWith('.'))) throw new ArgumentException("The report data root has an ambiguous local path.");
        foreach (var protectedPath in new[] { "F:/jindan", "E:/jindan", "F:/jindan-maintenance" }) { var preserved = Path.GetFullPath(protectedPath).TrimEnd(Path.DirectorySeparatorChar); if (fullRoot.Equals(preserved, StringComparison.OrdinalIgnoreCase) || fullRoot.StartsWith(preserved + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("The preserved workspace cannot be used as a report data root."); }
        _root = Path.Combine(fullRoot, "report-sessions"); for (var directory = new DirectoryInfo(_root); directory != null; directory = directory.Parent) if (directory.Exists && directory.Attributes.HasFlag(FileAttributes.ReparsePoint)) throw new ArgumentException("Report session ancestors cannot be linked directories.");
        if (!Path.IsPathFullyQualified(nodePath) || !Path.IsPathFullyQualified(workerPath) || nodePath.StartsWith("\\\\", StringComparison.Ordinal) || workerPath.StartsWith("\\\\", StringComparison.Ordinal)) throw new ArgumentException("Explicit local runtime paths are required.");
        _node = Path.GetFullPath(nodePath); _worker = Path.GetFullPath(workerPath);
        if (!File.Exists(_node) || !File.Exists(_worker)) throw new ArgumentException("The explicit local Node and worker files must exist.");
        if (timeoutMs < 25 || timeoutMs > 1800000) throw new ArgumentOutOfRangeException(nameof(timeoutMs));
        Directory.CreateDirectory(_root);
        _timeoutMs = timeoutMs; _testOperations = enableTestOperations; _authorize = authorize;
    }
    private static void Require(bool condition, string code) { if (!condition) throw new BoundaryException(code); }
    private static bool Sha(string? value) => value?.Length == 64 && value.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f');
    private static string WorkerProject(string projectId) => projectId.StartsWith("project:", StringComparison.Ordinal) ? projectId : "project:" + Uri.EscapeDataString(projectId);
    private static string Hash(ReadOnlySpan<byte> bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));
    private static async Task<string> FileHash(string path, CancellationToken ct) { await using var stream = File.OpenRead(path); return Convert.ToHexStringLower(await SHA256.HashDataAsync(stream, ct)); }
    private SessionState State(DocumentContext context)
    {
        lock (_lifecycle)
        {
            Require(Volatile.Read(ref _disposed) == 0, "SERVICE_DISPOSED");
            Require(!string.IsNullOrWhiteSpace(context.ContextId) && context.ContextId.Length <= 200 && !string.IsNullOrWhiteSpace(context.UserId) && !string.IsNullOrWhiteSpace(context.ProjectId), "INVALID_CONTEXT");
            var state = _states.GetOrAdd(context.ContextId, _ => new SessionState(context));
            Require(state.Context == context, "CONTEXT_MISMATCH"); return state;
        }
    }
    public void Invalidate(string contextId)
    {
        if (!_states.TryRemove(contextId, out var state)) return;
        lock (state) { state.Generation++; state.Running?.Cancel(); state.SourceSha = state.BundlePath = state.BundleSha = state.Fingerprint = state.AcknowledgedContextSha = null; }
    }
    public async Task AcknowledgeReviewAsync(DocumentContext context, string sourceSha256, string fingerprint, string reviewPath, CancellationToken ct = default)
    {
        if (_authorize != null) await _authorize(context, "acknowledgeReview", ct).ConfigureAwait(false);
        var state = State(context); long generation;
        lock (state) { Require(state.SourceSha == sourceSha256 && state.Fingerprint == fingerprint && state.BundlePath != null, "BINDING_MISMATCH"); generation = state.Generation; state.AcknowledgedContextSha = null; }
        var bytes = await ReadBounded(reviewPath, FileLimit, ct); using var document = JsonDocument.Parse(bytes);
        Require(document.RootElement.ValueKind == JsonValueKind.Object && document.RootElement.TryGetProperty("review", out var review) && review.TryGetProperty("sourceSha256", out var sha) && sha.GetString() == sourceSha256, "BINDING_MISMATCH");
        var hash = Hash(bytes); lock (state) { Require(state.Generation == generation && state.SourceSha == sourceSha256 && state.Fingerprint == fingerprint, "STALE_RESULT"); state.AcknowledgedContextSha = hash; }
    }
    public async Task<ReportReply> ExecuteAsync(DocumentContext context, ReportCommand command, IProgress<ReportProgress>? progress = null, CancellationToken ct = default)
    {
        var requestId = Guid.NewGuid().ToString("N"); SessionState? state = null; CancellationTokenSource? owned = null; long generation = 0;
        try
        {
            if (_authorize != null) await _authorize(context, command.Operation, ct).ConfigureAwait(false);
            lock (_lifecycle)
            {
                Require(_disposed == 0, "SERVICE_DISPOSED"); state = State(context); Require(context.ProjectId == command.ProjectId && Sha(command.SourceSha256), "BINDING_MISMATCH");
                Require(!string.IsNullOrWhiteSpace(command.Operation) && command.Operation.Length <= 80, "INVALID_OPERATION");
                Require(!command.Operation.StartsWith("test:", StringComparison.Ordinal) || _testOperations, "UNSUPPORTED_OPERATION");
                owned = CancellationTokenSource.CreateLinkedTokenSource(ct); lock (state) { state.Running?.Cancel(); generation = ++state.Generation; state.Running = owned; if (command.Operation is "analyze" or "recover") { state.SourceSha = state.BundlePath = state.BundleSha = state.Fingerprint = state.AcknowledgedContextSha = null; } }
            }
            var token = owned.Token; token.ThrowIfCancellationRequested();
            string? bundlePath = null, bundleSha = null, ackSha = null;
            lock (state)
            {
                if (BoundOperations.Contains(command.Operation)) { Require(state.SourceSha == command.SourceSha256 && state.BundlePath != null, "REANALYSIS_REQUIRED"); bundlePath = state.BundlePath; bundleSha = state.BundleSha; }
                if (DraftOperations.Contains(command.Operation)) { Require(state.AcknowledgedContextSha != null, "ACKNOWLEDGEMENT_REQUIRED"); ackSha = state.AcknowledgedContextSha; }
            }
            if (command.BundlePath != null)
            {
                Require(bundlePath != null, "REANALYSIS_REQUIRED"); var supplied = await FileHash(command.BundlePath, token);
                lock (state) { Require(state.BundleSha == supplied, "BINDING_MISMATCH"); }
            }
            var directory = Path.Combine(_root, requestId); Directory.CreateDirectory(directory); var input = Path.Combine(directory, "input"); Directory.CreateDirectory(input);
            long stagedBytes = 0;
            async Task<JsonObject> StageOwned(string original, string? expected, string name, long max)
            {
                var size = new FileInfo(original).Length; Require(size > 0 && size <= max && size <= 512L * 1024 * 1024 - stagedBytes, "FILE_TOTAL_LIMIT"); stagedBytes += size;
                return await Stage(original, expected, input, name, max, token);
            }
            var files = new JsonObject();
            files[command.Operation == "recover" ? "archive" : "source"] = await StageOwned(command.SourcePath, command.SourceSha256, "source.bin", FileLimit);
            if (bundlePath != null) files["bundle"] = await StageOwned(bundlePath, bundleSha, "bundle.json", BundleLimit);
            if (command.ContextPath != null)
            {
                var contextFile = await StageOwned(command.ContextPath, null, "context.json", FileLimit);
                if (ackSha != null) Require(contextFile["sha256"]!.GetValue<string>() == ackSha, "REVIEW_CHANGED"); files["context"] = contextFile;
            }
            else Require(ackSha == null, "REVIEW_CHANGED");
            if (command.FilledPath != null) files["filled"] = await StageOwned(command.FilledPath, null, "filled.hwpx", FileLimit);
            if (command.Evidence is { Count: > 0 })
            {
                Require(command.Evidence.Count <= 1000 && command.Evidence.Select(e => e.Id).Distinct(StringComparer.Ordinal).Count() == command.Evidence.Count, "INVALID_EVIDENCE"); var evidence = new JsonArray();
                for (var i = 0; i < command.Evidence.Count; i++) { var item = command.Evidence[i]; Require(Sha(item.Sha256), "INVALID_EVIDENCE"); var descriptor = await StageOwned(item.Path, item.Sha256, $"evidence-{i:D4}.bin", FileLimit); descriptor["id"] = item.Id; evidence.Add(descriptor); }
                files["evidence"] = evidence;
            }
            var parameters = new JsonObject();
            foreach (var (key, value) in command.Parameters ?? [])
            {
                var fileKey = key switch { "referenceSourcePath" => "referenceSource", "referenceBundlePath" => "referenceBundle", "textReviewPath" => "textReview", _ => null };
                if (fileKey != null) files[fileKey] = await StageOwned(value, null, fileKey + ".bin", fileKey.Contains("Bundle", StringComparison.Ordinal) ? BundleLimit : FileLimit);
                else { Require(key.Length <= 80 && value.Length <= 2000, "REQUEST_TOO_LARGE"); parameters[key] = value; }
            }
            var workerProject = WorkerProject(command.ProjectId);
            var request = new JsonObject { ["protocol"] = Contract.Worker, ["requestId"] = requestId, ["projectId"] = workerProject, ["sourceSha256"] = command.SourceSha256, ["operation"] = command.Operation, ["parameters"] = parameters, ["files"] = files };
            var requestText = request.ToJsonString(); Require(Encoding.UTF8.GetByteCount(requestText) <= 65536, "REQUEST_TOO_LARGE");
            var reply = await RunProcess(directory, request, requestText, progress, token).ConfigureAwait(false);
            token.ThrowIfCancellationRequested(); lock (state) { Require(state.Generation == generation, "STALE_RESULT"); }
            if (reply.Ok && command.Operation is "analyze" or "pairReference")
            {
                using var document = JsonDocument.Parse(await ReadBounded(reply.ResultJsonPath!, BundleLimit, token)); var bundle = document.RootElement.GetProperty("value");
                Require(bundle.GetProperty("projectId").GetString() == workerProject && bundle.GetProperty("material").GetProperty("sha256").GetString() == command.SourceSha256, "BINDING_MISMATCH");
                var fingerprint = bundle.GetProperty("fingerprint").GetString(); Require(Sha(fingerprint), "BINDING_MISMATCH");
                var ownBundle = Path.Combine(directory, "output", "adapter-bundle.json"); var bytes = Encoding.UTF8.GetBytes(bundle.GetRawText()); await AtomicWrite(ownBundle, bytes, token);
                lock (state) { Require(state.Generation == generation, "STALE_RESULT"); state.SourceSha = command.SourceSha256; state.BundlePath = ownBundle; state.BundleSha = Hash(bytes); state.Fingerprint = fingerprint; state.AcknowledgedContextSha = null; }
            }
            return reply;
        }
        catch (BoundaryException error) { return Failure(requestId, error.Code); }
        catch (OperationCanceledException) { return Failure(requestId, "CANCELLED"); }
        catch (Exception) { return Failure(requestId, "LOCAL_OPERATION_FAILED"); }
        finally { if (state != null) lock (state) { if (ReferenceEquals(state.Running, owned)) state.Running = null; } owned?.Dispose(); }
    }
    private static ReportReply Failure(string id, string code) => new(false, id, null, [], code, false);
    private static async Task<byte[]> ReadBounded(string input, long max, CancellationToken ct)
    {
        Require(Path.IsPathFullyQualified(input) && !input.StartsWith("\\\\", StringComparison.Ordinal), "INVALID_PATH"); var info = new FileInfo(input); Require(info.Exists && info.Length > 0 && info.Length <= max, "FILE_SIZE_LIMIT"); var bytes = await File.ReadAllBytesAsync(input, ct); Require(bytes.LongLength == info.Length && bytes.LongLength <= max, "FILE_SIZE_LIMIT"); return bytes;
    }
    private static async Task<JsonObject> Stage(string original, string? expected, string directory, string name, long max, CancellationToken ct)
    {
        var bytes = await ReadBounded(original, max, ct); var sha = Hash(bytes); Require(expected == null || expected == sha, "FILE_HASH_MISMATCH"); var path = Path.Combine(directory, name); await AtomicWrite(path, bytes, ct); return new JsonObject { ["path"] = path, ["sha256"] = sha };
    }
    private static async Task AtomicWrite(string destination, byte[] bytes, CancellationToken ct)
    {
        var temporary = destination + ".tmp"; await using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true)) { await stream.WriteAsync(bytes, ct); await stream.FlushAsync(ct); }
        File.Move(temporary, destination, false);
    }
    private async Task<ReportReply> RunProcess(string session, JsonObject request, string text, IProgress<ReportProgress>? progress, CancellationToken ct)
    {
        var requestId = request["requestId"]!.GetValue<string>(); var process = new Process { StartInfo = new ProcessStartInfo(_node) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, StandardInputEncoding = new UTF8Encoding(false), StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8 } };
        process.StartInfo.ArgumentList.Add(_worker); process.StartInfo.ArgumentList.Add(session);
        process.StartInfo.Environment.Clear(); foreach (var key in new[] { "SystemRoot", "WINDIR", "TEMP", "TMP", "PATH" }) if (Environment.GetEnvironmentVariable(key) is string value) process.StartInfo.Environment[key] = value;
        process.StartInfo.Environment["NODE_ENV"] = "production"; if (_testOperations) process.StartInfo.Environment["JINDAN_WORKER_TEST"] = "1";
        using var timeout = new CancellationTokenSource(_timeoutMs); using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeout.Token); JsonObject? result = null; int? pid = null;
        try
        {
            lock (_lifecycle) { Require(_disposed == 0, "SERVICE_DISPOSED"); Require(process.Start(), "WORKER_START_FAILED"); pid = process.Id; Require(_ownedProcesses.TryAdd(pid.Value, process), "WORKER_START_FAILED"); }
            var stdout = ReadProtocol(process.StandardOutput, request, progress, value => { Require(result == null, "INVALID_PROTOCOL"); result = value; }, linked.Token);
            var stderr = Drain(process.StandardError, linked.Token);
            await process.StandardInput.WriteAsync(text.AsMemory(), linked.Token).ConfigureAwait(false); await process.StandardInput.WriteLineAsync().ConfigureAwait(false); process.StandardInput.Close();
            var finished = Task.WhenAll(stdout, stderr, process.WaitForExitAsync(linked.Token));
            // Any malformed protocol task must interrupt the owned process rather
            // than leave a synchronous engine consuming CPU until timeout.
            var first = await Task.WhenAny(finished, stdout, stderr).ConfigureAwait(false); if (first.IsFaulted) await first.ConfigureAwait(false);
            await finished.ConfigureAwait(false); ct.ThrowIfCancellationRequested(); timeout.Token.ThrowIfCancellationRequested();
            Require(process.ExitCode == 0 && result != null, "WORKER_CRASH");
            if (result!["ok"]?.GetValue<bool>() != true) return Failure(requestId, result["error"]?["code"]?.GetValue<string>() ?? "ENGINE_ERROR");
            var descriptor = result["resultFile"]!.AsObject(); var artifact = await ValidateArtifact(descriptor, session, BundleLimit, ct); using var document = JsonDocument.Parse(await ReadBounded(artifact.Path, BundleLimit, ct));
            Require(document.RootElement.GetProperty("ok").GetBoolean() && document.RootElement.GetProperty("reportReady").GetBoolean() == false, "INVALID_RESULT_FILE");
            var artifacts = new List<ReportArtifact> { artifact }; await WalkArtifacts(document.RootElement, session, artifacts, ct); return new ReportReply(true, requestId, artifact.Path, artifacts, null, false);
        }
        catch (OperationCanceledException) { return Failure(requestId, ct.IsCancellationRequested ? "CANCELLED" : "TIMEOUT"); }
        finally
        {
            if (pid != null) StopOwnedProcess(pid.Value, process, release: true);
            else process.Dispose();
        }
    }
    private void StopOwnedProcess(int id, Process process, bool release)
    {
        // Dispose and the async request's finally may reach the same worker at
        // once. Only this request releases its Process object; both exit waits
        // and that release share the lock. A stale snapshot never reads a closed
        // handle or acts on a later process that happens to reuse the PID.
        lock (process)
        {
            if (_ownedProcesses.TryGetValue(id, out var current) && ReferenceEquals(current, process))
            {
                try { if (!process.HasExited) process.Kill(false); } catch (InvalidOperationException) { }
                process.WaitForExit();
                LastCompletedWorkerPid = id;
                _ownedProcesses.TryRemove(id, out _);
            }
            // If exit could not be confirmed, the exception above keeps the
            // owned entry and open handle available for a later cleanup attempt.
            if (release) process.Dispose();
        }
    }
    private static async Task ReadProtocol(StreamReader reader, JsonObject request, IProgress<ReportProgress>? progress, Action<JsonObject> result, CancellationToken ct)
    {
        var buffer = new char[4096]; var pending = new StringBuilder(); var total = 0; var resultSeen = false;
        while (true)
        {
            var count = await reader.ReadAsync(buffer.AsMemory(), ct).ConfigureAwait(false); if (count == 0) break; total += Encoding.UTF8.GetByteCount(buffer, 0, count); Require(total <= 1024 * 1024, "PROTOCOL_LIMIT"); pending.Append(buffer, 0, count);
            while (true)
            {
                var content = pending.ToString(); var newline = content.IndexOf('\n'); if (newline < 0) { Require(Encoding.UTF8.GetByteCount(content) <= 65536, "PROTOCOL_LIMIT"); break; }
                var line = content[..newline]; pending.Remove(0, newline + 1); Require(Encoding.UTF8.GetByteCount(line) <= 65536, "PROTOCOL_LIMIT"); var message = JsonNode.Parse(line)?.AsObject(); Require(message != null, "INVALID_PROTOCOL");
                foreach (var key in new[] { "protocol", "requestId", "projectId", "sourceSha256", "operation" }) Require(message![key]?.GetValue<string>() == request[key]?.GetValue<string>(), "STALE_RESULT");
                Require(message!["reportReady"]?.GetValue<bool>() == false && !resultSeen, "INVALID_PROTOCOL"); var type = message["type"]?.GetValue<string>();
                if (type == "result") { resultSeen = true; result(message); } else if (type == "progress") progress?.Report(new ReportProgress(request["requestId"]!.GetValue<string>(), message["stage"]?.GetValue<string>() ?? "working", message["page"]?.GetValue<int>() ?? message["current"]?.GetValue<int>(), message["total"]?.GetValue<int>())); else throw new BoundaryException("INVALID_PROTOCOL");
            }
        }
        Require(pending.Length == 0, "INVALID_PROTOCOL");
    }
    private static async Task Drain(StreamReader reader, CancellationToken ct) { var buffer = new char[4096]; long count = 0; int read; while ((read = await reader.ReadAsync(buffer.AsMemory(), ct).ConfigureAwait(false)) > 0) { count += read; Require(count <= 1024 * 1024, "PROTOCOL_LIMIT"); } }
    private static async Task<ReportArtifact> ValidateArtifact(JsonObject descriptor, string session, long max, CancellationToken ct)
    {
        var location = descriptor["path"]?.GetValue<string>(); Require(location != null && Path.IsPathFullyQualified(location), "INVALID_RESULT_FILE"); var full = Path.GetFullPath(location!); var output = Path.GetFullPath(Path.Combine(session, "output")) + Path.DirectorySeparatorChar;
        Require(full.StartsWith(output, StringComparison.OrdinalIgnoreCase) && !File.GetAttributes(full).HasFlag(FileAttributes.ReparsePoint), "INVALID_RESULT_FILE");
        var parent = Path.GetDirectoryName(full); while (parent != null && parent.StartsWith(output.TrimEnd(Path.DirectorySeparatorChar), StringComparison.OrdinalIgnoreCase)) { Require(!File.GetAttributes(parent).HasFlag(FileAttributes.ReparsePoint), "INVALID_RESULT_FILE"); parent = Path.GetDirectoryName(parent); }
        var size = descriptor["size"]?.GetValue<long>() ?? -1; Require(size > 0 && size <= max && new FileInfo(full).Length == size, "INVALID_RESULT_FILE"); var sha = descriptor["sha256"]?.GetValue<string>(); Require(Sha(sha) && await FileHash(full, ct) == sha, "INVALID_RESULT_FILE"); return new ReportArtifact(full, sha!, size, descriptor["mediaType"]?.GetValue<string>() ?? "application/octet-stream");
    }
    private static async Task WalkArtifacts(JsonElement value, string session, List<ReportArtifact> artifacts, CancellationToken ct, int depth = 0)
    {
        Require(depth <= 80, "OUTPUT_LIMIT"); if (value.ValueKind == JsonValueKind.Object) { if (value.TryGetProperty("$workerFile", out var file)) { var artifact = await ValidateArtifact(JsonNode.Parse(file.GetRawText())!.AsObject(), session, FileLimit, ct); artifacts.Add(artifact); return; } foreach (var item in value.EnumerateObject()) await WalkArtifacts(item.Value, session, artifacts, ct, depth + 1); } else if (value.ValueKind == JsonValueKind.Array) foreach (var item in value.EnumerateArray()) await WalkArtifacts(item, session, artifacts, ct, depth + 1);
    }
    public void Dispose()
    {
        // A repeated call still retries any retained worker after a failed wait.
        // Closed requests have already removed their entries under the same lock
        // used below; the disposed flag permanently prevents new worker starts.
        KeyValuePair<int, Process>[] owned; lock (_lifecycle) { _disposed = 1; owned = _ownedProcesses.ToArray(); }
        foreach (var state in _states.Values) lock (state) { state.Generation++; state.Running?.Cancel(); state.SourceSha = state.BundlePath = state.BundleSha = state.Fingerprint = state.AcknowledgedContextSha = null; }
        // Wait on process handles, never captured UI Task continuations. This is
        // safe during STA Application.Run shutdown and cannot kill another app.
        foreach (var pair in owned) StopOwnedProcess(pair.Key, pair.Value, release: false);
    }
}
