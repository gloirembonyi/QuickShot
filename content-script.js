// Listen for messages from the extension
browser.runtime.onMessage.addListener(message => {
    if (message.action === "checkPageCompatibility") {
        // Detect page type
        const isPDF = document.contentType === "application/pdf";
        const isWebApp = !!document.querySelector('div[role="application"]');
        
        return Promise.resolve({
            isPDF: isPDF,
            isWebApp: isWebApp,
            url: window.location.href
        });
    }
});
