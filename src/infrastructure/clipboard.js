// @ts-check
/**
 * クリップボード書き込み。iOS Safari ではユーザー操作の中で同期的に呼び出す必要があるため、
 * 呼び出し側は await の前にこの関数を呼ぶこと。成功時のみ true（T30: 失敗時は成功表示を出さない）。
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function writeClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // フォールバックへ
  }
  return legacyCopy(text);
}

/** @param {string} text */
function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
