import { ownerOf } from '../shared/space-store.js';
import { Utils } from '../shared/utils.js';
import { Logger } from '../shared/logger.js';

export const DUPLICATE_TAB_ALARM = 'mergeDuplicateTabs';
const FIRST_SEEN_KEY = 'duplicateTabsFirstSeen';
const CHECK_MINUTES = 5;

// Only ordinary pages are candidates. Keep active, playing, pinned and favorite tabs even
// when another tab has the same address. Never treat a missing activity time as old.
export function findDuplicateToClose({ tabs, spaces, protectedIds, hidden = new Set(), firstSeen, now, idleMinutes }) {
    const groups = new Map();
    for (const tab of tabs) {
        const space = ownerOf(spaces, tab.id);
        if (!space || hidden.has(tab.id) || !tab.url || !/^(https?:|file:)/i.test(tab.url) || tab.pendingUrl) continue;
        const key = JSON.stringify([tab.windowId, space.id, tab.url]);
        const group = groups.get(key) || [];
        group.push(tab);
        groups.set(key, group);
    }
    for (const group of groups.values()) {
        if (group.length < 2) continue;
        const eligible = group.filter(tab => {
            const lastUsed = tab.lastAccessed > 0 ? tab.lastAccessed : firstSeen[tab.id];
            return (
                !tab.active &&
                !tab.highlighted &&
                !tab.audible &&
                !tab.pinned &&
                !protectedIds.has(tab.id) &&
                Number.isFinite(lastUsed) &&
                now - lastUsed >= idleMinutes * 60_000
            );
        });
        // Close the least recently used first; at least one copy always remains.
        eligible.sort((a, b) => (a.lastAccessed || firstSeen[a.id]) - (b.lastAccessed || firstSeen[b.id]));
        if (eligible.length) return eligible[0].id;
    }
    return null;
}

export function registerDuplicateTabMerge({ chromeApi = chrome, spaceStore, getSettings = Utils.getSettings } = {}) {
    let running = false;
    async function configureAlarm() {
        try {
            const { mergeDuplicateTabsEnabled } = await getSettings();
            if (!mergeDuplicateTabsEnabled) await chromeApi.alarms.clear(DUPLICATE_TAB_ALARM);
            else if (!(await chromeApi.alarms.get(DUPLICATE_TAB_ALARM))) {
                await chromeApi.alarms.create(DUPLICATE_TAB_ALARM, { periodInMinutes: CHECK_MINUTES });
            }
        } catch (error) {
            Logger.warn('[Duplicate tabs] Could not configure the alarm:', error);
        }
    }

    async function checkDuplicates() {
        if (running) return;
        running = true;
        try {
            while (true) {
                const settings = await getSettings();
                const idleMinutes = Number(settings.mergeDuplicateTabsIdleMinutes);
                if (!settings.mergeDuplicateTabsEnabled || !Number.isFinite(idleMinutes) || idleMinutes < 1) return;
                const [tabs, state, bindings, session] = await Promise.all([
                    chromeApi.tabs.query({}),
                    spaceStore.run(() => ({
                        spaces: structuredClone(spaceStore.spaces),
                        hidden: [...spaceStore.hidden]
                    })),
                    Utils.getPinnedTabStates(),
                    chromeApi.storage.session.get([FIRST_SEEN_KEY, 'favoriteOpenTabs'])
                ]);
                const now = Date.now();
                const firstSeen = session[FIRST_SEEN_KEY] || {};
                const present = new Set(tabs.map(tab => String(tab.id)));
                for (const id of Object.keys(firstSeen)) if (!present.has(id)) delete firstSeen[id];
                for (const tab of tabs) if (!(tab.id in firstSeen)) firstSeen[tab.id] = now;
                await chromeApi.storage.session.set({ [FIRST_SEEN_KEY]: firstSeen });
                const protectedIds = new Set([
                    ...state.hidden,
                    ...state.spaces.flatMap(space => [...space.spaceBookmarks, ...space.pinnedTabs]),
                    ...Object.keys(bindings)
                        .filter(id => bindings[id]?.bookmarkId)
                        .map(Number),
                    ...Object.values(session.favoriteOpenTabs || {})
                ]);
                const id = findDuplicateToClose({
                    tabs,
                    spaces: state.spaces,
                    protectedIds,
                    hidden: new Set(state.hidden),
                    firstSeen,
                    now,
                    idleMinutes
                });
                if (id === null) return;
                // The other copy, membership, or a protection can change while we read storage.
                const [latestTabs, latestState, latestBindings, latestSession, latestSettings] = await Promise.all([
                    chromeApi.tabs.query({}),
                    spaceStore.run(() => ({
                        spaces: structuredClone(spaceStore.spaces),
                        hidden: [...spaceStore.hidden]
                    })),
                    Utils.getPinnedTabStates(),
                    chromeApi.storage.session.get('favoriteOpenTabs'),
                    getSettings()
                ]);
                if (
                    !latestSettings.mergeDuplicateTabsEnabled ||
                    latestSettings.mergeDuplicateTabsIdleMinutes !== settings.mergeDuplicateTabsIdleMinutes
                )
                    return;
                const latestProtectedIds = new Set([
                    ...latestState.spaces.flatMap(space => [...space.spaceBookmarks, ...space.pinnedTabs]),
                    ...Object.keys(latestBindings)
                        .filter(key => latestBindings[key]?.bookmarkId)
                        .map(Number),
                    ...Object.values(latestSession.favoriteOpenTabs || {})
                ]);
                if (
                    findDuplicateToClose({
                        tabs: latestTabs,
                        spaces: latestState.spaces,
                        protectedIds: latestProtectedIds,
                        hidden: new Set(latestState.hidden),
                        firstSeen,
                        now: Date.now(),
                        idleMinutes
                    }) !== id
                )
                    return;
                await chromeApi.tabs.remove(id);
            }
        } catch (error) {
            Logger.warn('[Duplicate tabs] Could not finish checking:', error);
        } finally {
            running = false;
        }
    }

    chromeApi.alarms.onAlarm.addListener(alarm => {
        if (alarm.name === DUPLICATE_TAB_ALARM) return checkDuplicates();
    });
    chromeApi.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.mergeDuplicateTabsEnabled) configureAlarm();
    });
    configureAlarm();
    return { checkDuplicates, configureAlarm };
}
