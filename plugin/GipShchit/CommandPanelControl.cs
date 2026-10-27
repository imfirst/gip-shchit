using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.Windows;
using AcAp = Autodesk.AutoCAD.ApplicationServices.Application;

namespace Gip.Shchit
{
    /// <summary>Закрепляемая палитра с кнопками основных команд ГИП-ЩИТ.</summary>
    internal static class CommandPanelHost
    {
        private static PaletteSet _palette;
        private static CommandPanelControl _control;

        public static void Show()
        {
            if (_palette == null)
            {
                _palette = new PaletteSet("ГИП · Инструменты", "GIPTOOLS",
                    new Guid("ad97cfb7-bfc0-49aa-bd27-8c76f7d25843"))
                {
                    Style = PaletteSetStyles.ShowCloseButton
                          | PaletteSetStyles.ShowPropertiesMenu
                          | PaletteSetStyles.ShowAutoHideButton,
                    MinimumSize = new Size(300, 420),
                    DockEnabled = DockSides.Left | DockSides.Right | DockSides.None
                };

                _control = new CommandPanelControl();
                _palette.Add("Команды", _control);
                _palette.Size = new Size(340, 600);
            }

            _palette.Visible = true;
            _control?.RefreshActiveDocument();
        }
    }

    /// <summary>Кнопки вызывают штатные команды AutoCAD/LISP, не дублируя их логику.</summary>
    internal sealed class CommandPanelControl : UserControl
    {
        private readonly FlowLayoutPanel _body;
        private readonly Label _document;
        private readonly ToolTip _tips = new ToolTip();

        public CommandPanelControl()
        {
            Dock = DockStyle.Fill;
            BackColor = Color.FromArgb(246, 248, 250);

            _body = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                AutoScroll = true,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                Padding = new Padding(12, 10, 12, 12),
                BackColor = BackColor
            };
            Controls.Add(_body);

            _body.Controls.Add(new Label
            {
                Text = "ГИП · Инструменты",
                AutoSize = false,
                Height = 32,
                Width = 280,
                Font = new Font("Segoe UI", 14F, FontStyle.Bold),
                ForeColor = Color.FromArgb(32, 48, 64),
                TextAlign = ContentAlignment.MiddleLeft,
                Margin = new Padding(0, 0, 0, 2),
                Tag = "stretch"
            });

            _document = new Label
            {
                Text = "Активный чертёж: проверка…",
                AutoSize = false,
                Height = 34,
                Width = 280,
                Font = new Font("Segoe UI", 8.5F),
                ForeColor = Color.FromArgb(86, 99, 112),
                TextAlign = ContentAlignment.MiddleLeft,
                Margin = new Padding(0, 0, 0, 12),
                Tag = "stretch"
            };
            _body.Controls.Add(_document);

            AddSection("КОНСТРУКТОР");
            AddAction("Открыть таблицу групп", "GIPPANEL",
                "Таблица состава щита: группы, аппараты, фазы, кабели и построение альбома.");
            AddAction("Создать / изменить щит", "GIPSHCHIT",
                "Запускает диалог параметров и построение альбома по шаблону.");

            AddSection("РАБОТА С ЧЕРТЕЖОМ");
            AddAction("Пересчитать альбом", "GIPUPD",
                "Обновляет однолинейную и монтажную схемы и спецификацию по текущей монтажной схеме.");

            AddSection("ОБМЕН И АВТОМАТИЗАЦИЯ");
            AddAction("Щит по ссылке", "GIPLINK",
                "Запрашивает ссылку, содержащую состав щита, и строит альбом.");
            AddAction("Вкл. / выкл. автообновление", "GIPAUTO",
                "Переключает автоматический пересчёт после перемещения, удаления и редактирования аппаратов.");

            _body.Controls.Add(new Label
            {
                Text = "Команды выполняются в активном чертеже. Результат и запросы отображаются в командной строке AutoCAD.",
                AutoSize = false,
                Height = 54,
                Width = 280,
                Font = new Font("Segoe UI", 8F),
                ForeColor = Color.FromArgb(86, 99, 112),
                TextAlign = ContentAlignment.TopLeft,
                Margin = new Padding(0, 14, 0, 4),
                Tag = "stretch"
            });

            _body.Resize += (s, e) => ResizeItems();
            AcAp.DocumentManager.DocumentActivated += (s, e) => RefreshActiveDocument();
            RefreshActiveDocument();
        }

        public void RefreshActiveDocument()
        {
            var doc = AcAp.DocumentManager.MdiActiveDocument;
            var name = "нет активного чертежа";
            if (doc != null)
            {
                try { name = Path.GetFileName(doc.Name); }
                catch { name = doc.Name; }
            }
            _document.Text = "Активный чертёж: " + name;
        }

        private void AddSection(string title)
        {
            _body.Controls.Add(new Label
            {
                Text = title,
                AutoSize = false,
                Height = 24,
                Width = 280,
                Font = new Font("Segoe UI", 8F, FontStyle.Bold),
                ForeColor = Color.FromArgb(38, 105, 156),
                TextAlign = ContentAlignment.MiddleLeft,
                Margin = new Padding(0, 6, 0, 4),
                Tag = "stretch"
            });
        }

        private void AddAction(string title, string command, string description)
        {
            var button = new Button
            {
                Text = title,
                AutoSize = false,
                Height = 42,
                Width = 280,
                Font = new Font("Segoe UI", 9F, FontStyle.Regular),
                TextAlign = ContentAlignment.MiddleLeft,
                Padding = new Padding(10, 0, 8, 0),
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.White,
                ForeColor = Color.FromArgb(32, 48, 64),
                Margin = new Padding(0, 0, 0, 7),
                Cursor = Cursors.Hand,
                Tag = "stretch"
            };
            button.FlatAppearance.BorderColor = Color.FromArgb(213, 220, 228);
            button.FlatAppearance.MouseOverBackColor = Color.FromArgb(233, 242, 250);
            _tips.SetToolTip(button, description + Environment.NewLine + "Команда: " + command);
            button.Click += (s, e) => RunCommand(command);
            _body.Controls.Add(button);
        }

        private void ResizeItems()
        {
            var width = Math.Max(220, _body.ClientSize.Width - _body.Padding.Horizontal - SystemInformation.VerticalScrollBarWidth - 8);
            foreach (Control control in _body.Controls)
            {
                if (Equals(control.Tag, "stretch")) control.Width = width;
            }
        }

        private static void RunCommand(string command)
        {
            var doc = AcAp.DocumentManager.MdiActiveDocument;
            if (doc == null)
            {
                MessageBox.Show("Сначала откройте или создайте чертёж AutoCAD.",
                    "ГИП · Инструменты", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            try
            {
                doc.SendStringToExecute(command + " ", true, false, false);
                doc.Editor.WriteMessage("\nГИП-ЩИТ: вызвана команда " + command + ".");
            }
            catch (System.Exception ex)
            {
                MessageBox.Show("Не удалось вызвать команду " + command + ":" + Environment.NewLine + ex.Message,
                    "ГИП · Инструменты", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }
}
