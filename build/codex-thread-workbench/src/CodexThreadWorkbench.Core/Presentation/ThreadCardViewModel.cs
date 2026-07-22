using System.Collections.ObjectModel;
using System.Text.Json;
using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Presentation;

public sealed class ThreadCardViewModel : ObservableObject
{
    private readonly ICodexThreadClient _client;
    private readonly Func<ThreadCardViewModel, Task>? _closeRequested;
    private readonly Func<ThreadCardViewModel, Task>? _stateChanged;
    private readonly SemaphoreSlim _sendGate = new(1, 1);
    private string _title;
    private string _draft = string.Empty;
    private ThreadStatusKind _status;
    private string? _activeTurnId;
    private string _errorMessage = string.Empty;
    private bool _isBusy;
    private bool _isMinimized;
    private CodexApprovalRequest? _pendingApproval;

    public ThreadCardViewModel(
        ICodexThreadClient client,
        ThreadCardState state,
        Func<ThreadCardViewModel, Task>? closeRequested = null,
        Func<ThreadCardViewModel, Task>? stateChanged = null)
    {
        _client = client;
        _closeRequested = closeRequested;
        _stateChanged = stateChanged;
        ThreadId = state.Summary.Id;
        _title = state.Summary.Title;
        Preview = state.Summary.Preview;
        WorkingDirectory = state.Summary.WorkingDirectory;
        UpdatedAt = state.Summary.UpdatedAt;
        _status = state.Status;
        _activeTurnId = state.ActiveTurnId;
        _errorMessage = state.ErrorMessage ?? string.Empty;
        Messages = new ObservableCollection<ChatMessage>(state.Messages);

        SendCommand = new AsyncRelayCommand(SendAsync, CanSend);
        StopCommand = new AsyncRelayCommand(StopAsync, () => IsRunning && !IsBusy);
        ApproveCommand = new AsyncRelayCommand(
            () => RespondToApprovalAsync(accept: true),
            () => PendingApproval is not null && !IsBusy);
        DeclineCommand = new AsyncRelayCommand(
            () => RespondToApprovalAsync(accept: false),
            () => PendingApproval is not null && !IsBusy);
        ToggleMinimizeCommand = new RelayCommand(ToggleMinimize);
        CloseCommand = new AsyncRelayCommand(CloseAsync);
    }

    public string ThreadId { get; }

    public string Title
    {
        get => _title;
        private set => SetProperty(ref _title, value);
    }

    public string Preview { get; }

    public string WorkingDirectory { get; }

    public DateTimeOffset UpdatedAt { get; }

    public ObservableCollection<ChatMessage> Messages { get; }

    public string Draft
    {
        get => _draft;
        set
        {
            if (SetProperty(ref _draft, value))
            {
                SendCommand.RaiseCanExecuteChanged();
            }
        }
    }

    public ThreadStatusKind Status
    {
        get => _status;
        private set
        {
            if (SetProperty(ref _status, value))
            {
                OnPropertyChanged(nameof(StatusText));
                OnPropertyChanged(nameof(StatusColor));
                OnPropertyChanged(nameof(IsRunning));
                SendCommand.RaiseCanExecuteChanged();
                StopCommand.RaiseCanExecuteChanged();
            }
        }
    }

    public string StatusText => Status switch
    {
        ThreadStatusKind.Running => "进行中",
        ThreadStatusKind.Completed => "已完成",
        ThreadStatusKind.Interrupted => "已停止",
        ThreadStatusKind.NeedsApproval => "需确认",
        ThreadStatusKind.Error => "出错",
        ThreadStatusKind.Offline => "离线",
        ThreadStatusKind.NotLoaded => "未载入",
        _ => "空闲"
    };

    public string StatusColor => Status switch
    {
        ThreadStatusKind.Running => "#239567",
        ThreadStatusKind.Completed => "#239567",
        ThreadStatusKind.NeedsApproval => "#BD7622",
        ThreadStatusKind.Error => "#C74444",
        ThreadStatusKind.Interrupted => "#7B858D",
        ThreadStatusKind.Offline => "#7B858D",
        _ => "#68737C"
    };

    public string? ActiveTurnId
    {
        get => _activeTurnId;
        private set
        {
            if (SetProperty(ref _activeTurnId, value))
            {
                OnPropertyChanged(nameof(IsRunning));
                StopCommand.RaiseCanExecuteChanged();
            }
        }
    }

    public bool IsRunning =>
        Status == ThreadStatusKind.Running && !string.IsNullOrWhiteSpace(ActiveTurnId);

    public string ErrorMessage
    {
        get => _errorMessage;
        private set
        {
            if (SetProperty(ref _errorMessage, value))
            {
                OnPropertyChanged(nameof(HasError));
            }
        }
    }

    public bool HasError => !string.IsNullOrWhiteSpace(ErrorMessage);

    public bool IsBusy
    {
        get => _isBusy;
        private set
        {
            if (SetProperty(ref _isBusy, value))
            {
                SendCommand.RaiseCanExecuteChanged();
                StopCommand.RaiseCanExecuteChanged();
                ApproveCommand.RaiseCanExecuteChanged();
                DeclineCommand.RaiseCanExecuteChanged();
            }
        }
    }

    public bool IsMinimized
    {
        get => _isMinimized;
        set
        {
            if (SetProperty(ref _isMinimized, value))
            {
                OnPropertyChanged(nameof(MinimizeGlyph));
            }
        }
    }

    public string MinimizeGlyph => IsMinimized ? "□" : "—";

    public CodexApprovalRequest? PendingApproval
    {
        get => _pendingApproval;
        private set
        {
            if (SetProperty(ref _pendingApproval, value))
            {
                OnPropertyChanged(nameof(HasPendingApproval));
                ApproveCommand.RaiseCanExecuteChanged();
                DeclineCommand.RaiseCanExecuteChanged();
            }
        }
    }

    public bool HasPendingApproval => PendingApproval is not null;

    public AsyncRelayCommand SendCommand { get; }

    public AsyncRelayCommand StopCommand { get; }

    public AsyncRelayCommand ApproveCommand { get; }

    public AsyncRelayCommand DeclineCommand { get; }

    public RelayCommand ToggleMinimizeCommand { get; }

    public AsyncRelayCommand CloseCommand { get; }

    public async Task SendAsync()
    {
        if (!CanSend())
        {
            return;
        }

        await _sendGate.WaitAsync();
        try
        {
            var text = Draft.Trim();
            if (text.Length == 0)
            {
                return;
            }

            IsBusy = true;
            ErrorMessage = string.Empty;
            try
            {
                if (IsRunning && ActiveTurnId is not null)
                {
                    await _client.SteerTurnAsync(ThreadId, ActiveTurnId, text);
                }
                else
                {
                    await _client.ResumeThreadAsync(ThreadId);
                    ActiveTurnId = await _client.StartTurnAsync(ThreadId, text);
                    Status = ThreadStatusKind.Running;
                }

                Messages.Add(new ChatMessage(
                    $"local-{Guid.NewGuid():N}",
                    ChatRole.User,
                    text));
                Draft = string.Empty;
            }
            catch (Exception error)
            {
                ErrorMessage = error.Message;
            }
            finally
            {
                IsBusy = false;
            }
        }
        finally
        {
            _sendGate.Release();
        }
    }

    public async Task StopAsync()
    {
        if (!IsRunning || ActiveTurnId is null)
        {
            return;
        }

        var interruptedTurnId = ActiveTurnId;
        IsBusy = true;
        ErrorMessage = string.Empty;
        Status = ThreadStatusKind.Interrupted;
        try
        {
            await _client.InterruptTurnAsync(ThreadId, interruptedTurnId);
            if (ActiveTurnId == interruptedTurnId)
            {
                ActiveTurnId = null;
            }
        }
        catch (Exception error)
        {
            if (ActiveTurnId == interruptedTurnId &&
                Status == ThreadStatusKind.Interrupted)
            {
                Status = ThreadStatusKind.Running;
            }

            ErrorMessage = error.Message;
        }
        finally
        {
            IsBusy = false;
        }
    }

    public void ApplyStatusSnapshot(ThreadCardState state)
    {
        if (state.Summary.Id != ThreadId || IsBusy)
        {
            return;
        }

        ActiveTurnId = state.ActiveTurnId;
        Status = state.Status;
    }

    public void SetApproval(CodexApprovalRequest request)
    {
        PendingApproval = request;
        Status = ThreadStatusKind.NeedsApproval;
    }

    public async Task RespondToApprovalAsync(bool accept)
    {
        var request = PendingApproval;
        if (request is null)
        {
            return;
        }

        IsBusy = true;
        ErrorMessage = string.Empty;
        try
        {
            await _client.RespondToApprovalAsync(request, accept);
            PendingApproval = null;
            Status = ActiveTurnId is null
                ? ThreadStatusKind.Idle
                : ThreadStatusKind.Running;
        }
        catch (Exception error)
        {
            ErrorMessage = error.Message;
        }
        finally
        {
            IsBusy = false;
        }
    }

    public void ApplyNotification(CodexNotification notification)
    {
        switch (notification.Kind)
        {
            case CodexNotificationKind.ThreadStatusChanged:
                if (notification.Payload.TryGetProperty("status", out var threadStatus))
                {
                    Status = ThreadProjection.MapThreadStatus(threadStatus);
                }

                break;
            case CodexNotificationKind.TurnStarted:
                ActiveTurnId = notification.TurnId ?? GetNestedTurnId(notification.Payload);
                Status = ThreadStatusKind.Running;
                ErrorMessage = string.Empty;
                break;
            case CodexNotificationKind.AgentMessageDelta:
                ApplyAgentDelta(notification);
                break;
            case CodexNotificationKind.ItemCompleted:
                ApplyCompletedItem(notification.Payload);
                break;
            case CodexNotificationKind.TurnCompleted:
                ApplyCompletedTurn(notification.Payload);
                break;
            case CodexNotificationKind.ThreadNameUpdated:
                var name = GetString(notification.Payload, "name");
                if (!string.IsNullOrWhiteSpace(name))
                {
                    Title = name;
                }

                break;
            case CodexNotificationKind.Error:
                ErrorMessage = GetString(notification.Payload, "message");
                Status = ThreadStatusKind.Error;
                break;
        }
    }

    private bool CanSend() =>
        !IsBusy && !string.IsNullOrWhiteSpace(Draft) && PendingApproval is null;

    private void ApplyAgentDelta(CodexNotification notification)
    {
        var delta = GetString(notification.Payload, "delta");
        if (delta.Length == 0)
        {
            return;
        }

        var itemId = notification.ItemId ??
                     GetString(notification.Payload, "itemId");
        var index = FindMessageIndex(itemId);
        if (index < 0)
        {
            Messages.Add(new ChatMessage(itemId, ChatRole.Assistant, delta, IsStreaming: true));
            return;
        }

        var existing = Messages[index];
        Messages[index] = existing with
        {
            Text = existing.Text + delta,
            IsStreaming = true
        };
    }

    private void ApplyCompletedItem(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("item", out var item))
        {
            return;
        }

        var type = GetString(item, "type");
        var itemId = GetString(item, "id");
        if (type == "agentMessage")
        {
            var finalText = GetString(item, "text");
            var index = FindMessageIndex(itemId);
            var finalMessage = new ChatMessage(itemId, ChatRole.Assistant, finalText);
            if (index >= 0)
            {
                Messages[index] = finalMessage;
            }
            else if (!string.IsNullOrWhiteSpace(finalText))
            {
                Messages.Add(finalMessage);
            }
        }
    }

    private void ApplyCompletedTurn(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("turn", out var turn))
        {
            return;
        }

        ActiveTurnId = null;
        Status = GetString(turn, "status") switch
        {
            "completed" => ThreadStatusKind.Completed,
            "interrupted" => ThreadStatusKind.Interrupted,
            "failed" => ThreadStatusKind.Error,
            _ => ThreadStatusKind.Idle
        };
        if (Status == ThreadStatusKind.Error &&
            turn.TryGetProperty("error", out var error) &&
            error.ValueKind == JsonValueKind.Object)
        {
            ErrorMessage = GetString(error, "message");
        }
    }

    private int FindMessageIndex(string itemId)
    {
        for (var index = 0; index < Messages.Count; index++)
        {
            if (Messages[index].Id == itemId)
            {
                return index;
            }
        }

        return -1;
    }

    private static string? GetNestedTurnId(JsonElement parameters) =>
        parameters.TryGetProperty("turn", out var turn)
            ? GetString(turn, "id")
            : null;

    private static string GetString(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var property) &&
        property.ValueKind == JsonValueKind.String
            ? property.GetString() ?? string.Empty
            : string.Empty;

    private void ToggleMinimize()
    {
        IsMinimized = !IsMinimized;
        if (_stateChanged is not null)
        {
            _ = _stateChanged(this);
        }
    }

    private Task CloseAsync() =>
        _closeRequested?.Invoke(this) ?? Task.CompletedTask;
}
