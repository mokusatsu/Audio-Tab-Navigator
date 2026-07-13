(function() {
  const browserAPI = (typeof browser !== 'undefined') ? browser : chrome;
  const activeTabList = document.getElementById('active-tab-list');
  const historyTabList = document.getElementById('history-tab-list');
  const activeEmptyMessage = document.getElementById('active-empty-message');
  const historyEmptyMessage = document.getElementById('history-empty-message');
  const DEFAULT_FAVICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAFElEQVR42mNkIAAY0kwmOMAUmBMAIF8ACp6ghS8AAAAASUVORK5CYII=';

  const muteAllButton = document.getElementById('mute-all-button');
  const statusMessage = document.getElementById('status-message');
  const shortcutSettingsButton = document.getElementById('shortcut-settings-button');
  const shortcutStatusText = document.getElementById('shortcut-status-text');
  const shortcutButtonText = document.getElementById('shortcut-button-text');
  const shortcutWarningArea = document.getElementById('shortcut-warning-area');
  const shortcutInstructionsPanel = document.getElementById('shortcut-instructions-panel');

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

  function getTabDisplayTitle(tab) {
    return tab.title || browserAPI.i18n.getMessage('untitledTab');
  }

  function captureFocusToken() {
    const element = document.activeElement;
    if (!element || !element.dataset) {
      return null;
    }
    const { tabId, action } = element.dataset;
    if (!tabId || !action) {
      return null;
    }
    return { tabId, action };
  }

  function restoreFocus(token) {
    if (!token) {
      return;
    }
    const tabId = parseInt(token.tabId, 10);
    if (isNaN(tabId)) return;
    const selector = `[data-tab-id="${tabId}"][data-action="${CSS.escape(token.action)}"]`;
    const target = document.querySelector(selector);
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  }

  function announce(messageKey, interpolations = []) {
    if (!statusMessage) return;
    const text = browserAPI.i18n.getMessage(messageKey, interpolations);
    statusMessage.textContent = '';
    setTimeout(() => {
      statusMessage.textContent = text;
    }, 50);
  }

  function createTabItemElement(tab, isHistory, historyTimestamp) {
    const li = document.createElement('li');
    li.className = 'tab-item';

    const mainButton = document.createElement('button');
    mainButton.type = 'button';
    mainButton.className = 'tab-main';
    mainButton.setAttribute('data-action', 'activate');
    mainButton.setAttribute('data-tab-id', tab.id);

    const icon = document.createElement('img');
    icon.className = 'favicon';
    icon.src = tab.favIconUrl || DEFAULT_FAVICON;
    icon.alt = '';
    icon.setAttribute('draggable', 'false');
    icon.onerror = () => { icon.src = DEFAULT_FAVICON; };
    mainButton.appendChild(icon);

    const info = document.createElement('span');
    info.className = 'tab-info';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-title';
    titleSpan.textContent = getTabDisplayTitle(tab);
    info.appendChild(titleSpan);

    const isMuted = !isHistory && Boolean(tab.mutedInfo && tab.mutedInfo.muted);

    if (isHistory && historyTimestamp) {
      const timeSpan = document.createElement('span');
      timeSpan.className = 'tab-time';
      timeSpan.textContent = formatRelativeTime(historyTimestamp);
      info.appendChild(timeSpan);
    } else if (isMuted) {
      const statusSpan = document.createElement('span');
      statusSpan.className = 'tab-status';
      statusSpan.textContent = browserAPI.i18n.getMessage('mutedStatus');
      info.appendChild(statusSpan);
    }
    mainButton.appendChild(info);

    if (!isHistory && !isMuted) {
      const soundWave = document.createElement('span');
      soundWave.className = 'sound-wave';
      soundWave.setAttribute('aria-hidden', 'true');
      soundWave.appendChild(document.createElement('span'));
      soundWave.appendChild(document.createElement('span'));
      soundWave.appendChild(document.createElement('span'));
      mainButton.appendChild(soundWave);
    }

    li.appendChild(mainButton);

    const actions = document.createElement('div');
    actions.className = 'actions';

    if (!isHistory) {
      const muteBtn = document.createElement('button');
      muteBtn.type = 'button';
      muteBtn.className = 'btn btn-mute';
      muteBtn.setAttribute('data-action', 'mute');
      muteBtn.setAttribute('data-tab-id', tab.id);
      muteBtn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
      
      const muteIcon = document.createElement('span');
      muteIcon.setAttribute('aria-hidden', 'true');
      muteIcon.textContent = isMuted ? '🔇' : '🔊';
      muteBtn.appendChild(muteIcon);

      const title = getTabDisplayTitle(tab);
      const ariaLabel = browserAPI.i18n.getMessage(
        isMuted ? 'unmuteTabAriaLabel' : 'muteTabAriaLabel',
        [title]
      );
      muteBtn.setAttribute('aria-label', ariaLabel);
      muteBtn.title = ariaLabel;

      muteBtn.addEventListener('click', async () => {
        muteBtn.disabled = true;
        try {
          const latestTab = await browserAPI.tabs.get(tab.id);
          const currentMuted = Boolean(latestTab.mutedInfo && latestTab.mutedInfo.muted);
          const nextMuted = !currentMuted;
          await browserAPI.tabs.update(tab.id, { muted: nextMuted });
          
          const newTitle = getTabDisplayTitle(latestTab);
          announce(
            nextMuted ? 'tabMutedAnnouncement' : 'tabUnmutedAnnouncement',
            [newTitle]
          );
          refreshTabList();
        } catch (err) {
          console.error('Mute toggle failed:', err);
          muteBtn.disabled = false;
          announce('operationFailed');
          refreshTabList();
        }
      });
      actions.appendChild(muteBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-close';
    closeBtn.setAttribute('data-action', 'close');
    closeBtn.setAttribute('data-tab-id', tab.id);
    
    const closeIcon = document.createElement('span');
    closeIcon.setAttribute('aria-hidden', 'true');
    closeIcon.textContent = '✕';
    closeBtn.appendChild(closeIcon);

    closeBtn.title = browserAPI.i18n.getMessage('closeTabAriaLabel');
    closeBtn.setAttribute('aria-label', browserAPI.i18n.getMessage('closeTabAriaLabel'));

    closeBtn.addEventListener('click', async () => {
      try {
        await browserAPI.tabs.remove(tab.id);
      } catch (err) {
        console.error('Close failed:', err);
        announce('operationFailed');
      }
    });

    actions.appendChild(closeBtn);
    li.appendChild(actions);

    mainButton.addEventListener('click', async () => {
      try {
        await browserAPI.tabs.update(tab.id, { active: true });
        if (typeof tab.windowId === 'number') {
          await browserAPI.windows.update(tab.windowId, { focused: true });
        }
        window.close();
      } catch (error) {
        console.error('Focus failed:', error);
        announce('operationFailed');
      }
    });

    return li;
  }

  async function refreshTabList() {
    if (!activeTabList || !historyTabList) return;

    const focusToken = captureFocusToken();

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
          const li = createTabItemElement(item, true, item.timestamp);
          historyFragment.appendChild(li);
        }
        historyTabList.appendChild(historyFragment);
      }

      // 3. 全ミュートボタンの有効／無効を更新
      if (muteAllButton) {
        const hasUnmutedAudibleTab = activeTabs.some(
          tab => !Boolean(tab.mutedInfo && tab.mutedInfo.muted)
        );
        muteAllButton.disabled = !hasUnmutedAudibleTab || activeTabs.length === 0;
      }

      // 4. フォーカスを復元
      if (focusToken) {
        restoreFocus(focusToken);
      }

      // Chromeでポップアップの高さが自動的に追従しないバグの対策
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

  let refreshTimeout = null;
  function scheduleRefresh() {
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }
    refreshTimeout = setTimeout(() => {
      refreshTabList();
    }, 50);
  }

  // イベントリスナーの登録
  browserAPI.tabs.onUpdated.addListener((_id, changeInfo) => {
    if (
      changeInfo.audible !== undefined ||
      changeInfo.title !== undefined ||
      changeInfo.mutedInfo !== undefined
    ) {
      scheduleRefresh();
    }
  });

  browserAPI.tabs.onRemoved.addListener(scheduleRefresh);

  if (muteAllButton) {
    muteAllButton.addEventListener('click', async () => {
      muteAllButton.disabled = true;
      try {
        const activeTabs = await browserAPI.tabs.query({ audible: true });
        const targets = activeTabs.filter(tab => typeof tab.id === 'number' && !Boolean(tab.mutedInfo && tab.mutedInfo.muted));
        if (targets.length === 0) {
          refreshTabList();
          return;
        }

        const results = await Promise.allSettled(
          targets.map(tab => browserAPI.tabs.update(tab.id, { muted: true }))
        );

        const failedCount = results.filter(r => r.status === 'rejected').length;
        if (failedCount === 0) {
          announce('muteAllComplete');
        } else {
          announce('muteAllPartialFailure');
        }
        refreshTabList();
      } catch (error) {
        console.error('Mute all failed:', error);
        announce('muteAllPartialFailure');
        refreshTabList();
      }
    });
  }

  async function refreshShortcutDisplay() {
    try {
      const commands = await browserAPI.commands.getAll();
      const cycleCommand = commands.find(c => c.name === 'cycle-audible-tabs');
      const isAssigned = Boolean(cycleCommand && cycleCommand.shortcut);

      if (shortcutStatusText) {
        if (isAssigned) {
          shortcutStatusText.textContent = browserAPI.i18n.getMessage('shortcutLabel', [cycleCommand.shortcut]);
        } else {
          shortcutStatusText.textContent = browserAPI.i18n.getMessage('shortcutUnassigned');
        }
      }

      if (shortcutButtonText) {
        if (isAssigned) {
          shortcutButtonText.textContent = browserAPI.i18n.getMessage('changeShortcut');
        } else {
          shortcutButtonText.textContent = browserAPI.i18n.getMessage('configureShortcut');
        }
      }

      // Check storage warning flag
      const storage = await new Promise(resolve => {
        browserAPI.storage.local.get(['shortcutNeedsAttention'], result => {
          resolve(result || {});
        });
      });

      if (shortcutWarningArea) {
        if (storage.shortcutNeedsAttention && !isAssigned) {
          shortcutWarningArea.classList.remove('hidden');
        } else {
          shortcutWarningArea.classList.add('hidden');
        }
      }
    } catch (err) {
      console.error('Failed to refresh shortcut display:', err);
    }
  }

  async function openShortcutSettings() {
    if (browserAPI.commands && typeof browserAPI.commands.openShortcutSettings === 'function') {
      try {
        await browserAPI.commands.openShortcutSettings();
        return true;
      } catch (e) {
        console.error('API openShortcutSettings failed:', e);
      }
    }
    return false;
  }

  if (shortcutSettingsButton) {
    shortcutSettingsButton.addEventListener('click', async () => {
      try {
        await new Promise((resolve) => {
          browserAPI.storage.local.remove('shortcutNeedsAttention', () => {
            resolve();
          });
        });
        if (shortcutWarningArea) {
          shortcutWarningArea.classList.add('hidden');
        }
      } catch (err) {
        console.error('Failed to clear shortcut attention flag:', err);
      }

      const opened = await openShortcutSettings();
      if (!opened) {
        if (shortcutInstructionsPanel) {
          shortcutInstructionsPanel.classList.remove('hidden');
        }
        announce('shortcutInstructionsChrome');
      } else {
        if (shortcutInstructionsPanel) {
          shortcutInstructionsPanel.classList.add('hidden');
        }
      }
    });
  }

  window.addEventListener('focus', refreshShortcutDisplay);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshShortcutDisplay();
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    applyI18n();
    refreshTabList();
    refreshShortcutDisplay();
  });
})();