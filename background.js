// background.js
let activeTabId = null;

// Add caching for analysis results
const analysisCache = new Map();

// Function to initialize the screenshot tool
async function initScreenshotTool(tab, options = {}) {
  activeTabId = tab.id;
  
  try {
    // Get API key - use the Gemini API key if no user key is set
    const settings = await browser.storage.local.get('apiKey');
    const apiKey = settings.apiKey || "AIzaSyD839Zbz0FyWZ6xMGRuM4VdLblnpoQkEig";

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
    
    // Inject required scripts and CSS
    await browser.tabs.insertCSS(tab.id, { file: "selector.css" });
    await browser.tabs.executeScript(tab.id, { file: "html2canvas.min.js" });
    await browser.tabs.executeScript(tab.id, { file: "selector.js" });
    
    // Start selection mode
    browser.tabs.sendMessage(tab.id, {
      action: "startSelection"
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
  if (message.action === "captureComplete") {
    console.log("Received capture complete message, starting analysis");
    analyzeScreenshot(message.data)
      .then(result => {
        console.log("Analysis complete, sending results back");
        browser.tabs.sendMessage(sender.tab.id, {
          action: "analysisResult",
          result: result,
          screenshot: message.data.dataUrl
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