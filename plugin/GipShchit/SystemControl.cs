using System;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Forms;
using Autodesk.AutoCAD.ApplicationServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using AcAp = Autodesk.AutoCAD.ApplicationServices.Application;

namespace Gip.Shchit
{
    /// <summary>Настройки панели системы: страница, файлы обмена с LISP, команды.</summary>
    internal sealed class SystemSpec
    {
        public string Host, Page, InFile, OutFile, RegFile, ReadCmd, BuildCmd, ResultType, LogName;
        public string[] Commands = new string[0];      // белый список команд «cmd»
        public string[] Interactive = new string[0];   // команды с указанием точек (ждать дольше)
        public Action<string> OnTab;                   // сообщение «tab» (панель проекта: переключить вкладку)
    }

    /// <summary>
    /// Панель системы на WebView2 (кондиционирование, проект …) — по образцу «Отопления».
    /// Страница -> AutoCAD: «тип\nтело»: ready | build (данные построения) | cmd (команда из белого списка) | tab (вкладка).
    /// AutoCAD -> страница: JSON {type: &lt;ResultType&gt;, ok, msg} и реестр, который пишет LISP.
    /// Каждая команда в конце пишет реестр — по нему панель узнаёт, что команда завершилась.
    /// </summary>
    internal sealed class SystemControl : UserControl
    {
        private readonly SystemSpec _s;
        private string Host => _s.Host;
        private string InFile => _s.InFile;
        private string OutFile => _s.OutFile;
        private string RegFile => _s.RegFile;

        private readonly WebView2 _web;
        private readonly Label _msg;
        private bool _pageReady;
        private string _pendingData;
        private string _pendingCmd;
        private Document _pendingDoc;
        private bool _wait;
        private string _waitCmd;
        private DateTime _waitUntil;
        private DateTime _waitStart;

        public SystemControl(SystemSpec spec)
        {
            _s = spec;
            Dock = DockStyle.Fill;
            _msg = new Label { Dock = DockStyle.Fill, TextAlign = System.Drawing.ContentAlignment.MiddleCenter, Text = "Загрузка панели…" };
            Controls.Add(_msg);
            _web = new WebView2 { Dock = DockStyle.Fill, Visible = false };
            Controls.Add(_web);
            InitAsync();
        }

        private static string PluginDir => Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);

        private async void InitAsync()
        {
            try
            {
                var dir = PluginDir;
                var env = await WebViewEnv.Get(dir);
                await _web.EnsureCoreWebView2Async(env);

                var core = _web.CoreWebView2;
                core.Settings.AreDevToolsEnabled = true;      // F12 — консоль для поиска ошибок
                core.Settings.IsStatusBarEnabled = false;
                core.SetVirtualHostNameToFolderMapping(Host, Path.Combine(PluginDir, "web"), CoreWebView2HostResourceAccessKind.Allow);
                core.WebMessageReceived += OnWebMessage;
                core.NavigationStarting += (s, e) => _pageReady = false;
                _web.Source = new Uri("https://" + Host + "/" + _s.Page);
                _web.Visible = true;
                _msg.Visible = false;
                AcAp.Idle += OnIdle;
            }
            catch (System.Exception ex)
            {
                _msg.Text = "Не удалось открыть панель: " + ex.Message +
                            "\n\nНужна среда WebView2 (Microsoft Edge WebView2 Runtime). Установите её с сайта Microsoft и перезапустите AutoCAD.";
                Log("WebView2: " + ex);
            }
        }

        public void OnShown() { if (_pageReady) _pendingCmd = _s.ReadCmd; }

        // ------------------------------------------------------------------ сообщения страницы
        private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string m;
            try { m = e.TryGetWebMessageAsString(); } catch { return; }
            if (m == null) return;
            var i = m.IndexOf('\n');
            var type = i < 0 ? m : m.Substring(0, i);
            var body = i < 0 ? "" : m.Substring(i + 1);
            switch (type)
            {
                case "ready":
                    _pageReady = true;
                    _pendingCmd = _s.ReadCmd;            // сразу показать данные чертежа
                    _pendingDoc = AcAp.DocumentManager.MdiActiveDocument;
                    break;
                case "tab":
                    try { _s.OnTab?.Invoke(body.Trim()); } catch (System.Exception ex) { Log("tab: " + ex); }
                    break;
                case "build":
                    if (body.Length > 10)
                    {
                        _pendingData = body;
                        _pendingDoc = AcAp.DocumentManager.MdiActiveDocument;
                    }
                    break;
                case "cmd":
                    var c = body.Trim();
                    if (Array.IndexOf(_s.Commands, c) >= 0 || c == _s.ReadCmd)
                    {
                        _pendingCmd = c;
                        _pendingDoc = AcAp.DocumentManager.MdiActiveDocument;
                    }
                    break;
            }
        }

        // ------------------------------------------------------------------ работа в паузах AutoCAD
        private void OnIdle(object sender, EventArgs e)
        {
            if (!_pageReady) return;
            var doc = AcAp.DocumentManager.MdiActiveDocument;
            if (doc == null) return;
            try
            {
                if (_wait) { CheckResult(doc); return; }
                if (doc != _pendingDoc) _pendingDoc = doc;          // панель работает с активным чертежом
                if (!IsQuiet(doc)) return;

                if (_pendingData != null)
                {
                    var text = _pendingData; _pendingData = null;
                    ClearFile(OutFile); ClearFile(RegFile);
                    WriteText(InFile, text);
                    doc.SendStringToExecute(_s.BuildCmd + " ", true, false, false);
                    StartWait(_s.BuildCmd, 600);
                }
                else if (_pendingCmd != null)
                {
                    var c = _pendingCmd; _pendingCmd = null;
                    ClearFile(OutFile); ClearFile(RegFile);
                    doc.SendStringToExecute(c + " ", true, false, false);
                    StartWait(c, Array.IndexOf(_s.Interactive, c) >= 0 ? 900 : 600);
                }
            }
            catch (System.Exception ex) { Log("Idle: " + ex); }
        }

        private void StartWait(string cmd, int seconds)
        {
            _wait = true; _waitCmd = cmd; _waitUntil = DateTime.Now.AddSeconds(seconds); _waitStart = DateTime.Now;
        }

        private void CheckResult(Document doc)
        {
            var reg = ReadAndDelete(RegFile);
            if (reg != null)
            {
                _wait = false;
                var res = ReadAndDelete(OutFile);
                if (res != null && _waitCmd != _s.ReadCmd)
                {
                    var lines = res.Replace("\r", "").Split('\n');
                    var ok = lines.Length > 0 && lines[0].Trim() == "ok";
                    var msg = lines.Length > 1 ? string.Join(" ", lines, 1, lines.Length - 1).Trim() : "";
                    Post("{\"type\":\"" + _s.ResultType + "\",\"ok\":" + (ok ? "true" : "false") + ",\"msg\":" + Js(msg) + "}");
                }
                Post(reg);
                return;
            }
            // команда отменена (Esc) — AutoCAD свободен, а реестра нет
            if (DateTime.Now > _waitStart.AddSeconds(3) && IsQuiet(doc))
            {
                _wait = false;
                Post("{\"type\":\"" + _s.ResultType + "\",\"ok\":false,\"msg\":\"Команда прервана.\"}");
                return;
            }
            if (DateTime.Now > _waitUntil)
            {
                _wait = false;
                Post("{\"type\":\"" + _s.ResultType + "\",\"ok\":false,\"msg\":\"AutoCAD не ответил вовремя. Проверьте командную строку.\"}");
            }
        }

        private void Post(string json)
        {
            try { _web.CoreWebView2?.PostWebMessageAsJson(json); }
            catch (System.Exception ex) { Log("Post: " + ex); }
        }

        // ------------------------------------------------------------------ файлы и служебное
        private static bool IsQuiet(Document doc)
        {
            var cmds = AcAp.GetSystemVariable("CMDNAMES") as string;
            return doc.Editor.IsQuiescent && string.IsNullOrEmpty(cmds);
        }

        private static string TempDir()
        {
            var temp = AcAp.GetSystemVariable("TEMPPREFIX") as string;
            return string.IsNullOrEmpty(temp) ? Path.GetTempPath() : temp;
        }

        private static void WriteText(string name, string text)
        {
            var sb = new StringBuilder(text.Length + 16);
            foreach (var c in text) sb.Append(c > 126 ? '?' : c);
            File.WriteAllText(Path.Combine(TempDir(), name), sb.ToString().Replace("\r\n", "\n").Replace("\n", "\r\n"), Encoding.ASCII);
        }

        private static void ClearFile(string name)
        {
            try { var p = Path.Combine(TempDir(), name); if (File.Exists(p)) File.Delete(p); } catch { }
        }

        private static string ReadAndDelete(string name)
        {
            try
            {
                var p = Path.Combine(TempDir(), name);
                if (!File.Exists(p)) return null;
                var t = File.ReadAllText(p, Encoding.ASCII);
                try { File.Delete(p); } catch { }
                return t.Length > 0 ? t : null;
            }
            catch { return null; }
        }

        private static string Js(string s)
        {
            var sb = new StringBuilder("\"");
            foreach (var c in s ?? "")
            {
                if (c == '"' || c == '\\') sb.Append('\\').Append(c);
                else if (c < 32 || c > 126) sb.Append("\\u").Append(((int)c).ToString("X4"));
                else sb.Append(c);
            }
            return sb.Append('"').ToString();
        }

        private void Log(string s)
        {
            try
            {
                var p = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GIP", "panel.log");
                Directory.CreateDirectory(Path.GetDirectoryName(p));
                File.AppendAllText(p, DateTime.Now.ToString("s") + " " + _s.LogName + " " + s + Environment.NewLine, Encoding.UTF8);
            }
            catch { }
        }
    }
}
