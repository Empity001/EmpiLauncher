using Avalonia;
using Avalonia.Controls.Shapes;

namespace EmpiLauncher.Linux.Views;

/// <summary>A shape that takes the room it is given and asks for none: the torn edge of Punk's buttons must follow the button's size, never set it.</summary>
public sealed class TornShape : Avalonia.Controls.Shapes.Path
{
    protected override Size MeasureOverride(Size availableSize) => default;
}
