document.addEventListener('DOMContentLoaded', () => {
    const shortcuts = {
        windows: [
            { key: 'Ctrl+Shift+Q', description: 'Open Screenshot Analyzer' },
            { key: 'Alt+S', description: 'Quick Analysis' },
            { key: 'Alt+A', description: 'Select Area' },
            { key: 'Right-click', description: 'Context Menu Access' }
        ],
        mac: [
            { key: 'Command+Shift+Q', description: 'Open Screenshot Analyzer' },
            { key: 'Option+S', description: 'Quick Analysis' },
            { key: 'Option+A', description: 'Select Area' },
            { key: 'Right-click/Two-finger click', description: 'Context Menu Access' }
        ]
    };

    // Detect OS
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const currentShortcuts = isMac ? shortcuts.mac : shortcuts.windows;

    // Create shortcut list
    const shortcutList = document.getElementById('shortcut-list');
    currentShortcuts.forEach(shortcut => {
        const li = document.createElement('li');
        li.innerHTML = `<kbd>${shortcut.key}</kbd> - ${shortcut.description}`;
        shortcutList.appendChild(li);
    });
});
