// The live tabs of a space as the list shows them, top to bottom. Tabs hidden inside a
// collapsed folder are left out, so a close never lands on a row the user cannot see.
export function displayedTabIds(spaceId, root = document) {
    const space = root.querySelector(`.space[data-space-id="${spaceId}"]`);
    if (!space) return [];
    const ids = [];
    for (const row of space.querySelectorAll('.tab[data-tab-id]:not(.bookmark-only)')) {
        const id = Number(row.dataset.tabId);
        if (Number.isInteger(id) && !ids.includes(id) && row.getClientRects().length) ids.push(id);
    }
    return ids;
}
