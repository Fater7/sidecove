// Where a tab opened from a link goes in a space's stored tab list.
//
// The list is stored in Chrome order (left to right), but the side panel draws it reversed
// when "Show new tabs at the top" is on. A link tab belongs directly below its opener on
// screen, so the position is worked out on screen and converted back. Tabs already opened
// from the same opener stay above it, which keeps several links in opening order.

/**
 * @param {number[]} ids stored list the tab is added to (not changed)
 * @param {number|undefined} openerId tab the link was opened from
 * @param {number} newId the new tab
 * @param {Iterable<number>} siblingIds tabs already opened from the same opener
 * @param {boolean} inverted whether the list is drawn reversed
 * @returns {number[]} the new stored list
 */
export function placeLinkTab(ids, openerId, newId, siblingIds, inverted) {
    const siblings = new Set(siblingIds);
    const screen = inverted ? [...ids].reverse() : [...ids];
    // An opener outside the list (a pinned tab or favourite) puts the run of link tabs at the
    // top of the list; start before the first row then.
    let at = screen.indexOf(openerId) + 1;
    while (siblings.has(screen[at])) at++;
    screen.splice(at, 0, newId);
    return inverted ? screen.reverse() : screen;
}
