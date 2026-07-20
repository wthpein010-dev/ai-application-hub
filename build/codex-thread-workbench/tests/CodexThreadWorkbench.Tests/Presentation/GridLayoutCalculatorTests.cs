using CodexThreadWorkbench.Presentation;

namespace CodexThreadWorkbench.Tests.Presentation;

public sealed class GridLayoutCalculatorTests
{
    [Theory]
    [InlineData(0, 1, 1)]
    [InlineData(1, 1, 1)]
    [InlineData(2, 1, 2)]
    [InlineData(3, 2, 2)]
    [InlineData(4, 2, 2)]
    [InlineData(5, 2, 3)]
    [InlineData(6, 2, 3)]
    [InlineData(9, 2, 3)]
    public void Calculate_ReturnsExpectedShape(int count, int rows, int columns)
    {
        var shape = GridLayoutCalculator.Calculate(count);

        Assert.Equal(new GridShape(rows, columns), shape);
    }
}
