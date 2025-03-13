// options.js
document.addEventListener('DOMContentLoaded', function() {
    const apiKeyInput = document.getElementById('apiKey');
    const apiEndpointInput = document.getElementById('apiEndpoint');
    const apiModelInput = document.getElementById('apiModel');
    const saveButton = document.getElementById('saveButton');
    const statusDiv = document.getElementById('status');
    
    // Set default Gemini API key
    const defaultApiKey = "AIzaSyD839Zbz0FyWZ6xMGRuM4VdLblnpoQkEig";
    
    // Load saved settings
    browser.storage.local.get(['apiKey', 'apiEndpoint', 'apiModel']).then((result) => {
      if (result.apiKey) {
        apiKeyInput.value = result.apiKey;
      } else {
        apiKeyInput.value = defaultApiKey;
      }
      
      if (result.apiEndpoint) {
        apiEndpointInput.value = result.apiEndpoint;
      } else {
        apiEndpointInput.value = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
      }
      
      if (result.apiModel) {
        apiModelInput.value = result.apiModel;
      } else {
        apiModelInput.value = 'gemini-1.5-flash';
      }
    });
    
    // Save settings
    saveButton.addEventListener('click', function() {
      const apiKey = apiKeyInput.value.trim() || defaultApiKey;
      const apiEndpoint = apiEndpointInput.value.trim();
      const apiModel = apiModelInput.value.trim();
      
      browser.storage.local.set({
        apiKey: apiKey,
        apiEndpoint: apiEndpoint || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
        apiModel: apiModel || 'gemini-1.5-flash'
      }).then(() => {
        showStatus('Settings saved successfully!', 'success');
      }).catch((error) => {
        showStatus('Error saving settings: ' + error.message, 'error');
      });
    });
    
    function showStatus(message, type) {
      statusDiv.textContent = message;
      statusDiv.className = 'status ' + type;
      statusDiv.style.display = 'block';
      
      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 3000);
    }
});