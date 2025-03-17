// selector.js - Handles the screenshot selection area functionality
// This script is injected into the page when the user activates the screenshot tool

(function() {
  // Fix for Firefox/Chrome compatibility
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
  
  // Use debug utilities if available
  const debug = window.ExtDebug || {
    info: console.log,
    error: console.error,
    warn: console.warn,
    debug: console.debug
  };
  
  debug.info("Screenshot selector loaded");
  
  // Check for html2canvas immediately
  if (typeof html2canvas !== 'function') {
    debug.warn("html2canvas not found initially - will check again when needed");
  } else {
    debug.info("html2canvas library detected");
  }
  
  // Variables to track selection state
  let isSelecting = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let overlay, selection, instructions;
  
  // Flag to prevent multiple selection processes
  let selectionActive = false;
  
  // Listen for messages from the background script
  browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    debug.info("Selector received message:", message.action);
    
    if (message.action === "startSelection") {
      debug.info("Starting selection process");
      
      // Prevent multiple selection processes
      if (selectionActive) {
        debug.warn("Selection already active, ignoring duplicate request");
        sendResponse({ success: true, alreadyActive: true });
        return true;
      }
      
      startSelectionProcess();
      sendResponse({ success: true }); // Firefox friendly response
      return true; // Required for Firefox async response
    } else if (message.action === "analysisResult") {
      debug.info("Showing analysis results");
      selectionActive = false; // Reset flag
      showAnalysisResults(message.result, message.screenshot);
      sendResponse({ success: true });
      return true;
    } else if (message.action === "analysisError") {
      debug.error("Analysis error:", message.error);
      selectionActive = false; // Reset flag
      hideLoading();
      showNotification("Analysis error: " + message.error, "error");
      sendResponse({ success: true });
      return true;
    } else if (message.action === "showNotification") {
      debug.info("Showing notification:", message.message);
      showNotification(message.message, message.type || "info");
      sendResponse({ success: true });
      return true;
    }
    
    return false; // Not handled
  });

  function startSelectionProcess() {
    try {
      debug.info("Creating selection elements");
      
      // Set active flag
      selectionActive = true;
      
      // Remove any existing elements first (critical for Firefox)
      cleanupSelectionElements();
      
      // Create the overlay
      createSelectionElements();
      
      // Add event listeners
      document.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('keydown', handleKeyDown);
      
      debug.info("Selection process started successfully");
    } catch (error) {
      debug.error("Error starting selection process:", error);
      selectionActive = false; // Reset flag on error
      showNotification("Failed to start selection: " + error.message, "error");
    }
  }
  
  function createSelectionElements() {
    // Remove any existing elements first
    cleanupSelectionElements();
    
    // Create overlay
    overlay = document.createElement('div');
    overlay.className = 'screenshot-selector-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
    overlay.style.zIndex = '999999';
    overlay.style.cursor = 'crosshair';
    document.body.appendChild(overlay);
    
    // Create instructions
    instructions = document.createElement('div');
    instructions.className = 'screenshot-instructions';
    instructions.style.position = 'fixed';
    instructions.style.top = '10px';
    instructions.style.left = '50%';
    instructions.style.transform = 'translateX(-50%)';
    instructions.style.zIndex = '9999999';
    instructions.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
    instructions.style.color = 'white';
    instructions.style.padding = '10px 15px';
    instructions.style.borderRadius = '4px';
    instructions.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    instructions.style.fontSize = '14px';
    instructions.textContent = 'Click and drag to select an area to analyze';
    document.body.appendChild(instructions);
    
    // Create selection element (initially hidden)
    selection = document.createElement('div');
    selection.className = 'screenshot-selection';
    selection.style.position = 'absolute';
    selection.style.border = '2px solid #4285f4';
    selection.style.backgroundColor = 'rgba(66, 133, 244, 0.1)';
    selection.style.zIndex = '1000000';
    selection.style.display = 'none';
    document.body.appendChild(selection);
    
    debug.info("Selection elements created and appended to document");
  }
  
  function handleMouseDown(e) {
    // Start selection
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    
    // Update selection position
    selection.style.left = startX + 'px';
    selection.style.top = startY + 'px';
    selection.style.width = '0';
    selection.style.height = '0';
    selection.style.display = 'block';
    
    e.preventDefault();
  }
  
  function handleMouseMove(e) {
    if (!isSelecting) return;
    
    // Update current position
    currentX = e.clientX;
    currentY = e.clientY;
    
    // Calculate dimensions
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    // Calculate position (handle selection in any direction)
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    
    // Update selection element
    selection.style.left = left + 'px';
    selection.style.top = top + 'px';
    selection.style.width = width + 'px';
    selection.style.height = height + 'px';
    
    // Update instructions text with dimensions
    instructions.textContent = `Selection: ${width}px × ${height}px`;
  }
  
  function handleMouseUp(e) {
    if (!isSelecting) return;
    isSelecting = false;
    
    // Get final dimensions
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    // Only proceed if selection has meaningful size
    if (width < 10 || height < 10) {
      showNotification("Selection too small. Please select a larger area.", "warning");
      return;
    }
    
    // Create controls
    createSelectionControls();
  }
  
  function handleKeyDown(e) {
    // ESC key cancels the selection
    if (e.key === 'Escape') {
      cancelSelection();
    }
  }
  
  function cancelSelection() {
    // Reset active flag
    selectionActive = false;
    
    // Remove all elements and event listeners
    cleanupSelectionElements();
    document.removeEventListener('mousedown', handleMouseDown);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('keydown', handleKeyDown);
  }
  
  function cleanupSelectionElements() {
    // Remove all created elements
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (selection && selection.parentNode) selection.parentNode.removeChild(selection);
    if (instructions && instructions.parentNode) instructions.parentNode.removeChild(instructions);
    
    // Clean up any other elements (like controls)
    const controls = document.querySelector('.screenshot-controls');
    if (controls && controls.parentNode) controls.parentNode.removeChild(controls);
    
    // Remove any loading elements
    const loader = document.querySelector('.screenshot-loader');
    if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
    
    // Reset variables
    overlay = null;
    selection = null;
    instructions = null;
  }
  
  function createSelectionControls() {
    // Get selection dimensions and position
    const rect = selection.getBoundingClientRect();
    
    // Create controls container
    const controls = document.createElement('div');
    controls.className = 'screenshot-controls';
    controls.style.position = 'fixed';
    controls.style.zIndex = '999999';
    controls.style.display = 'flex';
    controls.style.gap = '10px';
    controls.style.padding = '12px';
    controls.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
    controls.style.borderRadius = '8px';
    controls.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    
    // Position controls below the selection
    controls.style.top = (rect.bottom + 10) + 'px';
    controls.style.left = ((rect.left + rect.right) / 2 - 100) + 'px';
    
    // Create buttons
    const analyzeButton = createButton('screenshot-accept', 'Analyze', captureAndAnalyze);
    const cancelButton = createButton('screenshot-close', 'Cancel', cancelSelection);
    
    // Add buttons to controls
    controls.appendChild(analyzeButton);
    controls.appendChild(cancelButton);
    
    // Add controls to document
    document.body.appendChild(controls);
  }
  
  function createButton(className, text, clickHandler) {
    const button = document.createElement('button');
    button.className = `screenshot-button ${className}`;
    button.textContent = text;
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.padding = '8px 16px';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    button.style.backgroundColor = className.includes('accept') ? '#4285f4' : '#f1f3f4';
    button.style.color = className.includes('accept') ? 'white' : '#3c4043';
    button.style.fontWeight = '500';
    button.addEventListener('click', clickHandler);
    return button;
  }
  
  async function captureAndAnalyze() {
    try {
      // Show loading indicator
      showLoading("Capturing screenshot...");
      
      // Get the selection rectangle coordinates
      const rect = selection.getBoundingClientRect();
      
      // Get the device pixel ratio for accurate screenshots
      const devicePixelRatio = window.devicePixelRatio || 1;
      
      debug.info("Starting capture with html2canvas");
      
      // Check if html2canvas is loaded
      if (typeof html2canvas !== 'function') {
        throw new Error("html2canvas library not loaded. Please try again or reload the page.");
      }
      
      // Safely handle html2canvas options - Firefox may have issues with certain options
      const html2canvasOptions = {
        scale: devicePixelRatio,
        logging: false,
        useCORS: true,
        allowTaint: true
      };
      
      try {
        // Create a canvas from the entire page using html2canvas
        debug.info("Creating canvas with html2canvas");
        const canvas = await html2canvas(document.documentElement, html2canvasOptions);
        
        debug.info("Full page captured, creating cropped canvas");
        
        // Create a new canvas for the cropped region
        const croppedCanvas = document.createElement('canvas');
        const ctx = croppedCanvas.getContext('2d');
        
        // Set the dimensions of the cropped canvas
        const scaledWidth = rect.width * devicePixelRatio;
        const scaledHeight = rect.height * devicePixelRatio;
        croppedCanvas.width = scaledWidth;
        croppedCanvas.height = scaledHeight;
        
        // Safely handle drawing to avoid out-of-bounds issues
        const sourceX = Math.max(0, rect.left * devicePixelRatio);
        const sourceY = Math.max(0, rect.top * devicePixelRatio);
        const sourceWidth = Math.min(canvas.width - sourceX, scaledWidth);
        const sourceHeight = Math.min(canvas.height - sourceY, scaledHeight);
        
        debug.info(`Drawing selection: sourceX=${sourceX}, sourceY=${sourceY}, width=${sourceWidth}, height=${sourceHeight}`);
        
        if (sourceWidth <= 0 || sourceHeight <= 0) {
          throw new Error("Invalid selection dimensions. Please try again with a valid selection.");
        }
        
        // Draw the selected portion to the new canvas
        ctx.drawImage(
          canvas,
          sourceX, sourceY,
          sourceWidth, sourceHeight,
          0, 0,
          scaledWidth, scaledHeight
        );
        
        // Convert to data URL
        const dataUrl = croppedCanvas.toDataURL('image/png');
        
        // Update loading message
        updateLoading("Analyzing image...");
        
        debug.info("Sending capture data to background script");
        
        try {
          // Send the image data to the background script for analysis
          await browserAPI.runtime.sendMessage({
            action: "captureComplete",
            data: {
              dataUrl: dataUrl,
              rect: {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
              },
              devicePixelRatio: devicePixelRatio,
              pageUrl: window.location.href,
              pageTitle: document.title
            }
          });
          
          debug.info("Capture data sent successfully");
        } catch (sendError) {
          debug.error("Error sending capture data:", sendError);
          hideLoading();
          showNotification("Failed to send screenshot data: " + (sendError.message || "Unknown error"), "error");
          selectionActive = false; // Reset on error
        }
      } catch (canvasError) {
        debug.error("HTML2Canvas error:", canvasError);
        throw new Error("Failed to capture screenshot: " + (canvasError.message || "Canvas creation failed"));
      }
    } catch (error) {
      debug.error("Error capturing screenshot:", error);
      hideLoading();
      showNotification("Failed to capture screenshot: " + (error.message || "Unknown error"), "error");
      cancelSelection();
    }
  }
  
  function showLoading(message) {
    // Remove existing selection elements
    cleanupSelectionElements();
    
    // Create loading container
    const loader = document.createElement('div');
    loader.className = 'screenshot-loader';
    loader.style.position = 'fixed';
    loader.style.top = '0';
    loader.style.left = '0';
    loader.style.width = '100%';
    loader.style.height = '100%';
    loader.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    loader.style.zIndex = '999999';
    loader.style.display = 'flex';
    loader.style.flexDirection = 'column';
    loader.style.alignItems = 'center';
    loader.style.justifyContent = 'center';
    
    // Create spinner
    const spinner = document.createElement('div');
    spinner.className = 'screenshot-spinner';
    spinner.style.width = '40px';
    spinner.style.height = '40px';
    spinner.style.border = '4px solid rgba(255, 255, 255, 0.3)';
    spinner.style.borderRadius = '50%';
    spinner.style.borderTop = '4px solid #fff';
    spinner.style.animation = 'screenshot-spin 1s linear infinite';
    loader.appendChild(spinner);
    
    // Add animation style
    const style = document.createElement('style');
    style.textContent = `
      @keyframes screenshot-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    
    // Create loading text
    const loadingText = document.createElement('div');
    loadingText.className = 'screenshot-loader-text';
    loadingText.style.color = 'white';
    loadingText.style.marginTop = '16px';
    loadingText.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    loadingText.style.fontSize = '16px';
    loadingText.textContent = message;
    loader.appendChild(loadingText);
    
    // Add to document
    document.body.appendChild(loader);
  }
  
  function updateLoading(message) {
    const loadingText = document.querySelector('.screenshot-loader-text');
    if (loadingText) loadingText.textContent = message;
  }
  
  function hideLoading() {
    const loader = document.querySelector('.screenshot-loader');
    if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
  }
  
  function showAnalysisResults(result, screenshotUrl) {
    // Reset active flag
    selectionActive = false;
    
    // Hide loading screen
    hideLoading();
    
    // Create results modal
    const modal = document.createElement('div');
    modal.className = 'screenshot-results-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modal.style.zIndex = '999999';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.opacity = '0';
    modal.style.transition = 'opacity 0.3s ease';
    
    // Create results container
    const container = document.createElement('div');
    container.className = 'screenshot-results-container';
    container.style.backgroundColor = 'white';
    container.style.borderRadius = '8px';
    container.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.2)';
    container.style.width = '90%';
    container.style.maxWidth = '1000px';
    container.style.maxHeight = '90vh';
    container.style.overflowY = 'auto';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    
    // Create header
    const header = document.createElement('div');
    header.className = 'screenshot-results-header';
    header.style.padding = '16px';
    header.style.borderBottom = '1px solid #eee';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    
    const title = document.createElement('h2');
    title.textContent = 'Screenshot Analysis';
    title.style.margin = '0';
    title.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    title.style.fontSize = '20px';
    title.style.fontWeight = '500';
    header.appendChild(title);
    
    const closeButton = document.createElement('button');
    closeButton.className = 'screenshot-close-results';
    closeButton.innerHTML = '×';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.color = '#5f6368';
    closeButton.addEventListener('click', () => {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    });
    header.appendChild(closeButton);
    
    container.appendChild(header);
    
    // Create content
    const content = document.createElement('div');
    content.className = 'screenshot-results-content';
    content.style.display = 'flex';
    content.style.padding = '16px';
    content.style.flexDirection = 'column';
    
    // In Firefox, the layout may need to be adjusted for better display
    const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
    if (isFirefox) {
      content.style.flexDirection = 'column';
    } else {
      // For wider screens, use a row layout
      const wideScreen = window.innerWidth > 768;
      content.style.flexDirection = wideScreen ? 'row' : 'column';
    }
    
    // Left column - image
    const imageSection = document.createElement('div');
    imageSection.className = 'screenshot-results-image';
    imageSection.style.flex = '1';
    imageSection.style.padding = '16px';
    
    const image = document.createElement('img');
    image.src = screenshotUrl;
    image.alt = 'Captured screenshot';
    image.style.maxWidth = '100%';
    image.style.maxHeight = '300px';
    image.style.objectFit = 'contain';
    image.style.border = '1px solid #eee';
    image.style.borderRadius = '4px';
    imageSection.appendChild(image);
    
    // Right column - analysis
    const textSection = document.createElement('div');
    textSection.className = 'screenshot-results-text';
    textSection.style.flex = '1';
    textSection.style.padding = '16px';
    
    const analysisTitle = document.createElement('h3');
    analysisTitle.textContent = 'AI Analysis';
    analysisTitle.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    analysisTitle.style.fontSize = '16px';
    analysisTitle.style.marginTop = '0';
    textSection.appendChild(analysisTitle);
    
    const analysisContent = document.createElement('div');
    analysisContent.className = 'screenshot-analysis-content';
    analysisContent.style.maxHeight = '300px';
    analysisContent.style.overflowY = 'auto';
    analysisContent.style.fontSize = '14px';
    analysisContent.style.lineHeight = '1.5';
    
    // Format the result
    if (typeof result === 'string') {
      analysisContent.innerHTML = result.replace(/\n/g, '<br>');
    } else if (result && result.html) {
      analysisContent.innerHTML = result.html;
    } else if (result && result.text) {
      analysisContent.innerHTML = result.text.replace(/\n/g, '<br>');
    } else {
      analysisContent.textContent = "No analysis available.";
    }
    
    textSection.appendChild(analysisContent);
    
    content.appendChild(imageSection);
    content.appendChild(textSection);
    container.appendChild(content);
    
    // Add actions
    const actions = document.createElement('div');
    actions.className = 'screenshot-results-actions';
    actions.style.padding = '16px';
    actions.style.borderTop = '1px solid #eee';
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';
    
    const copyButton = createButton('screenshot-copy-button', 'Copy Text', () => {
      const text = typeof result === 'string' ? result : 
                 result && result.text ? result.text : 
                 analysisContent.textContent;
      navigator.clipboard.writeText(text)
        .then(() => showNotification('Analysis copied to clipboard', 'success'))
        .catch(err => showNotification('Failed to copy: ' + err.message, 'error'));
    });
    
    const dismissButton = createButton('screenshot-dismiss-button', 'Dismiss', () => {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    });
    
    actions.appendChild(copyButton);
    actions.appendChild(dismissButton);
    container.appendChild(actions);
    
    // Add question section
    const questionSection = createQuestionSection();
    container.appendChild(questionSection);
    
    modal.appendChild(container);
    document.body.appendChild(modal);
    
    // Add animation
    setTimeout(() => modal.style.opacity = '1', 10);
  }
  
  function createQuestionSection() {
    const section = document.createElement('div');
    section.style.padding = '16px';
    section.style.borderTop = '1px solid #eee';
    return section;
  }
  
  async function askFollowUpQuestion(question) {
    if (!question.trim()) return;
    
    try {
      const response = await browserAPI.runtime.sendMessage({
        action: "askFollowUpQuestion",
        question: question
      });
      
      return response;
    } catch (error) {
      console.error("Error asking follow-up question:", error);
      return { error: error.message };
    }
  }
  
  function showNotification(message, type = 'info') {
    // Remove any existing notifications
    const existingNotification = document.querySelector('.screenshot-notification');
    if (existingNotification) {
      existingNotification.classList.add('notification-hiding');
      setTimeout(() => {
        if (existingNotification.parentNode) {
          existingNotification.parentNode.removeChild(existingNotification);
        }
      }, 300);
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `screenshot-notification screenshot-notification-${type}`;
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.padding = '12px 20px';
    notification.style.backgroundColor = type === 'error' ? '#f44336' : 
                                       type === 'warning' ? '#ff9800' : 
                                       type === 'success' ? '#4caf50' : '#2196f3';
    notification.style.color = 'white';
    notification.style.borderRadius = '4px';
    notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    notification.style.zIndex = '9999999';
    notification.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    notification.style.fontSize = '14px';
    notification.style.transition = 'opacity 0.3s ease';
    notification.textContent = message;
    
    // Add to document
    document.body.appendChild(notification);
    
    // Set timeout to remove notification after 3 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }
})(); 