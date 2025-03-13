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
      const selectionTop = Math.min(startY, endY);
      
      if (selectionTop > 40) {
        // Show above selection if there's room
        coordsDisplay.style.top = (selectionTop - 30) + 'px';
      } else {
        // Show below selection
        coordsDisplay.style.top = (Math.max(startY, endY) + 10) + 'px';
      }
      
      coordsDisplay.style.left = Math.min(startX, endX) + 'px';
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
      if (e.key === 'Escape') {
        cleanup();
      } else if (e.key === 'Enter' && selection && selection.style.display !== 'none') {
        captureAndAnalyze();
      } else if (e.key === 'r' || e.key === 'R') {
        resetSelection();
      } else if (e.key === '?') {
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
      
      // Position controls below or above the selection
      if (selectionRect.bottom + 60 < viewportHeight) {
        controls.style.left = selectionRect.left + 'px';
        controls.style.top = (selectionRect.bottom + 10) + 'px';
      } else {
        controls.style.left = selectionRect.left + 'px';
        controls.style.top = (selectionRect.top - 50) + 'px';
      }
      
      // Create accept (Analyze) button
      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'screenshot-button screenshot-accept';
      acceptBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Analyze';
      acceptBtn.addEventListener('click', () => {
        console.log("Analyze button clicked");
        captureAndAnalyze();
      });
      
      // Create refresh button
      const refreshBtn = document.createElement('button');
      refreshBtn.className = 'screenshot-button screenshot-refresh';
      refreshBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path></svg> Redraw';
      refreshBtn.addEventListener('click', () => {
        console.log("Redraw button clicked");
        resetSelection();
        createSelectionUI();
      });
      
      // Create close button
      const closeBtn = document.createElement('button');
      closeBtn.className = 'screenshot-button screenshot-close';
      closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Cancel';
      closeBtn.addEventListener('click', () => {
        console.log("Close button clicked");
        closeExtension();
      });
      
      // Add buttons to controls
      controls.appendChild(acceptBtn);
      controls.appendChild(refreshBtn);
      controls.appendChild(closeBtn);
      
      // Add controls to document
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
            timestamp: new Date().toISOString()
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
        '.screenshot-results-modal'
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
      const loader = document.querySelector('.screenshot-loader');
      if (loader) loader.remove();
    }
    
    // Show an error message
    function showError(message) {
      console.error("Showing error:", message);
      const errorBox = document.createElement('div');
      errorBox.className = 'screenshot-error';
      errorBox.innerHTML = `
        <div class="screenshot-error-title">Error</div>
        <div class="screenshot-error-message">${message}</div>
        <button class="screenshot-button screenshot-close-error">Close</button>
      `;
      document.body.appendChild(errorBox);
      
      // Add close button listener
      errorBox.querySelector('.screenshot-close-error').addEventListener('click', () => {
        errorBox.remove();
      });
      
      // Auto-remove after 10 seconds
      setTimeout(() => {
        if (document.body.contains(errorBox)) {
          errorBox.remove();
        }
      }, 10000);
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
            <button class="screenshot-close-results">×</button>
          </div>
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
                        <div class="timestamp">Generated on ${new Date().toLocaleString()}</div>
                    </div>
                    <div class="image-container">
                        <img src="${imageUrl}" alt="Analyzed screenshot">
                    </div>
                    <div class="analysis">${formatAnalysisText(analysisText)}</div>
                    <div class="footer">
                        Generated by AI Screenshot Analyzer
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
            askButton.innerHTML = '<div class="button-spinner"></div> Thinking...';
            answerContainer.style.display = 'block';
            answerContent.innerHTML = '<div class="answer-loading">Analyzing your question...</div>';
            
            // Send to background script
            browser.runtime.sendMessage({
                action: 'askQuestion',
                data: {
                    question: question,
                    imageDataUrl: imageUrl,
                    originalAnalysis: originalAnalysis
                }
            }).then(response => {
                // Display answer
                answerContent.innerHTML = formatAnalysisText(response.answer);
                
                // Reset button
                askButton.disabled = false;
                askButton.textContent = 'Ask AI';
                
                // Add feedback buttons
                const feedbackDiv = document.createElement('div');
                feedbackDiv.className = 'answer-feedback';
                feedbackDiv.innerHTML = `
                    <span>Was this helpful?</span>
                    <button class="feedback-button feedback-yes">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 21h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.58 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2zM9 9l4.34-4.34L12 10h9v2l-3 7H9V9zM1 9h4v12H1z"></path>
                        </svg>
                    </button>
                    <button class="feedback-button feedback-no">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm0 12l-4.34 4.34L12 14H3v-2l3-7h9v10zm4-12h4v12h-4z"></path>
                        </svg>
                    </button>
                `;
                answerContent.appendChild(feedbackDiv);
                
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
                
                // Ensure the answer is visible
                answerContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                
            }).catch(error => {
                answerContent.innerHTML = `<div class="answer-error">Sorry, I couldn't process your question. Please try again.</div>`;
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

    function setupAllHandlers(modal, analysisText, screenshotUrl) {
      try {
        // Basic button handlers
        const closeResultsButton = modal.querySelector('.screenshot-close-results');
        if (closeResultsButton) {
          closeResultsButton.addEventListener('click', () => {
            modal.remove();
          });
        }
        
        const newSelectionButton = modal.querySelector('.screenshot-new-selection');
        if (newSelectionButton) {
          newSelectionButton.addEventListener('click', () => {
            modal.remove();
            createSelectionUI();
          });
        }
        
        const copyTextButton = modal.querySelector('.screenshot-copy-text');
        if (copyTextButton) {
          copyTextButton.addEventListener('click', () => {
            navigator.clipboard.writeText(analysisText)
              .then(() => showNotification('Analysis text copied to clipboard!', 'success'))
              .catch(err => showError('Failed to copy text: ' + err.message));
          });
        }
        
        const closeButton = modal.querySelector('.screenshot-close');
        if (closeButton) {
          closeButton.addEventListener('click', () => {
            closeExtension();
            modal.remove();
          });
        }
        
        // Export PDF functionality
        const exportPdfButton = modal.querySelector('.screenshot-export-pdf');
        if (exportPdfButton) {
          exportPdfButton.addEventListener('click', () => {
            exportToPDF(screenshotUrl, analysisText);
          });
        }
        
        // Set up image tools
        setupImageTools(modal);
        
        // Set up question answering
        setupQuestionAnswering(modal, screenshotUrl, analysisText);
        
      } catch (error) {
        console.error("Error setting up handlers:", error);
        showError("An error occurred while setting up the interface. Please try again.");
      }
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
  })();