(function() {
  const browserAPI = (typeof browser !== 'undefined') ? browser : chrome;
  const tabListElement = document.getElementById('tab-list');
  const emptyMessageElement = document.getElementById('empty-message');
  const DEFAULT_FAVICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAFElEQVR42mNkIAAY0kwmOMAUmBMAIF8ACp6ghS8AAAAASUVORK5CYII=';

  async function refreshTabList() {
    if (!tabListElement || !emptyMessageElement) return;

    try {
      const tabs = await browserAPI.tabs.query({ audible: true });
      tabListElement.textContent = '';

      if (tabs.length === 0) {
        emptyMessageElement.classList.remove('hidden');
        return;
      }

      emptyMessageElement.classList.add('hidden');
      const fragment = document.createDocumentFragment();

      for (const tab of tabs) {
        if (typeof tab.id === 'undefined') continue;

        const li = document.createElement('li');
        li.className = 'tab-item';

        const icon = document.createElement('img');
        icon.className = 'favicon';
        icon.src = tab.favIconUrl || DEFAULT_FAVICON;
        icon.onerror = () => { icon.src = DEFAULT_FAVICON; };

        const info = document.createElement('div');
        info.className = 'tab-info';
        info.textContent = tab.title || '無題のタブ';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.textContent = '×';
        closeBtn.title = 'タブを閉じる';
        closeBtn.setAttribute('aria-label', 'タブを閉じる');

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

        closeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await browserAPI.tabs.remove(tab.id);
            await refreshTabList();
          } catch (err) {
            console.error('Close failed:', err);
          }
        });

        li.appendChild(icon);
        li.appendChild(info);
        li.appendChild(closeBtn);
        fragment.appendChild(li);
      }
      tabListElement.appendChild(fragment);
    } catch (error) {
      console.error('Refresh failed:', error);
    }
  }

  browserAPI.tabs.onUpdated.addListener((_id, changeInfo) => {
    if (changeInfo.audible !== undefined || changeInfo.title !== undefined) {
      refreshTabList();
    }
  });

  browserAPI.tabs.onRemoved.addListener(refreshTabList);
  document.addEventListener('DOMContentLoaded', refreshTabList);
})();