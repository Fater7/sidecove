// A trackpad swipe is a stream of wheel events, including its momentum. Keep the
// stream locked to one switch until its horizontal events have stopped arriving.
export function createTrackpadSwipeHandler(switchSpace, { idleMs = 250, threshold = 25 } = {}) {
    let movement = 0;
    let switched = false;
    let timer;

    return event => {
        if (!event.deltaX || (!movement && Math.abs(event.deltaX) <= Math.abs(event.deltaY))) return;

        event.preventDefault();
        clearTimeout(timer);
        timer = setTimeout(() => {
            movement = 0;
            switched = false;
        }, idleMs);

        if (switched) return;
        movement += event.deltaX;
        if (Math.abs(movement) > threshold) {
            switched = true;
            switchSpace(movement < 0 ? -1 : 1);
        }
    };
}
