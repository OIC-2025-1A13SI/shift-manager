// @ts-check
/**
 * ファイルの書き出し。iPhone では共有シート（「"ファイル"に保存」）を優先し、
 * 使えない環境ではダウンロードリンクで保存する。
 * @param {string} filename @param {string} text
 * @returns {Promise<'saved' | 'cancelled' | 'failed'>}
 */
export async function saveTextFile(filename, text) {
  const file = new File([text], filename, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return 'saved';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    // 共有に失敗した場合はダウンロードへ
  }
  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'saved';
  } catch {
    return 'failed';
  }
}
