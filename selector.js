// selector.js
(function() {
    // State variables
    let startX, startY, endX, endY;
    let isSelecting = false;
    let overlay, selection, controls, instructions, coordsDisplay;
    let pendingAnalysis = false;
    
    // Listen for messages from the background script
    browser.runtime.onMessage.addListener((message, sender) => {
      console.log("Content script received message:", message);
      
      if (message.action === "startSelection") {
        createSelectionUI();
      } else if (message.action === "analysisResult") {
        if (!message.result || !message.screenshot) {
            showError("Invalid analysis result received");
            removeLoader();
            pendingAnalysis = false;
            return;
        }
        
        console.log("Received analysis result");
        showResult(message.result, message.screenshot);
        removeLoader();
        pendingAnalysis = false;
      } else if (message.action === "analysisError") {
        console.error("Analysis error:", message.error);
        showError(message.error);
        removeLoader();
        pendingAnalysis = false;
      } else if (message.action === "showNotification") {
        showNotification(message.message);
      } else if (message.action === 'askQuestion') {
        try {
          return askGeminiQuestion(
            message.data.question,
            message.data.imageDataUrl,
            message.data.originalAnalysis
          ).then(answer => {
            return { answer: answer };
          }).catch(error => {
            console.error("Question answering error:", error);
            return { answer: "Sorry, I encountered an error: " + error.message };
          });
        } catch (error) {
          console.error("Error in ask question handler:", error);
          return Promise.resolve({ answer: "Sorry, I encountered an error: " + error.message });
        }
      }
      
      return false;
    });
    
    // Create the selection UI
    function createSelectionUI() {
      console.log("Creating selection UI");
      
      // Remove existing UI if present
      cleanup(true);
      
      // Create overlay
      overlay = document.createElement('div');
      overlay.className = 'screenshot-selector-overlay';
      document.body.appendChild(overlay);
      
      // Add global close button
      const globalCloseBtn = document.createElement('div');
      globalCloseBtn.className = 'screenshot-global-close';
      globalCloseBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      `;
      globalCloseBtn.title = "Close QuickShot (ESC)";
      globalCloseBtn.addEventListener('click', closeExtension);
      document.body.appendChild(globalCloseBtn);
      
      // Add animated instructions
      instructions = document.createElement('div');
      instructions.className = 'screenshot-instructions';
      instructions.innerHTML = `
          <div class="instructions-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
          </div>
          <div class="instructions-text">
              Click and drag to select an area for analysis
              <span class="instructions-shortcut">Press <kbd>?</kbd> for help</span>
          </div>
      `;
      document.body.appendChild(instructions);
      
      // Add coordinates display
      coordsDisplay = document.createElement('div');
      coordsDisplay.className = 'screenshot-coords';
      document.body.appendChild(coordsDisplay);
      
      // Add event listeners
      overlay.addEventListener('mousedown', handleMouseDown);
      overlay.addEventListener('mousemove', handleMouseMove);
      overlay.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('keydown', handleKeyPress);
      overlay.addEventListener('dblclick', handleDoubleClick);
      
      // Show notification
      showNotification("Select an area to analyze with AI", 'info');
      
      // Show quick tip on first use
      if (!localStorage.getItem('screenshotTipShown')) {
        showQuickTip();
        localStorage.setItem('screenshotTipShown', 'true');
      }
    }
    
    // Show helpful quick tip for first-time users
    function showQuickTip() {
      const quickTip = document.createElement('div');
      quickTip.className = 'screenshot-quick-tip';
      quickTip.innerHTML = `
          <div class="quick-tip-content">
              <span class="tip-title">Pro tip:</span> Select text for OCR or images for visual analysis
              <div class="tip-progress"></div>
          </div>
      `;
      document.body.appendChild(quickTip);
      
      setTimeout(() => {
          if (document.body.contains(quickTip)) {
              quickTip.classList.add('tip-hiding');
              setTimeout(() => quickTip.remove(), 300);
          }
      }, 5000);
    }
    
    // Handle mouse down event to start selection
    function handleMouseDown(e) {
      // Ignore if we're already processing an analysis
      if (pendingAnalysis) return;
      
      console.log("Starting selection at", e.clientX, e.clientY);
      isSelecting = true;
      startX = e.clientX;
      startY = e.clientY;
      
      // Create selection element if it doesn't exist
      if (!selection) {
        selection = document.createElement('div');
        selection.className = 'screenshot-selection';
        document.body.appendChild(selection);
      }
      
      // Reset selection position and size
      selection.style.left = startX + 'px';
      selection.style.top = startY + 'px';
      selection.style.width = '0';
      selection.style.height = '0';
      selection.style.display = 'block';
      
      // Remove any existing controls
      if (controls) {
        controls.remove();
        controls = null;
      }
      
      // Update coordinates display
      updateCoordinatesDisplay(startX, startY, startX, startY);
    }
    
    // Handle mouse move event to update selection
    function handleMouseMove(e) {
      if (!isSelecting) return;
      
      endX = e.clientX;
      endY = e.clientY;
      
      // Calculate selection dimensions
      const left = Math.min(startX, endX);
      const top = Math.min(startY, endY);
      const width = Math.abs(endX - startX);
      const height = Math.abs(endY - startY);
      
      // Update selection element
      selection.style.left = left + 'px';
      selection.style.top = top + 'px';
      selection.style.width = width + 'px';
      selection.style.height = height + 'px';
      
      // Update coordinates display
      updateCoordinatesDisplay(startX, startY, endX, endY);
    }
    
    // Update the coordinates display
    function updateCoordinatesDisplay(startX, startY, endX, endY) {
      const width = Math.abs(endX - startX);
      const height = Math.abs(endY - startY);
      
      coordsDisplay.textContent = `Selection: ${width}px × ${height}px (${startX},${startY}) to (${endX},${endY})`;
      coordsDisplay.style.display = 'block';
      
      // Position coordinates display
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      // Calculate the selection's bounds
      const selectionTop = Math.min(startY, endY);
      const selectionLeft = Math.min(startX, endX);
      const selectionBottom = Math.max(startY, endY);
      
      // Get the dimensions of the coordinates display
      const coordsRect = coordsDisplay.getBoundingClientRect();
      const coordsWidth = coordsRect.width || 200; // Fallback if not yet in DOM
      const coordsHeight = coordsRect.height || 30; // Fallback if not yet in DOM
      
      // Decide whether to position above or below the selection
      let coordsTop;
      if (selectionTop > coordsHeight + 10) {
        // Position above the selection if there's enough space
        coordsTop = selectionTop - coordsHeight - 10;
      } else if (selectionBottom + coordsHeight + 10 < viewportHeight) {
        // Position below the selection if there's enough space
        coordsTop = selectionBottom + 10;
      } else {
        // Position inside the selection if possible
        coordsTop = selectionTop + 10;
      }
      
      // Calculate horizontal position, preventing it from going off-screen
      const idealLeft = selectionLeft;
      const coordsLeft = Math.min(idealLeft, viewportWidth - coordsWidth - 10);
      
      // Apply positions
      coordsDisplay.style.top = `${coordsTop}px`;
      coordsDisplay.style.left = `${coordsLeft}px`;
    }
    
    // Handle mouse up event to complete selection
    function handleMouseUp(e) {
      if (!isSelecting) return;
      isSelecting = false;
      
      endX = e.clientX;
      endY = e.clientY;
      
      console.log("Ended selection at", endX, endY);
      
      // Only show controls if selection has a minimum size
      if (Math.abs(endX - startX) > 10 && Math.abs(endY - startY) > 10) {
        showControls();
        // Keep instructions visible but update text
        instructions.textContent = "Use the buttons below to analyze this selection or try again";
      } else {
        // Reset for small selections
        if (selection) selection.style.display = 'none';
        instructions.textContent = "Selection too small. Please try again with a larger area.";
      }
    }
    
    // Handle key press events
    function handleKeyPress(e) {
      console.log("Key pressed:", e.key);

      // Prevent default actions for specific keys
      if (['Escape', 'Enter', 'r', 'R', '?'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
      
      if (e.key === 'Escape') {
        console.log("Escape pressed - closing extension");
        closeExtension();
      } else if (e.key === 'Enter' && selection && selection.style.display !== 'none') {
        console.log("Enter pressed - analyzing selection");
        captureAndAnalyze();
      } else if (e.key === 'r' || e.key === 'R') {
        console.log("R pressed - resetting selection");
        resetSelection();
      } else if (e.key === '?') {
        console.log("? pressed - showing help");
        showShortcutsHelp();
      }
    }
    
    // Show the control buttons
    function showControls() {
      console.log("Showing control buttons");
      
      // Remove existing controls if they exist
      if (controls) {
        controls.remove();
      }
      
      // Create controls container
      controls = document.createElement('div');
      controls.className = 'screenshot-controls';
      
      // Calculate optimal position for controls
      const selectionRect = selection.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      // Position controls below or above the selection
      if (selectionRect.bottom + 60 < viewportHeight) {
        controls.style.left = Math.min(selectionRect.left, viewportWidth - 320) + 'px'; // Prevent overflow
        controls.style.top = (selectionRect.bottom + 10) + 'px';
      } else {
        controls.style.left = Math.min(selectionRect.left, viewportWidth - 320) + 'px'; // Prevent overflow
        controls.style.top = (selectionRect.top - 60) + 'px';
      }
      
      // Create accept (Analyze) button
      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'screenshot-button screenshot-accept';
      acceptBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Analyze with AI';
      acceptBtn.title = "Analyze this area with QuickShot AI (Enter)";
      acceptBtn.addEventListener('click', () => {
        console.log("Analyze button clicked");
        captureAndAnalyze();
      });
      
      // Create refresh button
      const refreshBtn = document.createElement('button');
      refreshBtn.className = 'screenshot-button screenshot-refresh';
      refreshBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path></svg> New Selection';
      refreshBtn.title = "Start a new selection (R)";
      refreshBtn.addEventListener('click', () => {
        console.log("New selection button clicked");
        resetSelection();
      });
      
      // Create cancel button
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'screenshot-button screenshot-close';
      cancelBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Cancel';
      cancelBtn.title = "Close screenshot tool (Esc)";
      cancelBtn.addEventListener('click', () => {
        console.log("Cancel button clicked");
        closeExtension();
      });
      
      // Add buttons to controls
      controls.appendChild(acceptBtn);
      controls.appendChild(refreshBtn);
      controls.appendChild(cancelBtn);
      
      // Add tooltip to explain the controls
      const tooltip = document.createElement('div');
      tooltip.className = 'screenshot-controls-tooltip';
      tooltip.textContent = "Press 'Analyze with AI' to process this selection.";
      controls.appendChild(tooltip);
      
      // Add controls to the document
      document.body.appendChild(controls);
    }
    
    // Capture screenshot and initiate analysis
    function captureAndAnalyze() {
      if (pendingAnalysis) return;
      pendingAnalysis = true;
      
      console.log("Starting capture and analysis");
      showLoader();
      
      if (controls) controls.style.display = 'none';
      
      const selectionRect = selection.getBoundingClientRect();
      
      showNotification("Capturing screenshot...");
      
      // Send message to capture the tab
      browser.runtime.sendMessage({
        action: 'captureTab',
        data: {
            rect: {
                x: Math.round(selectionRect.left + window.scrollX),
                y: Math.round(selectionRect.top + window.scrollY),
                width: Math.round(selectionRect.width),
                height: Math.round(selectionRect.height)
            },
            devicePixelRatio: window.devicePixelRatio || 1,
            timestamp: new Date().toISOString(),
            pageTitle: document.title,
            pageUrl: window.location.href
        }
      }).catch(error => {
          console.error("Screenshot capture failed:", error);
          showError("Failed to capture screenshot: " + error.message);
        pendingAnalysis = false;
        removeLoader();
      });
    }
    
    // Reset selection to start over
    function resetSelection() {
      console.log("Resetting selection");
      
      // Remove controls
      if (controls) {
        controls.remove();
        controls = null;
      }
      
      // Hide selection
      if (selection) selection.style.display = 'none';
      
      // Show instructions again
      if (instructions) {
        instructions.textContent = 'Click and drag to select an area for analysis';
        instructions.style.display = 'block';
      }
      
      // Reset selection state
      isSelecting = false;
      
      // Hide coordinates
      if (coordsDisplay) coordsDisplay.style.display = 'none';
    }
    
    // Clean up all UI elements
    function cleanup(preserveOverlay = false) {
      console.log("Cleaning up UI elements");
      
      // Remove all extension elements
      const elementsToRemove = [
        '.screenshot-selection',
        '.screenshot-controls',
        '.screenshot-instructions',
        '.screenshot-coords',
        '.screenshot-loader',
        '.screenshot-error',
        '.screenshot-notification',
        '.screenshot-results-modal',
        '.screenshot-global-close',
        '.screenshot-controls-tooltip'
      ];
      
      elementsToRemove.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => element.remove());
      });
      
      // Remove event listeners
      document.removeEventListener('keydown', handleKeyPress);
      
      if (overlay) {
        overlay.removeEventListener('mousedown', handleMouseDown);
        overlay.removeEventListener('mousemove', handleMouseMove);
        overlay.removeEventListener('mouseup', handleMouseUp);
        overlay.removeEventListener('dblclick', handleDoubleClick);
        
        if (!preserveOverlay) {
          overlay.remove();
          overlay = null;
        }
      }
      
      // Reset state variables
      selection = null;
      controls = null;
      instructions = null;
      coordsDisplay = null;
      isSelecting = false;
      pendingAnalysis = false;
      startX = startY = endX = endY = null;
    }
    
    // Show a loading indicator
    function showLoader() {
      console.log("Showing loader");
      
      // Create backdrop to prevent clicks
      const backdrop = document.createElement('div');
      backdrop.className = 'screenshot-loader-backdrop';
      document.body.appendChild(backdrop);
      
      // Create loader
      const loader = document.createElement('div');
      loader.className = 'screenshot-loader';
      loader.innerHTML = `
        <div class="screenshot-spinner"></div>
        <div class="screenshot-loader-text">Analyzing image with AI...</div>
      `;
      document.body.appendChild(loader);
    }

    // Remove the loading indicator
    function removeLoader() {
      console.log("Removing loader");
      
      // Remove loader with fade-out effect
      const loader = document.querySelector('.screenshot-loader');
      const backdrop = document.querySelector('.screenshot-loader-backdrop');
      
      if (loader) {
        loader.classList.add('fadeOut');
        setTimeout(() => loader.remove(), 300);
      }
      
      if (backdrop) {
        backdrop.classList.add('fadeOut');
        setTimeout(() => backdrop.remove(), 300);
      }
    }
    
    // Show an error message
    function showError(message) {
      console.error("Showing error:", message);
      
      // Remove any existing error message
      const existingError = document.querySelector('.screenshot-error');
      if (existingError) existingError.remove();
      
      const errorBox = document.createElement('div');
      errorBox.className = 'screenshot-error';
      
      // Check if this is an API key error
      const isApiKeyError = message.includes('API key not') || 
                              message.includes('API key not configured') || 
                              message.includes('API key not valid');
      
      let errorContent = `
        <div class="screenshot-error-title">Error</div>
        <div class="screenshot-error-message">${message}</div>
      `;
      
      // Add settings button for API key errors
      if (isApiKeyError) {
        errorContent += `
          <div class="screenshot-error-help">
            Please add your Gemini API key in the extension settings.
          </div>
          <div class="screenshot-error-actions">
            <button class="screenshot-button screenshot-open-settings">Open Settings</button>
            <button class="screenshot-button screenshot-close-error">Close</button>
          </div>
        `;
      } else {
        errorContent += `<button class="screenshot-button screenshot-close-error">Close</button>`;
      }
      
      errorBox.innerHTML = errorContent;
      document.body.appendChild(errorBox);
      
      // Add close button listener
      errorBox.querySelector('.screenshot-close-error').addEventListener('click', () => {
        errorBox.remove();
      });
      
      // Add settings button listener for API key errors
      if (isApiKeyError) {
        errorBox.querySelector('.screenshot-open-settings').addEventListener('click', () => {
          browser.runtime.sendMessage({ action: 'openSettings' });
          errorBox.remove();
        });
      }
      
      // Auto-remove after 20 seconds for non-API key errors, 60 seconds for API key errors
      setTimeout(() => {
        if (document.body.contains(errorBox)) {
          errorBox.remove();
        }
      }, isApiKeyError ? 60000 : 20000);
    }
    
    // Show a notification message
    function showNotification(message, type = 'info') {
        console.log(`Showing notification (${type}):`, message);
        
      // Remove existing notification if any
      const existingNotification = document.querySelector('.screenshot-notification');
      if (existingNotification) existingNotification.remove();
      
      const notification = document.createElement('div');
        notification.className = `screenshot-notification screenshot-notification-${type}`;
        
        // Add appropriate icon based on type
        let icon = '';
        switch (type) {
            case 'success':
                icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
                break;
            case 'error':
                icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12" y2="16"></line></svg>';
                break;
            case 'warning':
                icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12" y2="17"></line></svg>';
                break;
            default:
                icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M8 12h8"></path><path d="M12 8v8"></path></svg>';
        }
        
        notification.innerHTML = `
            <div class="notification-icon">${icon}</div>
            <div class="notification-message">${message}</div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            if (document.body.contains(notification)) {
                notification.classList.add('notification-hiding');
                setTimeout(() => notification.remove(), 300);
            }
        }, 4000);
    }
    
    // Display analysis results
    function showResult(result, screenshotUrl) {
      console.log("Showing analysis results");
      cleanup(); // Clean up selection UI
      
      const resultsModal = document.createElement('div');
      resultsModal.className = 'screenshot-results-modal';
      
      // Format analysis text for better readability
      const formattedAnalysis = formatAnalysisText(result.analysis);
      
      resultsModal.innerHTML = `
        <div class="screenshot-results-container">
          <div class="screenshot-results-header">
            <h2>AI Analysis Results</h2>
          </div>
            <button class="screenshot-close-results" aria-label="Close">×</button>
          <div class="screenshot-results-content">
            <div class="screenshot-results-image">
              <img src="${screenshotUrl}" alt="Analyzed screenshot">
              <div class="screenshot-image-tools">
                <div class="image-tools-buttons">
                  <button class="image-tool-button" data-tool="zoom">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                      <line x1="11" y1="8" x2="11" y2="14"></line>
                      <line x1="8" y1="11" x2="14" y2="11"></line>
                    </svg>
                    Zoom
                  </button>
                  <button class="image-tool-button" data-tool="brighten">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="5"></circle>
                      <line x1="12" y1="1" x2="12" y2="3"></line>
                      <line x1="12" y1="21" x2="12" y2="23"></line>
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                      <line x1="1" y1="12" x2="3" y2="12"></line>
                      <line x1="21" y1="12" x2="23" y2="12"></line>
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                    </svg>
                    Brighten
                  </button>
                  <button class="image-tool-button" data-tool="contrast">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M12 16a4 4 0 0 0 0-8v8z"></path>
                    </svg>
                    Contrast
                  </button>
                  <button class="image-tool-button" data-tool="save">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Save
                  </button>
                </div>
              </div>
            </div>
            <div class="screenshot-results-text">
              <h3>Analysis:</h3>
              <div class="screenshot-analysis-content">${formattedAnalysis}</div>
              <div class="screenshot-results-timestamp">Analysis performed: ${new Date(result.timestamp).toLocaleString()}</div>
            </div>
            <div class="screenshot-question-wrapper">
              <h3>Ask a question about this image:</h3>
              <div class="screenshot-question-input-container">
                <input type="text" class="screenshot-question-input" placeholder="Type your question here...">
                <button class="screenshot-ask-button">Ask AI</button>
              </div>
              <div class="screenshot-question-suggestions">
                <div class="suggestion-chips">
                  <button class="suggestion-chip">What does this show?</button>
                  <button class="suggestion-chip">Explain this in simpler terms</button>
                  <button class="suggestion-chip">What's the main point?</button>
                  <button class="suggestion-chip">How can I use this information?</button>
                </div>
              </div>
              <div class="screenshot-answer-container" style="display: none;">
                <h4>Answer:</h4>
                <div class="screenshot-answer-content"></div>
              </div>
            </div>
          </div>
          <div class="screenshot-results-actions">
            <button class="screenshot-button screenshot-new-selection">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="8" y1="12" x2="16" y2="12"></line>
                <line x1="12" y1="8" x2="12" y2="16"></line>
              </svg>
              New Selection
            </button>
            <button class="screenshot-button screenshot-copy-text">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
              </svg>
              Copy Text
            </button>
            <button class="screenshot-button screenshot-export-pdf">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              Export PDF
            </button>
            <button class="screenshot-button screenshot-close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              Close
            </button>
          </div>
        </div>
      `;
      
      document.body.appendChild(resultsModal);
      
      // Set up all event handlers
      setupAllHandlers(resultsModal, result.analysis, screenshotUrl);
    }
    
    // Format analysis text for better readability
    function formatAnalysisText(text) {
      // Remove ** markers from the text (bold/emphasis markers)
      text = text.replace(/\*\*/g, '');
      
      // Format bullet points
      text = text.replace(/^(\*\s+.+)/gm, '<li>$1</li>');
      text = text.replace(/\*\s+/g, '');
      
      // Format numbered lists
      text = text.replace(/^(\d+\.\s+.+)/gm, '<li>$1</li>');
      
      // If there are list items, wrap them in a ul or ol
      if (text.includes('<li>')) {
        // Find all consecutive list items and wrap them in ul tags
        text = text.replace(/(<li>\d+\..+<\/li>(\s*<li>\d+\..+<\/li>)*)/g, '<ol>$1</ol>');
        text = text.replace(/(<li>[^0-9].+<\/li>(\s*<li>[^0-9].+<\/li>)*)/g, '<ul>$1</ul>');
      }
      
      // Format paragraphs
      text = text.replace(/\n\n/g, '</p><p>');
      
      // Format equations and math symbols
      text = text.replace(/\$([^$]+)\$/g, '<span class="math-inline">$1</span>');
      
      // Wrap all text not in li or p elements in p tags
      if (!text.startsWith('<p>') && !text.startsWith('<ul>') && !text.startsWith('<ol>')) {
        text = '<p>' + text;
      }
      if (!text.endsWith('</p>') && !text.endsWith('</ul>') && !text.endsWith('</ol>')) {
        text = text + '</p>';
      }
      
      // Convert newlines to <br> within paragraphs
      text = text.replace(/<p>(.+?)\n(.+?)<\/p>/g, function(match, p1, p2) {
        return '<p>' + p1 + '<br>' + p2 + '</p>';
      });
      
      return text;
    }
    
    // Download the analyzed image
    function downloadImage(dataUrl, filename) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        link.click();
        showNotification('Image downloaded successfully!', 'success');
    }
    
    // Export analysis as PDF
    function exportToPDF(imageUrl, analysisText) {
        showNotification('Preparing PDF export...', 'info');
        
        // Create a new window for printing
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>AI Screenshot Analysis</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            max-width: 800px;
                            margin: 0 auto;
                            padding: 20px;
                            color: #202124;
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 30px;
                        }
                        h1 {
                            color: #4285f4;
                            font-size: 24px;
                        }
                        .timestamp {
                            color: #5f6368;
                            font-size: 14px;
                            margin-bottom: 30px;
                        }
                        .image-container {
                            text-align: center;
                            margin-bottom: 30px;
                        }
                        img {
                            max-width: 100%;
                            border: 1px solid #dadce0;
                            border-radius: 8px;
                            padding: 10px;
                            background: #f8f9fa;
                        }
                        .analysis {
                            line-height: 1.6;
                            background: #f8f9fa;
                            padding: 20px;
                            border-radius: 8px;
                            border: 1px solid #dadce0;
                        }
                        .footer {
                            margin-top: 30px;
                            text-align: center;
                            font-size: 12px;
                            color: #5f6368;
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>AI Screenshot Analysis</h1>
                        <div class="timestamp">Generated on: ${new Date().toLocaleString()}</div>
                    </div>
                    <div class="image-container">
                        <img src="${imageUrl}" alt="Analyzed Screenshot">
                    </div>
                    <div class="analysis">${analysisText}</div>
                    <div class="footer">
                        Generated with AI Screenshot Analyzer
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();
        
        printWindow.onload = function() {
            setTimeout(() => {
                printWindow.print();
                showNotification('PDF export complete!', 'success');
            }, 500);
        };
    }
    
    // Set up question answering functionality
    function setupQuestionAnswering(modal, imageUrl, originalAnalysis) {
        const questionInput = modal.querySelector('.screenshot-question-input');
        const askButton = modal.querySelector('.screenshot-ask-button');
        const answerContainer = modal.querySelector('.screenshot-answer-container');
        const suggestionChips = modal.querySelectorAll('.suggestion-chip');
        
        if (!questionInput || !askButton || !answerContainer) return;
        
        const answerContent = answerContainer.querySelector('.screenshot-answer-content');
        if (!answerContent) return;
        
        // Handle suggestion chips
        suggestionChips.forEach(chip => {
            chip.addEventListener('click', () => {
                questionInput.value = chip.textContent;
                askQuestion(questionInput.value);
            });
        });
        
        // Handle ask button click
        askButton.addEventListener('click', () => {
            askQuestion(questionInput.value.trim());
        });
        
        // Handle Enter key press
        questionInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter' && !askButton.disabled) {
                askQuestion(questionInput.value.trim());
            }
        });
        
        // Function to ask question and show answer
        function askQuestion(question) {
            if (!question) return;
            
            // Show loading state
            askButton.disabled = true;
            askButton.innerHTML = '<div class="button-spinner"></div> Processing...';
            answerContainer.style.display = 'block';
            answerContent.innerHTML = '<div class="answer-loading">Analyzing your question and processing the image...</div>';
            
            // Send to background script
            browser.runtime.sendMessage({
                action: 'askQuestion',
                data: {
                    question: question,
                    imageDataUrl: imageUrl,
                    originalAnalysis: originalAnalysis
                }
            }).then(response => {
                // Display answer with fade-in animation
                answerContent.style.opacity = '0';
                setTimeout(() => {
                    answerContent.innerHTML = formatAnalysisText(response.answer);
                    
                    // Reset button
                    askButton.disabled = false;
                    askButton.textContent = 'Ask AI';
                    
                    // Add feedback buttons
                    const feedbackDiv = document.createElement('div');
                    feedbackDiv.className = 'answer-feedback';
                    feedbackDiv.innerHTML = `
                        <span>Was this helpful?</span>
                        <button class="feedback-button feedback-yes" title="This was helpful">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 21h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.58 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2zM9 9l4.34-4.34L12 10h9v2l-3 7H9V9zM1 9h4v12H1z"></path>
                            </svg>
                        </button>
                        <button class="feedback-button feedback-no" title="This was not helpful">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm0 12l-4.34 4.34L12 14H3v-2l3-7h9v10zm4-12h4v12h-4z"></path>
                            </svg>
                        </button>
                    `;
                    answerContent.appendChild(feedbackDiv);
                    answerContent.style.opacity = '1';
                    
                    // Handle feedback
                    feedbackDiv.querySelector('.feedback-yes').addEventListener('click', () => {
                        showNotification('Thank you for your feedback!', 'success');
                        feedbackDiv.innerHTML = '<span class="feedback-thanks">Thank you for your feedback!</span>';
                    });
                    
                    feedbackDiv.querySelector('.feedback-no').addEventListener('click', () => {
                        feedbackDiv.innerHTML = `
                            <span>We're sorry. Please try:</span>
                            <ul class="feedback-suggestions">
                                <li>Be more specific in your question</li>
                                <li>Try a different way of asking</li>
                                <li>Ask about something clearly visible in the image</li>
                            </ul>
                        `;
                    });
                }, 300);
            }).catch(error => {
                answerContent.innerHTML = `<div class="answer-error">Sorry, I couldn't process your question: ${error.message || 'Unknown error'}. Please try again.</div>`;
                askButton.disabled = false;
                askButton.textContent = 'Ask AI';
            });
        }
    }
    
    // Handle double-click for quick element selection
    function handleDoubleClick(e) {
        if (pendingAnalysis) return;
        
        // Try to get the element under the cursor
        const element = document.elementFromPoint(e.clientX, e.clientY);
        
        if (!element || element === overlay) return;
        
        // Get the bounding rectangle of the element
        const rect = element.getBoundingClientRect();
        
        // Set as the current selection
        startX = rect.left;
        startY = rect.top;
        endX = rect.right;
        endY = rect.bottom;
        
        // Update the selection display
        updateSelectionDisplay(startX, startY, endX, endY);
        
        // Show controls
        showControls();
        
        // Update instructions
        if (instructions) {
            instructions.textContent = "Element selected. Click Analyze to process.";
        }
        
        // Prevent default action
        e.preventDefault();
        e.stopPropagation();
    }

    function showShortcutsHelp() {
      const helpPopup = document.createElement('div');
      helpPopup.className = 'screenshot-help-popup';
      helpPopup.innerHTML = `
        <div class="screenshot-help-content">
          <h3>AI Screenshot Analyzer Shortcuts</h3>
          <ul>
            <li><kbd>Esc</kbd> <span>Cancel selection / close</span></li>
            <li><kbd>Enter</kbd> <span>Analyze current selection</span></li>
            <li><kbd>R</kbd> <span>Reset current selection</span></li>
            <li><kbd>?</kbd> <span>Show this help guide</span></li>
          </ul>
          <div class="help-tips">
            <div class="help-tip-title">Tips for best results:</div>
            <ul class="help-tips-list">
              <li>Select specific, clear areas of the screen</li>
              <li>Include enough context for accurate analysis</li>
              <li>For text recognition, ensure text is clearly visible</li>
            </ul>
          </div>
          <button class="screenshot-button screenshot-help-close">Got it</button>
        </div>
      `;
      document.body.appendChild(helpPopup);
      
      helpPopup.querySelector('.screenshot-help-close').addEventListener('click', () => {
        helpPopup.remove();
      });
    }

    // Set up all event handlers
    function setupAllHandlers(modal, analysisText, screenshotUrl) {
      // Set up image tools
      setupImageTools(modal);
      
      // Set up question answering
      setupQuestionAnswering(modal, screenshotUrl, analysisText);
      
      // Add event listeners for buttons
      const closeResultsButton = modal.querySelector('.screenshot-close-results');
      const closeButton = modal.querySelector('.screenshot-close');
      const newSelectionButton = modal.querySelector('.screenshot-new-selection');
      const copyTextButton = modal.querySelector('.screenshot-copy-text');
      const exportPdfButton = modal.querySelector('.screenshot-export-pdf');
      
      closeResultsButton.addEventListener('click', () => {
        modal.remove();
      });
      
      closeButton.addEventListener('click', () => {
        modal.remove();
      });
      
      newSelectionButton.addEventListener('click', () => {
        modal.remove();
        createSelectionUI();
      });
      
      copyTextButton.addEventListener('click', () => {
        navigator.clipboard.writeText(analysisText)
          .then(() => {
            showNotification('Analysis copied to clipboard', 'success');
          })
          .catch(() => {
            showNotification('Failed to copy text', 'error');
          });
      });
      
      exportPdfButton.addEventListener('click', () => {
        exportToPDF(screenshotUrl, analysisText);
      });
    }

    // Set up image tools functionality
    function setupImageTools(modal) {
      const imageElement = modal.querySelector('.screenshot-results-image img');
      const toolButtons = modal.querySelectorAll('.image-tool-button');
      
      if (!imageElement || !toolButtons.length) return;
      
      toolButtons.forEach(button => {
        button.addEventListener('click', () => {
          const tool = button.getAttribute('data-tool');
          
          // Toggle active state
          if (tool !== 'save') {
            button.classList.toggle('active');
          }
          
          switch(tool) {
            case 'zoom':
              if (button.classList.contains('active')) {
                imageElement.style.cursor = 'zoom-in';
                imageElement.addEventListener('click', handleImageZoom);
              } else {
                imageElement.style.cursor = '';
                imageElement.removeEventListener('click', handleImageZoom);
                imageElement.style.transform = '';
              }
              break;
              
            case 'brighten':
              if (button.classList.contains('active')) {
                imageElement.style.filter = 'brightness(1.3)';
                // Deactivate contrast if active
                const contrastButton = Array.from(toolButtons).find(b => b.getAttribute('data-tool') === 'contrast');
                if (contrastButton && contrastButton.classList.contains('active')) {
                  contrastButton.classList.remove('active');
                }
              } else {
                imageElement.style.filter = '';
              }
              break;
              
            case 'contrast':
              if (button.classList.contains('active')) {
                imageElement.style.filter = 'contrast(1.3)';
                // Deactivate brightness if active
                const brightnessButton = Array.from(toolButtons).find(b => b.getAttribute('data-tool') === 'brighten');
                if (brightnessButton && brightnessButton.classList.contains('active')) {
                  brightnessButton.classList.remove('active');
                }
              } else {
                imageElement.style.filter = '';
              }
              break;
              
            case 'save':
              downloadImage(imageElement.src, 'screenshot-analysis.png');
              break;
          }
        });
      });
      
      // Handle image zoom click
      function handleImageZoom(e) {
        const rect = imageElement.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (imageElement.style.transform === '') {
          // Zoom in
          imageElement.style.transformOrigin = `${x}px ${y}px`;
          imageElement.style.transform = 'scale(2)';
          imageElement.style.cursor = 'zoom-out';
        } else {
          // Zoom out
          imageElement.style.transform = '';
          imageElement.style.cursor = 'zoom-in';
        }
      }
    }

    // Add OCR feature
    function addOcrFeature(modalElement, analysisText, imageUrl) {
      // Create OCR button
      const actionsContainer = modalElement.querySelector('.screenshot-results-actions');
      const ocrButton = document.createElement('button');
      ocrButton.className = 'screenshot-button screenshot-ocr-button';
      ocrButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 7 4 4 20 4 20 7"></polyline>
          <line x1="9" y1="20" x2="15" y2="20"></line>
          <line x1="12" y1="4" x2="12" y2="20"></line>
        </svg>
        Extract Text
      `;
      
      // Insert as second button
      actionsContainer.insertBefore(ocrButton, actionsContainer.children[1]);
      
      // Add OCR functionality
      ocrButton.addEventListener('click', () => {
        // Show loading
        ocrButton.disabled = true;
        ocrButton.innerHTML = '<div class="button-spinner"></div> Extracting...';
        
        // Request OCR from background script
        browser.runtime.sendMessage({
          action: 'extractText',
          data: {
            imageDataUrl: imageUrl
          }
        }).then(response => {
          // Show OCR results
          showOcrResults(modalElement, response.text);
          ocrButton.disabled = false;
          ocrButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 7 4 4 20 4 20 7"></polyline>
              <line x1="9" y1="20" x2="15" y2="20"></line>
              <line x1="12" y1="4" x2="12" y2="20"></line>
            </svg>
            Extract Text
          `;
          }).catch(error => {
          showNotification('Failed to extract text: ' + error.message, 'error');
          ocrButton.disabled = false;
          ocrButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 7 4 4 20 4 20 7"></polyline>
              <line x1="9" y1="20" x2="15" y2="20"></line>
              <line x1="12" y1="4" x2="12" y2="20"></line>
            </svg>
            Extract Text
          `;
        });
      });
    }

    // Show OCR results in modal
    function showOcrResults(modalElement, text) {
      // Create OCR results container if it doesn't exist
      let ocrContainer = modalElement.querySelector('.screenshot-ocr-results');
      if (!ocrContainer) {
        ocrContainer = document.createElement('div');
        ocrContainer.className = 'screenshot-ocr-results';
        modalElement.querySelector('.screenshot-results-content').appendChild(ocrContainer);
      }
      
      ocrContainer.innerHTML = `
        <h3>Extracted Text:</h3>
        <div class="ocr-text-content">${text || 'No text detected in image'}</div>
        <div class="ocr-actions">
          <button class="screenshot-button ocr-copy-button">Copy Text</button>
        </div>
      `;
      
      // Copy button functionality
      ocrContainer.querySelector('.ocr-copy-button').addEventListener('click', () => {
        navigator.clipboard.writeText(text)
          .then(() => showNotification('Text copied to clipboard!', 'success'))
          .catch(err => showError('Failed to copy text: ' + err.message));
      });
      
      // Scroll to OCR results
      ocrContainer.scrollIntoView({ behavior: 'smooth' });
    }

    function showAnalysisOptions() {
      const analysisOptionsHTML = `
        <div class="screenshot-analysis-options">
          <h3>Analysis Options</h3>
          <div class="analysis-option-group">
            <label>
              <input type="radio" name="analysis-type" value="general" checked>
              General Analysis
            </label>
            <label>
              <input type="radio" name="analysis-type" value="technical">
              Technical Details
            </label>
            <label>
              <input type="radio" name="analysis-type" value="accessibility">
              Accessibility Review
            </label>
            <label>
              <input type="radio" name="analysis-type" value="design">
              Design Feedback
            </label>
          </div>
          <button class="screenshot-button screenshot-accept" id="confirm-analysis">Continue</button>
        </div>
      `;
      
      const optionsContainer = document.createElement('div');
      optionsContainer.className = 'screenshot-options-container';
      optionsContainer.innerHTML = analysisOptionsHTML;
      document.body.appendChild(optionsContainer);
      
      document.getElementById('confirm-analysis').addEventListener('click', () => {
        const selectedOption = document.querySelector('input[name="analysis-type"]:checked').value;
        optionsContainer.remove();
        captureAndAnalyzeWithOption(selectedOption);
      });
    }

    function captureAndAnalyzeWithOption(option) {
      // Store the selected option for use in the analysis
      localStorage.setItem('currentAnalysisOption', option);
      captureAndAnalyze();
    }

    // Add image editing functionality
    function addImageEditingTools(imageElement, container) {
      const toolsHTML = `
        <div class="screenshot-image-tools">
          <div class="image-tools-header">
            <h3>Image Tools</h3>
          </div>
          <div class="image-tools-buttons">
            <button class="image-tool-button" data-tool="crop">
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M17,15H19V7C19,5.9 18.1,5 17,5H9V7H17V15M7,17V1H5V5H1V7H5V17A2,2 0 0,1 7,19H17V23H19V19H23V17H7Z" />
              </svg>
              Crop
            </button>
            <button class="image-tool-button" data-tool="annotate">
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" />
              </svg>
              Annotate
            </button>
            <button class="image-tool-button" data-tool="highlight">
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M18.5,1.15C17.97,1.15 17.46,1.34 17.07,1.73L11.26,7.55L16.91,13.2L22.73,7.39C23.5,6.61 23.5,5.35 22.73,4.56L19.89,1.73C19.5,1.34 19,1.15 18.5,1.15M10.3,8.5L4.34,14.46C3.56,15.24 3.56,16.5 4.36,17.31C3.14,18.54 1.9,19.77 0.67,21H6.33L7.19,20.14C7.97,20.9 9.22,20.89 10,20.12L15.95,14.16" />
              </svg>
              Highlight
            </button>
            <button class="image-tool-button" data-tool="blur">
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M12,18C11.11,18 10.26,17.8 9.5,17.45C9.2,17.81 8.76,18 8.5,18C6.47,18 5,16.5 5,14.5V14H4A2,2 0 0,1 2,12A2,2 0 0,1 4,10H5V9.5C5,7.5 6.47,6 8.5,6C8.79,6 9.06,6.06 9.31,6.13C10.05,4.29 11.89,3 14,3A5,5 0 0,1 19,8A5,5 0 0,1 14,13H12V15A3,3 0 0,0 15,18C15.36,18 15.7,17.93 16,17.82L16.12,17.76C15.64,17.31 15.32,16.68 15.32,16C15.32,14.89 16.22,14 17.32,14C18.43,14 19.32,14.89 19.32,16A3,3 0 0,1 16.32,19C14.5,19 13,17.5 13,15.68V13H14A3,3 0 0,0 17,10A3,3 0 0,0 14,7C12.34,7 11,8.34 11,10C11,10.35 11.06,10.68 11.18,11H8.5C7.57,11 7,11.57 7,12.5V13H10C10.56,13 11,12.56 11,12C11,11.44 10.56,11 10,11H8.5C8.22,11 8,11.22 8,11.5V14.5C8,14.78 8.22,15 8.5,15C8.78,15 9,14.78 9,14.5V12.5C9,12.22 9.22,12 9.5,12C9.77,12 10,12.22 10,12.5C10,12.71 9.89,12.89 9.72,13C9.89,13.11 10,13.29 10,13.5V14.32C10,14.88 10.2,15.25 10.5,15.25C10.8,15.25 11,14.88 11,14.32V13.5C11,13.22 11.22,13 11.5,13C11.78,13 12,13.22 12,13.5C12,13.71 11.89,13.89 11.72,14C11.89,14.11 12,14.29 12,14.5C12,14.78 11.78,15 11.5,15C11.22,15 11,14.78 11,14.5V14.32C11,13.54 10.71,13 10.29,12.82C10.57,12.43 11,12.17 11.5,12.08V12C11.5,11.17 12.17,10.5 13,10.5C13.83,10.5 14.5,11.17 14.5,12C14.5,12.83 13.83,13.5 13,13.5C12.67,13.5 12.37,13.39 12.14,13.21C12.04,13.42 12,13.65 12,13.9V14.5C12,16.43 13.57,18 15.5,18C15.71,18 15.91,17.97 16.1,17.92L16.14,18C16.77,18.62 17.68,19 18.7,19C20.54,19 22,17.5 22,15.68C22,14.87 21.62,14.14 21,13.7C21.05,13.5 21.08,13.25 21.08,13C21.08,11.7 20.3,10.6 19.18,10.12C19.07,7.28 16.75,5 13.9,5C10.9,5 8.46,7.4 8.5,10.38C7.04,10.64 6,11.88 6,13.4V14.5C6,15.88 7.12,17 8.5,17C9.58,17 10.5,16.26 10.82,15.24C11.16,15.41 11.55,15.5 11.95,15.5C12.71,15.5 13.38,15.19 13.79,14.67C13.87,14.71 13.93,14.78 14,14.82C12.8,16.67 9.86,17.6 8.5,17" />
              </svg>
              Blur
            </button>
          </div>
        </div>
      `;
      
      const toolsContainer = document.createElement('div');
      toolsContainer.className = 'image-editing-container';
      toolsContainer.innerHTML = toolsHTML;
      container.appendChild(toolsContainer);
      
      // Implement tool functionality
      const toolButtons = toolsContainer.querySelectorAll('.image-tool-button');
      toolButtons.forEach(button => {
        button.addEventListener('click', () => {
          const tool = button.dataset.tool;
          applyImageTool(tool, imageElement);
        });
      });
    }

    function applyImageTool(tool, imageElement) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = imageElement.naturalWidth;
      canvas.height = imageElement.naturalHeight;
      ctx.drawImage(imageElement, 0, 0);
      
      switch (tool) {
        case 'crop':
          enableCropMode(canvas, imageElement);
          break;
        case 'annotate':
          enableAnnotateMode(canvas, imageElement);
          break;
        case 'highlight':
          enableHighlightMode(canvas, imageElement);
          break;
        case 'blur':
          enableBlurMode(canvas, imageElement);
          break;
      }
    }

    function enhanceQuestionInterface(container) {
      // Create chatbot-like interface
      const chatInterface = document.createElement('div');
      chatInterface.className = 'screenshot-chat-interface';
      
      const chatHTML = `
        <div class="chat-container">
          <div class="chat-messages" id="chat-messages">
            <div class="chat-message system">
              <div class="message-avatar">
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,10.5A1.5,1.5 0 0,1 13.5,12A1.5,1.5 0 0,1 12,13.5A1.5,1.5 0 0,1 10.5,12A1.5,1.5 0 0,1 12,10.5M7.5,10.5A1.5,1.5 0 0,1 9,12A1.5,1.5 0 0,1 7.5,13.5A1.5,1.5 0 0,1 6,12A1.5,1.5 0 0,1 7.5,10.5M16.5,10.5A1.5,1.5 0 0,1 18,12A1.5,1.5 0 0,1 16.5,13.5A1.5,1.5 0 0,1 15,12A1.5,1.5 0 0,1 16.5,10.5Z" />
                </svg>
              </div>
              <div class="message-content">
                I've analyzed this screenshot. Ask me anything about it!
              </div>
            </div>
          </div>
          
          <div class="chat-input-container">
            <input type="text" id="chat-input" class="chat-input" placeholder="Ask a question about this screenshot...">
            <button id="send-question" class="send-question-button">
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M2,21L23,12L2,3V10L17,12L2,14V21Z" />
              </svg>
            </button>
          </div>
        </div>
      `;
      
      chatInterface.innerHTML = chatHTML;
      container.appendChild(chatInterface);
      
      // Setup event listeners
      const chatInput = document.getElementById('chat-input');
      const sendButton = document.getElementById('send-question');
      const messagesContainer = document.getElementById('chat-messages');
      
      const sendQuestion = () => {
        const question = chatInput.value.trim();
        if (!question) return;
        
        // Add user message to chat
        const userMessageHTML = `
          <div class="chat-message user">
            <div class="message-content">
              ${escapeHTML(question)}
            </div>
            <div class="message-avatar user-avatar">
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z" />
              </svg>
            </div>
          </div>
        `;
        messagesContainer.insertAdjacentHTML('beforeend', userMessageHTML);
        
        // Add loading indicator
        const loadingHTML = `
          <div class="chat-message system loading" id="loading-message">
            <div class="message-avatar">
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,10.5A1.5,1.5 0 0,1 13.5,12A1.5,1.5 0 0,1 12,13.5A1.5,1.5 0 0,1 10.5,12A1.5,1.5 0 0,1 12,10.5M7.5,10.5A1.5,1.5 0 0,1 9,12A1.5,1.5 0 0,1 7.5,13.5A1.5,1.5 0 0,1 6,12A1.5,1.5 0 0,1 7.5,10.5M16.5,10.5A1.5,1.5 0 0,1 18,12A1.5,1.5 0 0,1 16.5,13.5A1.5,1.5 0 0,1 15,12A1.5,1.5 0 0,1 16.5,10.5Z" />
              </svg>
            </div>
            <div class="message-content">
              <span class="typing-indicator"><span>.</span><span>.</span><span>.</span></span>
            </div>
          </div>
        `;
        messagesContainer.insertAdjacentHTML('beforeend', loadingHTML);
        
        // Send question to AI
        askGeminiQuestion(question, imageUrl, analysisText)
          .then(answer => {
            // Remove loading indicator
            document.getElementById('loading-message').remove();
            
            // Add AI response
            const aiResponseHTML = `
              <div class="chat-message system">
                <div class="message-avatar">
                  <svg width="24" height="24" viewBox="0 0 24 24">
                    <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,10.5A1.5,1.5 0 0,1 13.5,12A1.5,1.5 0 0,1 12,13.5A1.5,1.5 0 0,1 10.5,12A1.5,1.5 0 0,1 12,10.5M7.5,10.5A1.5,1.5 0 0,1 9,12A1.5,1.5 0 0,1 7.5,13.5A1.5,1.5 0 0,1 6,12A1.5,1.5 0 0,1 7.5,10.5M16.5,10.5A1.5,1.5 0 0,1 18,12A1.5,1.5 0 0,1 16.5,13.5A1.5,1.5 0 0,1 15,12A1.5,1.5 0 0,1 16.5,10.5Z" />
                  </svg>
                </div>
                <div class="message-content">
                  ${formatAIResponse(answer)}
                </div>
              </div>
            `;
            messagesContainer.insertAdjacentHTML('beforeend', aiResponseHTML);
            
            // Scroll to bottom
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          })
          .catch(error => {
            // Remove loading indicator
            document.getElementById('loading-message').remove();
            
            // Add error message
            const errorHTML = `
              <div class="chat-message error">
                <div class="message-avatar">
                  <svg width="24" height="24" viewBox="0 0 24 24">
                    <path d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z" />
                  </svg>
                </div>
                <div class="message-content">
                  Sorry, I encountered an error: ${error.message}
                </div>
              </div>
            `;
            messagesContainer.insertAdjacentHTML('beforeend', errorHTML);
          });
        
        // Clear input
        chatInput.value = '';
      };
      
      sendButton.addEventListener('click', sendQuestion);
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          sendQuestion();
        }
      });
    }

    function formatAIResponse(text) {
      // Convert markdown-like syntax to HTML
      return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    }

    function escapeHTML(text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Add export functionality
    function addExportOptions(container, imageDataUrl, analysisText) {
      const exportHTML = `
        <div class="export-options">
          <h3>Export Results</h3>
          <div class="export-buttons">
            <button class="export-button" data-format="pdf">
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M19,3A2,2 0 0,1 21,5V19A2,2 0 0,1 19,21H5A2,2 0 0,1 3,19V5A2,2 0 0,1 5,3M9.5,11.5V6.5H8V11.5A1.5,1.5 0 0,0 9.5,13A1.5,1.5 0 0,0 11,11.5A1.5,1.5 0 0,0 9.5,10H7.5V8.5H9.5A3,3 0 0,1 12.5,11.5A3,3 0 0,1 9.5,14.5A3,3 0 0,1 6.5,11.5V6.5H5V5H9.5V6.5M14,6.5H16.5V10H14V11.5H16.5V13H14V17.5H12.5V5H16.5V6.5H14Z" />
              </svg>
              Export as PDF
            </button>
            <button class="export-button" data-format="markdown">
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M20.56 18H3.44C2.65 18 2 17.37 2 16.59V7.41C2 6.63 2.65 6 3.44 6H20.56C21.35 6 22 6.63 22 7.41V16.59C22 17.37 21.35 18 20.56 18M6.81 15.19V11.53L8.73 13.88L10.65 11.53V15.19H12.58V8.81H10.65L8.73 11.16L6.81 8.81H4.89V15.19H6.81M19.69 12H17.77V8.81H15.85V12H13.92L16.81 15.28L19.69 12Z" />
              </svg>
              Export as Markdown
            </button>
            <button class="export-button" data-format="html">
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M12,17.56L16.07,16.43L16.62,10.33H9.38L9.2,8.3H16.8L17.81,9.93L19.69,12Z" />
              </svg>
              Export as HTML
            </button>
            <button class="export-button" data-format="image">
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M13,9H18.5L13,3.5V9M6,2H14L20,8V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V4C4,2.89 4.89,2 6,2M6,20H15L18,20V12L14,16L12,14L6,20M8,9A2,2 0 0,0 6,11A2,2 0 0,0 8,13A2,2 0 0,0 10,11A2,2 0 0,0 8,9Z" />
              </svg>
              Export as Image
            </button>
          </div>
        </div>
      `;
      
      const exportContainer = document.createElement('div');
      exportContainer.className = 'screenshot-export-container';
      exportContainer.innerHTML = exportHTML;
      container.appendChild(exportContainer);
      
      // Setup event listeners for export buttons
      const exportButtons = exportContainer.querySelectorAll('.export-button');
      exportButtons.forEach(button => {
        button.addEventListener('click', () => {
          const format = button.dataset.format;
          exportAnalysis(format, imageDataUrl, analysisText);
        });
      });
    }

    function exportAnalysis(format, imageDataUrl, analysisText) {
      switch (format) {
        case 'pdf':
          exportAsPDF(imageDataUrl, analysisText);
          break;
        case 'markdown':
          exportAsMarkdown(imageDataUrl, analysisText);
          break;
        case 'html':
          exportAsHTML(imageDataUrl, analysisText);
          break;
        case 'image':
          exportAsImage(imageDataUrl, analysisText);
          break;
      }
    }

    function exportAsPDF(imageDataUrl, analysisText) {
      // Create a hidden iframe to generate PDF
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      
      // Create PDF content
      const content = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>AI Analysis Results</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; }
            h1 { color: #1a73e8; margin-bottom: 20px; }
            img { max-width: 100%; margin: 20px 0; border: 1px solid #dadce0; }
            .analysis { line-height: 1.6; }
            .footer { margin-top: 30px; color: #5f6368; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>AI Screenshot Analysis</h1>
          <div class="timestamp">Generated on: ${new Date().toLocaleString()}</div>
          <img src="${imageDataUrl}" alt="Analyzed Screenshot">
          <div class="analysis">${analysisText}</div>
          <div class="footer">
            Generated with AI Screenshot Analyzer
          </div>
        </body>
        </html>
      `;
      
      iframe.srcdoc = content;
      
      // Show notification
      showNotification("Preparing PDF for download...");
    }

    function exportAsMarkdown(imageDataUrl, analysisText) {
      // Create markdown content
      const filename = `ai-analysis-${new Date().getTime()}.md`;
      const content = `# AI Screenshot Analysis
      
Generated on: ${new Date().toLocaleString()}

![Screenshot](${imageDataUrl})

## Analysis

${analysisText}

---
Generated with AI Screenshot Analyzer
`;
      
      // Create download link
      downloadFile(filename, content, 'text/markdown');
      
      // Show notification
      showNotification("Markdown file downloaded");
    }

    function exportAsHTML(imageDataUrl, analysisText) {
      // Create HTML content
      const filename = `ai-analysis-${new Date().getTime()}.html`;
      const content = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>AI Analysis Results</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; max-width: 800px; margin: 0 auto; }
        h1 { color: #1a73e8; margin-bottom: 20px; }
        img { max-width: 100%; margin: 20px 0; border: 1px solid #dadce0; border-radius: 8px; }
        .analysis { line-height: 1.6; }
        .timestamp { color: #5f6368; margin-bottom: 20px; }
        .footer { margin-top: 40px; color: #5f6368; font-size: 12px; border-top: 1px solid #dadce0; padding-top: 20px; }
      </style>
    </head>
    <body>
      <h1>AI Screenshot Analysis</h1>
      <div class="timestamp">Generated on: ${new Date().toLocaleString()}</div>
      <img src="${imageDataUrl}" alt="Analyzed Screenshot">
      <div class="analysis">${analysisText}</div>
      <div class="footer">
        Generated with AI Screenshot Analyzer
      </div>
    </body>
    </html>
  `;
      
      // Create download link
      downloadFile(filename, content, 'text/html');
      
      // Show notification
      showNotification("HTML file downloaded");
    }

    function exportAsImage(imageDataUrl, analysisText) {
      // Create a canvas to combine the screenshot and analysis
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Create a temporary image to get dimensions
      const img = new Image();
      img.onload = function() {
        // Set canvas dimensions
        const padding = 40;
        const textHeight = 200; // Estimated height for text
        canvas.width = img.width + (padding * 2);
        canvas.height = img.height + textHeight + (padding * 2);
        
        // Fill background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw border
        ctx.strokeStyle = '#dadce0';
        ctx.lineWidth = 1;
        ctx.strokeRect(padding/2, padding/2, canvas.width - padding, canvas.height - padding);
        
        // Draw heading
        ctx.fillStyle = '#1a73e8';
        ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
        ctx.fillText('AI Screenshot Analysis', padding, padding + 24);
        
        // Draw timestamp
        ctx.fillStyle = '#5f6368';
        ctx.font = '12px system-ui, -apple-system, sans-serif';
        ctx.fillText(`Generated on: ${new Date().toLocaleString()}`, padding, padding + 48);
        
        // Draw the image
        ctx.drawImage(img, padding, padding + 60);
        
        // Draw analysis text (simple truncated version)
        ctx.fillStyle = '#202124';
        ctx.font = '14px system-ui, -apple-system, sans-serif';
        const maxTextLength = 200;
        const truncatedText = analysisText.length > maxTextLength 
          ? analysisText.substring(0, maxTextLength) + '...' 
          : analysisText;
        
        ctx.fillText(truncatedText, padding, padding + img.height + 90);
        
        // Draw footer
        ctx.fillStyle = '#5f6368';
        ctx.font = '12px system-ui, -apple-system, sans-serif';
        ctx.fillText('Generated with AI Screenshot Analyzer', padding, canvas.height - padding/2);
        
        // Convert canvas to image and download
        const dataUrl = canvas.toDataURL('image/png');
        const filename = `ai-analysis-${new Date().getTime()}.png`;
        
        // Create download link
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        link.click();
        
        // Show notification
        showNotification("Image downloaded");
      };
      
      img.src = imageDataUrl;
    }

    function downloadFile(filename, content, mimeType) {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }

    // Add comparison mode functionality
    function enableComparisonMode() {
      // Store previous screenshot for comparison
      const previousScreenshot = localStorage.getItem('lastScreenshot');
      
      if (!previousScreenshot) {
        showNotification("No previous screenshot to compare with. Take a screenshot first.");
        return;
      }
      
      // Show UI for selecting a new area to compare
      showNotification("Select an area to compare with previous screenshot");
      
      // Create a semi-transparent overlay to show the previous screenshot position
      const overlay = document.createElement('div');
      overlay.className = 'comparison-overlay';
      document.body.appendChild(overlay);
      
      // After taking the new screenshot, show comparison UI
      const showComparison = (newScreenshot) => {
        // Create comparison UI
        const comparisonContainer = document.createElement('div');
        comparisonContainer.className = 'comparison-container';
        
        comparisonContainer.innerHTML = `
          <div class="comparison-header">
            <h3>Visual Comparison</h3>
            <button class="close-button">×</button>
          </div>
          <div class="comparison-content">
            <div class="comparison-item">
              <h4>Before</h4>
              <img src="${previousScreenshot}" class="comparison-image">
            </div>
            <div class="comparison-controls">
              <button class="comparison-button" data-mode="side-by-side">
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <path d="M21,3H3A2,2 0 0,0 1,5V19A2,2 0 0,0 3,21H21A2,2 0 0,0 23,19V5A2,2 0 0,0 21,3M11,19H3V5H11V19M21,19H13V5H21V19Z" />
                </svg>
              </button>
              <button class="comparison-button" data-mode="slider">
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <path d="M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z" />
                </svg>
              </button>
              <button class="comparison-button" data-mode="diff">
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <path d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M19,5V19H5V5H19Z M17,17H7V16H17V17M17,15H7V14H17V15M17,12H7V7H17V12Z" />
                </svg>
              </button>
            </div>
            <div class="comparison-item">
              <h4>After</h4>
              <img src="${newScreenshot}" class="comparison-image">
            </div>
          </div>
          <div class="comparison-actions">
            <button class="analyze-differences-button">Analyze Differences</button>
            <button class="export-comparison-button">Export Comparison</button>
          </div>
        `;
        
        document.body.appendChild(comparisonContainer);
        
        // Set up event listeners for comparison controls
        const closeButton = comparisonContainer.querySelector('.close-button');
        closeButton.addEventListener('click', () => {
          comparisonContainer.remove();
        });
        
        const comparisonButtons = comparisonContainer.querySelectorAll('.comparison-button');
        comparisonButtons.forEach(button => {
          button.addEventListener('click', () => {
            const mode = button.dataset.mode;
            updateComparisonMode(mode, comparisonContainer, previousScreenshot, newScreenshot);
          });
        });
        
        // Set up analyze differences button
        const analyzeButton = comparisonContainer.querySelector('.analyze-differences-button');
        analyzeButton.addEventListener('click', () => {
          analyzeDifferences(previousScreenshot, newScreenshot);
        });
      };
      
      // Listen for completion of new screenshot and trigger comparison
      document.addEventListener('newScreenshotTaken', (event) => {
        showComparison(event.detail.dataUrl);
      }, { once: true });
    }

    function updateComparisonMode(mode, container, before, after) {
      const comparisonContent = container.querySelector('.comparison-content');
      
      switch (mode) {
        case 'side-by-side':
          comparisonContent.className = 'comparison-content side-by-side';
          break;
        case 'slider':
          setupSliderView(comparisonContent, before, after);
          break;
        case 'diff':
          setupDiffView(comparisonContent, before, after);
          break;
      }
    }

    function setupSliderView(container, before, after) {
      container.innerHTML = `
        <div class="slider-container">
          <img src="${before}" class="slider-image before-image">
          <img src="${after}" class="slider-image after-image">
          <div class="slider-handle"></div>
        </div>
      `;
      
      const sliderHandle = container.querySelector('.slider-handle');
      const afterImage = container.querySelector('.after-image');
      
      // Initial position
      afterImage.style.width = '50%';
      
      // Make slider draggable
      let isDragging = false;
      
      sliderHandle.addEventListener('mousedown', () => {
        isDragging = true;
      });
      
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const sliderRect = container.querySelector('.slider-container').getBoundingClientRect();
        const percentage = Math.max(0, Math.min(100, ((e.clientX - sliderRect.left) / sliderRect.width) * 100));
        
        afterImage.style.width = `${percentage}%`;
        sliderHandle.style.left = `${percentage}%`;
      });
      
      document.addEventListener('mouseup', () => {
        isDragging = false;
      });
    }

    function setupDiffView(container, before, after) {
      // Create a canvas to visualize differences
      const diffContainer = document.createElement('div');
      diffContainer.className = 'diff-container';
      diffContainer.innerHTML = '<canvas id="diff-canvas"></canvas>';
      container.innerHTML = '';
      container.appendChild(diffContainer);
      
      // Load both images
      const beforeImg = new Image();
      const afterImg = new Image();
      
      Promise.all([
        new Promise(resolve => {
          beforeImg.onload = resolve;
          beforeImg.src = before;
        }),
        new Promise(resolve => {
          afterImg.onload = resolve;
          afterImg.src = after;
        })
      ]).then(() => {
        // Calculate diff
        const canvas = document.getElementById('diff-canvas');
        canvas.width = Math.max(beforeImg.width, afterImg.width);
        canvas.height = Math.max(beforeImg.height, afterImg.height);
        
        const ctx = canvas.getContext('2d');
        
        // Draw before image
        ctx.drawImage(beforeImg, 0, 0);
        
        // Draw after image with difference blending
        ctx.globalCompositeOperation = 'difference';
        ctx.drawImage(afterImg, 0, 0);
        
        // Enhance differences
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
          // Boost difference visibility
          data[i] *= 5;     // R
          data[i+1] *= 5;   // G
          data[i+2] *= 5;   // B
        }
        
        ctx.putImageData(imageData, 0, 0);
      });
    }

    function analyzeDifferences(before, after) {
      showNotification("Analyzing differences...");
      
      // Send both images to AI for analysis
      browser.runtime.sendMessage({
        action: 'analyzeDifferences',
        data: {
          before: before,
          after: after
        }
      }).then(result => {
        // Show analysis results
        showDifferenceAnalysis(result.analysis);
      }).catch(error => {
        showError("Error analyzing differences: " + error.message);
      });
    }

    // Function to fully close the extension
    function closeExtension() {
        console.log("Closing extension");
        // Clean up all UI elements
        cleanup(false);
        // Notify anyone interested that we're closing
        browser.runtime.sendMessage({
            action: "extensionClosed"
        }).catch(error => {
            console.error("Error sending close message:", error);
        });
    }
  })(); // This is the closing bracket for the IIFE