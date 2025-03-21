// background.js
let activeTabId = null;

// Add caching for analysis results
const analysisCache = new Map();

// Maximum number of history items to store
let MAX_HISTORY_ITEMS = 50;

// Default API key - you should replace this with your actual Gemini API key
const DEFAULT_API_KEY = "YOUR_GEMINI_API_KEY";

// Function to save screenshot to history
async function saveToHistory(data) {
  try {
    // Get existing history
    const storageData = await browser.storage.local.get('screenshotHistory');
    let history = storageData.screenshotHistory || [];
    
    // Create history item
    const historyItem = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      imageUrl: data.dataUrl,
      analysis: data.analysis,
      pageTitle: data.pageTitle || 'Untitled',
      pageUrl: data.pageUrl || '',
      tags: []
    };
    
    // Add to beginning of array (newest first)
    history.unshift(historyItem);
    
    // Limit history size
    if (history.length > MAX_HISTORY_ITEMS) {
      history = history.slice(0, MAX_HISTORY_ITEMS);
    }
    
    // Save to storage
    await browser.storage.local.set({ screenshotHistory: history });
    console.log('Saved to history:', historyItem.id);
    
    // Update badge to show history count
    browser.browserAction.setBadgeText({ text: history.length.toString() });
    browser.browserAction.setBadgeBackgroundColor({ color: '#1a73e8' });
    
    return historyItem;
  } catch (error) {
    console.error('Error saving to history:', error);
    return null;
  }
}

// Function to get the API key from settings
async function getApiKey() {
  try {
    const userSettingsData = await browser.storage.local.get(['userSettings']);
    const userSettings = userSettingsData.userSettings || {};
    
    // Use API key from user settings, or fall back to default
    let apiKey = userSettings.apiKey || DEFAULT_API_KEY;
    
    // For backward compatibility, also check the old location
    if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
      const oldSettings = await browser.storage.local.get(['apiKey']);
      if (oldSettings.apiKey) {
        apiKey = oldSettings.apiKey;
        
        // Migrate the key to the new location
        if (!userSettings.apiKey) {
          userSettings.apiKey = apiKey;
          await browser.storage.local.set({ userSettings });
        }
      }
    }
    
    return apiKey;
  } catch (error) {
    console.error("Error getting API key:", error);
    return DEFAULT_API_KEY;
  }
}

// Function to initialize the screenshot tool
async function initScreenshotTool(tab, options = {}) {
  activeTabId = tab.id;
  
  try {
    // Inject required scripts and CSS
    await browser.tabs.insertCSS(tab.id, { file: "selector.css" });
    await browser.tabs.executeScript(tab.id, { file: "html2canvas.min.js" });
    await browser.tabs.executeScript(tab.id, { file: "selector.js" });
    
    // Start selection mode
    browser.tabs.sendMessage(tab.id, {
      action: "startSelection",
      options: options
    });
  } catch (error) {
    console.error("Error initializing screenshot tool:", error);
    browser.notifications.create({
      type: "basic",
      title: "Screenshot Analyzer Error",
      message: "Failed to initialize screenshot tool: " + error.message,
      iconUrl: "icons/icon48.png"
    });
  }
}

// Handle browser action (toolbar button click)
browser.browserAction.onClicked.addListener(initScreenshotTool);

// Handle different activation methods
browser.commands.onCommand.addListener((command) => {
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
  if (message.action === "initScreenshotTool") {
    // Handle screenshot tool initialization request from popup
    browser.tabs.query({ active: true, currentWindow: true })
      .then(tabs => {
        if (tabs[0]) {
          initScreenshotTool(tabs[0], message.options || {});
        }
      });
    return true;
  }
  
  if (message.action === "openSettings") {
    // Open the extension settings page
    browser.runtime.openOptionsPage();
    return true;
  }
  
  if (message.action === "captureComplete") {
    console.log("Received capture complete message, starting analysis");
    analyzeScreenshot(message.data)
      .then(result => {
        console.log("Analysis complete, sending results back");
        
        // Add result to message data for saving to history
        message.data.analysis = result;
        
        // Get user settings to check if we should save to history
        browser.storage.local.get('userSettings')
          .then(data => {
            const userSettings = data.userSettings || {};
            
            // Save to history if auto-save is enabled (default true)
            if (userSettings.autoSave !== false) {
              saveToHistory(message.data);
            }
            
            browser.tabs.sendMessage(sender.tab.id, {
              action: "analysisResult",
              result: result,
              screenshot: message.data.dataUrl
            });
          });
      })
      .catch(error => {
        console.error("Analysis failed:", error);
        browser.tabs.sendMessage(sender.tab.id, {
          action: "analysisError",
          error: error.message
        });
      });
    return true; // Indicates async response
  }
  
  // Add handlers for history operations
  if (message.action === "getHistory") {
    return browser.storage.local.get('screenshotHistory')
      .then(data => {
        return { history: data.screenshotHistory || [] };
      });
  }
  
  if (message.action === "deleteHistoryItem") {
    return browser.storage.local.get('screenshotHistory')
      .then(data => {
        const history = data.screenshotHistory || [];
        const newHistory = history.filter(item => item.id !== message.id);
        return browser.storage.local.set({ screenshotHistory: newHistory });
      })
      .then(() => {
        return { success: true };
      });
  }
  
  if (message.action === "clearHistory") {
    return browser.storage.local.set({ screenshotHistory: [] })
      .then(() => {
        browser.browserAction.setBadgeText({ text: "" });
        return { success: true };
      });
  }
  
  if (message.action === "updateHistorySize") {
    // Update the maximum history size
    MAX_HISTORY_ITEMS = message.size || 50;
    
    // Trim existing history if needed
    return browser.storage.local.get('screenshotHistory')
      .then(data => {
        const history = data.screenshotHistory || [];
        
        if (history.length > MAX_HISTORY_ITEMS) {
          const trimmedHistory = history.slice(0, MAX_HISTORY_ITEMS);
          return browser.storage.local.set({ screenshotHistory: trimmedHistory });
        }
        
        return Promise.resolve();
      })
      .then(() => {
        return { success: true, newSize: MAX_HISTORY_ITEMS };
      });
  }
  
  // Add handler for saving/unsaving items
  if (message.action === "toggleSaveItem") {
    return browser.storage.local.get(['screenshotHistory', 'savedScreenshots'])
      .then(data => {
        const history = data.screenshotHistory || [];
        let saved = data.savedScreenshots || [];
        
        const item = history.find(item => item.id === message.id);
        if (!item) return { success: false, error: "Item not found" };
        
        const isSaved = saved.some(savedItem => savedItem.id === message.id);
        
        if (isSaved) {
          // Remove from saved
          saved = saved.filter(savedItem => savedItem.id !== message.id);
        } else {
          // Add to saved
          saved.push(item);
        }
        
        return browser.storage.local.set({ savedScreenshots: saved })
          .then(() => {
            return { success: true, saved: !isSaved };
          });
      });
  }
  
  // Needed for settings page
  if (message.action === "getApiKey") {
    return getApiKey().then(apiKey => {
      return { apiKey };
    });
  }
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

    // Get user settings
    const userSettingsData = await browser.storage.local.get(['userSettings']);
    const userSettings = userSettingsData.userSettings || {};

    // Get API key from new getApiKey function
    const apiKey = await getApiKey();
    
    if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
      throw new Error('API key not configured. Please go to settings and enter a valid API key.');
    }

    console.log("Using API key:", apiKey.substring(0, 5) + "..." + apiKey.substring(apiKey.length - 5)); // Only log partial key for security
    
    // Get the AI model from settings or use default
    const apiModel = userSettings.apiModel || "gemini-1.5-flash";
    const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent`;

    console.log("Using AI model:", apiModel);

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
    const result = await fetch(`${apiEndpoint}?key=${encodeURIComponent(apiKey)}`, {
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
    console.log("Parsed API response");

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
        // Get API key from new getApiKey function
        const apiKey = await getApiKey();
        
        if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
          throw new Error('API key not configured. Please go to settings and enter a valid API key.');
        }
        
        // Get user settings
        const userSettingsData = await browser.storage.local.get(['userSettings']);
        const userSettings = userSettingsData.userSettings || {};
        
        // Get AI model
        const apiModel = userSettings.apiModel || "gemini-1.5-flash";
        
        // Use Gemini API endpoint
        const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent`;
        
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
        const result = await fetch(`${apiEndpoint}?key=${encodeURIComponent(apiKey)}`, {
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

// Load user settings when extension starts
browser.runtime.onInstalled.addListener(() => {
    // Load user settings
    browser.storage.local.get('userSettings')
        .then(data => {
            const userSettings = data.userSettings || {};
            
            // Update MAX_HISTORY_ITEMS based on user settings
            if (userSettings.historySize) {
                MAX_HISTORY_ITEMS = userSettings.historySize;
                console.log('Set MAX_HISTORY_ITEMS to', MAX_HISTORY_ITEMS);
            }
            
            // Initialize default settings if not present
            if (!data.userSettings) {
                browser.storage.local.set({
                    userSettings: {
                        apiKey: DEFAULT_API_KEY,
                        apiModel: 'gemini-1.5-flash',
                        autoAnalyze: true,
                        autoSave: true,
                        showToolbar: true,
                        historySize: 50,
                        autoClean: false,
                        cleanPeriod: 30,
                        darkMode: false,
                        showTooltips: true
                    }
                }).then(() => {
                    console.log('Initialized default settings');
                });
            }
        })
        .catch(error => {
            console.error('Error loading user settings:', error);
        });

    // Create a welcome notification
    browser.notifications.create({
        type: "basic",
        title: "QuickShot Installed",
        message: "Thanks for installing QuickShot! Please go to Settings and add your Gemini API key to get started.",
        iconUrl: "icons/icon128.png"
    });
});

// Add OCR functionality to background.js
async function performOCR(imageData) {
  try {
    // Get API key from settings
    const apiKey = await getApiKey();
    
    if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
      throw new Error('API key not configured. Please go to settings and enter a valid API key.');
    }
    
    const endpoint = "https://vision.googleapis.com/v1/images:annotate";
    
    // Convert data URL to base64
    const base64Image = imageData.dataUrl.split(',')[1];
    
    const requestBody = {
      requests: [
        {
          image: {
            content: base64Image
          },
          features: [
            {
              type: "TEXT_DETECTION"
            }
          ]
        }
      ]
    };
    
    const response = await fetch(`${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`OCR API error: ${response.status}`);
    }
    
    const data = await response.json();
    return {
      text: data.responses[0]?.textAnnotations?.[0]?.description || "No text detected",
      textBlocks: data.responses[0]?.textAnnotations || []
    };
  } catch (error) {
    console.error("OCR error:", error);
    throw error;
  }
}