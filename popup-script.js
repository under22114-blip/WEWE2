class RobloxCommunityTracker {
    constructor() {
        this.currentCommunityId = null;
        this.isSearching = false;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadStoredData();
    }

    bindEvents() {
        const searchBtn = document.getElementById('searchBtn');
        const refreshBtn = document.getElementById('refreshBtn');
        const communityInput = document.getElementById('communityLink');

        searchBtn.addEventListener('click', () => this.handleSearch());
        refreshBtn.addEventListener('click', () => this.handleRefresh());
        
        communityInput.addEventListener('input', () => this.validateInput());
        communityInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });

        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleBackgroundMessage(message);
        });
    }

    async loadStoredData() {
        try {
            const result = await chrome.storage.local.get(['lastCommunityId', 'lastLeaderboard']);
            if (result.lastCommunityId && result.lastLeaderboard) {
                this.currentCommunityId = result.lastCommunityId;
                this.displayLeaderboard(result.lastLeaderboard);
                document.getElementById('refreshBtn').disabled = false;
                
                // Restore the community link in input
                const communityInput = document.getElementById('communityLink');
                communityInput.value = `https://www.roblox.com/communities/${result.lastCommunityId}/`;
            }
        } catch (error) {
            console.error('Error loading stored data:', error);
        }
    }

    extractCommunityId(url) {
        try {
            // Remove any trailing fragments or query parameters
            const cleanUrl = url.split('?')[0].split('#')[0];
            
            // Match the 2025 format: https://www.roblox.com/communities/{ID}/...
            const match = cleanUrl.match(/\/communities\/(\d+)/);
            
            if (match && match[1]) {
                const communityId = match[1];
                // Validate that it's a reasonable community ID (numeric and reasonable length)
                if (/^\d{1,12}$/.test(communityId)) {
                    return communityId;
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error extracting community ID:', error);
            return null;
        }
    }

    validateInput() {
        const input = document.getElementById('communityLink');
        const searchBtn = document.getElementById('searchBtn');
        const url = input.value.trim();

        if (!url) {
            searchBtn.disabled = true;
            return false;
        }

        const communityId = this.extractCommunityId(url);
        const isValid = communityId !== null;
        
        searchBtn.disabled = !isValid;
        
        // Visual feedback
        if (url && !isValid) {
            input.style.borderColor = '#f44336';
            this.showStatus('Invalid community link format', 'error');
        } else if (isValid) {
            input.style.borderColor = '#4caf50';
            this.clearStatus();
        } else {
            input.style.borderColor = '#3a3a5c';
            this.clearStatus();
        }

        return isValid;
    }

    async handleSearch() {
        if (this.isSearching) return;

        const input = document.getElementById('communityLink');
        const url = input.value.trim();

        if (!this.validateInput()) {
            this.showStatus('Please enter a valid Roblox community link', 'error');
            return;
        }

        const communityId = this.extractCommunityId(url);
        if (!communityId) {
            this.showStatus('Could not extract community ID from the link', 'error');
            return;
        }

        this.currentCommunityId = communityId;
        this.isSearching = true;
        
        // Update UI state
        document.getElementById('searchBtn').disabled = true;
        document.getElementById('refreshBtn').disabled = true;
        this.showProgress();
        this.showStatus('Fetching community members...', 'info');

        try {
            // Send message to background script to start fetching
            await chrome.runtime.sendMessage({
                action: 'fetchCommunityData',
                communityId: communityId
            });
        } catch (error) {
            console.error('Error starting search:', error);
            this.showStatus('Failed to start search. Please try again.', 'error');
            this.resetSearchState();
        }
    }

    async handleRefresh() {
        if (!this.currentCommunityId || this.isSearching) return;

        this.isSearching = true;
        document.getElementById('refreshBtn').disabled = true;
        this.showProgress();
        this.showStatus('Refreshing leaderboard...', 'info');

        try {
            await chrome.runtime.sendMessage({
                action: 'fetchCommunityData',
                communityId: this.currentCommunityId
            });
        } catch (error) {
            console.error('Error refreshing:', error);
            this.showStatus('Failed to refresh. Please try again.', 'error');
            this.resetSearchState();
        }
    }

    handleBackgroundMessage(message) {
        switch (message.type) {
            case 'progress':
                this.updateProgress(message.data);
                break;
            case 'success':
                this.handleSearchSuccess(message.data);
                break;
            case 'partial_results':
                this.handlePartialResults(message.data);
                break;
            case 'error':
                this.handleSearchError(message.error);
                break;
            case 'status':
                this.showStatus(message.message, message.statusType || 'info');
                break;
        }
    }

    updateProgress(data) {
        const { current, total, message } = data;
        const percentage = total > 0 ? (current / total) * 100 : 0;
        
        const progressFill = document.querySelector('.progress-fill');
        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }

        if (message) {
            this.showStatus(message, 'info');
        }
    }

    handlePartialResults(data) {
        const { leaderboard, isPartial, processed, total } = data;
        
        // Update leaderboard with partial results
        this.displayLeaderboard(leaderboard);
        
        // Update stats for partial results
        const stats = {
            totalMembers: total,
            totalWithRAP: leaderboard.length,
            totalRAP: leaderboard.reduce((sum, player) => sum + player.totalRAP, 0)
        };
        this.updateStats(stats);
        
        // Show status indicating partial results
        this.showStatus(`Live results: ${leaderboard.length} wealthy members found (${processed}/${total} processed)`, 'info');
    }

    async handleSearchSuccess(data) {
        const { leaderboard, stats } = data;
        
        this.displayLeaderboard(leaderboard);
        this.updateStats(stats);
        
        // Store data for future use
        await chrome.storage.local.set({
            lastCommunityId: this.currentCommunityId,
            lastLeaderboard: leaderboard,
            lastStats: stats
        });

        this.showStatus(`✅ Complete! Found ${stats.totalMembers} members with ${stats.totalWithRAP} having valuable items`, 'success');
        this.resetSearchState();
        document.getElementById('refreshBtn').disabled = false;
    }

    handleSearchError(error) {
        console.error('Search error:', error);
        this.showStatus(error || 'An error occurred while fetching data', 'error');
        this.resetSearchState();
    }

    displayLeaderboard(leaderboard) {
        const leaderboardContainer = document.getElementById('leaderboard');
        const leaderboardHeader = document.querySelector('.leaderboard-header');
        
        leaderboardContainer.innerHTML = '';
        
        if (!leaderboard || leaderboard.length === 0) {
            leaderboardHeader.style.display = 'none';
            leaderboardContainer.innerHTML = `
                <div class="empty-state">
                    <h3>No members found</h3>
                    <p>This community has no members with valuable limited items (>10k RAP)</p>
                </div>
            `;
            return;
        }

        leaderboardHeader.style.display = 'flex';

        leaderboard.forEach((player, index) => {
            const rank = index + 1;
            const item = document.createElement('div');
            item.className = `leaderboard-item ${rank <= 3 ? `rank-${rank}` : ''}`;
            
            item.innerHTML = `
                <div class="player-info">
                    <div class="rank">#${rank}</div>
                    <img src="${player.avatar || 'https://www.roblox.com/headshot-thumbnail/image?userId=' + player.userId + '&width=32&height=32&format=png'}" 
                         alt="${player.username}" 
                         class="avatar"
                         onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiM2NjY2NjYiLz4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTggMTJDMTAuMjA5MSAxMiAxMiAxMC4yMDkxIDEyIDhDMTIgNS43OTA5IDEwLjIwOTEgNCA4IDRDNS43OTA5IDQgNCA1Ljc5MDkgNCA4QzQgMTAuMjA5MSA1Ljc5MDkgMTIgOCAxMloiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo8L3N2Zz4K'">
                    <div class="username">@${player.username}</div>
                </div>
                <div class="rap-value">${this.formatNumber(player.totalRAP)}</div>
            `;
            
            leaderboardContainer.appendChild(item);
        });
    }

    updateStats(stats) {
        document.getElementById('memberCount').textContent = `${stats.totalMembers} members`;
        document.getElementById('totalRAP').textContent = `Total RAP: R$ ${this.formatNumber(stats.totalRAP)}`;
    }

    formatNumber(num) {
        if (num >= 1000000000) {
            return (num / 1000000000).toFixed(1) + 'B';
        } else if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toLocaleString();
    }

    showStatus(message, type = 'info') {
        const statusElement = document.getElementById('statusMessage');
        statusElement.textContent = message;
        statusElement.className = `status-message ${type}`;
        statusElement.style.display = 'block';
    }

    clearStatus() {
        const statusElement = document.getElementById('statusMessage');
        statusElement.style.display = 'none';
        statusElement.className = 'status-message';
    }

    showProgress() {
        const progressBar = document.getElementById('progressBar');
        progressBar.style.display = 'block';
        
        const progressFill = document.querySelector('.progress-fill');
        progressFill.style.width = '0%';
    }

    hideProgress() {
        const progressBar = document.getElementById('progressBar');
        progressBar.style.display = 'none';
    }

    resetSearchState() {
        this.isSearching = false;
        document.getElementById('searchBtn').disabled = false;
        this.hideProgress();
    }
}

// Initialize the tracker when the popup loads
document.addEventListener('DOMContentLoaded', () => {
    new RobloxCommunityTracker();
});