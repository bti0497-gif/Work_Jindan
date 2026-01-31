namespace WinFormsWebViewTest;

static class Program
{
    /// <summary>
    ///  The main entry point for the application.
    /// </summary>
    [STAThread]
    static void Main()
    {
        // To customize application configuration such as set high DPI settings or default font,
        // see https://aka.ms/applicationconfiguration.
        try { System.IO.File.WriteAllText(System.IO.Path.Combine(System.IO.Path.GetTempPath(), "winforms-startup.txt"), "main-started"); } catch {}
        ApplicationConfiguration.Initialize();
        Application.Run(new Form1());
    }    
}