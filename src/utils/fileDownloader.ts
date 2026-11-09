import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { saveAs } from 'file-saver';

/**
 * Universal file saver and downloader that works seamlessly on both Web and
 * native Android/iOS Capacitor apps.
 *
 * In Capacitor:
 * 1. Writes base64 data to Directory.Documents or Directory.Cache.
 * 2. Invokes native Share.share so the user can save to device storage, Google Drive, or open in apps.
 *
 * In Web:
 * 1. Calls file-saver saveAs with standard anchor fallback.
 */
export async function downloadExportFile(
  content: Blob | string | Uint8Array,
  filename: string,
  mimeType: string = 'application/octet-stream'
): Promise<{ success: boolean; uri?: string }> {
  try {
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      // Convert to base64
      let base64Data = '';
      if (typeof content === 'string') {
        // UTF-8 string to base64
        base64Data = btoa(unescape(encodeURIComponent(content)));
      } else if (content instanceof Uint8Array) {
        let binary = '';
        const len = content.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(content[i]);
        }
        base64Data = btoa(binary);
      } else if (content instanceof Blob) {
        base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const res = reader.result as string;
            const commaIdx = res.indexOf(',');
            resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
          };
          reader.onerror = reject;
          reader.readAsDataURL(content);
        });
      }

      // Try writing to Documents directory first for permanent user access
      let savedFile: { uri: string };
      try {
        savedFile = await Filesystem.writeFile({
          path: filename,
          data: base64Data,
          directory: Directory.Documents,
          recursive: true,
        });
      } catch (docErr) {
        console.warn('Writing to Documents failed, falling back to Cache directory:', docErr);
        savedFile = await Filesystem.writeFile({
          path: filename,
          data: base64Data,
          directory: Directory.Cache,
          recursive: true,
        });
      }

      // Trigger native share dialog so user can save or view
      try {
        await Share.share({
          title: filename,
          text: `Official Report: ${filename}`,
          files: [savedFile.uri],
          dialogTitle: `Save or Open ${filename}`,
        });
      } catch (shareErr: any) {
        // User may cancel share dialog; file is still saved to disk
        if (shareErr?.name !== 'AbortError') {
          console.warn('Share sheet notification:', shareErr);
        }
      }

      return { success: true, uri: savedFile.uri };
    }

    // Web Browser fallback
    let blob: Blob;
    if (content instanceof Blob) {
      blob = content;
    } else if (content instanceof Uint8Array) {
      blob = new Blob([content as unknown as BlobPart], { type: mimeType });
    } else {
      blob = new Blob([content], { type: mimeType });
    }

    try {
      saveAs(blob, filename);
    } catch {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    return { success: true };
  } catch (err: any) {
    console.error('downloadExportFile error:', err);
    throw new Error(err.message || 'Failed to download file to device.');
  }
}
