export function updateTabSearchVisibility(visible, clearSearch) {
    document.getElementById('tabSearch').hidden = !visible;
    if (!visible) clearSearch();
}
