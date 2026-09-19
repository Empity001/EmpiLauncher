using System.Windows.Documents;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using EmpiLauncher.App.Themes;

internal static class Program
{
    static int failures;
    static void Check(string name, bool ok, string detail = "") { Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {name}  {detail}"); if (!ok) failures++; }
    static void Wait(int ms)
    {
        var frame = new DispatcherFrame();
        var t = new DispatcherTimer(DispatcherPriority.Normal) { Interval = TimeSpan.FromMilliseconds(ms) };
        t.Tick += (_, _) => { t.Stop(); frame.Continue = false; };
        t.Start();
        Dispatcher.PushFrame(frame);
    }
    /// <summary>Waits (up to a limit) until something has started to move: the first sample of an animation is what the checks look at, however busy the machine is.</summary>
    static void WaitUntil(Func<bool> moved, int limitMs)
    {
        var until = DateTime.UtcNow.AddMilliseconds(limitMs);
        while (!moved() && DateTime.UtcNow < until) Wait(8);
    }
    static bool Between(double v, double a, double b) => v > Math.Min(a, b) + 1e-6 && v < Math.Max(a, b) - 1e-6;

    [STAThread]
    static int Main()
    {
        var app = new EmpiLauncher.App.App();
        app.InitializeComponent();
        var window = new Window { Left = -3000, Top = 0, Width = 600, Height = 500, WindowStyle = WindowStyle.None, ShowInTaskbar = false, Background = Brushes.Black };
        var panel = new StackPanel { Margin = new Thickness(20) };
        window.Content = panel;
        window.Show();
        Style S(string key) => (Style)app.FindResource(key);
        Console.WriteLine($"Motion.Enabled = {Motion.Enabled}");

        // ---- the curve ----
        var ease = new BezierEase { X1 = 0.25, Y1 = 0.1, X2 = 0.25, Y2 = 1 };
        Check("BezierEase matches CSS ease at 0.5 (0.802)", Math.Abs(ease.Ease(0.5) - 0.8024) < 0.01, ease.Ease(0.5).ToString("0.0000"));
        Check("EaseOut curve: 0 at 0, 1 at 1, fast start, never backwards", Motion.Out.Ease(0) == 0 && Motion.Out.Ease(1) == 1 && Motion.Out.Ease(0.1) > 0.3 && Enumerable.Range(1, 100).All(i => Motion.Out.Ease(i / 100.0) >= Motion.Out.Ease((i - 1) / 100.0)), $"at .1 = {Motion.Out.Ease(0.1):0.000}");
        Check("EaseInOut curve: slow start, fast middle", Motion.InOut.Ease(0.1) < 0.05 && Math.Abs(Motion.InOut.Ease(0.5) - 0.62) < 0.1, $"at .1 = {Motion.InOut.Ease(0.1):0.000}");

        // ---- warm-up: the first transition of a process pays for loading the animation machinery (tens of ms), which would make the
        // "already moving after 50 ms" checks below depend on how busy the machine is. One throwaway cycle first. ----
        var warm = new Button { Content = "x", Style = S("GhostButton") };
        panel.Children.Add(warm);
        Wait(150);
        warm.ApplyTemplate();
        VisualStateManager.GoToState(warm, "MouseOver", true); Wait(250);
        VisualStateManager.GoToState(warm, "Pressed", true); Wait(250);
        VisualStateManager.GoToState(warm, "Normal", true); Wait(250);
        panel.Children.Remove(warm);

        // ---- button: hover lifts, press sinks, and it can change its mind halfway ----
        var b = new Button { Content = "Jugar", Style = S("GhostButton") };
        panel.Children.Add(b);
        Wait(150);
        b.ApplyTemplate();
        var rootGrid = (Grid)b.Template.FindName("Root", b); var bodyGrid = (Grid)b.Template.FindName("Body", b); double LiftY() => ((TranslateTransform)rootGrid.RenderTransform).Y; double PressX() => ((ScaleTransform)bodyGrid.RenderTransform).ScaleX; double PressY() => ((ScaleTransform)bodyGrid.RenderTransform).ScaleY;
        var over = (Border)b.Template.FindName("Over", b);
        Check("button at rest: no lift, no press, no overlay", LiftY() == 0 && PressX() == 1 && over.Opacity == 0);
        VisualStateManager.GoToState(b, "MouseOver", true);
        WaitUntil(() => LiftY() != 0 || over.Opacity > 0, 800);
        var y1 = LiftY(); var o1 = over.Opacity;
        Check("hover starts smoothly: its first sample is between rest and end, not the end", Between(y1, 0, -1) && Between(o1, 0, 0.10), $"y={y1:0.000} overlay={o1:0.000}");
        VisualStateManager.GoToState(b, "Normal", true);
        Wait(20);
        var y2 = LiftY();
        Check("leaving halfway continues from where it was (no jump to either end)", y2 < 0 && Math.Abs(y2) <= Math.Abs(y1) + 0.02 && y2 != 0, $"was {y1:0.000}, now {y2:0.000}");
        Wait(300);
        Check("and settles back", LiftY() == 0 && over.Opacity == 0, $"y={LiftY()} overlay={over.Opacity}");
        VisualStateManager.GoToState(b, "MouseOver", true); Wait(300);
        Check("hover ends lifted 1 px with the overlay at 10 %", Math.Abs(LiftY() + 1) < 1e-6 && Math.Abs(over.Opacity - 0.10) < 1e-6, $"y={LiftY()} overlay={over.Opacity}");
        VisualStateManager.GoToState(b, "Pressed", true); WaitUntil(() => PressX() != 1, 800);
        var sMid = PressX();
        Check("press starts smoothly: its first sample is between rest and end", Between(sMid, 1, 0.97), $"scale={sMid:0.0000}");
        Wait(250);
        Check("press ends at 97 %", Math.Abs(PressX() - 0.97) < 1e-6 && Math.Abs(PressY() - 0.97) < 1e-6, $"scale={PressX()}");
        VisualStateManager.GoToState(b, "Normal", true); Wait(300);
        Check("release returns to rest", PressX() == 1 && LiftY() == 0);

        // ---- disabled: a dim that fades in, not a jump ----
        var d = new Button { Content = "x", Style = S("PrimaryButton"), IsEnabled = true };
        panel.Children.Add(d); Wait(120); d.ApplyTemplate();
        var root = (Grid)d.Template.FindName("Root", d);
        d.IsEnabled = false; WaitUntil(() => root.Opacity != 1, 800);
        Check("a button that becomes disabled fades to 40 %", Between(root.Opacity, 1, 0.4), $"opacity={root.Opacity:0.000}");
        Wait(300);
        Check("and ends at 40 %", Math.Abs(root.Opacity - 0.4) < 1e-6);

        // ---- switch: created on it stays put; toggled it travels ----
        var sw = new ToggleButton { Style = S("Switch"), IsChecked = true };
        panel.Children.Add(sw); Wait(150); sw.ApplyTemplate();
        var slide = (TranslateTransform)((Grid)sw.Template.FindName("ThumbHolder", sw)).RenderTransform;
        var trackOn = (Border)sw.Template.FindName("TrackOn", sw);
        Check("a switch that is created ON starts ON (it does not slide in)", slide.X == 16 && trackOn.Opacity == 1, $"x={slide.X} track={trackOn.Opacity}");
        sw.IsChecked = false; WaitUntil(() => slide.X != 16, 800);
        Check("switching off travels", Between(slide.X, 16, 0) && Between(trackOn.Opacity, 1, 0), $"x={slide.X:0.00} track={trackOn.Opacity:0.00}");
        Wait(300);
        Check("and arrives", slide.X == 0 && trackOn.Opacity == 0, $"x={slide.X}");
        sw.IsChecked = true; Wait(300);
        Check("switching on arrives at 16 px", Math.Abs(slide.X - 16) < 1e-6 && trackOn.Opacity == 1, $"x={slide.X}");

        // ---- tab pills: the chosen one fills as the other empties ----
        var a1 = new RadioButton { Style = S("TabPill"), Content = "Cuenta", GroupName = "g", IsChecked = true };
        var a2 = new RadioButton { Style = S("TabPill"), Content = "Java", GroupName = "g" };
        var row = new StackPanel { Orientation = Orientation.Horizontal }; row.Children.Add(a1); row.Children.Add(a2); panel.Children.Add(row);
        Wait(150); a1.ApplyTemplate(); a2.ApplyTemplate();
        var on1 = (Border)a1.Template.FindName("OnFill", a1); var on2 = (Border)a2.Template.FindName("OnFill", a2);
        var ink2 = (SolidColorBrush)TextElement.GetForeground((ContentPresenter)a2.Template.FindName("Label", a2));
        Check("the tab that starts chosen is filled at once", on1.Opacity == 1 && on2.Opacity == 0, $"{on1.Opacity}/{on2.Opacity}");
        a2.IsChecked = true; WaitUntil(() => on1.Opacity != 1, 800);
        Check("choosing another moves the fill (both in progress)", Between(on1.Opacity, 1, 0) && Between(on2.Opacity, 0, 1), $"{on1.Opacity:0.00}/{on2.Opacity:0.00}");
        Wait(300);
        Check("it ends on the new one, with dark text", on1.Opacity == 0 && on2.Opacity == 1 && ink2.Color == (Color)app.FindResource("BgColor"), $"{on1.Opacity}/{on2.Opacity}");

        // ---- text box: focus lights the outline ----
        var tb = new TextBox { Style = S("InputBox"), Text = "x" };
        panel.Children.Add(tb); Wait(150); tb.ApplyTemplate();
        var ring = (Border)tb.Template.FindName("FocusFrame", tb);
        Check("an unfocused text box has no accent outline", ring.Opacity == 0);
        VisualStateManager.GoToState(tb, "Focused", true); Wait(300);
        Check("focus lights it", ring.Opacity == 1, $"opacity={ring.Opacity}");
        VisualStateManager.GoToState(tb, "Unfocused", true); Wait(300);
        Check("and losing focus puts it out", ring.Opacity == 0, $"opacity={ring.Opacity}");

        // ---- Motion helpers ----
        var box = new Border { Width = 50, Height = 20, Background = Brushes.White };
        panel.Children.Add(box); Wait(50);
        Motion.Rise(box, 200, 240, 10);
        Check("an element waiting its turn is already invisible (no flash)", box.Opacity == 0);
        Wait(100);
        Check("...and still is before its delay ends", box.Opacity == 0, $"{box.Opacity}");
        WaitUntil(() => box.Opacity > 0, 1200);
        Check("then it fades in and rises", Between(box.Opacity, 0, 1) && ((TranslateTransform)box.RenderTransform).Y > 0, $"opacity={box.Opacity:0.00} y={((TranslateTransform)box.RenderTransform).Y:0.0}");
        Wait(400);
        Check("and ends fully in place", box.Opacity == 1 && ((TranslateTransform)box.RenderTransform).Y == 0);
        box.Opacity = 0.5;
        Check("afterwards the animation does not hold the property (a later change sticks)", box.Opacity == 0.5);
        box.Opacity = 1;

        var st = new ScaleTransform(0, 1);
        Motion.Follow(st, ScaleTransform.ScaleXProperty, 0.6); WaitUntil(() => st.ScaleX != 0, 800);
        var f1 = st.ScaleX;
        Check("Follow slides toward the value", Between(f1, 0, 0.6), $"{f1:0.000}");
        Motion.Follow(st, ScaleTransform.ScaleXProperty, 1.0); Wait(30);
        Check("a new target continues from where it is, not from zero", st.ScaleX >= f1 - 1e-6, $"{f1:0.000} -> {st.ScaleX:0.000}");
        Wait(350);
        Check("and arrives", Math.Abs(st.ScaleX - 1.0) < 1e-6, $"{st.ScaleX}");
        Motion.Snap(st, ScaleTransform.ScaleXProperty, 0);
        Check("Snap puts it at a value at once", st.ScaleX == 0);

        var tearBox = new Border { Width = 40, Height = 10, Background = Brushes.White };
        panel.Children.Add(tearBox); Wait(50);
        Motion.Tear(tearBox); WaitUntil(() => tearBox.Opacity < 1 || ((TranslateTransform)tearBox.RenderTransform).X != 0, 800);
        var during = ((TranslateTransform)tearBox.RenderTransform).X != 0 || tearBox.Opacity < 1;
        Wait(350);
        Check("the tear glitches and then leaves the element exactly as it was", during && tearBox.Opacity == 1 && ((TranslateTransform)tearBox.RenderTransform).X == 0, $"during={during} opacity={tearBox.Opacity} x={((TranslateTransform)tearBox.RenderTransform).X}");

        var gone = new Border { Width = 40, Height = 10, Background = Brushes.White }; panel.Children.Add(gone); Wait(50);
        var left = false; Motion.Leave(gone, () => left = true, 140); WaitUntil(() => gone.Opacity != 1, 800);
        Check("Leave fades first and calls back when done", !left && Between(gone.Opacity, 1, 0), $"opacity={gone.Opacity:0.00}");
        Wait(250);
        Check("...and the element is back at full opacity for the next time", left && gone.Opacity == 1);

        Console.WriteLine(failures == 0 ? "ALL PASS" : $"{failures} FAILED");
        window.Close();
        return failures == 0 ? 0 : 1;
    }
}
