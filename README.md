# AI Screenshot Analyzer

A powerful browser extension that allows you to select any area of your screen, capture it, and analyze it using AI.

## Features

- Select any area of the webpage to analyze
- Get instant AI-powered analysis of your screenshot
- Ask follow-up questions about the analyzed content
- Keyboard shortcuts for quick access
- Works with Google's powerful Gemini AI
- Compatible with both Chrome and Firefox

## Installation

### Chrome

1. Download this repository as a ZIP file and extract it to a folder
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extracted folder
5. The extension should now be installed and visible in your toolbar

### Firefox

1. Download this repository as a ZIP file and extract it to a folder
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..." and select the `manifest.json` file from the extracted folder
4. The extension should now be installed and visible in your toolbar

For permanent installation in Firefox:

1. You'll need to sign your add-on through the [Firefox Add-ons Developer Hub](https://addons.mozilla.org/en-US/developers/)
2. The process requires creating an account and submitting the add-on for review

## Usage

### Using Keyboard Shortcuts

- **Option+S** (Mac) or **Alt+S** (Windows/Linux): Quickly activate the screenshot tool
- **Option+A** (Mac) or **Alt+A** (Windows/Linux): Start area selection
- **Command+Shift+Q** (Mac) or **Ctrl+Shift+Q** (Windows/Linux): Open the extension popup

### Using the Extension Button

1. Click the AI Screenshot Analyzer icon in your browser toolbar
2. Click "Start Screenshot Analysis" in the popup
3. Click and drag to select the area you want to analyze
4. Click "Analyze" to process the selected area

### Using Context Menu

1. Right-click anywhere on a webpage
2. Select "Analyze with AI Screenshot" from the context menu
3. Click and drag to select the area you want to analyze
4. Click "Analyze" to process the selected area

## Firefox-Specific Setup

Firefox requires some additional configuration for keyboard shortcuts:

1. Go to `about:addons`
2. Click the gear icon and select "Manage Extension Shortcuts"
3. Find "AI Screenshot Analyzer" and set up your preferred shortcuts

## Troubleshooting

### Keyboard Shortcuts Not Working

- Check if the extension has permission to run on all sites
- Try clicking the extension icon first to initialize it
- Reload the page if the extension was just installed
- Check browser extension settings to ensure shortcuts are enabled

### Firefox-Specific Issues

- Go to `about:addons` → Extensions → AI Screenshot Analyzer → Permissions and ensure "Access your data for all websites" is enabled
- Go to `about:config` and ensure `extensions.webextensions.restrictedDomains` does not include websites you want to capture
- Some websites may have Content Security Policies that block extensions

### Extension Not Working on Certain Sites

Some websites have strict security policies that can prevent extensions from working. In these cases:

1. Try using the extension on a different website
2. Check if the website is in your browser's restricted domains list
3. Try using the browser action button instead of keyboard shortcuts

## Privacy & Data Usage

- All processing is done using Google's Gemini API
- Screenshots are sent to the API for analysis but are not stored permanently
- An API key is required for full functionality (the extension includes a default key for testing)

## Credits

- This extension uses [html2canvas](https://html2canvas.hertzen.com/) for screenshot capturing
- AI analysis powered by Google's Gemini API

## License

This project is licensed under the MIT License - see the LICENSE file for details.
