using System.Diagnostics;
using Microsoft.Web.WebView2.Core;

namespace WorkJindan.WinForms;

public partial class Form1 : Form
{
    private static readonly string[] BackendExeCandidates = new[]
    {
        "ThezoneTechStudio.Api.exe",
        "DeojonTechStudio.Api.exe"
    };
    private static readonly string[] BackendDllCandidates = new[]
    {
        "ThezoneTechStudio.Api.dll",
        "DeojonTechStudio.Api.dll"
    };
    private const string AppUrl = "http://localhost:5000";
    private const string LocalHostName = "app.local";
    private static readonly string LogPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "ThezoneTechStudio",
        "startup.log");

    public Form1()
    {
        InitializeComponent();
        SetApplicationIcon();
        
        // Start backend process as early as possible in the background
        Task.Run(() => StartBackendProcessOnly());
    }

    private void StartBackendProcessOnly()
    {
        try
        {
            KillExistingBackendProcesses();
            var backendPath = ResolveBackendExecutablePath();
            if (!string.IsNullOrWhiteSpace(backendPath) && File.Exists(backendPath))
            {
                WriteStartupLog($"Starting backend: {backendPath}");
                var startInfo = new ProcessStartInfo
                {
                    FileName = backendPath,
                    WorkingDirectory = AppContext.BaseDirectory,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                Process.Start(startInfo);
            }
            else
            {
                var dllPath = ResolveBackendDllPath();
                if (!string.IsNullOrWhiteSpace(dllPath) && File.Exists(dllPath))
                {
                    WriteStartupLog($"Starting backend (dotnet): {dllPath}");
                    var startInfo = new ProcessStartInfo
                    {
                        FileName = "dotnet",
                        Arguments = $"\"{dllPath}\"",
                        WorkingDirectory = AppContext.BaseDirectory,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };
                    Process.Start(startInfo);
                }
                else
                {
                    WriteStartupLog($"Backend exe not found: {backendPath}");
                    WriteStartupLog($"Backend dll not found: {dllPath}");
                    WriteStartupLog($"BaseDir: {AppContext.BaseDirectory}");
                    try
                    {
                        var candidates = Directory.GetFiles(AppContext.BaseDirectory, "*TechStudio.Api*");
                        WriteStartupLog($"Backend files in BaseDir: {string.Join(", ", candidates.Select(Path.GetFileName))}");
                    }
                    catch
                    {
                        // ignore
                    }
                }
            }
        }
        catch (Exception ex)
        {
            WriteStartupLog($"Backend start failed: {ex.Message}");
            Debug.WriteLine($"Early backend start failed: {ex.Message}");
        }
    }

    private static string? ResolveBackendExecutablePath()
    {
        foreach (var name in BackendExeCandidates)
        {
            var candidate = Path.Combine(AppContext.BaseDirectory, name);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }
        return null;
    }

    private static string? ResolveBackendDllPath()
    {
        foreach (var name in BackendDllCandidates)
        {
            var candidate = Path.Combine(AppContext.BaseDirectory, name);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }
        return null;
    }

    private static void KillExistingBackendProcesses()
    {
        var candidates = new[] { "ThezoneTechStudio.Api", "DeojonTechStudio.Api" };
        foreach (var name in candidates)
        {
            try
            {
                foreach (var proc in Process.GetProcessesByName(name))
                {
                    try
                    {
                        proc.Kill(true);
                    }
                    catch
                    {
                        // ignore kill failures
                    }
                }
            }
            catch
            {
                // ignore enumeration failures
            }
        }
    }

    private void SetApplicationIcon()
    {
        try
        {
            string iconPath = Path.Combine(AppContext.BaseDirectory, "thezone.ico");
            if (File.Exists(iconPath))
            {
                this.Icon = new Icon(iconPath);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to set icon: {ex.Message}");
        }
    }

    private async void Form1_Load(object sender, EventArgs e)
    {
        try
        {
            Directory.SetCurrentDirectory(AppContext.BaseDirectory);
            
            // Wait for backend to be ready while simultaneously initializing WebView
            var backendReadyTask = WaitForBackendReadyAsync();
            var webViewTask = InitializeWebViewAsync();
            await Task.WhenAll(backendReadyTask, webViewTask);

            if (!backendReadyTask.Result)
            {
                MessageBox.Show(
                    $"???? ???? ?????.\n??: {LogPath}",
                    "?? ?? ??",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
            await LoadUiAsync();
            ShowAdminSeedNoticeIfAny();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"?? ???? ?? ?????? ?????????.\n{ex.Message}", "????", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task InitializeWebViewAsync()
    {
        try
        {
            string userDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ThezoneTechStudio");
            var options = new CoreWebView2EnvironmentOptions
            {
                AdditionalBrowserArguments = "--disable-web-security --disable-features=IsolateOrigins,site-per-process"
            };
            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder, options);
            
            await webView.EnsureCoreWebView2Async(env);

            // Enable DevTools and context menus for troubleshooting
            webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;

        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show("WebView2 Runtime?? ?????? ???? ??????. ??? ?? ??? ???????????.", "WebView2 ???", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private async Task<bool> WaitForBackendReadyAsync()
    {
        // Poll backend with short intervals until it's ready
        int attempts = 0;
        while (attempts < 25 && !await IsBackendAvailable(150))
        {
            await Task.Delay(150);
            attempts++;
        }
        var ready = attempts < 25;
        WriteStartupLog(ready ? "Backend ready." : "Backend not ready after retries.");
        return ready;
    }

    private static async Task<bool> IsBackendAvailable(int timeoutMs = 200)
    {
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromMilliseconds(timeoutMs) };
            // Use the explicit health check path to ensure Kestrel is actually routing requests
            var response = await client.GetAsync($"{AppUrl}/api/health"); 
            return response.IsSuccessStatusCode; 
        }
        catch
        {
            return false;
        }
    }

    private static async Task<bool> IsUiAvailable(string url, int timeoutMs = 300)
    {
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromMilliseconds(timeoutMs) };
            var response = await client.GetAsync(url);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private async Task LoadUiAsync()
    {
        try
        {
            var distPath = Path.Combine(AppContext.BaseDirectory, "dist");
            if (Directory.Exists(distPath))
            {
                var indexPath = Path.Combine(distPath, "index.html");
                WriteStartupLog($"UI dist path: {distPath} indexExists={File.Exists(indexPath)}");
                if (File.Exists(indexPath))
                {
                    webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                        LocalHostName, distPath, CoreWebView2HostResourceAccessKind.Allow);
                    var localUrl = $"https://{LocalHostName}/index.html";
                    WriteStartupLog($"UI from local dist: {localUrl}");
                    webView.Source = new Uri(localUrl);
                    return;
                }
                WriteStartupLog("UI index.html missing in dist. Falling back to backend.");
            }

            var backendUiUrl = $"{AppUrl}/index.html";
            if (await IsUiAvailable(backendUiUrl))
            {
                WriteStartupLog($"UI from backend: {backendUiUrl}");
                webView.Source = new Uri(backendUiUrl);
                return;
            }

            WriteStartupLog($"UI not found. dist path: {distPath}");
            MessageBox.Show(
                $"UI ??? ?? ?????.\n??: {LogPath}",
                "UI ?? ??",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
        catch (Exception ex)
        {
            WriteStartupLog($"UI load failed: {ex.Message}");
        }
    }

    private void ShowAdminSeedNoticeIfAny()
    {
        try
        {
            var noticePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "ThezoneTechStudio",
                "admin.seed.txt");
            if (!File.Exists(noticePath)) return;

            var message = File.ReadAllText(noticePath);
            MessageBox.Show(message, "??? ??", MessageBoxButtons.OK, MessageBoxIcon.Information);
            File.Delete(noticePath);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Admin notice read error: {ex.Message}");
        }
    }

    private static void WriteStartupLog(string message)
    {
        try
        {
            var logDir = Path.GetDirectoryName(LogPath);
            if (!string.IsNullOrWhiteSpace(logDir))
            {
                Directory.CreateDirectory(logDir);
            }
            File.AppendAllText(LogPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
        }
        catch
        {
            // ignore logging failures
        }
    }
}
