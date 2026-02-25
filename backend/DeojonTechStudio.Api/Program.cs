using System.Text;
using System.Text.Json;
using System.Reflection;
using BCrypt.Net;
using DeojonTechStudio.Api.Data;
using DeojonTechStudio.Api.Models;
using DeojonTechStudio.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;

var envPath = Path.Combine(Directory.GetCurrentDirectory(), ".env.local");
if (!File.Exists(envPath))
{
    envPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "..", ".env.local"));
}
if (File.Exists(envPath))
{
    DotNetEnv.Env.Load(envPath);
}

var builder = WebApplication.CreateBuilder(args);

// Kestrel ?? ??: ?? ??????? 5000 ?? ??
builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenAnyIP(5000); 
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
const string CorsPolicyName = "AppCors";
var corsOrigins = builder.Configuration["CORS_ORIGINS"]
    ?.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    ?? new[] { "https://app.local", "http://localhost:3000", "http://localhost:5173" };
var corsOriginSet = new HashSet<string>(corsOrigins, StringComparer.OrdinalIgnoreCase);

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicyName, policy =>
        policy.WithOrigins(corsOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod());
});

builder.Services.AddDbContext<AppDbContext>(options =>
{
    var connection = builder.Configuration.GetConnectionString("Default")
        ?? Environment.GetEnvironmentVariable("ConnectionStrings__Default")
        ?? throw new InvalidOperationException("DB connection string not configured. Set ConnectionStrings:Default in appsettings.json or .env.local");

    options.UseNpgsql(connection);
});

builder.Services.AddSingleton<GoogleDriveService>();
builder.Services.AddSingleton<EmailService>();

var app = builder.Build();

// ?? ?? ???? (????)
app.Use(async (context, next) =>
{
    Console.WriteLine($"[Request] {context.Request.Method} {context.Request.Path}");
    await next();
});

// 1. Routing + CORS
app.UseRouting();
app.UseCors(CorsPolicyName);

// 1-1. CORS ?? ?? ?? + OPTIONS ?? ??
app.Use(async (context, next) =>
{
    var origin = context.Request.Headers.Origin.ToString();
    if (!string.IsNullOrWhiteSpace(origin) && corsOriginSet.Contains(origin))
    {
        context.Response.Headers["Access-Control-Allow-Origin"] = origin;
        context.Response.Headers["Vary"] = "Origin";
        context.Response.Headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-User-Id";
        context.Response.Headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,DELETE,OPTIONS";
    }

    if (HttpMethods.IsOptions(context.Request.Method))
    {
        context.Response.StatusCode = StatusCodes.Status204NoContent;
        return;
    }

    await next();
});

// 2. Health check - must be before any middleware that might use DB
app.MapGet("/api/health", () => Results.Ok("OK")).AllowAnonymous();
app.MapGet("/api/debug/dbinfo", (AppDbContext db) =>
{
    var conn = db.Database.GetDbConnection();
    return Results.Ok(new
    {
        ConnectionString = conn.ConnectionString,
        CanConnect = db.Database.CanConnect()
    });
});
app.MapGet("/api/debug/version", () =>
{
    var assembly = Assembly.GetExecutingAssembly().GetName();
    return Results.Ok(new
    {
        Name = assembly.Name,
        Version = assembly.Version?.ToString() ?? "unknown",
        BaseDir = AppContext.BaseDirectory
    });
});
app.MapGet("/api/debug/tables", (AppDbContext db) =>
{
    var conn = db.Database.GetDbConnection();
    conn.Open();
    using var cmd = conn.CreateCommand();
    cmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;";
    var tables = new List<string>();
    using var reader = cmd.ExecuteReader();
    while (reader.Read())
    {
        tables.Add(reader.GetString(0));
    }
    conn.Close();
    return Results.Ok(tables);
});

// 3. Static files
var distPath = Path.Combine(AppContext.BaseDirectory, "dist");
if (Directory.Exists(distPath))
{
    var provider = new PhysicalFileProvider(distPath);
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = provider });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = provider });
    var indexPath = Path.Combine(distPath, "index.html");
    if (File.Exists(indexPath))
    {
        app.MapGet("/", () => Results.File(indexPath, "text/html"));
        app.MapFallbackToFile("index.html", new StaticFileOptions { FileProvider = provider });
    }
}
else
{
    try
    {
        var logDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ThezoneTechStudio");
        Directory.CreateDirectory(logDir);
        var logPath = Path.Combine(logDir, "startup.log");
        var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "unknown";
        File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Backend version: {version} BaseDir={AppContext.BaseDirectory}{Environment.NewLine}");
        File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] dist not found: {distPath}{Environment.NewLine}");
    }
    catch
    {
        // ignore logging failures
    }
}

// 4. DB connection check (Supabase Postgres)
try
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.CanConnectAsync();
    Console.WriteLine("[DB] Supabase Postgres connection OK.");
}
catch (Exception ex)
{
    Console.WriteLine($"[DB] Connection failed: {ex.Message}");
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// 5. Auth Middleware
app.Use(async (context, next) =>
{
    // Skip DB/Auth check for health endpoint to ensure instant response
    if (context.Request.Path.Value?.EndsWith("/health", StringComparison.OrdinalIgnoreCase) == true)
    {
        await next();
        return;
    }

    try 
    {
        var db = context.RequestServices.GetRequiredService<AppDbContext>();
        string? userId = null;
        var authHeader = context.Request.Headers.Authorization.ToString();

        if (!string.IsNullOrWhiteSpace(authHeader) && authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var token = authHeader["Bearer ".Length..].Trim();
            userId = token.StartsWith("token-") ? token["token-".Length..] : token;
        }
        else if (context.Request.Headers.TryGetValue("X-User-Id", out var headerValues))
        {
            userId = headerValues.FirstOrDefault();
        }

        if (!string.IsNullOrWhiteSpace(userId))
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user != null)
            {
                context.Items["CurrentUser"] = user;
            }
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Auth Middleware Error: {ex.Message}");
    }

    await next();
});

User? GetCurrentUser(HttpContext context)
{
    return context.Items.TryGetValue("CurrentUser", out var user) ? user as User : null;
}

(int skip, int take) GetPaging(int page, int limit)
{
    var safePage = page <= 0 ? 1 : page;
    var safeLimit = limit <= 0 ? 20 : limit;
    return ((safePage - 1) * safeLimit, safeLimit);
}

string ToSizeLabel(long sizeBytes)
{
    const double gb = 1024 * 1024 * 1024;
    const double mb = 1024 * 1024;
    return sizeBytes >= gb
        ? $"{sizeBytes / gb:0.0} GB"
        : $"{sizeBytes / mb:0.0} MB";
}

bool HasGoogleDriveConfig(IConfiguration config)
{
    return !string.IsNullOrWhiteSpace(config["GOOGLE_CLIENT_ID"])
        && !string.IsNullOrWhiteSpace(config["GOOGLE_CLIENT_SECRET"])
        && !string.IsNullOrWhiteSpace(config["GOOGLE_REFRESH_TOKEN"]);
}

async Task<DatabaseSnapshotPayload?> TryDownloadLatestSnapshotAsync(GoogleDriveService driveService, IConfiguration config)
{
    if (!HasGoogleDriveConfig(config))
    {
        return null;
    }

    var rootFolderId = config["GOOGLE_DRIVE_FOLDER_ID"];
    var jsonFolderId = await driveService.EnsureFolderAsync("json", rootFolderId);
    var files = await driveService.ListFilesAsync(jsonFolderId, "db-snapshot-", ".json");
    var latest = files.OrderByDescending(f => f.ModifiedTime ?? DateTime.MinValue).FirstOrDefault();
    if (latest is null)
    {
        return null;
    }

    await using var stream = await driveService.DownloadFileAsync(latest.Id);
    using var reader = new StreamReader(stream, Encoding.UTF8);
    var json = await reader.ReadToEndAsync();
    return JsonSerializer.Deserialize<DatabaseSnapshotPayload>(json);
}

async Task TryCleanupOldSnapshotsAsync(GoogleDriveService driveService, IConfiguration config)
{
    if (!HasGoogleDriveConfig(config))
    {
        return;
    }

    var rootFolderId = config["GOOGLE_DRIVE_FOLDER_ID"];
    var jsonFolderId = await driveService.EnsureFolderAsync("json", rootFolderId);
    var files = await driveService.ListFilesAsync(jsonFolderId, "db-snapshot-", ".json");
    var cutoff = DateTime.UtcNow.AddDays(-7);
    foreach (var file in files)
    {
        if (file.ModifiedTime.HasValue && file.ModifiedTime.Value < cutoff)
        {
            await driveService.DeleteFileAsync(file.Id);
        }
    }
}

async Task TryUploadDatabaseSnapshotAsync(AppDbContext db, GoogleDriveService driveService, IConfiguration config, string reason)
{
    if (!HasGoogleDriveConfig(config))
    {
        return;
    }

    try
    {
        var payload = new
        {
            generatedAtUtc = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
            reason,
            users = await db.Users.ToListAsync(),
            projects = await db.Projects.ToListAsync(),
            processes = await db.Processes.ToListAsync(),
            tasks = await db.Tasks.ToListAsync(),
            boardPosts = await db.BoardPosts.ToListAsync(),
            files = await db.Files.ToListAsync(),
            syncLogs = await db.SyncLogs.ToListAsync()
        };

        var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true });
        var bytes = Encoding.UTF8.GetBytes(json);
        await using var stream = new MemoryStream(bytes);
        var rootFolderId = config["GOOGLE_DRIVE_FOLDER_ID"];
        var jsonFolderId = await driveService.EnsureFolderAsync("json", rootFolderId);
        var fileName = $"db-snapshot-{DateTime.UtcNow:yyyyMMdd-HHmmss}.json";
        await driveService.UploadFileAsync(stream, fileName, "application/json", jsonFolderId);
        await TryCleanupOldSnapshotsAsync(driveService, config);
    }
    catch (Exception ex)
    {
        try
        {
            var logDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "ThezoneTechStudio");
            Directory.CreateDirectory(logDir);
            var logPath = Path.Combine(logDir, "startup.log");
            File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] DB snapshot upload failed: {ex.Message}{Environment.NewLine}");
        }
        catch
        {
            // ignore logging failures
        }
    }
}

string GenerateTempPassword()
{
    const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$";
    var random = new Random();
    return new string(Enumerable.Range(0, 10).Select(_ => chars[random.Next(chars.Length)]).ToArray());
}

app.MapGet("/api/auth/check-id", async (string id, AppDbContext db) =>
{
    var available = !await db.Users.AnyAsync(u => u.Id == id);
    return Results.Ok(new AvailabilityResponse { Available = available });
});

app.MapGet("/api/auth/check-email", async (string email, AppDbContext db) =>
{
    var available = !await db.Users.AnyAsync(u => u.Email == email);
    return Results.Ok(new AvailabilityResponse { Available = available });
});

app.MapPost("/api/auth/login", async (LoginParams login, AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(login.Id) || string.IsNullOrWhiteSpace(login.Password))
    {
        return Results.BadRequest("???? ????? ?????.");
    }

    var user = await db.Users.FirstOrDefaultAsync(u => u.Id == login.Id);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    if (!BCrypt.Net.BCrypt.Verify(login.Password, user.PasswordHash))
    {
        return Results.Unauthorized();
    }

    var token = $"token-{user.Id}";
    return Results.Ok(new LoginResponse { Token = token, User = user });
});

app.MapPost("/api/auth/signup", async (SignupParams signup, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    if (string.IsNullOrWhiteSpace(signup.Id) ||
        string.IsNullOrWhiteSpace(signup.Name) ||
        string.IsNullOrWhiteSpace(signup.Email) ||
        string.IsNullOrWhiteSpace(signup.Phone) ||
        string.IsNullOrWhiteSpace(signup.Address) ||
        string.IsNullOrWhiteSpace(signup.DetailAddress) ||
        string.IsNullOrWhiteSpace(signup.Password))
    {
        return Results.BadRequest("?? ???? ???????.");
    }

    if (await db.Users.AnyAsync(u => u.Id == signup.Id))
    {
        return Results.Conflict("?? ???? ??????.");
    }

    if (await db.Users.AnyAsync(u => u.Email == signup.Email))
    {
        return Results.Conflict("?? ?? ?? ??????.");
    }

    var user = new User
    {
        Id = signup.Id,
        Name = signup.Name,
        Email = signup.Email,
        Phone = signup.Phone,
        Address = signup.Address,
        DetailAddress = signup.DetailAddress,
        Avatar = string.IsNullOrWhiteSpace(signup.Avatar)
            ? $"https://picsum.photos/seed/{signup.Id}/100/100"
            : signup.Avatar,
        Role = "user",
        PasswordHash = BCrypt.Net.BCrypt.HashPassword(signup.Password)
    };

    db.Users.Add(user);
    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "signup");
    return Results.Ok(user);
});

app.MapPost("/api/auth/forgot", async (ForgotPasswordRequest request, AppDbContext db, EmailService emailService, GoogleDriveService driveService, IConfiguration config) =>
{
    if (string.IsNullOrWhiteSpace(request.Email))
    {
        return Results.BadRequest("???? ?????.");
    }

    var user = await db.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
    if (user is null)
    {
        return Results.NotFound("??? ???? ????.");
    }

    var tempPassword = GenerateTempPassword();
    user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(tempPassword);
    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "reset-password");

    await emailService.SendTempPasswordAsync(request.Email, tempPassword);
    return Results.Ok();
});

app.MapGet("/api/user/profile", (HttpContext context) =>
{
    var user = GetCurrentUser(context);
    return user is null ? Results.Unauthorized() : Results.Ok(user);
});

app.MapPatch("/api/user/profile", async (UpdateProfileParams update, HttpContext context, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var user = GetCurrentUser(context);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    if (!string.IsNullOrWhiteSpace(update.Name)) user.Name = update.Name;
    if (!string.IsNullOrWhiteSpace(update.Email)) user.Email = update.Email;
    if (!string.IsNullOrWhiteSpace(update.Phone)) user.Phone = update.Phone;
    if (!string.IsNullOrWhiteSpace(update.Address)) user.Address = update.Address;
    if (!string.IsNullOrWhiteSpace(update.DetailAddress)) user.DetailAddress = update.DetailAddress;
    if (!string.IsNullOrWhiteSpace(update.Avatar)) user.Avatar = update.Avatar;

    if (!string.IsNullOrWhiteSpace(update.NewPassword))
    {
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(update.NewPassword);
    }

    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "update-profile");
    return Results.Ok(user);
});

app.MapGet("/api/projects", async ([AsParameters] ProjectRequestParams query, AppDbContext db) =>
{
    var result = db.Projects.AsQueryable();

    if (!string.IsNullOrWhiteSpace(query.Keyword))
    {
        result = result.Where(p => p.Title.Contains(query.Keyword) || p.Description.Contains(query.Keyword));
    }

    if (!string.IsNullOrWhiteSpace(query.Status))
    {
        result = result.Where(p => p.Status == query.Status);
    }

    result = query.SortBy switch
    {
        "oldest" => result.OrderBy(p => p.Id),
        _ => result.OrderByDescending(p => p.Id)
    };

    var (skip, take) = GetPaging(query.Page, query.Limit);
    var items = await result.Skip(skip).Take(take).ToListAsync();
    return Results.Ok(items);
});

app.MapPost("/api/projects", async (CreateProjectParams create, HttpContext context, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var user = GetCurrentUser(context);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var project = new Project
    {
        Id = Guid.NewGuid().ToString("N"),
        Title = create.Title,
        Description = create.Description,
        DueDate = create.DueDate,
        Members = create.Members,
        Progress = 0,
        Status = "In Progress",
        AuthorId = user.Id
    };

    db.Projects.Add(project);
    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "create-project");

    return Results.Ok(project);
});

app.MapPatch("/api/projects/{id}", async (string id, Project update, HttpContext context, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var user = GetCurrentUser(context);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id);
    if (project is null)
    {
        return Results.NotFound();
    }

    if (project.AuthorId != user.Id)
    {
        return Results.Forbid();
    }

    project.Title = update.Title;
    project.Description = update.Description;
    project.DueDate = update.DueDate;
    project.Members = update.Members;

    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "update-project");
    return Results.Ok(project);
});

app.MapDelete("/api/projects/{id}", async (string id, HttpContext context, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var user = GetCurrentUser(context);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id);
    if (project is null)
    {
        return Results.NotFound();
    }

    if (project.AuthorId != user.Id)
    {
        return Results.Forbid();
    }

    db.Projects.Remove(project);
    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "delete-project");
    return Results.Ok();
});

app.MapGet("/api/projects/{id}", async (string id, AppDbContext db) =>
{
    var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id);
    if (project is null)
    {
        return Results.NotFound();
    }

    var processes = await db.Processes.Where(p => p.ProjectId == id).ToListAsync();
    return Results.Ok(new { project, processes });
});

app.MapPost("/api/projects/{id}/processes", async (string id, CreateProcessParams create, HttpContext context, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var user = GetCurrentUser(context);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    if (!await db.Projects.AnyAsync(p => p.Id == id))
    {
        return Results.NotFound("????? ?? ? ????.");
    }

    var process = new Process
    {
        Id = Guid.NewGuid().ToString("N"),
        ProjectId = id,
        Title = create.Title,
        StartDate = create.StartDate,
        EndDate = create.EndDate,
        Description = create.Description,
        Members = create.Members,
        IsCompleted = false,
        AuthorId = user.Id
    };

    db.Processes.Add(process);
    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "create-process");

    return Results.Ok(process);
});

app.MapPatch("/api/processes/{id}", async (string id, Process update, HttpContext context, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var user = GetCurrentUser(context);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var process = await db.Processes.FirstOrDefaultAsync(p => p.Id == id);
    if (process is null)
    {
        return Results.NotFound();
    }

    if (process.AuthorId != user.Id)
    {
        return Results.Forbid();
    }

    process.Title = update.Title;
    process.StartDate = update.StartDate;
    process.EndDate = update.EndDate;
    process.Description = update.Description;
    process.Members = update.Members;

    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "update-process");
    return Results.Ok(process);
});

app.MapDelete("/api/processes/{id}", async (string id, HttpContext context, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var user = GetCurrentUser(context);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var process = await db.Processes.FirstOrDefaultAsync(p => p.Id == id);
    if (process is null)
    {
        return Results.NotFound();
    }

    if (process.AuthorId != user.Id)
    {
        return Results.Forbid();
    }

    db.Processes.Remove(process);
    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "delete-process");
    return Results.Ok();
});

app.MapPatch("/api/processes/{id}/toggle", async (string id, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var process = await db.Processes.FirstOrDefaultAsync(p => p.Id == id);
    if (process is null)
    {
        return Results.NotFound();
    }

    process.IsCompleted = !process.IsCompleted;
    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "toggle-process");
    return Results.Ok(process);
});

app.MapGet("/api/tasks", async ([AsParameters] TaskRequestParams query, HttpContext context, AppDbContext db) =>
{
    var user = GetCurrentUser(context);
    var result = db.Tasks.AsQueryable();

    if (query.Completed.HasValue)
    {
        result = result.Where(t => t.Completed == query.Completed.Value);
    }

    if (!string.IsNullOrWhiteSpace(query.Keyword))
    {
        result = result.Where(t => t.Text.Contains(query.Keyword));
    }

    if (!string.IsNullOrWhiteSpace(query.AuthorId))
    {
        result = result.Where(t => t.AuthorId == query.AuthorId);
    }

    result = user is null
        ? result.Where(t => t.IsPublic)
        : result.Where(t => t.IsPublic || t.AuthorId == user.Id);

    var (skip, take) = GetPaging(query.Page, query.Limit);
    var items = await result.Skip(skip).Take(take).ToListAsync();
    return Results.Ok(items);
});

app.MapPost("/api/tasks", async (CreateTaskParams create, HttpContext context, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var user = GetCurrentUser(context);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var task = new TaskItem
    {
        Id = Guid.NewGuid().ToString("N"),
        Text = create.Text,
        TargetDate = create.TargetDate,
        RegDate = DateTime.UtcNow.ToString("yyyy-MM-dd"),
        Completed = false,
        Author = user.Name,
        AuthorId = user.Id,
        AuthorAvatar = user.Avatar,
        IsPublic = create.IsPublic
    };

    db.Tasks.Add(task);
    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "create-task");

    return Results.Ok(task);
});

app.MapPatch("/api/tasks/{id}", async (string id, TaskItem update, HttpContext context, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var user = GetCurrentUser(context);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id);
    if (task is null)
    {
        return Results.NotFound();
    }

    if (task.AuthorId != user.Id)
    {
        return Results.Forbid();
    }

    task.Text = update.Text;
    task.TargetDate = update.TargetDate;
    task.Completed = update.Completed;
    task.IsPublic = update.IsPublic;

    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "update-task");
    return Results.Ok(task);
});

app.MapDelete("/api/tasks/{id}", async (string id, HttpContext context, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var user = GetCurrentUser(context);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id);
    if (task is null)
    {
        return Results.NotFound();
    }

    if (task.AuthorId != user.Id)
    {
        return Results.Forbid();
    }

    db.Tasks.Remove(task);
    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "delete-task");
    return Results.Ok();
});

app.MapGet("/api/board", async ([AsParameters] BoardRequestParams query, AppDbContext db) =>
{
    var result = db.BoardPosts.AsQueryable();

    if (!string.IsNullOrWhiteSpace(query.Keyword))
    {
        result = result.Where(p => p.Title.Contains(query.Keyword) || p.Content.Contains(query.Keyword));
    }

    // 공지글 상단 고정 후 정렬 기준 적용
    result = query.SortBy switch
    {
        "views" => result.OrderByDescending(p => p.IsNotice).ThenByDescending(p => p.Views),
        "oldest" => result.OrderByDescending(p => p.IsNotice).ThenBy(p => p.Id),
        _ => result.OrderByDescending(p => p.IsNotice).ThenByDescending(p => p.Id)
    };

    var total = await result.CountAsync();
    var (skip, take) = GetPaging(query.Page, query.Limit);

    return Results.Ok(new BoardResponse
    {
        Items = await result.Skip(skip).Take(take).ToListAsync(),
        TotalCount = total,
        CurrentPage = query.Page
    });
});

app.MapPost("/api/board", async (BoardPost post, HttpContext context, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var user = GetCurrentUser(context);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    post.Id = Guid.NewGuid().ToString("N");
    post.Author = user.Name;
    post.AuthorId = user.Id;
    post.AuthorAvatar = user.Avatar;
    post.RegDate = DateTime.UtcNow.ToString("yyyy-MM-dd");
    post.Views = 0;
    // 공지글은 admin/master만 설정 가능
    if (user.Role != "admin" && user.Role != "master")
    {
        post.IsNotice = false;
    }

    db.BoardPosts.Add(post);
    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "create-board");
    return Results.Ok(post);
});

app.MapPatch("/api/board/{id}", async (string id, BoardPost update, HttpContext context, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var user = GetCurrentUser(context);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var post = await db.BoardPosts.FirstOrDefaultAsync(p => p.Id == id);
    if (post is null)
    {
        return Results.NotFound();
    }

    // admin/master는 모든 글 수정 가능, 일반 유저는 본인 글만
    var isAdmin = user.Role == "admin" || user.Role == "master";
    if (!isAdmin && post.AuthorId != user.Id)
    {
        return Results.Forbid();
    }

    post.Title = update.Title;
    post.Content = update.Content;
    // 공지글 설정은 admin/master만 가능
    if (isAdmin)
    {
        post.IsNotice = update.IsNotice;
    }

    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "update-board");
    return Results.Ok(post);
});

app.MapDelete("/api/board/{id}", async (string id, HttpContext context, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var user = GetCurrentUser(context);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var post = await db.BoardPosts.FirstOrDefaultAsync(p => p.Id == id);
    if (post is null)
    {
        return Results.NotFound();
    }

    // admin/master는 모든 글 삭제 가능, 일반 유저는 본인 글만
    var isAdmin = user.Role == "admin" || user.Role == "master";
    if (!isAdmin && post.AuthorId != user.Id)
    {
        return Results.Forbid();
    }

    db.BoardPosts.Remove(post);
    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "delete-board");
    return Results.Ok();
});

app.MapGet("/api/board/{id}", async (string id, AppDbContext db) =>
{
    var post = await db.BoardPosts.FirstOrDefaultAsync(p => p.Id == id);
    if (post is null)
    {
        return Results.NotFound();
    }

    post.Views += 1;
    await db.SaveChangesAsync();
    return Results.Ok(post);
});

app.MapGet("/api/files", async (AppDbContext db) =>
{
    var files = await db.Files.OrderByDescending(f => f.UpdatedAt).ToListAsync();
    return Results.Ok(files.Select(f => new FileResponse
    {
        Id = f.Id,
        Name = f.Name,
        FileType = f.FileType,
        SizeBytes = f.SizeBytes,
        SizeLabel = f.SizeLabel,
        UpdatedAt = f.UpdatedAt,
        Uploader = f.UploaderName,
        Status = "synced"
    }));
});

app.MapPost("/api/files/upload", async (HttpContext context, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var user = GetCurrentUser(context);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    if (!context.Request.HasFormContentType)
    {
        return Results.BadRequest("?? ??? ??? ????.");
    }

    var form = await context.Request.ReadFormAsync();
    var file = form.Files.FirstOrDefault();
    if (file is null)
    {
        return Results.BadRequest("??? ????.");
    }

    var folderId = context.RequestServices.GetRequiredService<IConfiguration>()["GOOGLE_DRIVE_FOLDER_ID"];
    await using var stream = file.OpenReadStream();
    var driveId = await driveService.UploadFileAsync(stream, file.FileName, file.ContentType, folderId);

    var record = new FileRecord
    {
        Id = Guid.NewGuid().ToString("N"),
        DriveFileId = driveId,
        Name = file.FileName,
        FileType = Path.GetExtension(file.FileName).TrimStart('.'),
        SizeBytes = file.Length,
        SizeLabel = ToSizeLabel(file.Length),
        UpdatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm"),
        UploaderId = user.Id,
        UploaderName = user.Name
    };

    db.Files.Add(record);
    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "upload-file");

    return Results.Ok(new FileResponse
    {
        Id = record.Id,
        Name = record.Name,
        FileType = record.FileType,
        SizeBytes = record.SizeBytes,
        SizeLabel = record.SizeLabel,
        UpdatedAt = record.UpdatedAt,
        Uploader = record.UploaderName,
        Status = "synced"
    });
});

app.MapGet("/api/files/{id}/download", async (string id, AppDbContext db, GoogleDriveService driveService) =>
{
    var record = await db.Files.FirstOrDefaultAsync(f => f.Id == id);
    if (record is null)
    {
        return Results.NotFound();
    }

    var stream = await driveService.DownloadFileAsync(record.DriveFileId);
    return Results.File(stream, "application/octet-stream", record.Name);
});

app.MapPost("/api/sync/broadcast", async (SyncMessage message, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var payloadJson = message.Payload is null
        ? string.Empty
        : JsonSerializer.Serialize(message.Payload, JsonSerializerOptions.Default);

    var log = new SyncLog
    {
        Id = string.IsNullOrWhiteSpace(message.Id) ? Guid.NewGuid().ToString("N") : message.Id,
        Category = message.Category,
        Action = message.Action,
        TargetId = message.TargetId,
        PayloadJson = payloadJson,
        Timestamp = message.Meta.Timestamp == 0 ? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() : message.Meta.Timestamp,
        UserId = message.Meta.UserId,
        UserName = message.Meta.UserName
    };

    db.SyncLogs.Add(log);
    await db.SaveChangesAsync();
    await TryUploadDatabaseSnapshotAsync(db, driveService, config, "sync-broadcast");

    return Results.Ok(log);
});

app.MapPost("/api/sync/import-latest", async (HttpContext context, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var user = GetCurrentUser(context);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    if (!HasGoogleDriveConfig(config))
    {
        return Results.BadRequest("Google Drive 설정이 없습니다.");
    }

    var snapshot = await TryDownloadLatestSnapshotAsync(driveService, config);
    if (snapshot is null)
    {
        return Results.NotFound("Google Drive에 스냅샷이 없습니다.");
    }

    var users = snapshot.Users ?? new List<User>();
    var projects = snapshot.Projects ?? new List<Project>();
    var processes = snapshot.Processes ?? new List<Process>();
    var tasks = snapshot.Tasks ?? new List<TaskItem>();
    var boardPosts = snapshot.BoardPosts ?? new List<BoardPost>();
    var files = snapshot.Files ?? new List<FileRecord>();
    var syncLogs = snapshot.SyncLogs ?? new List<SyncLog>();

    var existingUsers = await db.Users.AsNoTracking().ToListAsync();
    var existingProjects = await db.Projects.AsNoTracking().ToListAsync();
    var existingProcesses = await db.Processes.AsNoTracking().ToListAsync();
    var existingTasks = await db.Tasks.AsNoTracking().ToListAsync();
    var existingBoardPosts = await db.BoardPosts.AsNoTracking().ToListAsync();
    var existingFiles = await db.Files.AsNoTracking().ToListAsync();
    var existingSyncLogs = await db.SyncLogs.AsNoTracking().ToListAsync();

    var userMap = existingUsers.ToDictionary(u => u.Id, u => u);
    foreach (var item in users)
    {
        if (userMap.ContainsKey(item.Id))
        {
            db.Users.Update(item);
        }
        else
        {
            db.Users.Add(item);
        }
    }

    var projectMap = existingProjects.ToDictionary(p => p.Id, p => p);
    foreach (var item in projects)
    {
        if (projectMap.ContainsKey(item.Id))
        {
            db.Projects.Update(item);
        }
        else
        {
            db.Projects.Add(item);
        }
    }

    var processMap = existingProcesses.ToDictionary(p => p.Id, p => p);
    foreach (var item in processes)
    {
        if (processMap.ContainsKey(item.Id))
        {
            db.Processes.Update(item);
        }
        else
        {
            db.Processes.Add(item);
        }
    }

    var taskMap = existingTasks.ToDictionary(t => t.Id, t => t);
    foreach (var item in tasks)
    {
        if (taskMap.ContainsKey(item.Id))
        {
            db.Tasks.Update(item);
        }
        else
        {
            db.Tasks.Add(item);
        }
    }

    var boardMap = existingBoardPosts.ToDictionary(p => p.Id, p => p);
    foreach (var item in boardPosts)
    {
        if (boardMap.ContainsKey(item.Id))
        {
            db.BoardPosts.Update(item);
        }
        else
        {
            db.BoardPosts.Add(item);
        }
    }

    var fileMap = existingFiles.ToDictionary(f => f.Id, f => f);
    foreach (var item in files)
    {
        if (fileMap.ContainsKey(item.Id))
        {
            db.Files.Update(item);
        }
        else
        {
            db.Files.Add(item);
        }
    }

    var logMap = existingSyncLogs.ToDictionary(s => s.Id, s => s);
    foreach (var item in syncLogs)
    {
        if (logMap.ContainsKey(item.Id))
        {
            db.SyncLogs.Update(item);
        }
        else
        {
            db.SyncLogs.Add(item);
        }
    }

    await db.SaveChangesAsync();

    return Results.Ok(new
    {
        importedAtUtc = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
        counts = new
        {
            users = users.Count,
            projects = projects.Count,
            processes = processes.Count,
            tasks = tasks.Count,
            boardPosts = boardPosts.Count,
            files = files.Count,
            syncLogs = syncLogs.Count
        }
    });
});

app.MapGet("/api/sync/updates", async (long since, AppDbContext db, GoogleDriveService driveService, IConfiguration config) =>
{
    var todayStart = new DateTimeOffset(DateTime.Now.Date).ToUnixTimeMilliseconds();
    var oldChats = await db.SyncLogs
        .Where(log => log.Category == "CHAT" && log.Timestamp < todayStart)
        .ToListAsync();

    if (oldChats.Count > 0)
    {
        db.SyncLogs.RemoveRange(oldChats);
        await db.SaveChangesAsync();
        await TryUploadDatabaseSnapshotAsync(db, driveService, config, "sync-cleanup");
    }

    var updates = await db.SyncLogs
        .Where(log => log.Timestamp > since)
        .OrderBy(log => log.Timestamp)
        .ToListAsync();

    return Results.Ok(updates.Select(log => new SyncMessage
    {
        Id = log.Id,
        Category = log.Category,
        Action = log.Action,
        TargetId = log.TargetId,
        Payload = string.IsNullOrWhiteSpace(log.PayloadJson)
            ? null
            : JsonSerializer.Deserialize<object>(log.PayloadJson),
        Meta = new SyncMeta
        {
            Timestamp = log.Timestamp,
            UserId = log.UserId,
            UserName = log.UserName
        }
    }));
});

app.MapGet("/api/sync/online", async (int? withinSeconds, AppDbContext db) =>
{
    var window = withinSeconds ?? 60;
    var since = DateTimeOffset.UtcNow.AddSeconds(-window).ToUnixTimeMilliseconds();

    var online = await db.SyncLogs
        .Where(log => log.Category == "HEARTBEAT" && log.Timestamp >= since)
        .GroupBy(log => log.UserId)
        .Select(group => new { UserId = group.Key, UserName = group.Max(x => x.UserName) })
        .ToListAsync();

    return Results.Ok(online);
});

app.MapGet("/api/processes", async (int? page, int? limit, string? projectId, AppDbContext db) =>
{
    var result = db.Processes.AsQueryable();

    if (!string.IsNullOrWhiteSpace(projectId))
    {
        result = result.Where(p => p.ProjectId == projectId);
    }

    var (skip, take) = GetPaging(page ?? 1, limit ?? 200);
    var items = await result.Skip(skip).Take(take).ToListAsync();
    return Results.Ok(items);
});

app.Run();
