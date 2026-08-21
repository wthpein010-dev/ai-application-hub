using System.Collections.ObjectModel;
using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Presentation;

public sealed class ThreadPickerItemViewModel : ObservableObject
{
    private bool _isOpen;

    public ThreadPickerItemViewModel(ThreadSummary summary, bool isOpen)
    {
        Summary = summary;
        _isOpen = isOpen;
    }

    public ThreadSummary Summary { get; }

    public string Id => Summary.Id;

    public string Title => Summary.Title;

    public string Preview => Summary.Preview;

    public string WorkingDirectory => Summary.WorkingDirectory;

    public string UpdatedText => Summary.UpdatedAt == DateTimeOffset.MinValue
        ? string.Empty
        : Summary.UpdatedAt.LocalDateTime.ToString("MM-dd HH:mm");

    public bool IsOpen
    {
        get => _isOpen;
        set => SetProperty(ref _isOpen, value);
    }
}

public sealed class ThreadPickerViewModel : ObservableObject
{
    private readonly ICodexThreadClient _client;
    private readonly List<ThreadPickerItemViewModel> _allItems = [];
    private string _searchText = string.Empty;
    private bool _isLoading;
    private string _errorMessage = string.Empty;

    public ThreadPickerViewModel(ICodexThreadClient client)
    {
        _client = client;
    }

    public ObservableCollection<ThreadPickerItemViewModel> Items { get; } = [];

    public string SearchText
    {
        get => _searchText;
        set
        {
            if (SetProperty(ref _searchText, value))
            {
                ApplyFilter();
            }
        }
    }

    public bool IsLoading
    {
        get => _isLoading;
        private set => SetProperty(ref _isLoading, value);
    }

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

    public async Task RefreshAsync(
        IReadOnlyCollection<string> openThreadIds,
        CancellationToken cancellationToken = default)
    {
        IsLoading = true;
        ErrorMessage = string.Empty;
        try
        {
            var threads = await _client.ListThreadsAsync(
                limit: 200,
                cancellationToken: cancellationToken);
            var openIds = openThreadIds.ToHashSet(StringComparer.Ordinal);
            _allItems.Clear();
            _allItems.AddRange(
                threads.Select(summary =>
                    new ThreadPickerItemViewModel(summary, openIds.Contains(summary.Id))));
            ApplyFilter();
        }
        catch (Exception error)
        {
            ErrorMessage = error.Message;
        }
        finally
        {
            IsLoading = false;
        }
    }

    public void MarkOpen(string threadId, bool isOpen)
    {
        var item = _allItems.FirstOrDefault(candidate => candidate.Id == threadId);
        if (item is not null)
        {
            item.IsOpen = isOpen;
        }
    }

    private void ApplyFilter()
    {
        var query = SearchText.Trim();
        var filtered = string.IsNullOrWhiteSpace(query)
            ? _allItems
            : _allItems.Where(item =>
                    item.Title.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                    item.Preview.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                    item.WorkingDirectory.Contains(query, StringComparison.OrdinalIgnoreCase))
                .ToList();
        Items.Clear();
        foreach (var item in filtered)
        {
            Items.Add(item);
        }
    }
}
