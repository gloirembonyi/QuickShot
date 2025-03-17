// background.js

// Fix for Firefox/Chrome compatibility
const browser = window.browser || window.chrome;

// Detect browser type for Firefox-specific behaviors
const isFirefox = typeof InstallTrigger !== 'undefined';

// Initialize debug logging
if (window.ExtDebug) {
  ExtDebug.info("Background script initialized");
  ExtDebug.info("Browser detection:", isFirefox ? "Firefox" : "Chrome");
}

let activeTabId = null;

// Add caching for analysis results
const analysisCache = new Map();

// Function to initialize the screenshot tool
async function initScreenshotTool(tab, options = {}) {
  activeTabId = tab.id;
  
  try {
    if (window.ExtDebug) ExtDebug.info("Initializing screenshot tool for tab:", tab.id, "URL:", tab.url);
    
    // Get API key - use the Gemini API key if no user key is set
    const settings = await browser.storage.local.get('apiKey');
    const apiKey = settings.apiKey || "AIzaSyCkky5PQnc11vcZhX6t2M7jlDNqWFPB91k";

    if (!apiKey) {
      // Open options page if API key isn't set
      browser.runtime.openOptionsPage();
      // Use notifications if message sending fails (tab might not be ready)
      try {
        browser.tabs.sendMessage(tab.id, {
          action: "showNotification",
          message: "Please set your API key in the extension options first"
        });
      } catch (e) {
        if (window.ExtDebug) ExtDebug.error("Failed to send notification to tab:", e);
        browser.notifications.create({
          type: "basic",
          title: "AI Screenshot Analyzer",
          message: "Please set your API key in the extension options first",
          iconUrl: "icons/icon48.png"
        });
      }
      return;
    }

    // Store the API key in storage for easy access
    await browser.storage.local.set({ apiKey });
    
    // Firefox fix: Use try/catch for each injection separately with sequential loading
    // Inject the debug script first to enable better logging
    try {
      if (window.ExtDebug) ExtDebug.info("Injecting debug.js...");
      await browser.tabs.executeScript(tab.id, { file: "debug.js" });
      if (window.ExtDebug) ExtDebug.info("Debug script injected successfully");
    } catch (debugError) {
      if (window.ExtDebug) ExtDebug.warn("Error injecting debug script:", debugError);
      // Continue anyway as debug is optional
    }
    
    // Add a small delay for Firefox to ensure scripts are properly initialized
    if (isFirefox) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    try {
      if (window.ExtDebug) ExtDebug.info("Injecting CSS...");
      await browser.tabs.insertCSS(tab.id, { file: "selector.css" });
      if (window.ExtDebug) ExtDebug.info("CSS injected successfully");
    } catch (cssError) {
      if (window.ExtDebug) ExtDebug.error("Error injecting CSS:", cssError);
      // Continue anyway as this may not be fatal
    }
    
    if (isFirefox) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    try {
      if (window.ExtDebug) ExtDebug.info("Injecting html2canvas...");
      await browser.tabs.executeScript(tab.id, { file: "html2canvas.min.js" });
      if (window.ExtDebug) ExtDebug.info("html2canvas injected successfully");
    } catch (htmlCanvasError) {
      if (window.ExtDebug) ExtDebug.error("Error injecting html2canvas:", htmlCanvasError);
      throw new Error("Failed to inject HTML2Canvas: " + htmlCanvasError.message);
    }
    
    if (isFirefox) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    try {
      if (window.ExtDebug) ExtDebug.info("Injecting selector script...");
      await browser.tabs.executeScript(tab.id, { file: "selector.js" });
      if (window.ExtDebug) ExtDebug.info("Selector script injected successfully");
    } catch (selectorError) {
      if (window.ExtDebug) ExtDebug.error("Error injecting selector script:", selectorError);
      throw new Error("Failed to inject selector script: " + selectorError.message);
    }
    
    // Add a small delay before sending the startSelection message (especially for Firefox)
    await new Promise(resolve => setTimeout(resolve, isFirefox ? 100 : 50));
    
    // Start selection mode
    if (window.ExtDebug) ExtDebug.info("Starting selection mode...");
    
    try {
      const response = await browser.tabs.sendMessage(tab.id, {
        action: "startSelection"
      });
      if (window.ExtDebug) ExtDebug.info("Selection started successfully, response:", response);
    } catch (error) {
      if (window.ExtDebug) ExtDebug.error("Error sending startSelection message:", error);
      
      // If on Firefox, try a second attempt with a longer delay
      if (isFirefox) {
        if (window.ExtDebug) ExtDebug.info("Retrying on Firefox with longer delay...");
        await new Promise(resolve => setTimeout(resolve, 300));
        try {
          const retryResponse = await browser.tabs.sendMessage(tab.id, {
            action: "startSelection"
          });
          if (window.ExtDebug) ExtDebug.info("Selection started on retry, response:", retryResponse);
        } catch (retryError) {
          if (window.ExtDebug) ExtDebug.error("Error on second attempt:", retryError);
          throw new Error("Failed to start selection mode after multiple attempts: " + retryError.message);
        }
      } else {
        throw new Error("Failed to start selection mode: " + error.message);
      }
    }
    
    if (window.ExtDebug) ExtDebug.info("Screenshot tool initialized successfully");
  } catch (error) {
    if (window.ExtDebug) ExtDebug.error("Error initializing screenshot tool:", error);
    browser.notifications.create({
      type: "basic",
      title: "Screenshot Analyzer Error",
      message: "Failed to initialize screenshot tool: " + error.message,
      iconUrl: "icons/icon48.png"
    });
  }
}

// Handle browser action (toolbar button click)
browser.browserAction.onClicked.addListener((tab) => {
  if (window.ExtDebug) ExtDebug.info("Browser action clicked for tab:", tab.id);
  initScreenshotTool(tab);
});

// Handle different activation methods
browser.commands.onCommand.addListener((command) => {
    if (window.ExtDebug) ExtDebug.info(`Command received: ${command}`);
    switch (command) {
        case "start-screenshot-analyzer":
            // Quick analysis mode
            browser.tabs.query({active: true, currentWindow: true})
                .then(tabs => {
                    if (tabs[0]) {
                        initScreenshotTool(tabs[0], { quickMode: true });
                    }
                });
            break;
            
        case "start-screenshot-area":
            // Area selection mode
            browser.tabs.query({active: true, currentWindow: true})
                .then(tabs => {
                    if (tabs[0]) {
                        initScreenshotTool(tabs[0], { areaMode: true });
                    }
                });
            break;
  }
});

// Listen for messages from content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (window.ExtDebug) ExtDebug.info("Message received:", message.action, "from:", sender.tab ? sender.tab.id : "unknown");
  
  // Handle content script ready message
  if (message.action === "contentScriptReady") {
    if (window.ExtDebug) ExtDebug.info("Content script is ready in tab:", sender.tab?.id);
    return Promise.resolve({ success: true });
  }
  
  // Handle keyboard shortcut activation from content script
  if (message.action === "activateScreenshotTool") {
    if (window.ExtDebug) ExtDebug.info("Received activation request:", message);
    
    // Handle activation from popup button
    if (message.source === "popupButton" && message.tabId) {
      browser.tabs.get(message.tabId)
        .then(tab => {
          if (window.ExtDebug) ExtDebug.info("Activating from popup button for tab:", tab.id);
          initScreenshotTool(tab, { quickMode: true });
        })
        .catch(error => {
          if (window.ExtDebug) ExtDebug.error("Error getting tab:", error);
        });
      return Promise.resolve({ success: true });
    }
    
    // Handle activation from content script
    if (message.source === "keyboardShortcut" && sender.tab) {
      if (window.ExtDebug) ExtDebug.info("Activating from keyboard shortcut for tab:", sender.tab.id);
      initScreenshotTool(sender.tab, { quickMode: true });
      return Promise.resolve({ success: true });
    }
  }

  if (message.action === "captureComplete") {
    if (window.ExtDebug) ExtDebug.info("Received capture complete message, starting analysis");
    analyzeScreenshot(message.data)
      .then(result => {
        if (window.ExtDebug) ExtDebug.info("Analysis complete, sending results back");
        browser.tabs.sendMessage(sender.tab.id, {
          action: "analysisResult",
          result: result,
          screenshot: message.data.dataUrl
        }).catch(err => {
          if (window.ExtDebug) ExtDebug.error("Error sending analysis results:", err);
          // Try to send error notification if possible
          try {
            browser.tabs.sendMessage(sender.tab.id, {
              action: "analysisError",
              error: "Failed to send results: " + err.message
            });
          } catch (notifyErr) {
            if (window.ExtDebug) ExtDebug.error("Failed to send error notification:", notifyErr);
          }
        });
      })
      .catch(error => {
        if (window.ExtDebug) ExtDebug.error("Analysis failed:", error);
        browser.tabs.sendMessage(sender.tab.id, {
          action: "analysisError",
          error: error.message
        }).catch(err => {
          if (window.ExtDebug) ExtDebug.error("Failed to send error notification:", err);
        });
      });
    return true; // Indicates async response
  }
  
  // Handle follow-up questions
  if (message.action === "askFollowUpQuestion") {
    // Make sure we have an active tab and a valid question
    if (!activeTabId || !message.question) {
      if (window.ExtDebug) ExtDebug.warn("Invalid follow-up question request");
      return Promise.resolve({
        error: "Unable to process question. Please try again."
      });
    }

    // Get the last screenshot and analysis from cache
    const cachedAnalysis = analysisCache.get(activeTabId);
    if (!cachedAnalysis) {
      if (window.ExtDebug) ExtDebug.warn("No cached analysis found for tab:", activeTabId);
      return Promise.resolve({
        error: "No previous analysis found. Please take a new screenshot first."
      });
    }

    if (window.ExtDebug) ExtDebug.info("Processing follow-up question:", message.question);
    
    // Send the question to Gemini with the image
    return askGeminiQuestion(message.question, cachedAnalysis.imageDataUrl, cachedAnalysis.analysis)
      .then(answer => {
        if (window.ExtDebug) ExtDebug.info("Received answer from Gemini API");
        return { answer };
      })
      .catch(error => {
        if (window.ExtDebug) ExtDebug.error("Error asking follow-up question:", error);
        return {
          error: "Failed to get answer: " + error.message
        };
      });
  }
  
  // Fallback response for unhandled messages
  return false;
});

// Add this message handler to your existing listeners
browser.runtime.onMessage.addListener((message, sender) => {
    if (message.action === 'captureTab') {
        return browser.tabs.captureTab(sender.tab.id, { format: 'png' })
            .then(dataUrl => {
                // Crop the image using a canvas
                return cropScreenshot(dataUrl, message.data.rect, message.data.devicePixelRatio);
            })
            .then(croppedDataUrl => {
                // Store the cropped dataUrl for use in the analysis result
                const screenshotData = {
                    dataUrl: croppedDataUrl,
                    dimensions: message.data.rect,
                    timestamp: message.data.timestamp
                };
                
                return analyzeScreenshot(screenshotData)
                    .then(result => {
                        return browser.tabs.sendMessage(sender.tab.id, {
                            action: 'analysisResult',
                            result: result,
                            screenshot: croppedDataUrl // Pass the screenshot URL back
                        });
                    });
            })
            .catch(error => {
                console.error("Error in capture process:", error);
                return browser.tabs.sendMessage(sender.tab.id, {
                    action: 'analysisError',
                    error: error.message
                });
            });
    }
    if (message.action === 'askQuestion') {
        return askGeminiQuestion(
            message.data.question,
            message.data.imageDataUrl,
            message.data.originalAnalysis
        ).then(answer => {
            return { answer: answer };
        }).catch(error => {
            console.error("Question answering error:", error);
            return { answer: "I'm sorry, I encountered an error while processing your question. Please try again." };
        });
    }
    return false;
});

// Add this function to crop the screenshot
function cropScreenshot(dataUrl, rect, devicePixelRatio) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Scale the crop dimensions by device pixel ratio
            const scaledRect = {
                x: rect.x * devicePixelRatio,
                y: rect.y * devicePixelRatio,
                width: rect.width * devicePixelRatio,
                height: rect.height * devicePixelRatio
            };
            
            canvas.width = scaledRect.width;
            canvas.height = scaledRect.height;
            
            ctx.drawImage(img,
                scaledRect.x, scaledRect.y,
                scaledRect.width, scaledRect.height,
                0, 0,
                scaledRect.width, scaledRect.height
            );
            
            resolve(canvas.toDataURL('image/png', 0.95));
        };
        img.onerror = () => reject(new Error('Failed to load screenshot for cropping'));
        img.src = dataUrl;
    });
}

// Function to call Gemini AI API for image analysis
async function analyzeScreenshot(data) {
  try {
        // Generate a hash of the image data for caching
        const imageHash = await generateImageHash(data.dataUrl);
        
        // Check cache first
        if (analysisCache.has(imageHash)) {
            console.log("Using cached analysis result");
            return analysisCache.get(imageHash);
        }
        
        console.log("Starting screenshot analysis");

        // Get API key - use the Gemini API key by default
        const settings = await browser.storage.local.get(['apiKey']);
        const apiKey = settings.apiKey || "AIzaSyD839Zbz0FyWZ6xMGRuM4VdLblnpoQkEig";

        if (!apiKey) {
      throw new Error('API key not configured. Please check extension settings.');
    }
    
        // Update to use the new Gemini 1.5 Flash model
        const apiEndpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

        // Convert data URL to base64 by removing the prefix
        const base64Image = data.dataUrl.split(',')[1];

        console.log("Preparing API request to Gemini");

        // Create the request body for Gemini API
    const requestBody = {
            contents: [{
                parts: [
                    {
                        text: "Analyze this image and provide a detailed description of what you see, including any potential solutions or actions that can be taken based on the content."
                    },
                    {
                        inlineData: {
                            mimeType: "image/png",
                            data: base64Image
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.4,
                topK: 32,
                topP: 1
            }
        };

        console.log("Sending request to Gemini API");

        // Make API request to Gemini
        const result = await fetch(`${apiEndpoint}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        console.log("Received response from Gemini API:", result.status);

        if (!result.ok) {
            const errorData = await result.json().catch(() => ({}));
            throw new Error(`API error (${result.status}): ${errorData.error?.message || 'Unknown error'}`);
        }

        const resultData = await result.json();
        console.log("Parsed API response:", resultData);

        // Cache the result before returning
        analysisCache.set(imageHash, {
            analysis: resultData.candidates[0].content.parts[0].text,
            timestamp: new Date().toISOString()
        });
        
        return analysisCache.get(imageHash);
    } catch (error) {
        console.error("Error analyzing screenshot:", error);
        throw error;
    }
}

// Simple function to generate a hash from image data
async function generateImageHash(dataUrl) {
    // This is a simplified hash, you could use a more robust algorithm
    return dataUrl.length.toString() + '-' + dataUrl.substring(100, 150);
}

// Function to ask Gemini a question about an image
async function askGeminiQuestion(question, imageDataUrl, originalAnalysis) {
    try {
        // Get API key
        const settings = await browser.storage.local.get(['apiKey']);
        const apiKey = settings.apiKey || "AIzaSyD839Zbz0FyWZ6xMGRuM4VdLblnpoQkEig";
        
        // Use Gemini API endpoint
        const apiEndpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
        
        // Convert data URL to base64
        const base64Image = imageDataUrl.split(',')[1];
        
        // Create the request body for Gemini API with the question
        const requestBody = {
            contents: [{
                parts: [
                    {
                        text: `Based on this image, please answer the following question: "${question}"\n\nFor context, here's a previous analysis of this image: ${originalAnalysis}`
                    },
                    {
                        inlineData: {
                            mimeType: "image/png",
                            data: base64Image
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.2,
                topK: 32,
                topP: 1
            }
        };
        
        // Make API request to Gemini
        const result = await fetch(`${apiEndpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: {
                'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!result.ok) {
      const errorData = await result.json().catch(() => ({}));
      throw new Error(`API error (${result.status}): ${errorData.error?.message || 'Unknown error'}`);
    }
    
    const resultData = await result.json();
        return resultData.candidates[0].content.parts[0].text;
  } catch (error) {
        console.error("Error asking question:", error);
    throw error;
  }
}

// Add context menu items for easy access
browser.contextMenus.create({
    id: "screenshot-analyzer",
    title: "Analyze with AI Screenshot",
    contexts: ["page", "selection", "image"]
});

browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "screenshot-analyzer") {
        initScreenshotTool(tab);
    }
});