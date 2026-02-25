namespace DeojonTechStudio.Api.Models;

public class LoginParams
{
    public string Id { get; set; } = string.Empty;
    public string? Password { get; set; }
    public bool RememberId { get; set; }
}

public class SignupParams
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string DetailAddress { get; set; } = string.Empty;
    public string Avatar { get; set; } = string.Empty;
    public string? Password { get; set; }
}

public class UpdateProfileParams
{
    public string? Name { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public string? DetailAddress { get; set; }
    public string? Avatar { get; set; }
    public string? CurrentPassword { get; set; }
    public string? NewPassword { get; set; }
}

public class ProjectRequestParams
{
    public int Page { get; set; } = 1;
    public int Limit { get; set; } = 20;
    public string? Keyword { get; set; }
    public string? SortBy { get; set; }
    public string? Status { get; set; }
}

public class BoardRequestParams
{
    public int Page { get; set; } = 1;
    public int Limit { get; set; } = 20;
    public string? Keyword { get; set; }
    public string? SortBy { get; set; }
    public string? Category { get; set; }
}

public class TaskRequestParams
{
    public int Page { get; set; } = 1;
    public int Limit { get; set; } = 50;
    public string? Keyword { get; set; }
    public string? SortBy { get; set; }
    public bool? Completed { get; set; }
    public string? AuthorId { get; set; }
}

public class CreateTaskParams
{
    public string Text { get; set; } = string.Empty;
    public string TargetDate { get; set; } = string.Empty;
    public bool IsPublic { get; set; }
}

public class CreateProjectParams
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string DueDate { get; set; } = string.Empty;
    public List<string> Members { get; set; } = new();
}

public class CreateProcessParams
{
    public string Title { get; set; } = string.Empty;
    public string StartDate { get; set; } = string.Empty;
    public string EndDate { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public List<string> Members { get; set; } = new();
}

public class LoginResponse
{
    public string Token { get; set; } = string.Empty;
    public User User { get; set; } = new();
}

public class BoardResponse
{
    public List<BoardPost> Items { get; set; } = new();
    public int TotalCount { get; set; }
    public int CurrentPage { get; set; }
}

public class SyncMessage
{
    public string Id { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public object? Payload { get; set; }
    public SyncMeta Meta { get; set; } = new();
}

public class SyncMeta
{
    public long Timestamp { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
}

public class ForgotPasswordRequest
{
    public string Email { get; set; } = string.Empty;
}

public class AvailabilityResponse
{
    public bool Available { get; set; }
}

public class FileResponse
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string FileType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public string SizeLabel { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;
    public string Uploader { get; set; } = string.Empty;
    public string Status { get; set; } = "synced";
}
