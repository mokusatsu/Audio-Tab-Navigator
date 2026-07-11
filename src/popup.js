(function() {
  const browserAPI = (typeof browser !== 'undefined') ? browser : chrome;
  const activeTabList = document.getElementById('active-tab-list');
  const historyTabList = document.getElementById('history-tab-list');
  const activeEmptyMessage = document.getElementById('active-empty-message');
  const historyEmptyMessage = document.getElementById('history-empty-message');
  const DEFAULT_FAVICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAFElEQVR42mNkIAAY0kwmOMAUmBMAIF8ACp6ghS8AAAAASUVORK5CYII=';

  // Firefoxの現在のテーマを取得して適用
  async function initTheme() {
    if (typeof browser !== 'undefined' && browser.theme && browser.theme.getCurrent) {
      try {
        const theme = await browser.theme.getCurrent();
        if (theme && theme.colors) {
          // popup背景、またはframe（ヘッダー背景）のいずれかが存在すれば、その明暗を判定
          const bg = theme.colors.popup || theme.colors.frame;
          if (bg) {
            const isDark = isColorDark(bg);
            if (isDark) {
              document.documentElement.classList.add('force-dark');
              document.documentElement.classList.remove('force-light');
            } else {
              document.documentElement.classList.add('force-light');
              document.documentElement.classList.remove('force-dark');
            }
            return;
          }
        }
      } catch (e) {
        console.error('Failed to get Firefox theme colors:', e);
      }
    }
  }

  // 色の明暗判定ヘルパー (HSP相対輝度)
  function isColorDark(colorStr) {
    let r = 255, g = 255, b = 255;
    colorStr = colorStr.trim();
    
    if (colorStr.startsWith('#')) {
      const hex = colorStr.substring(1);
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
      }
    } else {
      const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        r = parseInt(match[1], 10);
        g = parseInt(match[2], 10);
        b = parseInt(match[3], 10);
      }
    }
    
    const hsp = Math.sqrt(
      0.299 * (r * r) +
      0.587 * (g * g) +
      0.114 * (b * b)
    );
    return hsp < 135;
  }

  // 即座にテーマ判定を実行
  initTheme();

  // HTML要素に翻訳を適用する
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const message = browserAPI.i18n.getMessage(key);
      if (message) {
        element.textContent = message;
      }
    });
  }

  function formatRelativeTime(timestamp) {
    const diffMs = Date.now() - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 10) return browserAPI.i18n.getMessage('timeJustNow');
    if (diffSec < 60) return browserAPI.i18n.getMessage('timeSecondsAgo', [diffSec.toString()]);
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return browserAPI.i18n.getMessage('timeMinutesAgo', [diffMin.toString()]);
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return browserAPI.i18n.getMessage('timeHoursAgo', [diffHr.toString()]);
    return browserAPI.i18n.getMessage('timeDaysAgo', [Math.floor(diffHr / 24).toString()]);
  }

  function createTabItemElement(tab, isHistory, historyTimestamp) {
    const li = document.createElement('li');
    li.className = 'tab-item';

    const icon = document.createElement('img');
    icon.className = 'favicon';
    icon.src = tab.favIconUrl || DEFAULT_FAVICON;
    icon.onerror = () => { icon.src = DEFAULT_FAVICON; };

    const info = document.createElement('div');
    info.className = 'tab-info';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-title';
    titleSpan.textContent = tab.title || '無題のタブ';
    info.appendChild(titleSpan);

    if (isHistory && historyTimestamp) {
      const timeSpan = document.createElement('span');
      timeSpan.className = 'tab-time';
      timeSpan.textContent = formatRelativeTime(historyTimestamp);
      info.appendChild(timeSpan);
    }

    li.appendChild(icon);
    li.appendChild(info);

    if (!isHistory) {
      // 再生中タブ用の音波アニメーション
      const soundWave = document.createElement('div');
      soundWave.className = 'sound-wave';
      soundWave.appendChild(document.createElement('span'));
      soundWave.appendChild(document.createElement('span'));
      soundWave.appendChild(document.createElement('span'));
      li.appendChild(soundWave);
    }

    const actions = document.createElement('div');
    actions.className = 'actions';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-close';
    closeBtn.textContent = '✕';
    closeBtn.title = browserAPI.i18n.getMessage('closeTabAriaLabel');
    closeBtn.setAttribute('aria-label', browserAPI.i18n.getMessage('closeTabAriaLabel'));

    closeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await browserAPI.tabs.remove(tab.id);
        // タブ削除イベントで自動リフレッシュされる
      } catch (err) {
        console.error('Close failed:', err);
      }
    });

    actions.appendChild(closeBtn);
    li.appendChild(actions);

    // タブに移動するイベント
    li.addEventListener('click', async () => {
      try {
        await browserAPI.tabs.update(tab.id, { active: true });
        if (tab.windowId) {
          await browserAPI.windows.update(tab.windowId, { focused: true });
        }
        window.close();
      } catch (err) {
        console.error('Focus failed:', err);
      }
    });

    return li;
  }

  async function refreshTabList() {
    if (!activeTabList || !historyTabList) return;

    try {
      // 1. 再生中タブの取得と描画
      const activeTabs = await browserAPI.tabs.query({ audible: true });
      activeTabList.textContent = '';

      if (activeTabs.length === 0) {
        activeEmptyMessage.classList.remove('hidden');
      } else {
        activeEmptyMessage.classList.add('hidden');
        const activeFragment = document.createDocumentFragment();
        for (const tab of activeTabs) {
          if (typeof tab.id === 'undefined') continue;
          const li = createTabItemElement(tab, false);
          activeFragment.appendChild(li);
        }
        activeTabList.appendChild(activeFragment);
      }

      // 2. 履歴タブの取得と描画
      const response = await browserAPI.runtime.sendMessage({ action: 'getHistory' });
      const historyTabs = (response && response.history) ? response.history : [];
      historyTabList.textContent = '';

      if (historyTabs.length === 0) {
        historyEmptyMessage.classList.remove('hidden');
      } else {
        historyEmptyMessage.classList.add('hidden');
        const historyFragment = document.createDocumentFragment();
        for (const item of historyTabs) {
          // 生存確認は background.js が完全に管理しているため、
          // popup.js 側では tabs.get を行わず、直接描画する（スリープ時の非表示バグを防止）
          const li = createTabItemElement(item, true, item.timestamp);
          historyFragment.appendChild(li);
        }
        historyTabList.appendChild(historyFragment);
      }

      // Chromeでポップアップの高さが自動的に追従しないバグの対策
      // 非同期DOM描画後にサイズ計算を再トリガーする
      setTimeout(() => {
        const scrollHeight = document.documentElement.scrollHeight;
        document.body.style.height = scrollHeight + 'px';
        setTimeout(() => {
          document.body.style.height = '';
        }, 10);
      }, 50);
    } catch (error) {
      console.error('Refresh failed:', error);
    }
  }

  // イベントリスナーの登録
  browserAPI.tabs.onUpdated.addListener((_id, changeInfo) => {
    if (changeInfo.audible !== undefined || changeInfo.title !== undefined) {
      refreshTabList();
    }
  });

  browserAPI.tabs.onRemoved.addListener(refreshTabList);

  document.addEventListener('DOMContentLoaded', () => {
    applyI18n();
    refreshTabList();
  });
})();