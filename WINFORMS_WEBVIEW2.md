# WinForms + WebView2 통합 가이드

목표: WinForms(또는 .NET 앱)에서 로컬 Next.js 서버(또는 정적 파일)를 실행/관리하고, WebView2로 앱 UI에 접속하는 방법을 설명합니다.

## 권장 방식 (호환성 최우선)
1. 앱 시작 시 Node(또는 패키징된 standalone)를 실행하여 로컬 서버를 띄웁니다.
2. 서버 헬스 체크 엔드포인트(`/api/health`)를 폴백으로 사용하여 서버가 준비될 때까지 폴링합니다.
3. 준비되면 WebView2를 `http://127.0.0.1:PORT`로 Navigate 시킵니다.

## C# 예시 (WinForms)
```csharp
using System;
using System.Diagnostics;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.WinForms;

async Task StartAndNavigateAsync(WebView2 webView, string nodeExePath, string workingDir, int port = 3000)
{
    // 1) Node 프로세스 시작
    var startInfo = new ProcessStartInfo
    {
        FileName = nodeExePath, // 예: "node"
        Arguments = "./node_modules/next/dist/bin/next start -p " + port,
        WorkingDirectory = workingDir,
        UseShellExecute = false,
        CreateNoWindow = true
    };

    var proc = Process.Start(startInfo);

    // 2) 헬스 체크 대기
    using var http = new HttpClient();
    var maxMs = 20000;
    var sw = Stopwatch.StartNew();
    while (sw.ElapsedMilliseconds < maxMs)
    {
        try
        {
            var res = await http.GetAsync($"http://127.0.0.1:{port}/api/health");
            if (res.IsSuccessStatusCode) break;
        }
        catch { }
        await Task.Delay(300);
    }

    // 3) WebView2로 이동
    webView.CoreWebView2.Navigate($"http://127.0.0.1:{port}");
}
```

## 대안: Virtual Host Mapping (포트 없이 로컬 파일 제공)
- WebView2의 `SetVirtualHostNameToFolderMapping("appassets", folderPath, Allow)`를 사용하면 `https://appassets/index.html`로 안전하게 파일을 로드할 수 있습니다.
- 단점: 서버 기반 API(예: Next.js api routes)는 별도 로컬 프로세스 또는 네이티브-브리지가 필요합니다.

---
참고: 이 리포지토리에는 `/api/health` 헬스 엔드포인트가 추가되어 있습니다. 로컬서버 방식이 Google Drive 연동(서버사이드 토큰 관리 등)에 가장 권장되는 방법입니다.