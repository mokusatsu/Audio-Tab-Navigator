/**
 * Chrome/Firefox 互換性のための名前空間の解決
 */
const browserAPI = (typeof browser !== 'undefined') ? browser : chrome;

/**
 * タブの表示用タイトルを取得（ローカライズ対応）
 */
function getTabDisplayTitle(tab) {
  return tab.title || browserAPI.i18n.getMessage('untitledTab');
}

// 現在音声再生中のタブIDのセット（音声停止時の検知に使用）
const activeAudibleTabs = new Set();

/**
 * 履歴をローカルストレージから取得するヘルパー関数
 */
async function getAudioHistory() {
  return new Promise((resolve) => {
    browserAPI.storage.local.get(['audioHistory'], (result) => {
      resolve(result.audioHistory || []);
    });
  });
}

/**
 * 履歴をローカルストレージに保存するヘルパー関数
 */
async function saveAudioHistory(history) {
  return new Promise((resolve) => {
    browserAPI.storage.local.set({ audioHistory: history }, () => {
      resolve();
    });
  });
}

/**
 * 履歴データをクリアする（ブラウザ起動時およびリロード時用）
 */
async function clearHistory() {
  try {
    await saveAudioHistory([]);
  } catch (e) {
    console.error('Failed to clear audio history:', e);
  }
}

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
    let history = await getAudioHistory();
    if (audible === true) {
      activeAudibleTabs.add(tabId);
      // 再生中になったため、履歴リストにあれば削除する
      const filtered = history.filter(item => item.id !== tabId);
      if (filtered.length !== history.length) {
        await saveAudioHistory(filtered);
      }
    } else if (audible === false) {
      if (activeAudibleTabs.has(tabId)) {
        activeAudibleTabs.delete(tabId);

        // タブの詳細情報を取得して履歴に追加
        const tab = await browserAPI.tabs.get(tabId);
        if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
          // 重複するURLの古い履歴を削除
          history = history.filter(item => item.url !== tab.url);

          // 先頭に新規履歴を追加
          history.unshift({
            id: tab.id,
            title: getTabDisplayTitle(tab),
            url: tab.url,
            favIconUrl: tab.favIconUrl || '',
            timestamp: Date.now()
          });

          // 最大5件に制限
          if (history.length > 5) {
            history = history.slice(0, 5);
          }
          await saveAudioHistory(history);
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
    try {
      let history = await getAudioHistory();
      const historyItemIndex = history.findIndex(item => item.id === tabId);
      if (historyItemIndex !== -1) {
        const tab = await browserAPI.tabs.get(tabId);
        if (tab) {
          history[historyItemIndex].title = tab.title || history[historyItemIndex].title;
          history[historyItemIndex].url = tab.url || history[historyItemIndex].url;
          history[historyItemIndex].favIconUrl = tab.favIconUrl || history[historyItemIndex].favIconUrl;
          await saveAudioHistory(history);
        }
      }
    } catch (err) {
      console.error('Failed to update history item on tab update:', err);
    }
  }
});

// タブが閉じられたときの処理
browserAPI.tabs.onRemoved.addListener(async (tabId) => {
  activeAudibleTabs.delete(tabId);
  // 閉じられたタブは履歴からも即座に削除する
  try {
    let history = await getAudioHistory();
    const filtered = history.filter(item => item.id !== tabId);
    await saveAudioHistory(filtered);
  } catch (e) {
    console.error('Failed to remove history item on tab remove:', e);
  }
  updateExtensionState();
});

browserAPI.tabs.onActivated.addListener(updateExtensionState);

browserAPI.runtime.onInstalled.addListener(async (details) => {
  await clearHistory();
  updateExtensionState();

  if (details && details.reason === 'install') {
    try {
      const commands = await browserAPI.commands.getAll();
      const cycleCommand = commands.find(c => c.name === 'cycle-audible-tabs');
      if (!cycleCommand || !cycleCommand.shortcut) {
        await browserAPI.storage.local.set({ shortcutNeedsAttention: true });
      }
    } catch (e) {
      console.error('Failed to check shortcut conflict on install:', e);
    }
  }
});

browserAPI.runtime.onStartup.addListener(async () => {
  await clearHistory();
  updateExtensionState();
});

// ポップアップからの履歴要求メッセージの処理
browserAPI.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'getHistory') {
    getAudioHistory().then(async (history) => {
      const cleanHistory = [];
      for (const item of history) {
        try {
          // tabs.get が成功すれば生存しているとみなす
          const tab = await browserAPI.tabs.get(item.id);
          if (tab) {
            cleanHistory.push(item);
          }
        } catch (e) {
          // tabs.get が失敗した場合は閉じられたとみなして除外する
        }
      }

      // もし無効なタブが除外されていたら、ストレージを更新
      if (cleanHistory.length !== history.length) {
        try {
          await saveAudioHistory(cleanHistory);
        } catch (err) {
          console.error('Failed to save cleaned history:', err);
        }
      }

      sendResponse({ history: cleanHistory });
    });
  }
  return true; // 非同期のレスポンスを有効にする
});

/**
 * 音声再生中タブを順番に巡回する
 */
async function cycleAudibleTabs() {
  const audibleTabs = await browserAPI.tabs.query({ audible: true });
  const targets = audibleTabs.filter(tab => typeof tab.id === 'number');
  if (targets.length === 0) {
    return;
  }

  // 1. windowId の昇順、2. 同一ウィンドウ内では index の昇順でソート
  targets.sort((a, b) => {
    if (a.windowId !== b.windowId) {
      return a.windowId - b.windowId;
    }
    return a.index - b.index;
  });

  if (targets.length === 1) {
    const targetTab = targets[0];
    await browserAPI.tabs.update(targetTab.id, { active: true });
    await browserAPI.windows.update(targetTab.windowId, { focused: true });
    return;
  }

  // 最後にフォーカスされていたウィンドウ内のアクティブタブを取得
  let lastFocusedWindowId = null;
  let currentActiveTabId = null;
  try {
    const activeTabs = await browserAPI.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTabs.length > 0) {
      lastFocusedWindowId = activeTabs[0].windowId;
      currentActiveTabId = activeTabs[0].id;
    }
  } catch (e) {
    console.error('Failed to get active tab:', e);
  }

  if (!lastFocusedWindowId) {
    try {
      const win = await browserAPI.windows.getLastFocused();
      if (win) {
        lastFocusedWindowId = win.id;
      }
    } catch (e) {
      console.error('Failed to get last focused window:', e);
    }
  }

  const currentIndex = targets.findIndex(tab => tab.id === currentActiveTabId);
  let targetTab;

  if (currentIndex !== -1) {
    // 現在のアクティブタブが候補内なら、次の候補へ
    const nextIndex = (currentIndex + 1) % targets.length;
    targetTab = targets[nextIndex];
  } else {
    // 現在のアクティブタブが候補外の場合
    // 1. 最後にフォーカスされていたウィンドウ内の最も左にある音声タブ
    const candidateInWindow = targets.find(tab => tab.windowId === lastFocusedWindowId);
    if (candidateInWindow) {
      targetTab = candidateInWindow;
    } else {
      // 2. 該当しなければ並べ替え済み候補の先頭
      targetTab = targets[0];
    }
  }

  if (targetTab) {
    await browserAPI.tabs.update(targetTab.id, { active: true });
    await browserAPI.windows.update(targetTab.windowId, { focused: true });
  }
}

// キーボードショートカットのリスナー登録
browserAPI.commands.onCommand.addListener(async (command) => {
  if (command !== 'cycle-audible-tabs') {
    return;
  }

  try {
    await cycleAudibleTabs();
  } catch (error) {
    console.error('Failed to cycle audible tabs:', error);
  }
});