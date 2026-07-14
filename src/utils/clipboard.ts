export type ClipboardAdapters = {
  writeText?: (text: string) => Promise<void>;
  fallbackCopy?: (text: string) => boolean;
};

const fallbackCopy = (text: string) => {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(area);
  }
};

const browserClipboardAdapters = (): ClipboardAdapters => ({
  writeText: navigator.clipboard?.writeText.bind(navigator.clipboard),
  fallbackCopy,
});

export const copyTextToClipboard = async (
  text: string,
  adapters: ClipboardAdapters = browserClipboardAdapters(),
) => {
  if (!text) return false;
  try {
    if (adapters.writeText) {
      await adapters.writeText(text);
      return true;
    }
  } catch {
    // Clipboard permission failures fall through to the document-based copy path.
  }
  try {
    return adapters.fallbackCopy?.(text) ?? false;
  } catch {
    return false;
  }
};
