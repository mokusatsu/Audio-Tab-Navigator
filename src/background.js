/**
 * Chrome/Firefox 互換性のための名前空間の解決
 */
const browserAPI = (typeof browser !== 'undefined') ? browser : chrome;

// 履歴管理用のメモリ変数
let audioHistory = [];
// 現在音声再生中のタブIDのセット（音声停止時の検知に使用）
const activeAudibleTabs = new Set();

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

    // activeAudibleTabs の同期
    const currentAudibleIds = new Set(tabs.map(t => t.id));
    for (const id of activeAudibleTabs) {
      if (!currentAudibleIds.has(id)) {
        activeAudibleTabs.delete(id);
      }
    }
    for (const id of currentAudibleIds) {
      activeAudibleTabs.add(id);
    }

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

/**
 * タブの音声再生状態の変化を処理する
 */
async function handleAudibleChange(tabId, audible) {
  try {
    if (audible === true) {
      activeAudibleTabs.add(tabId);
      // 再生中になったため、履歴リストにあれば削除する
      audioHistory = audioHistory.filter(item => item.id !== tabId);
    } else if (audible === false) {
      if (activeAudibleTabs.has(tabId)) {
        activeAudibleTabs.delete(tabId);

        // タブの詳細情報を取得して履歴に追加
        const tab = await browserAPI.tabs.get(tabId);
        if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
          // 重複するURLの古い履歴を削除
          audioHistory = audioHistory.filter(item => item.url !== tab.url);

          // 先頭に新規履歴を追加
          audioHistory.unshift({
            id: tab.id,
            title: tab.title || '無題のタブ',
            url: tab.url,
            favIconUrl: tab.favIconUrl || '',
            timestamp: Date.now()
          });

          // 最大5件に制限
          if (audioHistory.length > 5) {
            audioHistory = audioHistory.slice(0, 5);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error handling audible change:', err);
  }
}

// イベントリスナーの登録
browserAPI.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.audible !== undefined) {
    await handleAudibleChange(tabId, changeInfo.audible);
    updateExtensionState();
  } else {
    // タイトルやURL、ファビコンが更新された場合、履歴内の情報も更新する
    const historyItemIndex = audioHistory.findIndex(item => item.id === tabId);
    if (historyItemIndex !== -1) {
      try {
        const tab = await browserAPI.tabs.get(tabId);
        if (tab) {
          audioHistory[historyItemIndex].title = tab.title || audioHistory[historyItemIndex].title;
          audioHistory[historyItemIndex].url = tab.url || audioHistory[historyItemIndex].url;
          audioHistory[historyItemIndex].favIconUrl = tab.favIconUrl || audioHistory[historyItemIndex].favIconUrl;
        }
      } catch (err) {
        console.error('Failed to update history item on tab update:', err);
      }
    }
  }
});

// タブが閉じられたときの処理
browserAPI.tabs.onRemoved.addListener((tabId) => {
  activeAudibleTabs.delete(tabId);
  // 閉じられたタブは履歴からも即座に削除する
  audioHistory = audioHistory.filter(item => item.id !== tabId);
  updateExtensionState();
});

browserAPI.tabs.onActivated.addListener(updateExtensionState);

browserAPI.runtime.onInstalled.addListener(updateExtensionState);
browserAPI.runtime.onStartup.addListener(updateExtensionState);

// ポップアップからの履歴要求メッセージの処理
browserAPI.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'getHistory') {
    sendResponse({ history: audioHistory });
  }
  return true; // 非同期のレスポンスを有効にする
});