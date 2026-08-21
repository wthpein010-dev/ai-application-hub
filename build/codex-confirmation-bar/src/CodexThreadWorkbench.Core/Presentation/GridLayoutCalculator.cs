namespace CodexThreadWorkbench.Presentation;

public readonly record struct GridShape(int Rows, int Columns);

public static class GridLayoutCalculator
{
    public static GridShape Calculate(int count) => count switch
    {
        <= 1 => new GridShape(1, 1),
        2 => new GridShape(1, 2),
        <= 4 => new GridShape(2, 2),
        _ => new GridShape(2, 3)
    };
}
