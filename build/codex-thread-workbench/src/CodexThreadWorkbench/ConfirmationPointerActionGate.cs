namespace CodexThreadWorkbench;

public sealed class ConfirmationPointerActionGate
{
    private readonly HashSet<object> _armedActions = [];

    public void Arm(object action)
    {
        ArgumentNullException.ThrowIfNull(action);
        _armedActions.Add(action);
    }

    public bool TryConsume(object action)
    {
        ArgumentNullException.ThrowIfNull(action);
        return _armedActions.Remove(action);
    }

    public void Disarm(object action)
    {
        ArgumentNullException.ThrowIfNull(action);
        _armedActions.Remove(action);
    }

    public void Clear() => _armedActions.Clear();
}
