using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Forms;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using AcAp = Autodesk.AutoCAD.ApplicationServices.Application;

namespace Gip.Shchit
{
    /// <summary>
    /// Страница «Группы щита» (WebView2) и её связь с чертежом.
    /// Страница -> AutoCAD: строка «тип\nJSON»: ready | apply.
    /// AutoCAD -> страница: JSON {type: load|linked|unlinked, origin: activate|drawing, doc, state}.
    /// Состав щита хранится в словаре чертежа GIPPANEL (JSON, только ASCII); строит альбом LISP-команда GIPPANELAPPLY.
    /// </summary>
    internal sealed class PanelControl : UserControl
    {
        private const string Host = "gip.panel";
        private const string DictKey = "GIPPANEL";
        private const string OldStateKey = "GIPSHCHIT";
        private const string InFile = "gip_panel_in.json";

        private readonly WebView2 _web;
        private readonly Label _msg;
        private bool _pageReady;
        private bool _dirty;
        private bool _activatePending;
        private string _pendingApply;
        private string _pendingPlan;
        private const string PlanFile = "gip_plan_in.txt";
        private Document _pendingDoc;
        private readonly Dictionary<Document, DocLink> _docs = new Dictionary<Document, DocLink>();
        private readonly HashSet<Document> _exportAsked = new HashSet<Document>();

        private sealed class DocLink
        {
            public string Last;     // последний JSON, известный странице
            public bool Linked;
        }

        public PanelControl()
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
                // загрузчик WebView2 лежит рядом с DLL (или в runtimes\win-x64\native)
                var loader = File.Exists(Path.Combine(dir, "WebView2Loader.dll")) ? dir : Path.Combine(dir, "runtimes", "win-x64", "native");
                if (File.Exists(Path.Combine(loader, "WebView2Loader.dll")))
                    CoreWebView2Environment.SetLoaderDllFolderPath(loader);

                var data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GIP", "WebView2");
                Directory.CreateDirectory(data);
                var env = await CoreWebView2Environment.CreateAsync(null, data);
                await _web.EnsureCoreWebView2Async(env);

                var core = _web.CoreWebView2;
                core.Settings.AreDevToolsEnabled = true;      // F12 — консоль для поиска ошибок
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = true;
                core.SetVirtualHostNameToFolderMapping(Host, Path.Combine(PluginDir, "web"), CoreWebView2HostResourceAccessKind.Allow);
                core.WebMessageReceived += OnWebMessage;
                core.NavigationStarting += (s, e) => _pageReady = false;
                _web.Source = new Uri("https://" + Host + "/panel.html");
                _web.Visible = true;
                _msg.Visible = false;

                var dm = AcAp.DocumentManager;
                dm.DocumentActivated += (s, e) => _activatePending = true;
                dm.DocumentToBeDestroyed += (s, e) => { _docs.Remove(e.Document); _exportAsked.Remove(e.Document); };
                dm.DocumentCreated += (s, e) => Watch(e.Document);
                foreach (Document d in dm) Watch(d);
                AcAp.Idle += OnIdle;
            }
            catch (System.Exception ex)
            {
                _msg.Text = "Не удалось открыть панель: " + ex.Message +
                            "\n\nНужна среда WebView2 (Microsoft Edge WebView2 Runtime). В Windows 10/11 она обычно уже есть; " +
                            "если нет — установите её с сайта Microsoft и перезапустите AutoCAD.";
                Log("WebView2: " + ex);
            }
        }

        public void OnShown()
        {
            _activatePending = true;
        }

        // ------------------------------------------------------------------ события чертежа
        private void Watch(Document d)
        {
            if (d == null) return;
            d.CommandEnded += (s, e) => _dirty = true;
            d.CommandCancelled += (s, e) => _dirty = true;
            d.LispEnded += (s, e) => _dirty = true;
        }

        private void OnIdle(object sender, EventArgs e)
        {
            if (!_pageReady) return;
            var doc = AcAp.DocumentManager.MdiActiveDocument;
            if (doc == null) return;
            try
            {
                if (_activatePending && IsQuiet(doc))
                {
                    _activatePending = false;
                    PushActive("activate");
                    return;
                }
                if (_pendingApply != null && doc == _pendingDoc && IsQuiet(doc))
                {
                    var text = _pendingApply;
                    _pendingApply = null;
                    WriteInput(text);
                    Link(doc).Last = text;
                    doc.SendStringToExecute("GIPPANELAPPLY ", true, false, false);
                    return;
                }
                if (_pendingPlan != null && doc == _pendingDoc && IsQuiet(doc))
                {
                    var plan = _pendingPlan;
                    _pendingPlan = null;
                    WriteText(PlanFile, plan);
                    doc.SendStringToExecute("GIPPLANIMPORT ", true, false, false);
                    return;
                }
                if (_dirty && IsQuiet(doc))
                {
                    _dirty = false;
                    CheckDoc(doc);
                }
            }
            catch (System.Exception ex) { Log("Idle: " + ex); }
        }

        private static bool IsQuiet(Document doc)
        {
            var cmds = AcAp.GetSystemVariable("CMDNAMES") as string;
            return doc.Editor.IsQuiescent && string.IsNullOrEmpty(cmds);
        }

        private DocLink Link(Document d)
        {
            if (!_docs.TryGetValue(d, out var l)) { l = new DocLink(); _docs[d] = l; }
            return l;
        }

        /// <summary>После команды: изменился ли щит в чертеже (монтажка, отмена, сборка по шаблону).</summary>
        private void CheckDoc(Document doc)
        {
            var link = Link(doc);
            var text = ReadDict(doc, DictKey);
            if (text == null)
            {
                if (link.Linked) { link.Linked = false; link.Last = null; Post("{\"type\":\"unlinked\",\"doc\":" + Js(DocName(doc)) + "}"); }
                return;
            }
            if (text == link.Last)
            {
                if (!link.Linked) { link.Linked = true; Post("{\"type\":\"linked\",\"doc\":" + Js(DocName(doc)) + "}"); }
                return;
            }
            link.Last = text;
            link.Linked = true;
            Post("{\"type\":\"load\",\"origin\":\"drawing\",\"doc\":" + Js(DocName(doc)) + ",\"state\":" + text + "}");
        }

        /// <summary>Открыли/переключили чертёж — показать его щит.</summary>
        private void PushActive(string origin)
        {
            var doc = AcAp.DocumentManager.MdiActiveDocument;
            if (doc == null) return;
            var link = Link(doc);
            var text = ReadDict(doc, DictKey);
            if (text != null)
            {
                link.Last = text; link.Linked = true;
                Post("{\"type\":\"load\",\"origin\":\"" + origin + "\",\"doc\":" + Js(DocName(doc)) + ",\"state\":" + text + "}");
                return;
            }
            link.Linked = false; link.Last = null;
            Post("{\"type\":\"unlinked\",\"doc\":" + Js(DocName(doc)) + "}");
            // щит собран раньше окном ГИПЩИТ — попросить LISP выгрузить его в таблицу
            if (ReadDict(doc, OldStateKey) != null && !_exportAsked.Contains(doc))
            {
                _exportAsked.Add(doc);
                doc.SendStringToExecute("(if gip:panel-export (gip:panel-export)) ", true, false, false);
            }
        }

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
                    _activatePending = true;
                    break;
                case "apply":
                    if (body.Length > 2)
                    {
                        _pendingApply = Ascii(body);
                        _pendingDoc = AcAp.DocumentManager.MdiActiveDocument;
                    }
                    break;
                case "plan":
                    // страница «План из PDF»: подложка и значки — файлом для LISP-команды GIPPLANIMPORT
                    if (body.Length > 10)
                    {
                        _pendingPlan = body;
                        _pendingDoc = AcAp.DocumentManager.MdiActiveDocument;
                    }
                    break;
            }
        }

        private void Post(string json)
        {
            try { _web.CoreWebView2?.PostWebMessageAsJson(json); }
            catch (System.Exception ex) { Log("Post: " + ex); }
        }

        // ------------------------------------------------------------------ чертёж и файлы
        private static string ReadDict(Document doc, string key)
        {
            try
            {
                var db = doc.Database;
                using (doc.LockDocument())
                using (var tr = db.TransactionManager.StartOpenCloseTransaction())
                {
                    var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForRead);
                    if (!nod.Contains(key)) return null;
                    if (!(tr.GetObject(nod.GetAt(key), OpenMode.ForRead) is Xrecord xr) || xr.Data == null) return null;
                    var sb = new StringBuilder();
                    foreach (TypedValue tv in xr.Data)
                        if (tv.TypeCode == 1 && tv.Value is string s) sb.Append(s);
                    tr.Commit();
                    return sb.Length > 0 ? sb.ToString() : null;
                }
            }
            catch (System.Exception ex) { Log("Read " + key + ": " + ex); return null; }
        }

        /// <summary>Текст для LISP во временную папку AutoCAD (только ASCII: русские буквы уже записаны как \U+XXXX).</summary>
        private static void WriteText(string name, string text)
        {
            var temp = AcAp.GetSystemVariable("TEMPPREFIX") as string;
            if (string.IsNullOrEmpty(temp)) temp = Path.GetTempPath();
            var sb = new StringBuilder(text.Length + 16);
            foreach (var c in text) sb.Append(c > 126 ? '?' : c);
            File.WriteAllText(Path.Combine(temp, name), sb.ToString().Replace("\r\n", "\n").Replace("\n", "\r\n"), Encoding.ASCII);
        }

        private static void WriteInput(string text)
        {
            var temp = AcAp.GetSystemVariable("TEMPPREFIX") as string;
            if (string.IsNullOrEmpty(temp)) temp = Path.GetTempPath();
            var path = Path.Combine(temp, InFile);
            // строки по 200 знаков — LISP склеивает их обратно
            var sb = new StringBuilder(text.Length + text.Length / 200 * 2 + 4);
            for (var i = 0; i < text.Length; i += 200)
                sb.Append(text, i, Math.Min(200, text.Length - i)).Append("\r\n");
            File.WriteAllText(path, sb.ToString(), Encoding.ASCII);
        }

        private static string DocName(Document doc)
        {
            try { return Path.GetFileName(doc.Name); } catch { return ""; }
        }

        /// <summary>JSON только из ASCII: русские буквы — как \uXXXX (их понимает JSON-разбор LISP).</summary>
        private static string Ascii(string s)
        {
            var sb = new StringBuilder(s.Length + 256);
            foreach (var c in s)
            {
                if (c > 126) sb.Append("\\u").Append(((int)c).ToString("X4"));
                else sb.Append(c);
            }
            return sb.ToString();
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
                File.AppendAllText(p, DateTime.Now.ToString("s") + " " + s + Environment.NewLine, Encoding.UTF8);
            }
            catch { }
        }
    }
}
