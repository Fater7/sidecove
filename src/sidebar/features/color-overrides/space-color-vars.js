// Points the sidebar's background variables at a space colour's variables. They are
// references, not computed values, so the colours follow a change of the system theme
// or of a Settings override without being set again.
export function setSpaceColorVars(container, colorName) {
    container.style.setProperty('--space-bg-color', `var(--chrome-${colorName}-color, rgba(255, 255, 255, 0.1))`);
    container.style.setProperty(
        '--space-bg-color-dark',
        `var(--chrome-${colorName}-color-dark, rgba(255, 255, 255, 0.1))`
    );
}
