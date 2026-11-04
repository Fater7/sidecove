// After the active tab closes, Chrome shows another tab by its own rule, which can be a tab
// of a different space, or a different tab of this one than the list shows next. As in Arc, a
// close keeps you in your space: show the next tab down its list, or the one above when the
// closed tab was last, or a New Tab when none is left.
import { Logger } from '../../../shared/logger.js';

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
    getActiveTabId, // the tab the sidebar last saw activated in this window
    setActiveTabId,
    ownerOf, // tab id -> id of the space that owns it
    displayedOrder, // space id -> ids of its tabs as displayed
    tabExists, // is the tab open in any window
    openTabIds, // ids of the tabs open in this window
    activateTab,
    openNewTab, // opens a New Tab in the active space
    restoreAfterPick // undoes what the service worker recorded for a tab Chrome picked in another space
}) {
    // The sidebar drops a closed tab from its list as the close is handled, which can happen
    // before or after Chrome's activation event arrives, so the list is noted first.
    const closed = new Map();
    // The tab the user last visited in each space; the service worker's record can be overwritten.
    const visited = new Map();
    // Closing several tabs fires several activations; handle them one at a time.
    let queue = Promise.resolve();

    async function handle({ activatedTabId, activatedSpaceId }) {
        const spaceId = getActiveSpaceId();
        const previousTabId = getActiveTabId();
        if (previousTabId == null || !spaceId) return false;
        const note = closed.get(previousTabId);
        if ((note ? note.spaceId : ownerOf(previousTabId)) !== spaceId) return false;
        // A tab that is still open, such as one moved to another window, was not closed.
        if (!note && (await tabExists(previousTabId))) return false;
        const order = note ? note.order : displayedOrder(spaceId);
        if (!order.includes(previousTabId)) return false;
        const open = new Set(await openTabIds());
        const target = pickTabAfterClose(order, previousTabId, id => open.has(id) && !closed.has(id));
        const crossedSpaces = activatedSpaceId !== spaceId;
        // Chrome already picked the tab we would: nothing to change.
        if (!crossedSpaces && target === activatedTabId) return false;
        try {
            if (target === undefined) await openNewTab();
            else await activateTab(target);
        } catch (error) {
            Logger.warn('Could not stay in the space after a tab closed:', error);
            return false;
        }
        setActiveTabId(target ?? null);
        if (crossedSpaces) await restoreAfterPick(activatedSpaceId, activatedTabId, visited.get(activatedSpaceId));
        return true;
    }

    return {
        noteRemoval(tabId) {
            // Only the tab being shown can make Chrome pick another one.
            if (tabId !== getActiveTabId()) return;
            const spaceId = ownerOf(tabId);
            if (!spaceId) return;
            const now = Date.now();
            for (const [id, note] of closed) if (now - note.at > NOTE_LIFETIME_MS) closed.delete(id);
            closed.set(tabId, { spaceId, order: displayedOrder(spaceId), at: now });
        },

        // True when the tab that was active in the shown space closed and Chrome's pick was
        // replaced by ours. The caller then leaves everything as it is.
        stayAfterClose(activation) {
            const run = queue.then(async () => {
                const stayed = await handle(activation);
                // Settled here so the next queued activation sees where the user now is.
                if (!stayed) {
                    setActiveTabId(activation.activatedTabId);
                    visited.set(activation.activatedSpaceId, activation.activatedTabId);
                }
                return stayed;
            });
            queue = run.catch(() => {});
            return run;
        }
    };
}
