## Roblox Exact Robux (Chrome Extension)

Shows your exact Robux on roblox.com by replacing abbreviated values (e.g., 1M+) in the header with the full number (e.g., 1067530). It fetches your balance from Roblox's official API using your logged-in session cookies.

### Install (Developer Mode)

1. Download or clone this folder to your computer.
2. Open Chrome and go to `chrome://extensions`.
3. Toggle on Developer mode (top right).
4. Click "Load unpacked" and select this folder.
5. Visit `https://www.roblox.com/` while logged in. The header Robux display should become the exact number.

### Files

- `manifest.json`: Extension configuration (MV3).
- `background.js`: Service worker that fetches your balance from `https://economy.roblox.com/v1/user/currency`.
- `content.js`: Injected into roblox.com pages to replace header Robux text and keep it updated as the DOM changes.

### Notes

- The extension only alters header/navigation elements to avoid changing item prices or other numbers.
- Balance is cached for ~30 seconds to minimize network usage.
- If you're not logged in or the API is temporarily unavailable, the page will remain unchanged.

# 🎮 Roblox Community RAP Tracker

A Chrome extension that extracts Roblox community members and ranks them by their wealth based on limited items ownership.

## ✨ Features

- **Community ID Extraction**: Automatically extracts community IDs from 2025 Roblox community links
- **Fast Member Fetching**: Efficiently fetches all community members, even from communities with millions of members
- **RAP Calculation**: Calculates total Recent Average Price (RAP) for each member's limited items
- **Wealth Filtering**: Only counts limited items worth more than 10,000 Robux
- **Real-time Leaderboard**: Displays members ranked by total RAP value
- **Username Display**: Shows usernames (not display names) with total RAP values
- **Refresh Functionality**: Updates the leaderboard without re-entering the community link
- **Beautiful UI**: Modern dark theme with smooth animations and responsive design

## 🚀 Installation

1. **Download the Extension**:
   - Download all files to a folder on your computer

2. **Load into Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the folder containing the extension files

3. **Pin the Extension**:
   - Click the extensions icon (puzzle piece) in Chrome toolbar
   - Pin the "Roblox Community RAP Tracker" extension for easy access

## 📖 Usage

1. **Enter Community Link**:
   - Click the extension icon in your Chrome toolbar
   - Paste a Roblox community link in the text box
   - Example: `https://www.roblox.com/communities/35461612/Z9-Market#!/about`

2. **Search for Members**:
   - Click "Search for List" to start fetching community data
   - The extension will automatically extract the community ID (35461612)
   - Progress will be shown as members are processed

3. **View Leaderboard**:
   - Members will be ranked by total RAP value
   - Only shows members with limited items worth >10k Robux
   - Displays username and total RAP value

4. **Refresh Data**:
   - Use the "Refresh" button to update the leaderboard
   - No need to re-enter the community link

## 🔧 Technical Details

### Supported Link Formats
- `https://www.roblox.com/communities/{ID}/...`
- Automatically ignores everything after the community ID
- Validates that the extracted ID is numeric and reasonable length

### API Optimization
- **Parallel Processing**: Processes multiple members simultaneously
- **Rate Limit Handling**: Automatically handles Roblox API rate limits
- **Batch Processing**: Processes users in batches for optimal performance
- **Caching**: Stores results locally for quick refresh

### Performance Features
- **Fast Fetching**: Can handle communities with 2+ million members
- **Efficient RAP Calculation**: Only fetches RAP for limited items
- **Memory Optimization**: Limits display to top 100 members
- **Progress Tracking**: Real-time progress updates during processing

## 🛡️ Privacy & Security

- **No Data Collection**: Extension doesn't collect or store personal data
- **Local Storage**: All data is stored locally in your browser
- **API Compliance**: Follows Roblox API terms of service
- **Secure Requests**: All API calls are made securely over HTTPS

## 🐛 Troubleshooting

### Common Issues

1. **"Invalid community link format"**:
   - Ensure you're using the correct 2025 community link format
   - Link should contain `/communities/{ID}/`

2. **"Community not found"**:
   - Verify the community ID is correct
   - Check if the community is public and accessible

3. **Slow performance**:
   - Large communities may take several minutes to process
   - The extension will show progress updates
   - Consider using smaller communities for testing

4. **Rate limiting**:
   - If you see delays, the extension is handling Roblox rate limits
   - Wait for the process to complete automatically

### Error Messages

- **"Already processing a community"**: Wait for current operation to finish
- **"No members found"**: Community may be empty or private
- **"Failed to fetch community data"**: Check internet connection and try again

## 📋 File Structure

```
roblox-community-tracker/
├── manifest.json          # Extension configuration
├── popup.html            # Main UI interface
├── popup.css             # Styling and theme
├── popup.js              # UI logic and interactions
├── background.js         # API handling and data processing
└── README.md            # This file
```

## 🔄 Updates

The extension is designed to be compatible with Roblox's 2025 website updates and community link format changes.

## ⚠️ Disclaimer

This extension is for educational and informational purposes only. Always respect Roblox's Terms of Service and API usage guidelines. The extension makes read-only requests to public Roblox data.