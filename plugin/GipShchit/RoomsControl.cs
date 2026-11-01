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
    /// <summary>
    /// Палитра «Помещения» (WebView2, страница rooms.html).
    /// Страница -> AutoCAD: строка «тип\nтело»: ready | rooms | rooms-start | rooms-chunk | cmd.
    /// AutoCAD -> страница: JSON {type: rooms-result, ok, msg} и {type: registry, rooms:[…]}.
    /// Обмен с LISP (76_rooms.lsp) через временную папку: gip_rooms_in.txt (план), gip_rooms_out.txt (итог), gip_rooms_reg.txt (реестр).
    /// </summary>
    internal sealed class RoomsControl : UserControl
    {
        private const string Host = "gip.rooms";
        private const string InFile = "gip_rooms_in.txt";
        private const string OutFile = "gip_rooms_out.txt";
        private const string RegFile = "gip_rooms_reg.txt";

        private readonly WebView2 _web;
        private readonly Label _msg;
        private bool _pageReady;
        private string _pendingRooms;
        private string _pendingCmd;
        private string[] _parts;
        private int _partsGot;
        private DateTime _partsUntil;
        private Document _pendingDoc;
        private bool _wait;
        private string _waitCmd;
        private DateTime _waitUntil;

        public RoomsControl()
        {
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
                _web.Source = new Uri("https://" + Host + "/rooms.html");
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

        public void OnShown() { }

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
                    break;
                case "rooms":
                    if (body.Length > 10)
                    {
                        _parts = null; _partsGot = 0;
                        _pendingRooms = body;
                        _pendingDoc = AcAp.DocumentManager.MdiActiveDocument;
                    }
                    break;
                case "rooms-start":
                    if (int.TryParse(body, out var count) && count > 0 && count <= 8192)
                    {
                        _pendingRooms = null;
                        _parts = new string[count];
                        _partsGot = 0;
                        _partsUntil = DateTime.Now.AddMinutes(2);
                        _pendingDoc = AcAp.DocumentManager.MdiActiveDocument;
                    }
                    else Post("{\"type\":\"rooms-result\",\"ok\":false,\"msg\":\"Некорректное число частей данных.\"}");
                    break;
                case "rooms-chunk":
                    var split = body.IndexOf('\n');
                    if (_parts == null || split < 0 || !int.TryParse(body.Substring(0, split), out var idx) || idx < 0 || idx >= _parts.Length)
                    {
                        _parts = null; _partsGot = 0;
                        Post("{\"type\":\"rooms-result\",\"ok\":false,\"msg\":\"Нарушен порядок передачи данных. Нажмите кнопку ещё раз.\"}");
                        break;
                    }
                    if (_parts[idx] == null) _partsGot++;
                    _parts[idx] = body.Substring(split + 1);
                    _partsUntil = DateTime.Now.AddMinutes(2);
                    if (_partsGot == _parts.Length)
                    {
                        _pendingRooms = string.Concat(_parts);
                        _parts = null; _partsGot = 0;
                    }
                    break;
                case "cmd":
                    var c = body.Trim();
                    if (c == "GIPROOMSYNC" || c == "GIPROOMSAREA" || c == "GIPROOMSREAD")
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
                if (_parts != null && DateTime.Now > _partsUntil)
                {
                    _parts = null; _partsGot = 0;
                    Post("{\"type\":\"rooms-result\",\"ok\":false,\"msg\":\"Не получены все части данных. Повторите отправку.\"}");
                }
                if (_wait) { CheckResult(); return; }
                if (!IsQuiet(doc) || doc != _pendingDoc) return;

                if (_pendingRooms != null)
                {
                    var text = _pendingRooms; _pendingRooms = null;
                    ClearFile(OutFile);
                    WriteText(InFile, text);
                    doc.SendStringToExecute("GIPROOMSIMPORT ", true, false, false);
                    StartWait(null, 90);
                }
                else if (_pendingCmd != null)
                {
                    var c = _pendingCmd; _pendingCmd = null;
                    ClearFile(OutFile); ClearFile(RegFile);
                    doc.SendStringToExecute(c + " ", true, false, false);
                    StartWait(c, c == "GIPROOMSAREA" ? 600 : 60);
                }
            }
            catch (System.Exception ex) { Log("Idle: " + ex); }
        }

        private void StartWait(string cmd, int seconds)
        {
            _wait = true; _waitCmd = cmd; _waitUntil = DateTime.Now.AddSeconds(seconds);
        }

        private void CheckResult()
        {
            if (_waitCmd == "GIPROOMSREAD")
            {
                var reg = ReadAndDelete(RegFile);
                if (reg != null) { _wait = false; Post(reg); return; }
            }
            else
            {
                var res = ReadAndDelete(OutFile);
                if (res != null)
                {
                    _wait = false;
                    var lines = res.Replace("\r", "").Split('\n');
                    var ok = lines.Length > 0 && lines[0].Trim() == "ok";
                    var msg = lines.Length > 1 ? string.Join(" ", lines, 1, lines.Length - 1).Trim() : "";
                    Post("{\"type\":\"rooms-result\",\"ok\":" + (ok ? "true" : "false") + ",\"msg\":" + Js(msg) + "}");
                    return;
                }
            }
            if (DateTime.Now > _waitUntil)
            {
                _wait = false;
                Post("{\"type\":\"rooms-result\",\"ok\":false,\"msg\":\"AutoCAD не ответил вовремя. Проверьте командную строку.\"}");
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

        private static void Log(string s)
        {
            try
            {
                var p = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GIP", "panel.log");
                Directory.CreateDirectory(Path.GetDirectoryName(p));
                File.AppendAllText(p, DateTime.Now.ToString("s") + " rooms " + s + Environment.NewLine, Encoding.UTF8);
            }
            catch { }
        }
    }
}
