/**
 * Browser API Compatibility Layer
 * 
 * This script provides compatibility between Firefox's browser.* API
 * and Chrome's chrome.* API to allow the extension to work in both browsers
 * with the same codebase.
 */

(function() {
  // Only proceed if we're in Chrome (Firefox already has browser namespace)
  if (typeof window.browser === 'undefined' && typeof chrome !== 'undefined') {
    console.log("Setting up Chrome -> Firefox API compatibility layer");
    
    // Create browser namespace object
    window.browser = {};
    
    // Keep track of message callbacks
    const messageCallbacks = new Map();
    let messageCallbackCounter = 1;

    // Tabs API
    if (chrome.tabs) {
      window.browser.tabs = {
        query: function(queryInfo) {
          return new Promise((resolve, reject) => {
            chrome.tabs.query(queryInfo, (tabs) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(tabs);
              }
            });
          });
        },
        sendMessage: function(tabId, message, options) {
          return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, message, options, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          });
        },
        insertCSS: function(tabId, details) {
          return new Promise((resolve, reject) => {
            chrome.tabs.insertCSS(tabId, details, () => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve();
              }
            });
          });
        },
        executeScript: function(tabId, details) {
          return new Promise((resolve, reject) => {
            chrome.tabs.executeScript(tabId, details, (result) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(result);
              }
            });
          });
        },
        get: function(tabId) {
          return new Promise((resolve, reject) => {
            chrome.tabs.get(tabId, (tab) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(tab);
              }
            });
          });
        }
      };
    }

    // Runtime API
    if (chrome.runtime) {
      // Create a wrapper for onMessage to handle async responses correctly
      const originalAddListener = chrome.runtime.onMessage.addListener.bind(chrome.runtime.onMessage);
      
      window.browser.runtime = {
        onMessage: {
          addListener: function(listener) {
            return originalAddListener((message, sender, sendResponse) => {
              // Call the listener and handle both promise and direct responses
              const result = listener(message, sender, sendResponse);
              
              // If the listener returns true, it means it will call sendResponse asynchronously
              if (result === true) {
                return true;
              }
              
              // If the result is a Promise, handle it
              if (result && typeof result.then === 'function') {
                result.then(sendResponse, (error) => {
                  console.error("Error in async message handler:", error);
                  sendResponse({ error: error.message || "Unknown error" });
                });
                return true; // Indicate we'll call sendResponse asynchronously
              }
              
              // Otherwise, assume it's a synchronous response
              if (result !== undefined) {
                sendResponse(result);
              }
              return false;
            });
          },
          removeListener: chrome.runtime.onMessage.removeListener.bind(chrome.runtime.onMessage),
          hasListener: chrome.runtime.onMessage.hasListener.bind(chrome.runtime.onMessage)
        },
        sendMessage: function(message, options) {
          return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, options, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          });
        },
        getURL: chrome.runtime.getURL,
        openOptionsPage: function() {
          return new Promise((resolve, reject) => {
            if (chrome.runtime.openOptionsPage) {
              chrome.runtime.openOptionsPage(() => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                } else {
                  resolve();
                }
              });
            } else {
              // Fallback for older Chrome versions
              const optionsUrl = chrome.runtime.getURL('options/index.html');
              chrome.tabs.create({ url: optionsUrl }, (tab) => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                } else {
                  resolve(tab);
                }
              });
            }
          });
        }
      };
    }

    // Storage API
    if (chrome.storage) {
      window.browser.storage = {
        local: {
          get: function(keys) {
            return new Promise((resolve, reject) => {
              chrome.storage.local.get(keys, (items) => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                } else {
                  resolve(items);
                }
              });
            });
          },
          set: function(items) {
            return new Promise((resolve, reject) => {
              chrome.storage.local.set(items, () => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                } else {
                  resolve();
                }
              });
            });
          },
          remove: function(keys) {
            return new Promise((resolve, reject) => {
              chrome.storage.local.remove(keys, () => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                } else {
                  resolve();
                }
              });
            });
          }
        }
      };
    }

    // Commands API
    if (chrome.commands) {
      window.browser.commands = {
        onCommand: {
          addListener: chrome.commands.onCommand.addListener.bind(chrome.commands.onCommand)
        }
      };
    }

    // Browser Action API
    if (chrome.browserAction) {
      window.browser.browserAction = {
        onClicked: chrome.browserAction.onClicked,
        setTitle: function(details) {
          return new Promise((resolve, reject) => {
            chrome.browserAction.setTitle(details, () => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve();
              }
            });
          });
        },
        setIcon: function(details) {
          return new Promise((resolve, reject) => {
            chrome.browserAction.setIcon(details, () => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve();
              }
            });
          });
        }
      };
    }

    // Notifications API
    if (chrome.notifications) {
      window.browser.notifications = {
        create: function(notificationId, options) {
          return new Promise((resolve, reject) => {
            chrome.notifications.create(notificationId, options, (notificationId) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(notificationId);
              }
            });
          });
        },
        clear: function(notificationId) {
          return new Promise((resolve, reject) => {
            chrome.notifications.clear(notificationId, (wasCleared) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(wasCleared);
              }
            });
          });
        }
      };
    }
    
    // Context Menus API
    if (chrome.contextMenus) {
      window.browser.contextMenus = {
        create: function(createProperties, callback) {
          return chrome.contextMenus.create(createProperties, callback);
        },
        onClicked: chrome.contextMenus.onClicked
      };
    }
    
    console.log("Chrome -> Firefox API compatibility layer initialized");
  } else if (typeof window.browser !== 'undefined') {
    console.log("Running in Firefox with native browser API");
  } else {
    console.warn("Unable to initialize compatibility layer - neither Chrome nor Firefox APIs detected");
  }
})(); 