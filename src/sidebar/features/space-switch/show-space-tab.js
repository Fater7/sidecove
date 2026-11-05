import { chooseTabForSpace, createNewTabOpener } from '../../../shared/space-tab-choice.js';
import { Logger } from '../../../shared/logger.js';

// After the panel switches to a space, shows that space's last tab, or opens a New Tab in it
// when it has none open in this window. The New Tab closes by itself when you leave it empty
// (the "close new tabs you leave empty" setting), so a space only has one while it is empty.
export function createSpaceTabShower({ getOwnedTabs, activateTab, openNewTab, getActiveSpaceId, windowId }) {
    const opener = createNewTabOpener();
    let windowClosing = false;

    return {
        // Wire to chrome.tabs.onRemoved: closing a window removes its tabs one by one.
        noteTabRemoved(removeInfo) {
            if (removeInfo?.isWindowClosing && removeInfo.windowId === windowId()) windowClosing = true;
        },

        // `openIfEmpty` is for switches the user asked for; creating or deleting a space keeps what is on screen.
        async show(space, { openIfEmpty = false } = {}) {
            const choice = chooseTabForSpace({
                ownedTabs: await getOwnedTabs(space.id),
                lastTabId: space.lastTab,
                newTabPending: opener.isPending(space.id),
                windowClosing
            });
            if (getActiveSpaceId() !== space.id) return;
            if (choice.action === 'show') await activateTab(choice.tabId);
            else if (choice.action === 'open' && openIfEmpty) {
                try {
                    await opener.open(space.id, openNewTab);
                } catch (error) {
                    Logger.warn('Could not open a New Tab in the space:', error);
                }
            }
        }
    };
}
