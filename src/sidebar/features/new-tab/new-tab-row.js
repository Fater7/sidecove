// Each space carries its own "+ New Tab" row under the divider, as in Arc. The service
// worker puts the new tab in the selected space, so the row only has to ask for one.
export function wireNewTabRow(spaceElement, chromeApi = chrome) {
    spaceElement.querySelector('.new-tab-btn').addEventListener('click', () => {
        chromeApi.tabs.create({});
    });
}
