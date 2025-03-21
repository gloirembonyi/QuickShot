document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const apiKeyInput = document.getElementById('api-key');
    const apiModelSelect = document.getElementById('api-model');
    const autoAnalyzeToggle = document.getElementById('auto-analyze');
    const autoSaveToggle = document.getElementById('auto-save');
    const showToolbarToggle = document.getElementById('show-toolbar');
    const historySizeSelect = document.getElementById('history-size');
    const autoCleanToggle = document.getElementById('auto-clean');
    const cleanPeriodSelect = document.getElementById('clean-period');
    const clearHistoryBtn = document.getElementById('clear-history');
    const darkModeToggle = document.getElementById('dark-mode');
    const showTooltipsToggle = document.getElementById('show-tooltips');
    const resetSettingsBtn = document.getElementById('reset-settings');
    const saveSettingsBtn = document.getElementById('save-settings');
    const openHelpLink = document.getElementById('open-help');
    const privacyPolicyLink = document.getElementById('privacy-policy');
    const toastElement = document.getElementById('toast');

    // Default settings
    const defaultSettings = {
        apiKey: '',
        apiModel: 'gemini-1.5-flash',
        autoAnalyze: true,
        autoSave: true,
        showToolbar: true,
        historySize: 50,
        autoClean: false,
        cleanPeriod: 30,
        darkMode: false,
        showTooltips: true
    };

    // Load settings and initialize UI
    loadSettings();
    setupEventListeners();

    /**
     * Load user settings from storage
     */
    function loadSettings() {
        Promise.all([
            browser.storage.local.get('userSettings'),
            browser.runtime.sendMessage({ action: 'getApiKey' })
        ])
            .then(([storageData, apiKeyData]) => {
                // Merge saved settings with defaults
                const settings = { ...defaultSettings, ...(storageData.userSettings || {}) };
                
                // Use API key from getApiKey function if available
                if (apiKeyData && apiKeyData.apiKey && apiKeyData.apiKey !== "YOUR_GEMINI_API_KEY") {
                    settings.apiKey = apiKeyData.apiKey;
                }
                
                // Apply settings to form elements
                apiKeyInput.value = settings.apiKey || '';
                apiModelSelect.value = settings.apiModel;
                autoAnalyzeToggle.checked = settings.autoAnalyze;
                autoSaveToggle.checked = settings.autoSave;
                showToolbarToggle.checked = settings.showToolbar;
                historySizeSelect.value = settings.historySize.toString();
                autoCleanToggle.checked = settings.autoClean;
                cleanPeriodSelect.value = settings.cleanPeriod.toString();
                cleanPeriodSelect.disabled = !settings.autoClean;
                darkModeToggle.checked = settings.darkMode;
                showTooltipsToggle.checked = settings.showTooltips;
                
                // Apply dark mode if enabled
                if (settings.darkMode) {
                    document.documentElement.setAttribute('data-theme', 'dark');
                }
            })
            .catch(error => {
                console.error('Error loading settings:', error);
                showToast('Error loading settings', 'error');
            });
    }

    /**
     * Save settings to storage
     */
    function saveSettings() {
        const apiKey = apiKeyInput.value.trim();
        
        // Validate API key
        if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
            showToast('Please enter a valid Gemini API key', 'error');
            apiKeyInput.focus();
            return;
        }
        
        const settings = {
            apiKey: apiKey,
            apiModel: apiModelSelect.value,
            autoAnalyze: autoAnalyzeToggle.checked,
            autoSave: autoSaveToggle.checked,
            showToolbar: showToolbarToggle.checked,
            historySize: parseInt(historySizeSelect.value, 10),
            autoClean: autoCleanToggle.checked,
            cleanPeriod: parseInt(cleanPeriodSelect.value, 10),
            darkMode: darkModeToggle.checked,
            showTooltips: showTooltipsToggle.checked
        };
        
        browser.storage.local.set({ userSettings: settings })
            .then(() => {
                console.log('Settings saved:', settings);
                showToast('Settings saved successfully', 'success');
                
                // If history size changed, update MAX_HISTORY_ITEMS
                if (settings.historySize !== defaultSettings.historySize) {
                    browser.runtime.sendMessage({
                        action: 'updateHistorySize',
                        size: settings.historySize
                    });
                }
                
                // Apply dark mode setting
                if (settings.darkMode) {
                    document.documentElement.setAttribute('data-theme', 'dark');
                } else {
                    document.documentElement.removeAttribute('data-theme');
                }
            })
            .catch(error => {
                console.error('Error saving settings:', error);
                showToast('Error saving settings', 'error');
            });
    }

    /**
     * Reset settings to defaults
     */
    function resetSettings() {
        // Confirm before resetting
        if (!confirm('Are you sure you want to reset all settings to default values?')) {
            return;
        }
        
        // We need to keep the API key even when resetting other settings
        const currentApiKey = apiKeyInput.value.trim();
        
        // Apply default settings to form elements
        apiKeyInput.value = currentApiKey; // Keep the current API key
        apiModelSelect.value = defaultSettings.apiModel;
        autoAnalyzeToggle.checked = defaultSettings.autoAnalyze;
        autoSaveToggle.checked = defaultSettings.autoSave;
        showToolbarToggle.checked = defaultSettings.showToolbar;
        historySizeSelect.value = defaultSettings.historySize.toString();
        autoCleanToggle.checked = defaultSettings.autoClean;
        cleanPeriodSelect.value = defaultSettings.cleanPeriod.toString();
        cleanPeriodSelect.disabled = !defaultSettings.autoClean;
        darkModeToggle.checked = defaultSettings.darkMode;
        showTooltipsToggle.checked = defaultSettings.showTooltips;
        
        // Create new settings object with defaults but keep the API key
        const resetSettings = { 
            ...defaultSettings,
            apiKey: currentApiKey
        };
        
        // Save the settings
        browser.storage.local.set({ userSettings: resetSettings })
            .then(() => {
                console.log('Settings reset to defaults (keeping API key)');
                showToast('Settings reset to defaults', 'success');
                
                // Remove dark mode if default is light
                if (!defaultSettings.darkMode) {
                    document.documentElement.removeAttribute('data-theme');
                }
            })
            .catch(error => {
                console.error('Error resetting settings:', error);
                showToast('Error resetting settings', 'error');
            });
    }

    /**
     * Clear all history
     */
    function clearHistory() {
        // Confirm before clearing
        if (!confirm('Are you sure you want to clear all screenshot history? This cannot be undone.')) {
            return;
        }
        
        browser.runtime.sendMessage({ action: 'clearHistory' })
            .then(response => {
                if (response.success) {
                    showToast('Screenshot history cleared', 'success');
                } else {
                    showToast('Error clearing history', 'error');
                }
            })
            .catch(error => {
                console.error('Error clearing history:', error);
                showToast('Error clearing history', 'error');
            });
    }

    /**
     * Test API key validity
     */
    function testApiKey() {
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
            showToast('Please enter an API key first', 'error');
            return;
        }
        
        showToast('Testing API key...', 'info');
        
        // Simple test request to Gemini API
        const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`;
        
        const requestBody = {
            contents: [{
                parts: [{ text: "Hello, this is a test message. Please respond with 'API key is valid' if you receive this." }]
            }]
        };
        
        fetch(`${apiEndpoint}?key=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        })
        .then(response => {
            if (response.ok) {
                showToast('API key is valid!', 'success');
            } else {
                response.json().then(errorData => {
                    showToast(`Invalid API key: ${errorData.error?.message || 'Unknown error'}`, 'error');
                }).catch(() => {
                    showToast('Invalid API key', 'error');
                });
            }
        })
        .catch(error => {
            showToast(`Error testing API key: ${error.message}`, 'error');
        });
    }

    /**
     * Display a toast notification
     * @param {string} message The message to display
     * @param {string} type The type of toast (success, error, or info)
     */
    function showToast(message, type = 'info') {
        toastElement.textContent = message;
        toastElement.className = 'toast';
        
        if (type) {
            toastElement.classList.add(type);
        }
        
        // Show the toast
        setTimeout(() => {
            toastElement.classList.add('show');
        }, 10);
        
        // Hide the toast after 3 seconds
        setTimeout(() => {
            toastElement.classList.remove('show');
            
            // Remove the toast completely after animation
            setTimeout(() => {
                toastElement.className = 'toast';
            }, 300);
        }, 3000);
    }

    /**
     * Set up event listeners for form controls
     */
    function setupEventListeners() {
        // Auto-clean toggle
        autoCleanToggle.addEventListener('change', () => {
            cleanPeriodSelect.disabled = !autoCleanToggle.checked;
        });
        
        // Save settings button
        saveSettingsBtn.addEventListener('click', saveSettings);
        
        // Reset settings button
        resetSettingsBtn.addEventListener('click', resetSettings);
        
        // Clear history button
        clearHistoryBtn.addEventListener('click', clearHistory);
        
        // API key input - add test button
        const testApiKeyBtn = document.createElement('button');
        testApiKeyBtn.id = 'test-api-key';
        testApiKeyBtn.className = 'button button-secondary';
        testApiKeyBtn.style.marginTop = '8px';
        testApiKeyBtn.textContent = 'Test API Key';
        testApiKeyBtn.addEventListener('click', testApiKey);
        
        // Insert test button after API key input
        const apiKeyFormGroup = apiKeyInput.closest('.form-group');
        apiKeyFormGroup.appendChild(testApiKeyBtn);
        
        // Help link
        openHelpLink.addEventListener('click', (e) => {
            e.preventDefault();
            browser.tabs.create({ url: '/help.html' });
        });
        
        // Privacy policy link
        privacyPolicyLink.addEventListener('click', (e) => {
            e.preventDefault();
            browser.tabs.create({ url: '/privacy.html' });
        });
        
        // Form submission (prevent default)
        document.querySelectorAll('form').forEach(form => {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                saveSettings();
            });
        });
    }
}); 