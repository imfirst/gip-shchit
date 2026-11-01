using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;

namespace Gip.Shchit
{
    /// <summary>
    /// Общая среда WebView2 для всех палитр ГИП. SetLoaderDllFolderPath можно вызвать только до первого обращения
    /// к WebView2, поэтому среда создаётся один раз, а палитры берут готовую.
    /// </summary>
    internal static class WebViewEnv
    {
        private static Task<CoreWebView2Environment> _env;

        public static Task<CoreWebView2Environment> Get(string pluginDir)
        {
            if (_env == null)
            {
                try
                {
                    var loader = File.Exists(Path.Combine(pluginDir, "WebView2Loader.dll")) ? pluginDir : Path.Combine(pluginDir, "runtimes", "win-x64", "native");
                    if (File.Exists(Path.Combine(loader, "WebView2Loader.dll")))
                        CoreWebView2Environment.SetLoaderDllFolderPath(loader);
                }
                catch { /* уже вызывали раньше — не критично */ }
                var data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GIP", "WebView2");
                Directory.CreateDirectory(data);
                _env = CoreWebView2Environment.CreateAsync(null, data);
            }
            return _env;
        }
    }
}
