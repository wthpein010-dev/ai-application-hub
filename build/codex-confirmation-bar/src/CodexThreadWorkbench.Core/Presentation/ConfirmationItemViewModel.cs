using CodexThreadWorkbench.Confirmation;

namespace CodexThreadWorkbench.Presentation;

public sealed class ConfirmationItemViewModel : ObservableObject
{
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
            () => !IsSending);
        IgnoreCommand = new RelayCommand(
            () => ignoreRequested(this),
            () => !IsSending);
    }

    public ConfirmationCandidate Candidate { get; private set; }

    public string Title => Candidate.Title;

    public string RequestPreview => Candidate.RequestPreview;

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
}
