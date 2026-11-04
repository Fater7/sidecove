export const sections = ['spaceBookmarks', 'temporaryTabs', 'pinnedTabs'];
export const tabIds = space => sections.flatMap(key => space?.[key] || []);
export const ownerOf = (spaces, tabId) => spaces.find(space => tabIds(space).includes(tabId));

export function updateNativePinSection(space, tab) {
    if (Boolean(tab.pinned) === space.pinnedTabs.includes(tab.id)) return;
    for (const key of sections) space[key] = space[key].filter(id => id !== tab.id);
    space[tab.pinned ? 'pinnedTabs' : 'temporaryTabs'].push(tab.id);
}

// Shared top-bar pins do not select their remembered space when activated.
export function spaceForActivation(spaces, tabId, perSpacePinnedFavorites = false) {
    const space = ownerOf(spaces, tabId);
    return !perSpacePinnedFavorites && space?.pinnedTabs?.includes(tabId) ? undefined : space;
}
