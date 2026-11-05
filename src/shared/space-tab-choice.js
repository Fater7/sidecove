/**
 * Which tab a space switch should leave on screen, shared by the side panel and the service
 * worker so the click and the shortcut agree. Pure: no DOM and no extension globals.
 */

// `ownedTabs` are the space's open tabs in this window. A space with none gets a New Tab, as
// in Arc, so the page of the space you left is never left showing. Nothing is opened while
// one is already on its way for the space (a quick double switch) or the window is closing.
export function chooseTabForSpace({ ownedTabs, lastTabId, newTabPending = false, windowClosing = false }) {
    const tab = ownedTabs.find(t => t.id === lastTabId) || ownedTabs[ownedTabs.length - 1];
    if (tab) return { action: 'show', tabId: tab.id };
    if (newTabPending || windowClosing) return { action: 'none' };
    return { action: 'open' };
}

// Remembers which spaces are still getting their New Tab, so a second switch to the same
// space waits for the first instead of opening another.
export function createNewTabOpener() {
    const pending = new Map();
    return {
        isPending: key => pending.has(key),
        open(key, create) {
            if (pending.has(key)) return pending.get(key);
            const opening = (async () => create())().finally(() => pending.delete(key));
            pending.set(key, opening);
            return opening;
        }
    };
}
