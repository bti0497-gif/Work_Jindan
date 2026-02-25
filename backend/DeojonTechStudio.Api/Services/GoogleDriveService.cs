using Google.Apis.Auth.OAuth2;
using Google.Apis.Auth.OAuth2.Flows;
using Google.Apis.Auth.OAuth2.Responses;
using Google.Apis.Drive.v3;
using Google.Apis.Services;
using Google.Apis.Drive.v3.Data;

namespace DeojonTechStudio.Api.Services;

public class GoogleDriveService
{
    public record DriveFileInfo(string Id, string Name, DateTime? ModifiedTime);

    private readonly IConfiguration _configuration;

    public GoogleDriveService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    private DriveService CreateDriveService()
    {
        var clientId = _configuration["GOOGLE_CLIENT_ID"];
        var clientSecret = _configuration["GOOGLE_CLIENT_SECRET"];
        var refreshToken = _configuration["GOOGLE_REFRESH_TOKEN"];

        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret) || string.IsNullOrWhiteSpace(refreshToken))
        {
            throw new InvalidOperationException("Google Drive credentials are missing.");
        }

        var secrets = new ClientSecrets { ClientId = clientId, ClientSecret = clientSecret };
        var flow = new GoogleAuthorizationCodeFlow(new GoogleAuthorizationCodeFlow.Initializer
        {
            ClientSecrets = secrets,
            Scopes = new[] { DriveService.Scope.DriveFile, DriveService.Scope.Drive }
        });

        var token = new TokenResponse { RefreshToken = refreshToken };
        var credential = new UserCredential(flow, "thezone-drive", token);

        credential.RefreshTokenAsync(CancellationToken.None).GetAwaiter().GetResult();

        return new DriveService(new BaseClientService.Initializer
        {
            HttpClientInitializer = credential,
            ApplicationName = "ThezoneTechStudio"
        });
    }

    public async Task<string> UploadFileAsync(Stream stream, string name, string contentType, string? folderId)
    {
        using var service = CreateDriveService();
        var fileMetadata = new Google.Apis.Drive.v3.Data.File
        {
            Name = name,
            Parents = string.IsNullOrWhiteSpace(folderId) ? null : new List<string> { folderId }
        };

        var request = service.Files.Create(fileMetadata, stream, contentType);
        request.Fields = "id";
        var result = await request.UploadAsync();
        if (result.Status != Google.Apis.Upload.UploadStatus.Completed)
        {
            throw new InvalidOperationException("Google Drive upload failed.");
        }

        return request.ResponseBody.Id;
    }

    public async Task<Stream> DownloadFileAsync(string fileId)
    {
        var service = CreateDriveService();
        var stream = new MemoryStream();
        await service.Files.Get(fileId).DownloadAsync(stream);
        stream.Position = 0;
        return stream;
    }

    public async Task<string> EnsureFolderAsync(string folderName, string? parentId)
    {
        using var service = CreateDriveService();
        var list = service.Files.List();
        var parentQuery = string.IsNullOrWhiteSpace(parentId) ? string.Empty : $" and '{parentId}' in parents";
        list.Q = $"mimeType='application/vnd.google-apps.folder' and name='{folderName}' and trashed=false{parentQuery}";
        list.Fields = "files(id, name)";
        var result = await list.ExecuteAsync();
        var existing = result.Files?.FirstOrDefault();
        if (existing != null)
        {
            return existing.Id;
        }

        var fileMetadata = new Google.Apis.Drive.v3.Data.File
        {
            Name = folderName,
            MimeType = "application/vnd.google-apps.folder",
            Parents = string.IsNullOrWhiteSpace(parentId) ? null : new List<string> { parentId }
        };
        var create = service.Files.Create(fileMetadata);
        create.Fields = "id";
        var created = await create.ExecuteAsync();
        return created.Id;
    }

    public async Task<IReadOnlyList<DriveFileInfo>> ListFilesAsync(string folderId, string? namePrefix = null, string? nameSuffix = null)
    {
        using var service = CreateDriveService();
        var list = service.Files.List();
        var query = $"'{folderId}' in parents and trashed=false";
        if (!string.IsNullOrWhiteSpace(namePrefix))
        {
            query += $" and name contains '{namePrefix}'";
        }
        if (!string.IsNullOrWhiteSpace(nameSuffix))
        {
            query += $" and name contains '{nameSuffix}'";
        }
        list.Q = query;
        list.OrderBy = "modifiedTime desc";
        list.Fields = "files(id, name, modifiedTime)";
        list.PageSize = 20;
        var result = await list.ExecuteAsync();
        return result.Files?
            .Select(file => new DriveFileInfo(file.Id, file.Name, file.ModifiedTimeDateTimeOffset?.UtcDateTime))
            .ToList()
            ?? new List<DriveFileInfo>();
    }

    public async Task DeleteFileAsync(string fileId)
    {
        using var service = CreateDriveService();
        await service.Files.Delete(fileId).ExecuteAsync();
    }
}
