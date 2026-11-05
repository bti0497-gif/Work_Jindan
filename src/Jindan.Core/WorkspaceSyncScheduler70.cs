using Jindan.Contracts;

namespace Jindan.Core.Sync;

public interface IWorkspaceSyncClock70 { Task DelayAsync(TimeSpan delay, CancellationToken ct); }
public sealed class WorkspaceSyncClock70 : IWorkspaceSyncClock70 { public Task DelayAsync(TimeSpan delay, CancellationToken ct) => Task.Delay(delay, ct); }
public sealed record WorkspaceSyncScheduleState70(long Generation, string? ProjectId, bool Running, string Code, int ConsecutiveFailures);

/// <summary>Opt-in push-only scheduling of the same feature outbox. No default timer or network adapter.</summary>
public sealed class WorkspaceSyncScheduler70(IWorkspaceSyncService service, IWorkspaceSyncClock70? clock = null, Func<bool>? isOnline = null) : IAsyncDisposable
{
    readonly SemaphoreSlim lifecycle = new(1, 1);
    readonly IWorkspaceSyncClock70 timer = clock ?? new WorkspaceSyncClock70();
    CancellationTokenSource? owned;
    Task? loop;
    long generation;
    bool disposed;
    WorkspaceSyncScheduleState70 state = new(0, null, false, "DISABLED", 0);
    public WorkspaceSyncScheduleState70 State => Volatile.Read(ref state);
    public async Task StartAsync(string? projectId, bool explicitlyOptIn, TimeSpan interval, CancellationToken ct = default)
    {
        await lifecycle.WaitAsync(ct);
        try
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            DomainRules.Require(explicitlyOptIn, "CONFIRMATION", "Automatic push requires explicit per-session opt-in.");
            DomainRules.Require(interval >= TimeSpan.FromSeconds(1) && interval <= TimeSpan.FromHours(1), "SYNC_INTERVAL", "Use a bounded sync interval.");
            await StopCoreAsync();
            var status = await service.StatusAsync(projectId, ct);
            DomainRules.Require(status.Configured, "PRODUCTION_NOT_CONFIGURED", "No configured sync transport is available.");
            var g = ++generation; owned = new(); state = new(g, projectId, true, "WAITING", 0); loop = LoopAsync(g, projectId, interval, owned.Token);
        }
        finally { lifecycle.Release(); }
    }
    async Task LoopAsync(long g, string? projectId, TimeSpan interval, CancellationToken ct)
    {
        var failures = 0;
        try
        {
            while (true)
            {
                // Bounded exponential retry, at most five minutes; no parallel ticks.
                var delay = TimeSpan.FromTicks(Math.Min(Math.Max(TimeSpan.FromMinutes(5).Ticks, interval.Ticks), interval.Ticks * (1L << Math.Min(failures, 4))));
                await timer.DelayAsync(delay, ct); ct.ThrowIfCancellationRequested();
                if (!(isOnline?.Invoke() ?? true)) { Publish(g, projectId, true, "OFFLINE", failures); continue; }
                try
                {
                    var current = await service.StatusAsync(projectId, ct);
                    if (!current.Configured) { Publish(g, projectId, false, "PRODUCTION_NOT_CONFIGURED", failures); return; }
                    if (current.Pending.Count == 0) { failures = 0; Publish(g, projectId, true, "IDLE", 0); continue; }
                    var result = await service.PushPendingAsync(projectId, true, ct); ct.ThrowIfCancellationRequested();
                    failures = result.Issues.Count == 0 ? 0 : Math.Min(failures + 1, 16);
                    Publish(g, projectId, true, result.Issues.Count == 0 ? "ACKNOWLEDGED" : "RETRY_PENDING", failures);
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
                catch (WorkspaceException error) when (error.Code is "UNAUTHENTICATED" or "FORBIDDEN" or "PRODUCTION_NOT_CONFIGURED") { Publish(g, projectId, false, error.Code, failures); return; }
                catch { failures = Math.Min(failures + 1, 16); Publish(g, projectId, true, "RETRY_PENDING", failures); }
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        catch { Publish(g, projectId, false, "SCHEDULER_STOPPED", failures); }
    }
    void Publish(long g, string? projectId, bool running, string code, int failures) { if (g == generation && !disposed) Volatile.Write(ref state, new(g, projectId, running, code, failures)); }
    async Task StopCoreAsync()
    {
        generation++; owned?.Cancel(); if (loop is not null) await loop;
        owned?.Dispose(); owned = null; loop = null; state = new(generation, null, false, "DISABLED", 0);
    }
    public async Task StopAsync(CancellationToken ct = default) { await lifecycle.WaitAsync(ct); try { await StopCoreAsync(); } finally { lifecycle.Release(); } }
    public async ValueTask DisposeAsync() { await lifecycle.WaitAsync(); try { if (disposed) return; disposed = true; await StopCoreAsync(); } finally { lifecycle.Release(); } }
}
