// Fix for Firefox/Chrome compatibility
const browser = window.browser || window.chrome;

document.addEventListener('DOMContentLoaded', () => {
    // Show debug info in console
    console.log("Popup opened");
    
    // Detect browser type
    const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
    console.log("Browser detected:", isFirefox ? "Firefox" : "Chrome/other");
    
    // Show Firefox-specific tips if needed
    if (isFirefox) {
        const firefoxTip = document.getElementById('firefox-tip');
        if (firefoxTip) {
            firefoxTip.style.display = 'block';
        }
    }
    
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
    
    console.log("OS detected:", isMac ? "Mac" : "Windows/Linux");

    // Create shortcut list
    const shortcutList = document.getElementById('shortcut-list');
    currentShortcuts.forEach(shortcut => {
        const li = document.createElement('li');
        li.innerHTML = `<kbd>${shortcut.key}</kbd> - ${shortcut.description}`;
        shortcutList.appendChild(li);
    });
    
    // Add start button functionality
    const startButton = document.getElementById('start-button');
    if (startButton) {
        startButton.addEventListener('click', () => {
            console.log("Start button clicked");
            // Get the active tab and initialize the screenshot tool
            browser.tabs.query({active: true, currentWindow: true})
                .then(tabs => {
                    if (tabs[0]) {
                        console.log("Sending activation message for tab:", tabs[0].id);
                        browser.runtime.sendMessage({
                            action: "activateScreenshotTool",
                            source: "popupButton",
                            tabId: tabs[0].id
                        }).then(response => {
                            console.log("Activation message sent successfully, response:", response);
                            // Close the popup
                            window.close();
                        }).catch(error => {
                            console.error("Error sending activation message:", error);
                            // Still close popup to avoid user confusion
                            window.close();
                        });
                    } else {
                        console.error("No active tab found");
                    }
                }).catch(error => {
                    console.error("Error querying tabs:", error);
                });
        });
    } else {
        console.error("Start button not found");
    }
    
    // Add troubleshooting tips accordion
    const troubleshootingToggle = document.getElementById('troubleshooting-toggle');
    const troubleshootingContent = document.getElementById('troubleshooting-content');
    
    if (troubleshootingToggle && troubleshootingContent) {
        troubleshootingToggle.addEventListener('click', () => {
            if (troubleshootingContent.style.display === 'block') {
                troubleshootingContent.style.display = 'none';
                troubleshootingToggle.textContent = '+ Show Troubleshooting Tips';
            } else {
                troubleshootingContent.style.display = 'block';
                troubleshootingToggle.textContent = '- Hide Troubleshooting Tips';
            }
        });
    }
    
    // Use debugging utility if available
    if (window.ExtDebug) {
        window.ExtDebug.info("Popup initialized");
    }
});
