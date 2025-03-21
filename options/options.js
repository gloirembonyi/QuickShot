// options.js
document.addEventListener('DOMContentLoaded', function() {
    const apiKeyInput = document.getElementById('apiKey');
    const apiEndpointInput = document.getElementById('apiEndpoint');
    const apiModelInput = document.getElementById('apiModel');
    const saveButton = document.getElementById('saveButton');
    const statusDiv = document.getElementById('status');
    
    // Load saved settings
    Promise.all([
        browser.storage.local.get(['userSettings']),
        browser.runtime.sendMessage({ action: 'getApiKey' })
    ]).then(([storageData, apiKeyData]) => {
        const userSettings = storageData.userSettings || {};
        
        // Set API key from the getApiKey function result
        if (apiKeyData && apiKeyData.apiKey) {
            apiKeyInput.value = apiKeyData.apiKey;
        } else {
            apiKeyInput.value = '';
        }
        
        // Set API endpoint
        if (userSettings.apiEndpoint) {
            apiEndpointInput.value = userSettings.apiEndpoint;
        } else {
            apiEndpointInput.value = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
        }
        
        // Set API model
        if (userSettings.apiModel) {
            apiModelInput.value = userSettings.apiModel;
        } else {
            apiModelInput.value = 'gemini-1.5-flash';
        }
    }).catch(error => {
        showStatus('Error loading settings: ' + error.message, 'error');
    });
    
    // Save settings
    saveButton.addEventListener('click', function() {
        const apiKey = apiKeyInput.value.trim();
        const apiEndpoint = apiEndpointInput.value.trim();
        const apiModel = apiModelInput.value.trim();
        
        // Validate API Key
        if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
            showStatus('Please enter a valid Gemini API key', 'error');
            apiKeyInput.focus();
            return;
        }
        
        // Get existing settings first
        browser.storage.local.get(['userSettings']).then(data => {
            const userSettings = data.userSettings || {};
            
            // Update the settings
            const updatedSettings = {
                ...userSettings,
                apiKey: apiKey,
                apiEndpoint: apiEndpoint || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
                apiModel: apiModel || 'gemini-1.5-flash'
            };
            
            // Save settings
            browser.storage.local.set({
                userSettings: updatedSettings
            }).then(() => {
                showStatus('Settings saved successfully!', 'success');
            }).catch((error) => {
                showStatus('Error saving settings: ' + error.message, 'error');
            });
        }).catch(error => {
            showStatus('Error updating settings: ' + error.message, 'error');
        });
    });
    
    // Add test button
    const testButton = document.createElement('button');
    testButton.textContent = 'Test API Key';
    testButton.id = 'testButton';
    testButton.style.marginLeft = '10px';
    testButton.style.backgroundColor = '#34a853';
    
    // Insert test button next to save button
    saveButton.parentNode.insertBefore(testButton, saveButton.nextSibling);
    
    // Add event listener for test button
    testButton.addEventListener('click', function() {
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
            showStatus('Please enter an API key first', 'error');
            return;
        }
        
        showStatus('Testing API key...', 'info');
        
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
                showStatus('API key is valid!', 'success');
            } else {
                response.json().then(errorData => {
                    showStatus(`Invalid API key: ${errorData.error?.message || 'Unknown error'}`, 'error');
                }).catch(() => {
                    showStatus('Invalid API key', 'error');
                });
            }
        })
        .catch(error => {
            showStatus(`Error testing API key: ${error.message}`, 'error');
        });
    });
    
    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = 'status ' + type;
        statusDiv.style.display = 'block';
        
        // Don't auto-hide for errors
        if (type !== 'error') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 3000);
        }
    }
});