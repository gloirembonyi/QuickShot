// Add OCR functionality to background.js
async function performOCR(imageData) {
    try {
      const settings = await browser.storage.local.get(['apiKey']);
      const apiKey = settings.apiKey || "YOUR_DEFAULT_API_KEY";
      
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

// dashboard.js - Enhanced with history visualization and management

document.addEventListener('DOMContentLoaded', () => {
  // Initialize variables
  let currentTabId = 'history';
  
  // DOM elements
  const newCaptureBtn = document.getElementById('new-capture');
  const tabButtons = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  const historyContainer = document.getElementById('history-container');
  const savedContainer = document.getElementById('saved-container');
  const statsContainer = document.querySelector('.stats-grid');
  
  // Add event listeners for tabs
  tabButtons.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      switchTab(tabId);
      loadTabContent(tabId);
    });
  });
  
  // New capture button listener
  newCaptureBtn.addEventListener('click', () => {
    browser.tabs.create({
      url: 'about:blank'
    }).then(tab => {
      // Wait for page load and then inject screenshot tool
      browser.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          browser.tabs.onUpdated.removeListener(listener);
          browser.tabs.executeScript(tab.id, {
            code: `
              browser.runtime.sendMessage({
                action: 'initScreenshotTool'
              });
            `
          });
        }
      });
    });
  });
  
  // Switch between tabs
  function switchTab(tabId) {
    currentTabId = tabId;
    
    // Update active tab button
    tabButtons.forEach(tab => {
      if (tab.dataset.tab === tabId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
    
    // Update active tab content
    tabContents.forEach(content => {
      if (content.id === tabId + '-tab') {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
  }
  
  // Load content for the selected tab
  function loadTabContent(tabId) {
    switch (tabId) {
      case 'history':
        loadHistory();
        break;
      case 'saved':
        loadSaved();
        break;
      case 'stats':
        loadStats();
        break;
    }
  }
  
  // Load screenshot history
  function loadHistory() {
    browser.runtime.sendMessage({ action: 'getHistory' })
      .then(response => {
        renderItems(response.history, historyContainer, true);
      })
      .catch(error => {
        console.error('Error loading history:', error);
        renderError(historyContainer, 'Failed to load history');
      });
  }
  
  // Load saved screenshots
  function loadSaved() {
    browser.storage.local.get('savedScreenshots')
      .then(data => {
        const saved = data.savedScreenshots || [];
        renderItems(saved, savedContainer, false);
      })
      .catch(error => {
        console.error('Error loading saved items:', error);
        renderError(savedContainer, 'Failed to load saved items');
      });
  }
  
  // Load usage statistics
  function loadStats() {
    Promise.all([
      browser.storage.local.get('screenshotHistory'),
      browser.storage.local.get('savedScreenshots')
    ])
      .then(([historyData, savedData]) => {
        const history = historyData.screenshotHistory || [];
        const saved = savedData.savedScreenshots || [];
        
        // Create stats
        const totalScreenshots = history.length;
        const totalSaved = saved.length;
        
        // Count screenshots per day (last 7 days)
        const last7Days = {};
        const today = new Date();
        
        // Initialize last 7 days with 0 counts
        for (let i = 0; i < 7; i++) {
          const day = new Date(today);
          day.setDate(today.getDate() - i);
          const dayStr = day.toISOString().split('T')[0];
          last7Days[dayStr] = 0;
        }
        
        // Count screenshots per day
        history.forEach(item => {
          const day = item.timestamp.split('T')[0];
          if (last7Days[day] !== undefined) {
            last7Days[day]++;
          }
        });
        
        // Render stats
        statsContainer.innerHTML = `
          <div class="stat-card">
            <div class="stat-value">${totalScreenshots}</div>
            <div class="stat-label">Total Screenshots</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${totalSaved}</div>
            <div class="stat-label">Saved Screenshots</div>
          </div>
          <div class="stat-card wide">
            <div class="stat-label">Screenshots per Day (Last 7 Days)</div>
            <div class="chart">
              ${renderChart(Object.values(last7Days).reverse())}
            </div>
            <div class="chart-labels">
              ${Object.keys(last7Days).reverse().map(day => 
                `<div class="chart-label">${formatDate(day)}</div>`
              ).join('')}
            </div>
          </div>
        `;
      })
      .catch(error => {
        console.error('Error loading stats:', error);
        renderError(statsContainer, 'Failed to load statistics');
      });
  }
  
  // Render a simple bar chart
  function renderChart(data) {
    const max = Math.max(...data, 1);
    return data.map(value => {
      const height = (value / max * 100) || 0;
      return `<div class="chart-bar" style="height: ${height}%" data-value="${value}"></div>`;
    }).join('');
  }
  
  // Render screenshot items
  function renderItems(items, container, showSaveButton) {
    if (!items || items.length === 0) {
      renderEmptyState(container);
      return;
    }
    
    container.innerHTML = '';
    
    // Sort items by timestamp (newest first)
    items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.id = item.id;
      
      const formattedDate = formatDateTime(item.timestamp);
      
      card.innerHTML = `
        <img src="${item.imageUrl}" alt="Screenshot" class="card-image">
        <div class="card-content">
          <h3 class="card-title" title="${item.pageTitle}">${item.pageTitle}</h3>
          <div class="card-meta">${formattedDate}</div>
          <div class="card-actions">
            <button class="card-button view-button" title="View Details">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5c-7.633 0-9.927 6.617-9.948 6.684L1.946 12l.105.316C2.073 12.383 4.367 19 12 19s9.927-6.617 9.948-6.684l.106-.316-.105-.316C21.927 11.617 19.633 5 12 5zm0 11c-2.206 0-4-1.794-4-4s1.794-4 4-4 4 1.794 4 4-1.794 4-4 4z"></path>
                <circle cx="12" cy="12" r="2"></circle>
              </svg>
              View
            </button>
            ${showSaveButton ? `
              <button class="card-button save-button" title="Save for Later">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                </svg>
                Save
              </button>
            ` : ''}
            <button class="card-button delete-button" title="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18"></path>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Delete
            </button>
          </div>
        </div>
      `;
      
      // Add event listeners for card actions
      card.querySelector('.view-button').addEventListener('click', () => {
        viewScreenshot(item);
      });
      
      if (showSaveButton) {
        card.querySelector('.save-button').addEventListener('click', (e) => {
          toggleSaveItem(item.id, e.target.closest('.save-button'));
        });
      }
      
      card.querySelector('.delete-button').addEventListener('click', () => {
        deleteItem(item.id, container === savedContainer ? 'saved' : 'history');
      });
      
      container.appendChild(card);
    });
  }
  
  // Render empty state
  function renderEmptyState(container) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <h3>No items yet</h3>
        <p>Your screenshots will appear here after you capture them.</p>
        <button id="take-screenshot" class="primary-button">Take Screenshot</button>
      </div>
    `;
    
    // Add event listener for empty state button
    container.querySelector('#take-screenshot').addEventListener('click', () => {
      newCaptureBtn.click();
    });
  }
  
  // Render error message
  function renderError(container, message) {
    container.innerHTML = `
      <div class="empty-state error">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <h3>Error</h3>
        <p>${message}</p>
        <button id="retry-button" class="primary-button">Retry</button>
      </div>
    `;
    
    // Add event listener for retry button
    container.querySelector('#retry-button').addEventListener('click', () => {
      loadTabContent(currentTabId);
    });
  }
  
  // View screenshot details
  function viewScreenshot(item) {
    // Create modal to display screenshot details
    const modal = document.createElement('div');
    modal.className = 'detail-modal';
    
    const formattedDate = formatDateTime(item.timestamp);
    const formattedAnalysis = formatAnalysisText(item.analysis?.analysis || '');
    
    modal.innerHTML = `
      <div class="detail-content">
        <div class="detail-header">
          <h2>${item.pageTitle}</h2>
          <button class="close-button">×</button>
        </div>
        <div class="detail-body">
          <div class="detail-image-container">
            <img src="${item.imageUrl}" alt="Screenshot" class="detail-image">
          </div>
          <div class="detail-info">
            <div class="detail-meta">
              <div class="meta-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span>${formattedDate}</span>
              </div>
              <div class="meta-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
                <a href="${item.pageUrl}" target="_blank" class="page-link">${item.pageUrl}</a>
              </div>
            </div>
            <div class="detail-analysis">
              <h3>AI Analysis</h3>
              <div class="analysis-content">
                ${formattedAnalysis || 'No analysis available'}
              </div>
            </div>
          </div>
        </div>
        <div class="detail-footer">
          <button class="secondary-button close-detail">Close</button>
          <div class="footer-actions">
            <button class="primary-button download-button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download
            </button>
            <button class="primary-button copy-button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy to Clipboard
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Prevent scrolling of background content
    document.body.style.overflow = 'hidden';
    
    // Add event listeners for modal actions
    modal.querySelector('.close-button').addEventListener('click', () => {
      closeModal(modal);
    });
    
    modal.querySelector('.close-detail').addEventListener('click', () => {
      closeModal(modal);
    });
    
    modal.querySelector('.download-button').addEventListener('click', () => {
      downloadImage(item.imageUrl, `screenshot-${item.id}.png`);
    });
    
    modal.querySelector('.copy-button').addEventListener('click', () => {
      copyImageToClipboard(item.imageUrl);
    });
    
    // Close modal when clicking outside the content
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal);
      }
    });
  }
  
  // Close modal
  function closeModal(modal) {
    modal.classList.add('closing');
    setTimeout(() => {
      modal.remove();
      document.body.style.overflow = '';
    }, 300);
  }
  
  // Toggle save/unsave item
  function toggleSaveItem(id, button) {
    browser.runtime.sendMessage({
      action: 'toggleSaveItem',
      id: id
    })
      .then(response => {
        if (response.success) {
          // Update button text
          if (response.saved) {
            button.innerHTML = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
              Saved
            `;
            button.classList.add('saved');
            
            // Show notification
            showToast('Screenshot saved to favorites');
          } else {
            button.innerHTML = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
              Save
            `;
            button.classList.remove('saved');
            
            // Reload saved tab if we're on it
            if (currentTabId === 'saved') {
              loadSaved();
            }
            
            // Show notification
            showToast('Removed from favorites');
          }
        } else {
          showToast('Error: ' + (response.error || 'Failed to save item'));
        }
      })
      .catch(error => {
        console.error('Error toggling save:', error);
        showToast('Error: Failed to save item');
      });
  }
  
  // Delete item
  function deleteItem(id, type) {
    // Show confirmation dialog
    if (!confirm('Are you sure you want to delete this screenshot?')) {
      return;
    }
    
    if (type === 'history') {
      browser.runtime.sendMessage({
        action: 'deleteHistoryItem',
        id: id
      })
        .then(response => {
          if (response.success) {
            // Remove from DOM
            const card = document.querySelector(`.card[data-id="${id}"]`);
            if (card) {
              card.classList.add('removing');
              setTimeout(() => {
                card.remove();
                
                // Check if we need to show empty state
                if (historyContainer.children.length === 0) {
                  renderEmptyState(historyContainer);
                }
              }, 300);
            }
            
            // Show notification
            showToast('Screenshot deleted');
          } else {
            showToast('Error: Failed to delete item');
          }
        })
        .catch(error => {
          console.error('Error deleting item:', error);
          showToast('Error: Failed to delete item');
        });
    } else if (type === 'saved') {
      browser.storage.local.get('savedScreenshots')
        .then(data => {
          const saved = data.savedScreenshots || [];
          const newSaved = saved.filter(item => item.id !== id);
          
          return browser.storage.local.set({ savedScreenshots: newSaved });
        })
        .then(() => {
          // Remove from DOM
          const card = document.querySelector(`.card[data-id="${id}"]`);
          if (card) {
            card.classList.add('removing');
            setTimeout(() => {
              card.remove();
              
              // Check if we need to show empty state
              if (savedContainer.children.length === 0) {
                renderEmptyState(savedContainer);
              }
            }, 300);
          }
          
          // Show notification
          showToast('Screenshot removed from saved items');
        })
        .catch(error => {
          console.error('Error deleting saved item:', error);
          showToast('Error: Failed to delete item');
        });
    }
  }
  
  // Format date
  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  
  // Format date and time
  function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // Copy image to clipboard
  function copyImageToClipboard(dataUrl) {
    // Create an image element
    const img = new Image();
    img.src = dataUrl;
    
    img.onload = function() {
      // Create a canvas element
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw the image on the canvas
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      // Convert canvas to blob
      canvas.toBlob(blob => {
        // Copy to clipboard using the Clipboard API
        try {
          const clipboardItem = new ClipboardItem({ 'image/png': blob });
          navigator.clipboard.write([clipboardItem])
            .then(() => {
              showToast('Image copied to clipboard');
            })
            .catch(err => {
              console.error('Failed to copy image:', err);
              showToast('Failed to copy image to clipboard');
            });
        } catch (err) {
          console.error('Clipboard API not supported:', err);
          showToast('Clipboard API not supported in this browser');
        }
      });
    };
  }
  
  // Download image
  function downloadImage(dataUrl, filename) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }
  
  // Show toast notification
  function showToast(message) {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
      existingToast.remove();
    }
    
    // Create new toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Show toast
    setTimeout(() => {
      toast.classList.add('show');
    }, 50);
    
    // Hide toast after 3 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  }
  
  // Format analysis text for readability
  function formatAnalysisText(text) {
    if (!text) return '';
    
    // Remove ** markers from text (bold/emphasis markers)
    text = text.replace(/\*\*/g, '');
    
    // Convert newlines to <br>
    text = text.replace(/\n/g, '<br>');
    
    // Format bullet points
    text = text.replace(/^(\*\s+.+)/gm, '<li>$1</li>');
    text = text.replace(/\*\s+/g, '');
    
    // Wrap list items in <ul>
    if (text.includes('<li>')) {
      text = '<ul>' + text + '</ul>';
    }
    
    return text;
  }
  
  // Initial load
  loadTabContent(currentTabId);
});