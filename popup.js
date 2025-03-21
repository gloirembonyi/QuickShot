document.addEventListener('DOMContentLoaded', () => {
    // Shortcut definitions
    const shortcuts = {
        windows: [
            { key: 'Ctrl+Shift+Q', description: 'Open Screenshot Analyzer' },
            { key: 'Alt+S', description: 'Quick Analysis' },
            { key: 'Alt+A', description: 'Select Area' },
            { key: 'Esc', description: 'Cancel Selection' }
        ],
        mac: [
            { key: 'Command+Shift+Q', description: 'Open Screenshot Analyzer' },
            { key: 'Option+S', description: 'Quick Analysis' },
            { key: 'Option+A', description: 'Select Area' },
            { key: 'Esc', description: 'Cancel Selection' }
        ]
    };

    // DOM elements
    const quickCaptureBtn = document.getElementById('quick-capture');
    const areaCaptureBtn = document.getElementById('area-capture');
    const viewHistoryBtn = document.getElementById('view-history');
    const viewAllHistoryBtn = document.getElementById('view-all-history');
    const historyCountEl = document.getElementById('history-count');
    const recentHistoryContainer = document.getElementById('recent-history');
    const shortcutListContainer = document.getElementById('shortcut-list');
    const openSettingsBtn = document.getElementById('open-settings');
    const openHelpBtn = document.getElementById('open-help');
    const privacyPolicyBtn = document.getElementById('privacy-policy');

    // Detect OS
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const currentShortcuts = isMac ? shortcuts.mac : shortcuts.windows;

    // Initialize the UI
    initShortcuts();
    loadHistoryCount();
    loadRecentHistory();
    setupEventListeners();

    /**
     * Initialize keyboard shortcuts display
     */
    function initShortcuts() {
        shortcutListContainer.innerHTML = '';
        
    currentShortcuts.forEach(shortcut => {
            const shortcutItem = document.createElement('div');
            shortcutItem.className = 'shortcut-item';
            shortcutItem.innerHTML = `
                <kbd>${shortcut.key}</kbd>
                <span class="shortcut-desc">${shortcut.description}</span>
            `;
            shortcutListContainer.appendChild(shortcutItem);
        });
    }

    /**
     * Load and display the history count
     */
    function loadHistoryCount() {
        browser.storage.local.get('screenshotHistory')
            .then(data => {
                const history = data.screenshotHistory || [];
                historyCountEl.textContent = history.length;
                
                // Hide badge if zero
                if (history.length === 0) {
                    historyCountEl.style.display = 'none';
                } else {
                    historyCountEl.style.display = 'inline-flex';
                }
            })
            .catch(error => {
                console.error('Error loading history count:', error);
            });
    }

    /**
     * Load and display recent history items
     */
    function loadRecentHistory() {
        browser.storage.local.get('screenshotHistory')
            .then(data => {
                const history = data.screenshotHistory || [];
                const recentItems = history.slice(0, 3); // Show only the 3 most recent items
                
                if (recentItems.length === 0) {
                    showEmptyHistory();
                    return;
                }
                
                recentHistoryContainer.innerHTML = '';
                
                recentItems.forEach(item => {
                    const historyItem = createHistoryItem(item);
                    recentHistoryContainer.appendChild(historyItem);
                });
            })
            .catch(error => {
                console.error('Error loading recent history:', error);
                showEmptyHistory();
            });
    }

    /**
     * Create a single history item element
     * @param {Object} item The history item data
     * @returns {HTMLElement} The history item element
     */
    function createHistoryItem(item) {
        const formattedDate = formatDate(item.timestamp);
        
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.dataset.id = item.id;
        
        historyItem.innerHTML = `
            <img src="${item.imageUrl}" alt="Screenshot" class="history-thumbnail">
            <div class="history-details">
                <div>
                    <h3 class="history-title">${item.pageTitle || 'Untitled Screenshot'}</h3>
                    <p class="history-date">${formattedDate}</p>
                </div>
                <div class="history-actions">
                    <button class="history-btn view-btn" title="View Details">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 5c-7.633 0-9.927 6.617-9.948 6.684L1.946 12l.105.316C2.073 12.383 4.367 19 12 19s9.927-6.617 9.948-6.684l.106-.316-.105-.316C21.927 11.617 19.633 5 12 5zm0 11c-2.206 0-4-1.794-4-4s1.794-4 4-4 4 1.794 4 4-1.794 4-4 4z"></path>
                            <circle cx="12" cy="12" r="2"></circle>
                        </svg>
                    </button>
                    <button class="history-btn save-btn" title="Save to Favorites">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </button>
                    <button class="history-btn download-btn" title="Download">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        
        // Add event listeners to buttons
        historyItem.querySelector('.view-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            viewHistoryItem(item);
        });
        
        historyItem.querySelector('.save-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSaveItem(item.id);
        });
        
        historyItem.querySelector('.download-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            downloadImage(item.imageUrl, `screenshot-${item.id}.png`);
        });
        
        // Clicking on the item itself also views it
        historyItem.addEventListener('click', () => {
            viewHistoryItem(item);
        });
        
        return historyItem;
    }

    /**
     * Show empty history state
     */
    function showEmptyHistory() {
        recentHistoryContainer.innerHTML = `
            <div class="empty-history">
                No screenshots yet. Take one to get started!
            </div>
        `;
    }

    /**
     * View a history item (opens the dashboard with this item selected)
     * @param {Object} item The history item to view
     */
    function viewHistoryItem(item) {
        browser.tabs.create({
            url: `/dashboard.html?id=${item.id}`
        }).then(() => {
            window.close();
        });
    }

    /**
     * Toggle saving/unsaving a history item
     * @param {string} id The ID of the item to toggle
     */
    function toggleSaveItem(id) {
        browser.runtime.sendMessage({
            action: 'toggleSaveItem',
            id: id
        })
            .then(response => {
                if (response.success) {
                    // You could update the UI here, but we'll close the popup soon anyway
                    console.log(`Item ${id} ${response.saved ? 'saved' : 'unsaved'}`);
                }
            })
            .catch(error => {
                console.error('Error toggling save status:', error);
            });
    }

    /**
     * Download an image
     * @param {string} dataUrl The data URL of the image
     * @param {string} filename The filename to use
     */
    function downloadImage(dataUrl, filename) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Format a date string
     * @param {string} dateStr ISO date string
     * @returns {string} Formatted date string
     */
    function formatDate(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffMins < 1) {
            return 'Just now';
        } else if (diffMins < 60) {
            return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else if (diffDays < 7) {
            return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        }
    }

    /**
     * Set up all event listeners for UI elements
     */
    function setupEventListeners() {
        // Quick capture button
        if (quickCaptureBtn) {
            quickCaptureBtn.addEventListener('click', () => {
                captureScreenshot({ quickMode: true });
            });
        }
        
        // Area capture button
        if (areaCaptureBtn) {
            areaCaptureBtn.addEventListener('click', () => {
                captureScreenshot({ areaMode: true });
            });
        }
        
        // View history button
        if (viewHistoryBtn) {
            viewHistoryBtn.addEventListener('click', () => {
                openDashboard();
            });
        }
        
        // View all history link
        if (viewAllHistoryBtn) {
            viewAllHistoryBtn.addEventListener('click', () => {
                openDashboard();
            });
        }
        
        // Settings button
        if (openSettingsBtn) {
            openSettingsBtn.addEventListener('click', () => {
                browser.runtime.openOptionsPage().then(() => {
                    window.close();
                });
            });
        }
        
        // Help button
        if (openHelpBtn) {
            openHelpBtn.addEventListener('click', (e) => {
                e.preventDefault();
                browser.tabs.create({
                    url: '/help.html'
                }).then(() => {
                    window.close();
                });
            });
        }
        
        // Privacy policy button
        if (privacyPolicyBtn) {
            privacyPolicyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                browser.tabs.create({
                    url: '/privacy.html'
                }).then(() => {
                    window.close();
                });
            });
        }
    }

    /**
     * Capture a screenshot
     * @param {Object} options Options for the screenshot capture
     */
    function captureScreenshot(options = {}) {
        browser.tabs.query({ active: true, currentWindow: true })
            .then(tabs => {
                if (tabs[0]) {
                    browser.runtime.sendMessage({
                        action: 'initScreenshotTool',
                        tabId: tabs[0].id,
                        options: options
                    });
                    window.close();
                }
            });
    }

    /**
     * Open the dashboard
     * @param {Object} options Options for opening the dashboard
     */
    function openDashboard(options = {}) {
        const queryParams = new URLSearchParams(options).toString();
        const url = queryParams ? `/dashboard.html?${queryParams}` : '/dashboard.html';
        
        browser.tabs.create({ url }).then(() => {
            window.close();
        });
    }
});
