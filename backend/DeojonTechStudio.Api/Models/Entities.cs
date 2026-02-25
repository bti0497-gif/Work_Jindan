namespace DeojonTechStudio.Api.Models;

public class User
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string DetailAddress { get; set; } = string.Empty;
    public string Avatar { get; set; } = string.Empty;
    public string Role { get; set; } = "user";
    public string PasswordHash { get; set; } = string.Empty;
}

public class Project
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int Progress { get; set; }
    public string Status { get; set; } = "In Progress";
    public string DueDate { get; set; } = string.Empty;
    public List<string> Members { get; set; } = new();
    public string AuthorId { get; set; } = string.Empty;
}

public class Process
{
    public string Id { get; set; } = string.Empty;
    public string ProjectId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string StartDate { get; set; } = string.Empty;
    public string EndDate { get; set; } = string.Empty;
    public List<string> Members { get; set; } = new();
    public string Description { get; set; } = string.Empty;
    public bool IsCompleted { get; set; }
    public string AuthorId { get; set; } = string.Empty;
}

public class TaskItem
{
    public string Id { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public string TargetDate { get; set; } = string.Empty;
    public string RegDate { get; set; } = string.Empty;
    public bool Completed { get; set; }
    public string Author { get; set; } = string.Empty;
    public string AuthorId { get; set; } = string.Empty;
    public string AuthorAvatar { get; set; } = string.Empty;
    public bool IsPublic { get; set; }
}

public class BoardPost
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string Author { get; set; } = string.Empty;
    public string AuthorId { get; set; } = string.Empty;
    public string AuthorAvatar { get; set; } = string.Empty;
    public string RegDate { get; set; } = string.Empty;
    public int Views { get; set; }
    public bool IsNotice { get; set; } = false;
}

public class SyncLog
{
    public string Id { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string PayloadJson { get; set; } = string.Empty;
    public long Timestamp { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
}

public class FileRecord
{
    public string Id { get; set; } = string.Empty;
    public string DriveFileId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string FileType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public string SizeLabel { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;
    public string UploaderId { get; set; } = string.Empty;
    public string UploaderName { get; set; } = string.Empty;
}
