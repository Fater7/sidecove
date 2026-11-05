// Chrome's own new tab page. about:blank is left out on purpose: it is a page a site or the
// user can leave behind, not an untouched Cmd+T.
const NEW_TAB_PAGE = /^chrome:\/\/(newtab|new-tab-page)\/?$/;
export const isNewTabPage = url => NEW_TAB_PAGE.test(url || '');

// Whether the tab shows, or is still loading, nothing but the new tab page. A tab with no URL
// yet counts: a new tab has none until its page commits.
export function isUntouchedPage(tab) {
    return (!tab.url || isNewTabPage(tab.url)) && (!tab.pendingUrl || isNewTabPage(tab.pendingUrl));
}
