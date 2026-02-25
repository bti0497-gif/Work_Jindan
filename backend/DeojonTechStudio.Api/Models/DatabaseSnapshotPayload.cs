using System.Collections.Generic;

namespace DeojonTechStudio.Api.Models;

public class DatabaseSnapshotPayload
{
    public string? GeneratedAtUtc { get; set; }
    public string? Reason { get; set; }
    public List<User>? Users { get; set; }
    public List<Project>? Projects { get; set; }
    public List<Process>? Processes { get; set; }
    public List<TaskItem>? Tasks { get; set; }
    public List<BoardPost>? BoardPosts { get; set; }
    public List<FileRecord>? Files { get; set; }
    public List<SyncLog>? SyncLogs { get; set; }
}
