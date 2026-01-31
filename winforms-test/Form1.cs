using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.IO;
using System;
using System.Windows.Forms;

namespace WinFormsWebViewTest
{
    public partial class Form1 : Form
    {
        private WebView2 webView;
        private string statusPath = Path.Combine(Path.GetTempPath(), "winforms-webview-status.txt"); // use temp path to avoid permission issues

        public Form1()
        {
            // Immediate trace for troubleshooting
            try { File.WriteAllText(statusPath, "ctor"); } catch {}
            InitializeComponent();
            InitializeWebView();
        }

        private async void InitializeWebView()
        {
            try
            {
                webView = new WebView2();
                webView.Dock = DockStyle.Fill;
                this.Controls.Add(webView);

                await webView.EnsureCoreWebView2Async();
                webView.CoreWebView2.NavigationCompleted += CoreWebView2_NavigationCompleted;
                webView.CoreWebView2.NavigationStarting += CoreWebView2_NavigationStarting;

                // Navigate to local server
                webView.CoreWebView2.Navigate("http://127.0.0.1:3000");

                File.WriteAllText(statusPath, "started");
            }
            catch (Exception ex)
            {
                File.WriteAllText(statusPath, "error: " + ex.Message);
            }
        }

        private void CoreWebView2_NavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs e)
        {
            File.WriteAllText(statusPath, "navigating: " + e.Uri);
        }

        private void CoreWebView2_NavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (e.IsSuccess)
            {
                File.WriteAllText(statusPath, "success");
            }
            else
            {
                File.WriteAllText(statusPath, "nav-failed: " + e.HttpStatusCode);
            }
        }
    }
}
