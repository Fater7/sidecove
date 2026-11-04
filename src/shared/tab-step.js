// Next and previous tab in a space, in the order the side panel lists them: favorites in
// bookmark order, then the other tabs, which the panel reverses when new tabs show at the top.
// Pure, so the service worker and the unit tests share it.
export function tabsInDisplayOrder(space, { invertTabOrder = false, openTabIds }) {
    const open = id => openTabIds.has(id);
    const favorites = (space?.spaceBookmarks ?? []).filter(open);
    const others = (space?.temporaryTabs ?? []).filter(id => open(id) && !favorites.includes(id));
    if (invertTabOrder) others.reverse();
    return [...favorites, ...others];
}

// The tab to activate, wrapping at both ends, or null when there is nowhere to go.
export function adjacentTabId(orderedIds, currentId, direction) {
    const index = orderedIds.indexOf(currentId);
    if (index === -1 || orderedIds.length < 2) return null;
    const step = direction === 'next' ? 1 : -1;
    return orderedIds[(index + step + orderedIds.length) % orderedIds.length];
}
