import { collectFavoriteUrlKeys } from '../shared/favorite-safety.js';
import { Utils } from '../shared/utils.js';
import { Logger } from '../shared/logger.js';
import { isNewTabPage, isUntouchedPage, shouldCloseEmptyNewTab } from './empty-new-tab.js';

export const EMPTY_TAB_STORAGE_KEY = 'emptyNewTabs'; // storage.session: tab ids end with the browser session.
const RETRY_DELAY_MS = 300;

// Closes a new tab you leave without typing or opening anything. It remembers which tabs began
// as an empty new tab and which tab each window showed last, since the activation event names
// only the tab that was switched to. Only tabs seen opening are tracked: a new tab page that
// was already open when the extension started is left alone.
export function registerCloseEmptyNewTab({ chromeApi = chrome, spaceStore, getSettings = Utils.getSettings } = {}) {
    const untouched = new Set();
    const shown = new Map(); // windowId -> the tab shown there
    const save = () =>
        chromeApi.storage.session
            .set({ [EMPTY_TAB_STORAGE_KEY]: { untouched: [...untouched], shown: [...shown] } })
            .catch(error => Logger.warn('[Empty new tab] Could not save the tracked tabs:', error));

    const ready = (async () => {
        try {
            const stored = (await chromeApi.storage.session.get(EMPTY_TAB_STORAGE_KEY))?.[EMPTY_TAB_STORAGE_KEY];
            for (const id of stored?.untouched || []) untouched.add(id);
            for (const [windowId, tabId] of stored?.shown || []) shown.set(windowId, tabId);
        } catch (error) {
            Logger.warn('[Empty new tab] Could not read the tracked tabs:', error);
        }
        // A window the saved list does not cover (the worker restarted) starts from what it shows now.
        for (const tab of await chromeApi.tabs.query({ active: true })) {
            if (!shown.has(tab.windowId)) shown.set(tab.windowId, tab.id);
        }
    })().catch(error => Logger.warn('[Empty new tab] Could not start tracking:', error));

    async function closeIfEmpty(tabId) {
        const settings = await getSettings();
        if (!settings.closeEmptyNewTabs) return;
        const tab = await chromeApi.tabs.get(tabId);
        const [windowTabs, spaces, bindings, urlKeys] = await Promise.all([
            chromeApi.tabs.query({ windowId: tab.windowId }),
            spaceStore.dispatch({ action: 'get' }),
            Utils.getPinnedTabStates(),
            collectFavoriteUrlKeys(chromeApi)
        ]);
        const close = shouldCloseEmptyNewTab({
            enabled: true,
            tab,
            untouched: untouched.has(tabId),
            windowTabCount: windowTabs.length,
            protectedIds: new Set(spaces.flatMap(space => space.spaceBookmarks)),
            bindings,
            urlKeys
        });
        if (!close) return;
        try {
            await chromeApi.tabs.remove(tabId);
        } catch (error) {
            // Chrome refuses while a tab is being dragged; try again once it has settled.
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            await chromeApi.tabs.remove(tabId).catch(() => {});
            Logger.warn('[Empty new tab] Could not close the tab at once:', error);
        }
    }

    chromeApi.tabs.onCreated.addListener(async tab => {
        await ready;
        if (!isNewTabPage(tab.pendingUrl || tab.url)) return;
        untouched.add(tab.id);
        save();
    });
    chromeApi.tabs.onUpdated.addListener(async (tabId, _changeInfo, tab) => {
        await ready;
        if (!untouched.has(tabId) || isUntouchedPage(tab)) return;
        untouched.delete(tabId);
        save();
    });
    chromeApi.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
        await ready;
        const left = shown.get(windowId);
        shown.set(windowId, tabId);
        save();
        if (left === undefined || left === tabId || !untouched.has(left)) return;
        try {
            await closeIfEmpty(left);
        } catch (error) {
            // The tab may already be gone, which is fine.
            Logger.warn('[Empty new tab] Could not check the tab you left:', error);
        }
    });
    chromeApi.tabs.onRemoved.addListener(async tabId => {
        await ready;
        if (untouched.delete(tabId)) save();
    });
    chromeApi.tabs.onReplaced.addListener(async (added, removed) => {
        await ready;
        if (untouched.delete(removed)) save();
        for (const [windowId, tabId] of shown) if (tabId === removed) shown.set(windowId, added);
    });
    return { ready };
}
