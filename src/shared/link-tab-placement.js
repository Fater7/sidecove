// Where a tab opened from a link goes in a space's stored tab list.
//
// The list is stored in Chrome order (left to right), but the side panel draws it reversed
// when "Show new tabs at the top" is on. A link tab belongs below its opener on screen, so
// the position is worked out on screen and converted back.
//
// This follows Chrome's own model: while you stay on a tab, the links you open from it stack
// beneath it in the order opened, each under the one before (`tailId`). Switching to another
// tab and coming back resets that, and the next link goes directly beneath the tab again.

/**
 * @param {number[]} ids stored list the tab is added to (not changed)
 * @param {number} openerId tab the link was opened from
 * @param {number} newId the new tab
 * @param {number|undefined} tailId the last link opened from the opener since it was last
 *   switched to, if it is still in the list
 * @param {boolean} inverted whether the list is drawn reversed
 * @returns {number[]} the new stored list
 */
export function placeLinkTab(ids, openerId, newId, tailId, inverted) {
    const screen = inverted ? [...ids].reverse() : [...ids];
    // An opener outside the list (a pinned tab or favourite) puts its links at the top of the
    // list: indexOf gives -1, so the first link goes before the first row.
    const after = screen.includes(tailId) ? tailId : openerId;
    screen.splice(screen.indexOf(after) + 1, 0, newId);
    return inverted ? screen.reverse() : screen;
}
