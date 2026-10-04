mergeInto(LibraryManager.library, {
  LighthouseMetricsPublish: function (jsonPointer) {
    window.__lighthouseMetrics = JSON.parse(UTF8ToString(jsonPointer));
  }
});
