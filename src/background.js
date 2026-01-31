/**
 * Chrome/Firefox 互換性のための名前空間の解決
 */
const browserAPI = (typeof browser !== 'undefined') ? browser : chrome;

/**
 * オフスクリーンキャンバスを使用して動的にアイコンを生成する
 */
async function createIconImageData(isAudible) {
  try {
    // Chrome/Firefox の Service Worker で利用可能な OffscreenCanvas を使用
    const canvas = new OffscreenCanvas(16, 16);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, 16, 16);

    if (isAudible) {
      ctx.fillStyle = '#4285f4';
      ctx.beginPath();
      ctx.moveTo(2, 6);
      ctx.lineTo(6, 6);
      ctx.lineTo(10, 2);
      ctx.lineTo(10, 14);
      ctx.lineTo(6, 10);
      ctx.lineTo(2, 10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#4285f4';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(10, 8, 4, -Math.PI / 3, Math.PI / 3);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#999999';
      ctx.beginPath();
      ctx.moveTo(2, 6);
      ctx.lineTo(6, 6);
      ctx.lineTo(10, 2);
      ctx.lineTo(10, 14);
      ctx.lineTo(6, 10);
      ctx.lineTo(2, 10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#999999';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(12, 6);
      ctx.lineTo(15, 10);
      ctx.moveTo(15, 6);
      ctx.lineTo(12, 10);
      ctx.stroke();
    }

    return ctx.getImageData(0, 0, 16, 16);
  } catch (e) {
    console.error('Icon generation failed:', e);
    return null;
  }
}

/**
 * 拡張機能の状態を更新する
 */
async function updateExtensionState() {
  try {
    const tabs = await browserAPI.tabs.query({ audible: true });
    const count = tabs.length;
    const isAudible = count > 0;

    const imageData = await createIconImageData(isAudible);
    if (imageData) {
      await browserAPI.action.setIcon({ imageData }).catch(() => {});
    }

    if (isAudible) {
      await browserAPI.action.setBadgeText({ text: count.toString() });
      await browserAPI.action.setBadgeBackgroundColor({ color: '#d32f2f' });
    } else {
      await browserAPI.action.setBadgeText({ text: '' });
    }
  } catch (err) {
    console.error('State update failed:', err);
  }
}

// イベントリスナーの登録
browserAPI.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.audible !== undefined) {
    updateExtensionState();
  }
});
browserAPI.tabs.onRemoved.addListener(updateExtensionState);
browserAPI.tabs.onActivated.addListener(updateExtensionState);
browserAPI.runtime.onInstalled.addListener(updateExtensionState);
browserAPI.runtime.onStartup.addListener(updateExtensionState);