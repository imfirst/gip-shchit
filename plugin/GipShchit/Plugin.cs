using System;
using System.Drawing;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.Runtime;
using Autodesk.AutoCAD.Windows;
using AcAp = Autodesk.AutoCAD.ApplicationServices.Application;

[assembly: ExtensionApplication(typeof(Gip.Shchit.Plugin))]
[assembly: CommandClass(typeof(Gip.Shchit.Commands))]

namespace Gip.Shchit
{
    /// <summary>Загрузка плагина: ничего тяжёлого, панель создаётся по команде.</summary>
    public class Plugin : IExtensionApplication
    {
        public void Initialize()
        {
            try
            {
                var ed = AcAp.DocumentManager.MdiActiveDocument?.Editor;
                ed?.WriteMessage("\nГИП-ЩИТ: панель «Группы щита» — команда GIPPANEL (ГИППАНЕЛЬ); панель «Помещения» — команда GIPROOMS; «Отопление» — команда GIPHEAT; «Кондиционирование» — GIPCOND; весь проект в одной панели — GIPPROEKT.");
            }
            catch { /* при запуске AutoCAD документа может ещё не быть */ }
        }

        public void Terminate() { }
    }

    public class Commands
    {
        [CommandMethod("GIP", "GIPPANEL", CommandFlags.Session | CommandFlags.NoHistory)]
        public void ShowPanel() { if (ProjectHost.IsOpen) ProjectHost.Show("panel"); else PanelHost.Show(); }

        [CommandMethod("GIP", "GIPROOMS", CommandFlags.Session | CommandFlags.NoHistory)]
        public void ShowRooms() { if (ProjectHost.IsOpen) ProjectHost.Show("rooms"); else RoomsHost.Show(); }

        [CommandMethod("GIP", "GIPHEAT", CommandFlags.Session | CommandFlags.NoHistory)]
        public void ShowHeat() { if (ProjectHost.IsOpen) ProjectHost.Show("heat"); else HeatHost.Show(); }

        [CommandMethod("GIP", "GIPCOND", CommandFlags.Session | CommandFlags.NoHistory)]
        public void ShowCond() => ProjectHost.Show("cond");

        [CommandMethod("GIP", "GIPPROEKT", CommandFlags.Session | CommandFlags.NoHistory)]
        public void ShowProject() => ProjectHost.Show("project");
    }

    /// <summary>
    /// Единая панель «ГИП · Проект» (GIPPROEKT): вкладки Проект, Помещения, Группы щита, Отопление, Кондиционирование.
    /// Панели систем — те же, что и отдельные (GIPROOMS, GIPPANEL, GIPHEAT), плюс кондиционирование и сводка проекта.
    /// </summary>
    internal static class ProjectHost
    {
        private static PaletteSet _ps;
        private static readonly string[] Tabs = { "project", "rooms", "panel", "heat", "cond" };
        private static SystemControl _project, _cond;
        private static RoomsControl _rooms;
        private static PanelControl _panel;
        private static HeatControl _heat;

        public static bool IsOpen => _ps != null && _ps.Visible;

        public static void Show(string tab)
        {
            if (_ps == null)
            {
                _ps = new PaletteSet("ГИП · Проект", "GIPPROEKT", new Guid("5d2b7a43-91e6-4f0c-8b1e-6a3c2f9d7e15"))
                {
                    Style = PaletteSetStyles.ShowCloseButton | PaletteSetStyles.ShowPropertiesMenu | PaletteSetStyles.ShowAutoHideButton | PaletteSetStyles.ShowTabForSingle,
                    MinimumSize = new Size(420, 360),
                    DockEnabled = DockSides.Left | DockSides.Right | DockSides.None
                };
                _project = new SystemControl(new SystemSpec
                {
                    Host = "gip.proekt", Page = "proekt.html", LogName = "proekt",
                    InFile = "gip_prj_in.txt", OutFile = "gip_prj_out.txt", RegFile = "gip_prj_reg.txt",
                    ReadCmd = "GIPPRJREAD", BuildCmd = "GIPPRJSAVE", ResultType = "project-result",
                    Commands = new[] { "GIPPRJREAD" },
                    OnTab = name => Show(name)
                });
                _rooms = new RoomsControl();
                _panel = new PanelControl();
                _heat = new HeatControl();
                _cond = new SystemControl(new SystemSpec
                {
                    Host = "gip.cond", Page = "cond.html", LogName = "cond",
                    InFile = "gip_cond_in.txt", OutFile = "gip_cond_out.txt", RegFile = "gip_cond_reg.txt",
                    ReadCmd = "GIPCONDREAD", BuildCmd = "GIPCONDBUILD", ResultType = "cond-result",
                    Commands = new[] { "GIPCONDREAD", "GIPCONDIN", "GIPCONDOUT", "GIPCONDRISER", "GIPCONDK1", "GIPCONDDEL", "GIPCONDCLEAR", "GIPWALLS" },
                    Interactive = new[] { "GIPCONDIN", "GIPCONDOUT", "GIPCONDRISER", "GIPCONDK1", "GIPCONDDEL", "GIPWALLS" }
                });
                _ps.Add("Проект", _project);
                _ps.Add("Помещения", _rooms);
                _ps.Add("Группы щита", _panel);
                _ps.Add("Отопление", _heat);
                _ps.Add("Кондиционирование", _cond);
                if (_ps.Size.Width < 500) _ps.Size = new Size(1200, 820);
            }
            _ps.Visible = true;
            var i = Array.IndexOf(Tabs, tab);
            if (i >= 0)
            {
                try { _ps.Activate(i); } catch { /* старые версии AutoCAD */ }
                switch (tab)
                {
                    case "project": _project.OnShown(); break;
                    case "rooms": _rooms.OnShown(); break;
                    case "panel": _panel.OnShown(); break;
                    case "heat": _heat.OnShown(); break;
                    case "cond": _cond.OnShown(); break;
                }
            }
        }
    }

    /// <summary>Закрепляемая палитра «Отопление»: приборы под окнами, трассы Т1/Т2 от ШРВ, схема, спецификация.</summary>
    internal static class HeatHost
    {
        private static PaletteSet _ps;
        private static HeatControl _panel;

        public static void Show()
        {
            if (_ps == null)
            {
                _ps = new PaletteSet("ГИП · Отопление", "GIPHEAT", new Guid("3b8c1f6e-58a4-4c2e-9a7d-0e5b2c7d9f31"))
                {
                    Style = PaletteSetStyles.ShowCloseButton | PaletteSetStyles.ShowPropertiesMenu | PaletteSetStyles.ShowAutoHideButton,
                    MinimumSize = new Size(420, 360),
                    DockEnabled = DockSides.Left | DockSides.Right | DockSides.None
                };
                _panel = new HeatControl();
                _ps.Add("Отопление", _panel);
                if (_ps.Size.Width < 500) _ps.Size = new Size(1200, 800);
            }
            _ps.Visible = true;
            _panel?.OnShown();
        }
    }

    /// <summary>Закрепляемая палитра «Помещения»: PDF дизайнера → подложка, номера и экспликация.</summary>
    internal static class RoomsHost
    {
        private static PaletteSet _ps;
        private static RoomsControl _panel;

        public static void Show()
        {
            if (_ps == null)
            {
                _ps = new PaletteSet("ГИП · Помещения", "GIPROOMS", new Guid("7f0e5f0a-3a63-4a0b-9d5c-3c6a1b2f4e11"))
                {
                    Style = PaletteSetStyles.ShowCloseButton | PaletteSetStyles.ShowPropertiesMenu | PaletteSetStyles.ShowAutoHideButton,
                    MinimumSize = new Size(420, 360),
                    DockEnabled = DockSides.Left | DockSides.Right | DockSides.None
                };
                _panel = new RoomsControl();
                _ps.Add("Помещения", _panel);
                if (_ps.Size.Width < 500) _ps.Size = new Size(1100, 760);
            }
            _ps.Visible = true;
            _panel?.OnShown();
        }
    }

    /// <summary>Закрепляемая палитра AutoCAD с таблицей групп.</summary>
    internal static class PanelHost
    {
        private static PaletteSet _ps;
        private static PanelControl _panel;

        public static void Show()
        {
            if (_ps == null)
            {
                _ps = new PaletteSet("ГИП · Группы щита", "GIPPANEL", new Guid("c25f030b-a42f-4e4b-a774-95f311f2503a"))
                {
                    Style = PaletteSetStyles.ShowCloseButton | PaletteSetStyles.ShowPropertiesMenu | PaletteSetStyles.ShowAutoHideButton,
                    MinimumSize = new Size(420, 360),
                    DockEnabled = DockSides.Left | DockSides.Right | DockSides.None
                };
                _panel = new PanelControl();
                _ps.Add("Группы щита", _panel);
                if (_ps.Size.Width < 500) _ps.Size = new Size(1000, 760);
            }
            _ps.Visible = true;
            _panel?.OnShown();
        }
    }
}
