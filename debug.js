/**
 * Debug utility for AI Screenshot Analyzer extension
 * This helps trace extension issues across browsers
 */

const ExtDebug = (function() {
  // Extension name prefix
  const PREFIX = "[AI Screenshot]";
  
  // Debug levels
  const LEVELS = {
    INFO: { name: "INFO", color: "#4285f4" },
    WARN: { name: "WARN", color: "#f4b400" },
    ERROR: { name: "ERROR", color: "#db4437" },
    DEBUG: { name: "DEBUG", color: "#0f9d58" }
  };
  
  // Default debug level (can be changed)
  let debugEnabled = true;
  
  // Initialize based on stored preferences
  try {
    if (typeof browser !== 'undefined' || typeof chrome !== 'undefined') {
      const storage = (typeof browser !== 'undefined') ? browser.storage : chrome.storage;
      if (storage && storage.local) {
        storage.local.get('debugEnabled').then(result => {
          if (typeof result.debugEnabled === 'boolean') {
            debugEnabled = result.debugEnabled;
          }
        }).catch(() => {
          // Ignore storage errors
        });
      }
    }
  } catch (e) {
    // Ignore initialization errors
  }
  
  // Utility to format objects for logging
  function formatObject(obj) {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return String(obj);
    }
  }
  
  // Format arguments for consistent logging
  function formatLogArgs(args) {
    return Array.from(args).map(arg => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'object') return formatObject(arg);
      return String(arg);
    }).join(' ');
  }
  
  // Log with level-specific formatting
  function log(level, ...args) {
    if (!debugEnabled && level.name !== LEVELS.ERROR.name) return;
    
    const context = getCallerContext();
    const formatted = formatLogArgs(args);
    const message = `${PREFIX} [${level.name}] [${context}]: ${formatted}`;
    
    if (level.name === LEVELS.ERROR.name) {
      console.error(`%c${message}`, `color: ${level.color}`);
    } else if (level.name === LEVELS.WARN.name) {
      console.warn(`%c${message}`, `color: ${level.color}`);
    } else {
      console.log(`%c${message}`, `color: ${level.color}`);
    }
  }
  
  // Get caller context for better tracing
  function getCallerContext() {
    try {
      throw new Error();
    } catch (e) {
      const stack = e.stack.split('\n');
      // Skip first 3 lines (Error, getCallerContext, log)
      const callerLine = stack[3] || '';
      // Extract just the file/line info
      const match = callerLine.match(/at\s+(?:\w+\s+\()?([^:)]+:\d+)/);
      if (match && match[1]) {
        // Get just the file name and line number
        const fileInfo = match[1].split('/').pop();
        return fileInfo;
      }
      return 'unknown';
    }
  }
  
  // Public API
  return {
    info: function(...args) {
      log(LEVELS.INFO, ...args);
    },
    
    warn: function(...args) {
      log(LEVELS.WARN, ...args);
    },
    
    error: function(...args) {
      log(LEVELS.ERROR, ...args);
    },
    
    debug: function(...args) {
      log(LEVELS.DEBUG, ...args);
    },
    
    enable: function() {
      debugEnabled = true;
      try {
        const storage = (typeof browser !== 'undefined') ? browser.storage : chrome.storage;
        if (storage && storage.local) {
          storage.local.set({debugEnabled: true});
        }
      } catch (e) {
        // Ignore storage errors
      }
    },
    
    disable: function() {
      debugEnabled = false;
      try {
        const storage = (typeof browser !== 'undefined') ? browser.storage : chrome.storage;
        if (storage && storage.local) {
          storage.local.set({debugEnabled: false});
        }
      } catch (e) {
        // Ignore storage errors
      }
    },
    
    isEnabled: function() {
      return debugEnabled;
    }
  };
})();

// Export to window for global access
window.ExtDebug = ExtDebug; 