import { isProtectedFavorite } from '../shared/favorite-safety.js';
import { isUntouchedPage } from '../shared/new-tab-page.js';

// Whether the tab the user just left should close. `untouched` says it was opened as an empty
// new tab and has not been anywhere since, which the tab alone cannot tell.
export function shouldCloseEmptyNewTab({ enabled, tab, untouched, windowTabCount, protectedIds, bindings }) {
    // No URL matching: the new tab page is not a favourite's address, and Chrome-scheme URLs
    // all share one key, so one such bookmark would protect every new tab.
    return (
        enabled &&
        untouched &&
        isUntouchedPage(tab) &&
        windowTabCount > 1 &&
        !isProtectedFavorite(tab, protectedIds, bindings, new Set())
    );
}
