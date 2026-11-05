using System.Globalization;
using Jindan.Contracts;
namespace Jindan.Core;
// Preserved scheduleService.js semantics: calendar days, inclusive end date.
// Period elapsed percentage is distinct from completed-process percentage.
public sealed record ScheduleState(int Progress, string Status, int? DaysRemaining, bool IsValid);
public static class Schedule
{
    static DateOnly? Day(string? text) => text is { Length: >= 10 } && (text.Length == 10 || text[10] == 'T') && DateOnly.TryParseExact(text[..10], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;
    static int Round(double value) => (int)Math.Round(value, MidpointRounding.AwayFromZero);
    public static ScheduleState Get(IReadOnlyDictionary<string, string> fields, DateOnly today) { var start = Day(fields.GetValueOrDefault("startDate")); var end = Day(fields.GetValueOrDefault("endDate")); if (start is null || end is null || end < start) return new(0, "판정보류", null, false); var current = today.DayNumber; var a = start.Value.DayNumber; var b = end.Value.DayNumber; var status = current < a ? "예정" : current <= b ? "진행 중" : fields.GetValueOrDefault("isCompleted") == "true" ? "완료" : "미완료"; return new(current < a ? 0 : current > b ? 100 : Math.Min(99, Round((current - a) / (double)(b - a + 1) * 100)), status, b - current, true); }
    public static int Average(IEnumerable<WorkRecord> records, DateOnly today) { var valid = records.Select(r => Get(r.Fields, today)).Where(s => s.IsValid).ToArray(); return valid.Length == 0 ? 0 : Round(valid.Average(s => s.Progress)); }
    public static int ProjectProgress(WorkRecord project, IEnumerable<WorkRecord> processes, DateOnly today) { var children = processes.Where(r => r.ProjectId == project.Id && !r.Deleted).ToArray(); return children.Length > 0 ? Average(children, today) : Get(project.Fields, today).Progress; }
    public static int CompletionRatio(IEnumerable<WorkRecord> processes) { var all = processes.Where(r => !r.Deleted).ToArray(); return all.Length == 0 ? 0 : Round(all.Count(r => r.Fields.GetValueOrDefault("isCompleted") == "true") / (double)all.Length * 100); }
}
