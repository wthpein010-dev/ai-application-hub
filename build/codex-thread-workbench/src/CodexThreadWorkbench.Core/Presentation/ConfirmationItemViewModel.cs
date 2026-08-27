using CodexThreadWorkbench.Confirmation;

namespace CodexThreadWorkbench.Presentation;

public sealed class ConfirmationItemViewModel : ObservableObject
{
    private bool _isInteractionArmed = true;
    private bool _isSending;
    private string _errorText = string.Empty;

    public ConfirmationItemViewModel(
        ConfirmationCandidate candidate,
        Func<ConfirmationItemViewModel, Task> confirmRequested,
        Action<ConfirmationItemViewModel> ignoreRequested)
    {
        Candidate = candidate;
        ConfirmCommand = new AsyncRelayCommand(
            () => confirmRequested(this),
            () => IsInteractionArmed && !IsSending);
        IgnoreCommand = new RelayCommand(
            () => ignoreRequested(this),
            () => IsInteractionArmed && !IsSending);
    }

    public ConfirmationCandidate Candidate { get; private set; }

    public string Title => Candidate.Title;

    public string RequestPreview => Candidate.RequestPreview;

    public bool IsInteractionArmed => _isInteractionArmed;

    public bool IsActionEnabled => IsInteractionArmed && !IsSending;

    public bool IsSending
    {
        get => _isSending;
        internal set
        {
            if (SetProperty(ref _isSending, value))
            {
                ConfirmCommand.RaiseCanExecuteChanged();
                IgnoreCommand.RaiseCanExecuteChanged();
                OnPropertyChanged(nameof(ActionText));
                OnPropertyChanged(nameof(IsActionEnabled));
            }
        }
    }

    public string ErrorText
    {
        get => _errorText;
        internal set
        {
            if (SetProperty(ref _errorText, value))
            {
                OnPropertyChanged(nameof(HasError));
                OnPropertyChanged(nameof(ActionText));
            }
        }
    }

    public bool HasError => !string.IsNullOrWhiteSpace(ErrorText);

    public string ActionText => IsSending
        ? "正在发送…"
        : HasError
            ? "重试"
            : "确认继续";

    public AsyncRelayCommand ConfirmCommand { get; }

    public RelayCommand IgnoreCommand { get; }

    internal void UpdateCandidate(ConfirmationCandidate candidate)
    {
        if (Candidate == candidate)
        {
            return;
        }

        Candidate = candidate;
        OnPropertyChanged(nameof(Candidate));
        OnPropertyChanged(nameof(Title));
        OnPropertyChanged(nameof(RequestPreview));
    }

    internal void SetInteractionArmed(bool value)
    {
        if (!SetProperty(ref _isInteractionArmed, value))
        {
            return;
        }

        ConfirmCommand.RaiseCanExecuteChanged();
        IgnoreCommand.RaiseCanExecuteChanged();
        OnPropertyChanged(nameof(IsActionEnabled));
    }
}
