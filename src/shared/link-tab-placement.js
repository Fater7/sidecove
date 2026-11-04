// Where a tab opened from a link goes in a space's stored tab list.
//
// The list is stored in Chrome order (left to right), but the side panel draws it reversed
// when "Show new tabs at the top" is on. A link tab belongs directly below its opener on
// screen, so the position is worked out on screen and converted back. Tabs already opened
// from the opener, and tabs opened from those, stay above it, which keeps links in opening order.

const opensFrom = (openers, id, openerId) => {
    // The step limit guards against a cycle in the map.
    for (let o = openers.get(id), step = 0; o !== undefined && step < 100; o = openers.get(o), step++)
        if (o === openerId) return true;
    return false;
};

/**
 * @param {number[]} ids stored list the tab is added to (not changed)
 * @param {number} openerId tab the link was opened from
 * @param {number} newId the new tab
 * @param {Map<number, number>} openers opener of each tab seen so far
 * @param {boolean} inverted whether the list is drawn reversed
 * @returns {number[]} the new stored list
 */
export function placeLinkTab(ids, openerId, newId, openers, inverted) {
    const screen = inverted ? [...ids].reverse() : [...ids];
    // An opener outside the list (a pinned tab or favourite) puts the run of link tabs at the
    // top of the list; start before the first row then.
    let at = screen.indexOf(openerId) + 1;
    while (at < screen.length && opensFrom(openers, screen[at], openerId)) at++;
    screen.splice(at, 0, newId);
    return inverted ? screen.reverse() : screen;
}
