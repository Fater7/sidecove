// When Chrome picks a tab of another space after a close and we undo it, the service worker
// has already recorded that tab as the space's last tab and the space as the window's
// current one. Put both back.

// The patch that restores the space's last tab, or null when Chrome's pick was that tab anyway.
// `visitedTabId` is the tab the user last visited there and `savedTabId` the sidebar's saved
// one; either is used only while it is still open. With neither, the space falls back to its
// last tab rather than keeping a tab nobody chose.
export function lastTabPatch(space, { visitedTabId, savedTabId, pickedTabId, isOpen }) {
    if (visitedTabId === pickedTabId) return null;
    const restoreTo = [visitedTabId, savedTabId].find(id => id != null && id !== pickedTabId && isOpen(id)) ?? null;
    return { before: [{ ...space, lastTab: pickedTabId }], after: [{ ...space, lastTab: restoreTo }] };
}

export async function restoreAfterPick({
    spaceRequest,
    space,
    visitedTabId,
    openIds,
    pickedTabId,
    windowId,
    shownSpaceId
}) {
    if (space) {
        const patch = lastTabPatch(space, {
            visitedTabId,
            savedTabId: space.lastTab,
            pickedTabId,
            isOpen: id => openIds.has(id)
        });
        if (patch) await spaceRequest('patch', patch);
    }
    // Chrome's pick also made that space the window's current one.
    await spaceRequest('activate', { windowId, spaceId: shownSpaceId });
}
