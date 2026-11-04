// After the active tab closes, Chrome shows another tab by its own rule, which can be a tab
// of a different space. As in Arc, a close keeps you in your space: show the next tab of that
// space, or the previous one when the closed tab was last, or a New Tab when none is left.

// `order` is the space's tabs as displayed, top to bottom, including the closed one.
export function pickTabAfterClose(order, closedId, isOpen) {
    const index = order.indexOf(closedId);
    if (index < 0) return undefined;
    const after = order.slice(index + 1).find(isOpen);
    if (after !== undefined) return after;
    return order.slice(0, index).reverse().find(isOpen);
}

// Chrome's activation event follows a close within moments; older notes are stale.
const NOTE_LIFETIME_MS = 5000;

export function createCloseFocus({
    getActiveSpaceId,
    ownerOf, // tab id -> id of the space that owns it
    displayedOrder, // space id -> ids of its tabs as displayed
    openTabIds, // ids of the tabs open in this window
    activateTab,
    openNewTab, // opens a New Tab in the active space
    restoreLastTab // undoes the other space's "last tab" being set by Chrome's pick
}) {
    // The sidebar's own record of a closed tab is dropped from its list as the close is handled,
    // and that can happen before or after Chrome's activation event arrives.
    const closed = new Map();

    return {
        noteRemoval(tabId) {
            const spaceId = ownerOf(tabId);
            if (!spaceId) return;
            const now = Date.now();
            for (const [id, note] of closed) if (now - note.at > NOTE_LIFETIME_MS) closed.delete(id);
            closed.set(tabId, { spaceId, order: displayedOrder(spaceId), at: now });
        },

        // True when Chrome activated a tab of another space only because the tab that was active
        // in this space closed. The caller then leaves the space alone; we choose the tab here.
        async stayAfterClose({ previousTabId, activatedTabId, activatedSpaceId }) {
            const spaceId = getActiveSpaceId();
            if (previousTabId == null || !spaceId || activatedSpaceId === spaceId) return false;
            const note = closed.get(previousTabId);
            if ((note ? note.spaceId : ownerOf(previousTabId)) !== spaceId) return false;
            const open = new Set(await openTabIds());
            if (!note && open.has(previousTabId)) return false; // still open: the user went there on purpose
            const order = note ? note.order : displayedOrder(spaceId);
            if (!order.includes(previousTabId)) return false;
            const target = pickTabAfterClose(order, previousTabId, id => open.has(id));
            try {
                if (target === undefined) await openNewTab();
                else await activateTab(target);
            } catch {
                return false;
            }
            await restoreLastTab(activatedSpaceId, activatedTabId);
            return true;
        }
    };
}
