// Fix for Firefox/Chrome compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Detect if we're running in Firefox
const isFirefox = typeof InstallTrigger !== 'undefined';

// Log when content script is loaded
console.log("AI Screenshot Analyzer content script loaded", isFirefox ? "in Firefox" : "in Chrome");

// Flag to track keyboard shortcut availability
let keyboardShortcutsInitialized = false;

// Listen for messages from the extension
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Content script received message:", message.action);
    
    if (message.action === "checkPageCompatibility") {
        // Detect page type
        const isPDF = document.contentType === "application/pdf";
        const isWebApp = !!document.querySelector('div[role="application"]');
        
        sendResponse({
            isPDF: isPDF,
            isWebApp: isWebApp,
            url: window.location.href
        });
        
        return true; // This is important for Firefox async responses
    } 
    else if (message.action === "startSelection") {
        console.log("Selection mode activated via message");
        // Firefox fix: Don't return a promise, use sendResponse instead
        sendResponse({ success: true });
        return true; // This is important for Firefox async responses
    }
    else if (message.action === "showNotification") {
        console.log("Showing notification:", message.message);
        // Handle notification in content script
        sendResponse({ success: true });
        return true;
    }
    
    return false; // Not handled
});

// Initialize the content script immediately and set up keyboard listeners
function initContentScript() {
    console.log("AI Screenshot Analyzer: Initializing content script");
    
    // Initialize keyboard shortcut handling with retry mechanism
    initKeyboardShortcuts();
    
    // For Firefox, add a backup initialization in case the first one fails
    if (isFirefox && !keyboardShortcutsInitialized) {
        console.log("Setting up delayed keyboard shortcut initialization for Firefox");
        setTimeout(initKeyboardShortcuts, 500);
        
        // Add a second backup attempt
        setTimeout(() => {
            if (!keyboardShortcutsInitialized) {
                console.log("Final attempt to initialize keyboard shortcuts");
                initKeyboardShortcuts();
            }
        }, 1500);
    }
    
    // Let the background script know this content script is ready
    browserAPI.runtime.sendMessage({
        action: "contentScriptReady",
        url: window.location.href,
        browser: isFirefox ? "firefox" : "chrome"
    }).catch(err => console.log("Error notifying background script of readiness:", err));
}

// Set up keyboard shortcuts with improved handling for Firefox
function initKeyboardShortcuts() {
    if (keyboardShortcutsInitialized) {
        console.log("Keyboard shortcuts already initialized, skipping");
        return;
    }
    
    console.log("Setting up keyboard shortcut listeners");
    
    // Handle keyboard shortcuts with better event detection
    function handleKeyboardShortcut(e) {
        // Check for Option+S / Alt+S
        if ((e.altKey || e.metaKey) && e.key.toLowerCase() === 's') {
            console.log("Alt+S / Option+S shortcut detected");
            e.preventDefault(); // Prevent default browser behavior
            e.stopPropagation(); // Stop event propagation
            
            // Notify the background script to activate the screenshot tool
            browserAPI.runtime.sendMessage({
                action: "activateScreenshotTool",
                source: "keyboardShortcut",
                shortcut: "alt+s",
                url: window.location.href
            }).then(response => {
                console.log("Activation message sent successfully, response:", response);
            }).catch(error => {
                console.error("Error sending activation message:", error);
            });
        }
    }
    
    // Add dedicated listener for keyboard shortcuts
    // Use capture phase (true) to intercept events before they reach other handlers
    document.addEventListener('keydown', handleKeyboardShortcut, true);
    
    // Mark shortcuts as initialized
    keyboardShortcutsInitialized = true;
    console.log("Keyboard shortcuts initialized successfully");
}

// Initialize immediately
initContentScript();

// Also check on DOM content loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log("AI Screenshot Analyzer: DOM fully loaded");
    
    // Re-check keyboard shortcuts
    if (!keyboardShortcutsInitialized) {
        console.log("Initializing keyboard shortcuts after DOM loaded");
        initKeyboardShortcuts();
    }
});
