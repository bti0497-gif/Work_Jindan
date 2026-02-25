using System.Text.Json;
using DeojonTechStudio.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace DeojonTechStudio.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Process> Processes => Set<Process>();
    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<BoardPost> BoardPosts => Set<BoardPost>();
    public DbSet<SyncLog> SyncLogs => Set<SyncLog>();
    public DbSet<FileRecord> Files => Set<FileRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var listConverter = new ValueConverter<List<string>, string>(
            value => JsonSerializer.Serialize(value, (JsonSerializerOptions?)null),
            value => string.IsNullOrWhiteSpace(value)
                ? new List<string>()
                : JsonSerializer.Deserialize<List<string>>(value, (JsonSerializerOptions?)null) ?? new List<string>());

        // Supabase 테이블명 매핑 (jindan_ 접두사)
        modelBuilder.Entity<User>().ToTable("jindan_users");
        modelBuilder.Entity<Project>().ToTable("jindan_projects");
        modelBuilder.Entity<Process>().ToTable("jindan_processes");
        modelBuilder.Entity<TaskItem>().ToTable("jindan_tasks");
        modelBuilder.Entity<BoardPost>().ToTable("jindan_posts");
        modelBuilder.Entity<SyncLog>().ToTable("jindan_sync_logs");
        modelBuilder.Entity<FileRecord>().ToTable("jindan_files");

        // snake_case 컈럼명 매핑
        modelBuilder.Entity<User>(e => {
            e.Property(u => u.PasswordHash).HasColumnName("password_hash");
            e.Property(u => u.DetailAddress).HasColumnName("detail_address");
        });

        modelBuilder.Entity<Project>(e => {
            e.Property(p => p.DueDate).HasColumnName("due_date");
            e.Property(p => p.AuthorId).HasColumnName("author_id");
            e.Property(p => p.Members).HasConversion(listConverter).HasColumnName("members");
        });

        modelBuilder.Entity<Process>(e => {
            e.Property(p => p.ProjectId).HasColumnName("project_id");
            e.Property(p => p.StartDate).HasColumnName("start_date");
            e.Property(p => p.EndDate).HasColumnName("end_date");
            e.Property(p => p.IsCompleted).HasColumnName("is_completed");
            e.Property(p => p.AuthorId).HasColumnName("author_id");
            e.Property(p => p.Members).HasConversion(listConverter).HasColumnName("members");
        });

        modelBuilder.Entity<TaskItem>(e => {
            e.Property(t => t.TargetDate).HasColumnName("target_date");
            e.Property(t => t.RegDate).HasColumnName("reg_date");
            e.Property(t => t.AuthorId).HasColumnName("author_id");
            e.Property(t => t.AuthorAvatar).HasColumnName("author_avatar");
            e.Property(t => t.IsPublic).HasColumnName("is_public");
        });

        modelBuilder.Entity<BoardPost>(e => {
            e.Property(p => p.AuthorId).HasColumnName("author_id");
            e.Property(p => p.AuthorAvatar).HasColumnName("author_avatar");
            e.Property(p => p.RegDate).HasColumnName("reg_date");
            e.Property(p => p.IsNotice).HasColumnName("is_notice");
        });

        modelBuilder.Entity<SyncLog>(e => {
            e.Property(s => s.PayloadJson).HasColumnName("payload_json").HasColumnType("TEXT");
            e.Property(s => s.TargetId).HasColumnName("target_id");
            e.Property(s => s.UserId).HasColumnName("user_id");
            e.Property(s => s.UserName).HasColumnName("user_name");
        });

        modelBuilder.Entity<FileRecord>(e => {
            e.Property(f => f.DriveFileId).HasColumnName("drive_file_id");
            e.Property(f => f.FileType).HasColumnName("file_type");
            e.Property(f => f.SizeBytes).HasColumnName("size_bytes");
            e.Property(f => f.SizeLabel).HasColumnName("size_label");
            e.Property(f => f.UpdatedAt).HasColumnName("updated_at");
            e.Property(f => f.UploaderId).HasColumnName("uploader_id");
            e.Property(f => f.UploaderName).HasColumnName("uploader_name");
        });
    }
}
