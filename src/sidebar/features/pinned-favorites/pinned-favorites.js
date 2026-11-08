import { spaceRequest } from '../../../shared/space-client.js';
import { Utils } from '../../../shared/utils.js';
import { Logger } from '../../../shared/logger.js';
import { MOUSE_BUTTON } from '../../../shared/constants.js';
import { readFavoriteBookmarks, removeFavorite, reorderFavorites, saveFavorite } from './favorite-bookmarks.js';

export function createPinnedFavorites({ getWindowId, getActiveSpaceId, clearAllActiveStates, clearSelection }) {
    let generation = 0;
    const refresh = () => updatePinnedFavicons().catch(error => Logger.error('Could not update favorites', error));
    chrome.storage.onChanged.addListener((changes, area) => {
        if (
            (area === 'sync' && changes.perSpacePinnedFavorites) ||
            (area === 'local' && changes.favoriteBookmarkOwners) ||
            (area === 'session' && changes.favoriteOpenTabs)
        )
            refresh();
    });
    for (const event of ['onCreated', 'onRemoved', 'onChanged', 'onMoved'])
        chrome.bookmarks[event].addListener(refresh);
    return updatePinnedFavicons;

    async function updatePinnedFavicons() {
        const currentGeneration = ++generation;
        const [data, spaces, settings, tabs, session] = await Promise.all([
            readFavoriteBookmarks(),
            spaceRequest('get'),
            chrome.storage.sync.get('perSpacePinnedFavorites'),
            chrome.tabs.query({ windowId: getWindowId() }),
            chrome.storage.session.get('favoriteOpenTabs')
        ]);
        if (currentGeneration !== generation) return;
        const container = document.getElementById('pinnedFavicons');
        const owner = spaces.find(space => space.id === getActiveSpaceId())?.bookmarkFolderId;
        const favorites = data.favorites.filter(
            item => !settings.perSpacePinnedFavorites || !data.owners[item.id] || data.owners[item.id] === owner
        );
        const subtitle = container.querySelector('.placeholder-subtitle');
        if (subtitle)
            subtitle.textContent = settings.perSpacePinnedFavorites
                ? 'Favorites keep your most used sites close in this space'
                : 'Favorites keep your most used sites close across all spaces';

        container.querySelectorAll('.pinned-favicon').forEach(element => {
            if (!favorites.some(item => item.id === element.dataset.bookmarkId)) element.remove();
        });
        for (const favorite of favorites) {
            let element = container.querySelector(`[data-bookmark-id="${favorite.id}"]`);
            if (!element) {
                element = document.createElement('div');
                element.className = 'pinned-favicon';
                element.dataset.bookmarkId = favorite.id;
                element.draggable = true;
                const image = document.createElement('img');
                image.onerror = () => {
                    image.src = '/assets/default_icon.png';
                    image.onerror = null;
                };
                element.appendChild(image);
                element.addEventListener('mousedown', async event => {
                    if (event.button !== MOUSE_BUTTON.LEFT) return;
                    const [bookmark] = await chrome.bookmarks.get(element.dataset.bookmarkId);
                    const windowId = getWindowId();
                    const key = `${windowId}:${bookmark.id}`;
                    const { favoriteOpenTabs = {} } = await chrome.storage.session.get('favoriteOpenTabs');
                    const windowTabs = await chrome.tabs.query({ windowId });
                    const open =
                        windowTabs.find(tab => tab.id === favoriteOpenTabs[key]) ||
                        windowTabs.find(tab => tab.url === bookmark.url);
                    clearAllActiveStates();
                    element.classList.add('active');
                    const tab = open
                        ? await chrome.tabs.update(open.id, { active: true })
                        : await chrome.tabs.create({ windowId, url: bookmark.url });
                    favoriteOpenTabs[key] = tab.id;
                    await chrome.storage.session.set({ favoriteOpenTabs });
                });
                element.addEventListener('contextmenu', event => {
                    event.preventDefault();
                    document.getElementById('favorite-context-menu')?.remove();
                    const menu = document.createElement('div');
                    menu.id = 'favorite-context-menu';
                    menu.className = 'context-menu';
                    menu.style.position = 'fixed';
                    menu.style.left = `${event.clientX}px`;
                    menu.style.top = `${event.clientY}px`;
                    const remove = document.createElement('div');
                    remove.className = 'context-menu-item';
                    remove.textContent = 'Remove from Favorites';
                    remove.addEventListener('click', async () => {
                        await removeFavorite(element.dataset.bookmarkId);
                        menu.remove();
                        await updatePinnedFavicons();
                    });
                    menu.appendChild(remove);
                    document.body.appendChild(menu);
                    document.addEventListener('click', () => menu.remove(), { once: true });
                });
                element.addEventListener('dragstart', event => {
                    element.classList.add('dragging');
                    event.dataTransfer?.setData('text/plain', element.dataset.bookmarkId);
                });
                element.addEventListener('dragend', () => element.classList.remove('dragging'));
            }
            const tab =
                tabs.find(item => item.id === session.favoriteOpenTabs?.[`${getWindowId()}:${favorite.id}`]) ||
                tabs.find(item => item.url === favorite.url);
            element.dataset.url = favorite.url;
            if (tab) element.dataset.tabId = String(tab.id);
            else delete element.dataset.tabId;
            element.title = favorite.title || favorite.url;
            element.firstChild.src = Utils.getFaviconUrl(favorite.url, '96');
            element.firstChild.alt = element.title;
            element.classList.toggle('active', Boolean(tab?.active));
            container.appendChild(element);
        }
        const placeholder = container.querySelector('.pinned-placeholder-container');
        if (placeholder) placeholder.style.display = favorites.length ? 'none' : 'block';
        if (container.dataset.dragListenersBound) return;
        container.dataset.dragListenersBound = 'true';
        container.addEventListener('dragover', event => {
            event.preventDefault();
            container.classList.add('drag-over');
        });
        container.addEventListener('dragleave', () => container.classList.remove('drag-over'));
        container.addEventListener('drop', async event => {
            event.preventDefault();
            container.classList.remove('drag-over');
            const dragged = document.querySelector('.dragging');
            if (!dragged) return;
            if (dragged.classList.contains('pinned-favicon')) {
                const target = event.target.closest('.pinned-favicon');
                const ids = [...container.querySelectorAll('.pinned-favicon')].map(item => item.dataset.bookmarkId);
                const sourceIndex = ids.indexOf(dragged.dataset.bookmarkId);
                const targetIndex = target ? ids.indexOf(target.dataset.bookmarkId) : ids.length;
                if (sourceIndex < 0) return;
                ids.splice(sourceIndex, 1);
                ids.splice(
                    Math.max(0, targetIndex - (sourceIndex < targetIndex ? 1 : 0)),
                    0,
                    dragged.dataset.bookmarkId
                );
                // Reorder the full list so a per-space view cannot move or delete hidden favorites.
                const all = (await readFavoriteBookmarks()).favorites.map(item => item.id);
                let visible = 0;
                await reorderFavorites(all.map(id => (ids.includes(id) ? ids[visible++] : id)));
            } else {
                const tab = dragged.dataset.tabId
                    ? await chrome.tabs.get(Number(dragged.dataset.tabId))
                    : { url: dragged.dataset.url, title: dragged.textContent.trim() };
                const space = (await spaceRequest('get')).find(item => item.id === getActiveSpaceId());
                await saveFavorite(tab, space?.bookmarkFolderId);
                clearSelection();
            }
            await updatePinnedFavicons();
        });
    }
}
