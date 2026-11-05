using Jindan.Contracts;
using Jindan.Core.Sync;

namespace Jindan.Desktop;

public sealed partial class WorkbenchForm
{
    void AddSync70Menu()
    {
        if (services is not IWorkspaceSyncAccess access) return;
        var item = new ToolStripMenuItem("동기화");
        item.DropDownItems.Add("대기 목록·연결 상태", null, (_, _) => OpenSync70(access.Sync));
        menu.Items.Add(item);
    }
    void OpenSync70(IWorkspaceSyncService sync)
    {
        // The window retains the selected project; a later MDI switch cannot retarget a push.
        var project = SelectedProjectId;
        var dialog = new Form { Name = "WorkspaceSync70", Text = "동기화 대기 목록 · " + (project is null ? "내 전체 로컬 변경" : "선택 프로젝트"), Width = 820, Height = 510, AutoScaleMode = AutoScaleMode.Dpi, StartPosition = FormStartPosition.CenterParent };
        var summary = new Label { Dock = DockStyle.Top, Height = 68, Padding = new Padding(10), Text = "로컬 상태 읽는 중…", AutoEllipsis = true };
        var grid = new DataGridView { Name = "SyncPending70", Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AllowUserToDeleteRows = false, AutoGenerateColumns = false, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill };
        foreach (var (key, title) in new[] { ("Kind", "업무"), ("Id", "항목 식별자"), ("Operation", "작업"), ("RecordRevision", "로컬 버전"), ("CreatedAt", "대기 시각") }) grid.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = key, HeaderText = title });
        var actions = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 76 };
        var refresh = new Button { Text = "상태 새로 읽기", AutoSize = true }; var push = new Button { Text = "대기 변경 보내기", AutoSize = true }; var cancel = new Button { Text = "작업 취소", AutoSize = true, Enabled = false };
        var scheduled = new CheckBox { Text = "자동 보내기 (1분 · 이 창의 문맥만)", AutoSize = true, Enabled = false };
        var scheduler = new WorkspaceSyncScheduler70(sync);
        actions.Controls.AddRange([refresh, push, cancel, scheduled]); dialog.Controls.Add(grid); dialog.Controls.Add(summary); dialog.Controls.Add(actions);
        var lifetime = new CancellationTokenSource(); CancellationTokenSource? active = null; bool busy = false, canPush = false, canSchedule = false;
        async Task Refresh()
        {
            var status = await sync.StatusAsync(project, active?.Token ?? lifetime.Token);
            if (dialog.IsDisposed) return;
            grid.DataSource = status.Pending.ToArray();
            summary.Text = status.Configured ? $"{(status.IsSynthetic ? "격리 합성 시험 연결" : "주입된 연결 · 실서버 미검증")} · 대기 {status.Pending.Count}건\n{(scheduler.State.Running ? "자동 보내기 활성" : "자동 보내기 꺼짐")} · 마지막 ACK {status.LastAcknowledgedAt?.ToLocalTime().ToString("g") ?? "없음"}" : $"로컬 저장 완료 · 대기 {status.Pending.Count}건 · 실제 서버 연결 미설정\n계정·서버 권한·데이터 매핑 검증 전에는 전송할 수 없습니다.";
            canSchedule = status.Configured; scheduled.Enabled = !busy && canSchedule;
            canPush = status.Configured && status.Pending.Count > 0; push.Enabled = !busy && canPush;
        }
        async Task Run(Func<Task> operation)
        {
            if (busy) return; busy = true; refresh.Enabled = push.Enabled = scheduled.Enabled = false; cancel.Enabled = true; active = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            try { await operation(); }
            catch (OperationCanceledException) { if (!dialog.IsDisposed) summary.Text = "취소됨 · ACK 없는 변경은 대기 목록에 보존됩니다."; }
            catch { if (!dialog.IsDisposed) summary.Text = "동기화 차단 · 현재 계정·프로젝트 권한 또는 로컬 저장소를 확인하세요."; }
            finally { active?.Dispose(); active = null; busy = false; if (!dialog.IsDisposed) { refresh.Enabled = true; push.Enabled = canPush; scheduled.Enabled = canSchedule; cancel.Enabled = false; } }
        }
        refresh.Click += async (_, _) => await Run(Refresh);
        cancel.Click += (_, _) => active?.Cancel();
        push.Click += async (_, _) =>
        {
            if (MessageBox.Show(dialog, "표시된 문맥의 내 대기 변경만 보내시겠습니까? 실제 회사 서버 검증 승인은 별도입니다.", "대기 변경 확인", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            await Run(async () => { var result = await sync.PushPendingAsync(project, true, active!.Token); await Refresh(); if (!dialog.IsDisposed) summary.Text += $"\n시도 {result.Attempted} / ACK {result.Acknowledged} / 확인 필요 {result.Issues.Count} · 실서버 검증 안 됨"; });
        };
        scheduled.CheckedChanged += async (_, _) =>
        {
            try { if (scheduled.Checked) { await scheduler.StartAsync(project, true, TimeSpan.FromMinutes(1), lifetime.Token); summary.Text += "\n자동 보내기 대기 중 · 이 창을 닫으면 중지됩니다."; } else await scheduler.StopAsync(); }
            catch { if (!dialog.IsDisposed) { scheduled.Checked = false; summary.Text = "자동 보내기 차단 · 계정·프로젝트·연결 상태를 확인하세요."; } }
        };
        dialog.Shown += async (_, _) => await Run(Refresh);
        dialog.FormClosed += async (_, _) => { lifetime.Cancel(); active?.Cancel(); await scheduler.DisposeAsync(); lifetime.Dispose(); };
        dialog.Show(this);
    }
}
