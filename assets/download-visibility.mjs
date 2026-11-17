// This controls presentation of public links, never server authorization.
export const DOWNLOAD_VISIBILITY_KEY = 'ai-application-hub:download-visibility:v1';

export function createDownloadVisibility({ root, storage }) {
  let enabled = false;
  try { enabled = storage?.getItem(DOWNLOAD_VISIBILITY_KEY) === 'enabled'; } catch {}
  const render = () => { root.dataset.hubDownloads = enabled ? 'enabled' : 'disabled'; };
  render();
  return {
    get enabled() { return enabled; },
    refresh() {
      try {
        if (storage) enabled = storage.getItem(DOWNLOAD_VISIBILITY_KEY) === 'enabled';
      } catch {}
      render();
    },
    setEnabled(value) {
      enabled = value === true;
      render();
      try {
        if (!storage) return false;
        if (enabled) storage.setItem(DOWNLOAD_VISIBILITY_KEY, 'enabled');
        else storage.removeItem(DOWNLOAD_VISIBILITY_KEY);
        return true;
      } catch { return false; }
    },
  };
}
