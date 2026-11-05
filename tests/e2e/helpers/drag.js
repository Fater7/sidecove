/**
 * Drag and drop is dispatched as DOM events so it works while Chrome focuses other tabs.
 * `handle` is an optional selector inside the source to start the drag from.
 */
export async function dragOnto(page, sourceSelector, targetSelector, { handle = null } = {}) {
    await page.evaluate(
        ({ sourceSelector, targetSelector, handle }) => {
            const source = document.querySelector(sourceSelector);
            const grip = handle ? source.querySelector(handle) : source;
            const target = document.querySelector(targetSelector);
            if (!source || !target) throw new Error(`missing ${!source ? sourceSelector : targetSelector}`);
            const dataTransfer = new DataTransfer();
            const r = target.getBoundingClientRect();
            const point = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
            grip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
            target.dispatchEvent(
                new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer, ...point })
            );
            target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, ...point }));
            grip.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
        },
        { sourceSelector, targetSelector, handle }
    );
}
