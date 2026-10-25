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
                ed?.WriteMessage("\nГИП-ЩИТ: панель «Группы щита» — команда GIPPANEL (ГИППАНЕЛЬ).");
            }
            catch { /* при запуске AutoCAD документа может ещё не быть */ }
        }

        public void Terminate() { }
    }

    public class Commands
    {
        [CommandMethod("GIP", "GIPPANEL", CommandFlags.Session | CommandFlags.NoHistory)]
        public void ShowPanel() => PanelHost.Show();
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
