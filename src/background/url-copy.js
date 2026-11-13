/**
 * Copy the last-focused tab URL from the MV3 service worker.
 *
 * Clipboard APIs are unavailable in a service worker, so the copy goes through
 * an offscreen document. An open sidebar is the fallback when that fails.
 */
// Serialized by chrome.scripting and run only in the tab where the shortcut was pressed.
function showPageCopyToast() {
    const document = globalThis.document;
    document.getElementById('faterside-copy-toast')?.remove();
    const toast = document.createElement('div');
    toast.id = 'faterside-copy-toast';
    toast.setAttribute('popover', 'manual');
    const shadow = toast.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
        :host {
            all: initial; position: fixed; inset: 24px auto auto 50%; margin: 0;
            transform: translateX(-50%); border: 0; padding: 8px 16px;
            border-radius: 20px; background: #000; color: #fff;
            font: 500 14px/1.4 system-ui, sans-serif; text-align: center;
            box-shadow: 0 4px 12px rgba(0, 0, 0, .15); pointer-events: none;
            max-width: calc(100vw - 64px); z-index: 2147483647;
        }
        @media (prefers-color-scheme: dark) {
            :host { background: #fff; color: #333; }
        }
    `;
    const message = document.createElement('span');
    message.textContent = 'Copied current URL';
    shadow.append(style, message);
    document.documentElement.append(toast);
    toast.showPopover();
    document.ariaNotify?.('Copied current URL');
    setTimeout(() => toast.remove(), 1000);
}

async function showCopySuccess(chromeApi, tabId, logger) {
    try {
        await chromeApi.scripting.executeScript({ target: { tabId }, func: showPageCopyToast });
    } catch (error) {
        logger.log?.('[URLCopy] Page toast unavailable, notifying sidebar:', error);
        try {
            await chromeApi.runtime.sendMessage({ action: 'urlCopySuccess' });
        } catch {
            // The sidebar may be closed, especially on restricted Chrome pages.
        }
    }
}

export async function copyCurrentTabUrlWithFallback({ chromeApi = globalThis.chrome, logger = console } = {}) {
    try {
        const [tab] = await chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab?.id || !tab.url) {
            logger.error?.('[URLCopy] No active tab found');
            return false;
        }

        try {
            if (chromeApi.offscreen?.createDocument) {
                const offscreenUrl = chromeApi.runtime.getURL('offscreen.html');
                const contexts = await chromeApi.runtime.getContexts?.({
                    contextTypes: ['OFFSCREEN_DOCUMENT'],
                    documentUrls: [offscreenUrl]
                });
                if (!contexts?.length) {
                    await chromeApi.offscreen.createDocument({
                        url: 'offscreen.html',
                        reasons: ['CLIPBOARD'],
                        justification: 'Copy the current tab URL from a keyboard shortcut.'
                    });
                }
                const response = await chromeApi.runtime.sendMessage({
                    target: 'offscreen',
                    type: 'copyToClipboard',
                    text: tab.url
                });
                if (response?.success !== true) throw new Error(response?.error || 'Offscreen clipboard copy failed');
                await chromeApi.offscreen.closeDocument?.();
                await showCopySuccess(chromeApi, tab.id, logger);
                return true;
            }
        } catch (offscreenError) {
            logger.log?.('[URLCopy] Offscreen clipboard failed, trying the sidebar:', offscreenError);
        }

        try {
            const response = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Sidebar timeout')), 1000);
                chromeApi.runtime.sendMessage({ command: 'copyCurrentUrl', url: tab.url }, result => {
                    clearTimeout(timeout);
                    if (chromeApi.runtime.lastError) reject(chromeApi.runtime.lastError);
                    else resolve(result);
                });
            });
            if (response?.success !== true) return false;
            await showCopySuccess(chromeApi, tab.id, logger);
            return true;
        } catch (sidebarError) {
            logger.error?.('[URLCopy] Both the offscreen document and the sidebar failed:', sidebarError);
            return false;
        }
    } catch (error) {
        logger.error?.('[URLCopy] Failed to copy URL:', error);
        return false;
    }
}
