using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Jindan.Core.Sync;

/// <summary>One namespace's durable cache and outbox committed in the same new local file. Does not access LocalWorkspace or cloud sessions.</summary>
public sealed class SyncStore
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly string file;
    public SyncScope Scope { get; }
    public string StateFile => file;
    public bool RecoveredFromBackup { get; private set; }
    private const int MaximumRows = 10000, MaximumBytes = 32 * 1024 * 1024;
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = true, MaxDepth = 48 };
    private sealed class State
    {
        public int Schema { get; set; } = 1;
        public SyncScope Scope { get; set; } = new("", "");
        public long Generation { get; set; }
        public Dictionary<SyncTable, List<SyncRecord>> Tables { get; set; } = Enum.GetValues<SyncTable>().ToDictionary(t => t, _ => new List<SyncRecord>());
        public List<SyncPending> Pending { get; set; } = [];
        public DateTimeOffset? LastSuccessfulSync { get; set; }
    }
    public SyncStore(string isolatedDirectory, SyncScope scope)
    {
        SyncValidation.Scope(scope); Scope = scope with { };
        var root = Path.GetFullPath(isolatedDirectory); Directory.CreateDirectory(root); NoLinks(root);
        var key = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(scope, Json)))); file = Path.Combine(root, "sync-" + key + ".json");
    }
    private static void NoLinks(string path)
    {
        for (var cursor = Path.GetFullPath(path); cursor is not null; cursor = Path.GetDirectoryName(cursor)) if (Directory.Exists(cursor) || File.Exists(cursor)) SyncValidation.Require((File.GetAttributes(cursor) & FileAttributes.ReparsePoint) == 0, "PATH_INVALID");
    }
    private State Validate(State state)
    {
        SyncValidation.Require(state.Schema == 1, "SCHEMA_UNSUPPORTED");
        SyncValidation.Require(state.Scope == Scope, "STORE_SCOPE_MISMATCH");
        SyncValidation.Require(state.Generation >= 0 && state.Tables is not null && state.Pending is not null, "STORE_INVALID");
        SyncValidation.Require(state.Tables.Count == 3 && state.Tables.Keys.All(Enum.IsDefined) && Enum.GetValues<SyncTable>().All(state.Tables.ContainsKey), "STORE_INVALID");
        SyncValidation.Require(state.Pending.Count <= MaximumRows && state.Pending.Select(x => (x.Table, x.Id)).Distinct().Count() == state.Pending.Count, "STORE_INVALID");
        var total = 0;
        foreach (var table in state.Tables) { SyncValidation.Table(table.Key); SyncValidation.Require(table.Value is not null && table.Value.Select(r => r.Id).Distinct().Count() == table.Value.Count, "STORE_INVALID"); foreach (var row in table.Value) SyncValidation.Record(row); total += table.Value.Count; }
        SyncValidation.Require(total <= MaximumRows, "STORE_LIMIT");
        foreach (var entry in state.Pending) { SyncValidation.Require(entry is not null && Enum.IsDefined(entry.Operation) && Guid.TryParseExact(entry.Revision, "N", out _), "STORE_INVALID"); SyncValidation.Table(entry.Table); SyncValidation.Id(entry.Id); }
        return state;
    }
    private State ReadOne(string path)
    {
        NoLinks(path); SyncValidation.Require(new FileInfo(path).Length <= MaximumBytes, "STORE_LIMIT");
        try { var bytes = File.ReadAllBytes(path); using var document = JsonDocument.Parse(bytes, new() { MaxDepth = 48 }); RejectDuplicates(document.RootElement); return Validate(JsonSerializer.Deserialize<State>(bytes, Json) ?? throw new JsonException()); } catch (Exception ex) when (ex is JsonException or NullReferenceException or ArgumentException) { throw new SyncException("STORE_INVALID"); }
    }
    private static void RejectDuplicates(JsonElement element) { if (element.ValueKind == JsonValueKind.Object) { var keys = new HashSet<string>(StringComparer.Ordinal); foreach (var property in element.EnumerateObject()) { if (!keys.Add(property.Name)) throw new JsonException(); RejectDuplicates(property.Value); } } else if (element.ValueKind == JsonValueKind.Array) foreach (var child in element.EnumerateArray()) RejectDuplicates(child); }
    private State Read()
    {
        if (!File.Exists(file)) { if (File.Exists(file + ".bak")) { var backup = ReadOne(file + ".bak"); Write(backup, createBackup: false); RecoveredFromBackup = true; return backup; } return new() { Scope = Scope }; }
        try { return ReadOne(file); }
        catch (SyncException original) when (original.Code == "STORE_INVALID" && File.Exists(file + ".bak")) { var backup = ReadOne(file + ".bak"); File.Copy(file, file + ".corrupt-" + Guid.NewGuid().ToString("N")); Write(backup, createBackup: false); RecoveredFromBackup = true; return backup; }
    }
    private void Write(State state, bool createBackup = true)
    {
        Validate(state); var bytes = JsonSerializer.SerializeToUtf8Bytes(state, Json); SyncValidation.Require(bytes.Length <= MaximumBytes, "STORE_LIMIT"); NoLinks(Path.GetDirectoryName(file)!); if (File.Exists(file)) NoLinks(file);
        var temporary = file + ".tmp-" + Guid.NewGuid().ToString("N");
        try { using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough)) { stream.Write(bytes); stream.Flush(true); } if (createBackup && File.Exists(file)) { if (File.Exists(file + ".bak")) NoLinks(file + ".bak"); File.Copy(file, file + ".bak", true); } File.Move(temporary, file, true); }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    private async Task<T> Transaction<T>(Func<State, (T Result, bool Changed)> body, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            return await Task.Run(() =>
            {
                cancellationToken.ThrowIfCancellationRequested(); NoLinks(Path.GetDirectoryName(file)!);
                FileStream? lease = null; var timer = System.Diagnostics.Stopwatch.StartNew();
                while (lease is null) { cancellationToken.ThrowIfCancellationRequested(); try { if (File.Exists(file + ".lock")) NoLinks(file + ".lock"); lease = new(file + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); } catch (IOException) { SyncValidation.Require(timer.Elapsed < TimeSpan.FromSeconds(10), "STORE_BUSY"); cancellationToken.WaitHandle.WaitOne(20); } }
                using (lease) { var state = Read(); var (result, changed) = body(state); cancellationToken.ThrowIfCancellationRequested(); if (changed) { state.Generation++; Write(state); } return result; }
            }, cancellationToken).ConfigureAwait(false);
        }
        finally { gate.Release(); }
    }
    public Task<SyncSnapshot> SnapshotAsync(CancellationToken cancellationToken = default) => Transaction(state => (new SyncSnapshot(Scope, state.Generation, state.Tables.ToDictionary(x => x.Key, x => (IReadOnlyList<SyncRecord>)x.Value.Select(SyncValidation.Clone).ToArray()), state.Pending.Select(p => p with { }).ToArray(), state.LastSuccessfulSync), false), cancellationToken);
    public Task<string> UpsertAsync(SyncTable table, SyncRecord record, CancellationToken cancellationToken = default)
    {
        SyncValidation.Table(table); SyncValidation.Record(record); SyncValidation.Require(!record.Deleted, "EXPLICIT_DELETE_REQUIRED"); var copy = SyncValidation.Clone(record);
        return Transaction(state => { var rows = state.Tables[table]; var existing = rows.FindIndex(r => r.Id == copy.Id); if (existing < 0) rows.Add(copy); else rows[existing] = copy; return (Enqueue(state, table, copy.Id, SyncOperation.Upsert), true); }, cancellationToken);
    }
    public Task<string> DeleteAsync(SyncTable table, string id, CancellationToken cancellationToken = default)
    {
        SyncValidation.Table(table); SyncValidation.Id(id); return Transaction(state => { state.Tables[table].RemoveAll(r => r.Id == id); return (Enqueue(state, table, id, SyncOperation.Delete), true); }, cancellationToken);
    }
    public Task<string> QueueLegacyMissingUpsertAsync(SyncTable table, string id, CancellationToken cancellationToken = default)
    {
        SyncValidation.Table(table); SyncValidation.Id(id); return Transaction(state => (Enqueue(state, table, id, SyncOperation.Upsert), true), cancellationToken);
    }
    private static string Enqueue(State state, SyncTable table, string id, SyncOperation operation)
    {
        state.Pending.RemoveAll(p => p.Table == table && p.Id == id); var revision = Guid.NewGuid().ToString("N"); state.Pending.Add(new(table, id, operation, revision, DateTimeOffset.UtcNow)); return revision;
    }
    public Task<bool> AcknowledgeAsync(SyncEnvelope sent, SyncAcknowledgement acknowledgement, CancellationToken cancellationToken = default)
    {
        SyncValidation.Require(sent.Scope == Scope && acknowledgement.Scope == Scope && acknowledgement.Table == sent.Pending.Table && acknowledgement.Id == sent.Pending.Id && acknowledgement.Revision == sent.Pending.Revision && acknowledgement.Accepted, "ACK_MISMATCH");
        return Transaction(state => { var removed = state.Pending.RemoveAll(p => p.Table == sent.Pending.Table && p.Id == sent.Pending.Id && p.Revision == sent.Pending.Revision); return (removed > 0, removed > 0); }, cancellationToken);
    }
    public async Task MergePullAsync(SyncPull pull, CancellationToken cancellationToken = default)
    {
        SyncValidation.Require(pull.Scope == Scope && pull.Records is not null && pull.Records.Count <= MaximumRows, "SCOPE_MISMATCH"); SyncValidation.Table(pull.Table);
        long incomingBytes = 0;
        var cloud = pull.Records.Select(row => { cancellationToken.ThrowIfCancellationRequested(); SyncValidation.Record(row); incomingBytes += Encoding.UTF8.GetByteCount(row.Fields.ToJsonString()); SyncValidation.Require(incomingBytes <= MaximumBytes, "STORE_LIMIT"); return SyncValidation.Clone(row); }).ToArray(); SyncValidation.Require(cloud.Select(r => r.Id).Distinct().Count() == cloud.Length, "REMOTE_DUPLICATE");
        await Transaction(state =>
        {
            var pending = state.Pending.Where(p => p.Table == pull.Table).ToDictionary(p => p.Id, StringComparer.Ordinal); var ids = cloud.Select(r => r.Id).ToHashSet(StringComparer.Ordinal);
            var rows = state.Tables[pull.Table].Where(row => pull.Table != SyncTable.Tasks || !pull.CompleteSnapshot || string.IsNullOrEmpty(row.OwnerUid) || pending.ContainsKey(row.Id) || ids.Contains(row.Id)).ToDictionary(r => r.Id, SyncValidation.Clone, StringComparer.Ordinal);
            foreach (var row in cloud) { if (pending.ContainsKey(row.Id)) continue; if (row.Deleted) rows.Remove(row.Id); else rows[row.Id] = row; }
            foreach (var entry in pending.Values) if (entry.Operation == SyncOperation.Delete) rows.Remove(entry.Id);
            state.Tables[pull.Table] = rows.Values.ToList(); return (true, true);
        }, cancellationToken);
    }
    public async Task<bool> MarkSuccessfulAsync(CancellationToken cancellationToken = default) => await Transaction(state => { if (state.Pending.Count != 0) return (false, false); state.LastSuccessfulSync = DateTimeOffset.UtcNow; return (true, true); }, cancellationToken);
}
