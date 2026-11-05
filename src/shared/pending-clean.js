// Clean All hides the tabs it clears for the length of the Undo toast, then closes them. The
// sidebar and the service worker agree on this message and on how long the toast lasts.
export const PENDING_CLEAN_MESSAGE = 'pendingClean';
export const UNDO_WINDOW_MS = 8000;
// The toast starts a moment after the worker's clock does; the extra time keeps a click on
// Undo in the last instant from finding the tabs already closed.
export const CLOSE_GRACE_MS = 500;

// Puts restored tabs back where they were in the list. Tabs that joined while they were
// hidden go after them.
export function restoreTabOrder(current, original, restoredIds) {
    const restored = new Set(restoredIds);
    const present = new Set(current);
    const placed = original.filter(id => present.has(id) || restored.has(id));
    const joined = current.filter(id => !restored.has(id) && !original.includes(id));
    return [...new Set([...placed, ...joined, ...restoredIds])];
}
