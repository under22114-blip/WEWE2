/**
 * Roblox Community Wealth Tracker - Main Script
 * Completely rewritten for maximum performance and user experience
 */

class WealthTracker {
    constructor() {
        this.state = {
            isScanning: false,
            currentCommunityId: null,
            cachedResults: null
        };
        
        this.elements = {};
        this.init();
    }

    init() {
        this.cacheElements();
        this.bindEvents();
        this.loadPreviousSession();
    }

    cacheElements() {
        this.elements = {
            urlInput: document.getElementById('communityUrl'),
            scanBtn: document.getElementById('scanBtn'),
            refreshBtn: document.getElementById('refreshBtn'),
            inputStatus: document.getElementById('inputStatus'),
            statusDisplay: document.getElementById('statusDisplay'),
            progressContainer: document.getElementById('progressContainer'),
            progressFill: document.getElementById('progressFill'),
            progressText: document.getElementById('progressText'),
            statsBar: document.getElementById('statsBar'),
            memberCount: document.getElementById('memberCount'),
            rapCount: document.getElementById('rapCount'),
            totalValue: document.getElementById('totalValue'),
            leaderboard: document.getElementById('leaderboard')
        };
    }

    bindEvents() {
        // Input validation and real-time feedback
        this.elements.urlInput.addEventListener('input', () => this.validateInput());
        this.elements.urlInput.addEventListener('paste', () => {
            setTimeout(() => this.validateInput(), 10);
        });
        this.elements.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !this.elements.scanBtn.disabled) {
                this.startScan();
            }
        });

        // Button events
        this.elements.scanBtn.addEventListener('click', () => this.startScan());
        this.elements.refreshBtn.addEventListener('click', () => this.refresh());

        // Background script communication
        chrome.runtime.onMessage.addListener((message) => {
            this.handleBackgroundMessage(message);
        });
    }

    async loadPreviousSession() {
        try {
            const data = await chrome.storage.local.get(['lastCommunityId', 'lastResults']);
            if (data.lastCommunityId && data.lastResults) {
                this.state.currentCommunityId = data.lastCommunityId;
                this.state.cachedResults = data.lastResults;
                
                // Restore URL
                this.elements.urlInput.value = `https://www.roblox.com/communities/${data.lastCommunityId}/`;
                this.validateInput();
                
                // Display cached results
                this.displayResults(data.lastResults);
                this.elements.refreshBtn.disabled = false;
                
                this.setStatus('Previous session restored', 'info');
            }
        } catch (error) {
            console.error('Failed to load previous session:', error);
        }
    }

    extractCommunityId(url) {
        if (!url || typeof url !== 'string') return null;
        
        try {
            // Clean the URL
            const cleanUrl = url.trim().split('?')[0].split('#')[0];
            
            // Extract community ID using regex
            const patterns = [
                /\/communities\/(\d+)/i,  // Primary 2025 format
                /\/groups\/(\d+)/i        // Fallback for groups
            ];
            
            for (const pattern of patterns) {
                const match = cleanUrl.match(pattern);
                if (match && match[1]) {
                    const id = match[1];
                    // Validate ID format (1-12 digits)
                    if (/^\d{1,12}$/.test(id) && parseInt(id) > 0) {
                        return id;
                    }
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error extracting community ID:', error);
            return null;
        }
    }

    validateInput() {
        const url = this.elements.urlInput.value.trim();
        const communityId = this.extractCommunityId(url);
        
        // Reset styles
        this.elements.urlInput.classList.remove('valid', 'invalid');
        this.elements.inputStatus.classList.remove('valid', 'invalid');
        
        if (!url) {
            this.elements.scanBtn.disabled = true;
            this.elements.inputStatus.textContent = '';
            return false;
        }
        
        if (communityId) {
            this.elements.urlInput.classList.add('valid');
            this.elements.inputStatus.classList.add('valid');
            this.elements.inputStatus.textContent = `✓ Community ID: ${communityId}`;
            this.elements.scanBtn.disabled = false;
            return true;
        } else {
            this.elements.urlInput.classList.add('invalid');
            this.elements.inputStatus.classList.add('invalid');
            this.elements.inputStatus.textContent = '✗ Invalid community link format';
            this.elements.scanBtn.disabled = true;
            return false;
        }
    }

    async startScan() {
        if (this.state.isScanning) return;
        
        const url = this.elements.urlInput.value.trim();
        const communityId = this.extractCommunityId(url);
        
        if (!communityId) {
            this.setStatus('Invalid community link', 'error');
            return;
        }

        this.state.isScanning = true;
        this.state.currentCommunityId = communityId;
        
        // Update UI
        this.elements.scanBtn.disabled = true;
        this.elements.refreshBtn.disabled = true;
        this.clearResults();
        this.showProgress();
        this.setStatus('Initializing scan...', 'info');

        try {
            // Send scan request to background
            await chrome.runtime.sendMessage({
                action: 'scanCommunity',
                communityId: communityId
            });
        } catch (error) {
            console.error('Failed to start scan:', error);
            this.setStatus('Failed to start scan', 'error');
            this.resetScanState();
        }
    }

    async refresh() {
        if (!this.state.currentCommunityId || this.state.isScanning) return;
        
        this.state.isScanning = true;
        this.elements.refreshBtn.disabled = true;
        this.showProgress();
        this.setStatus('Refreshing data...', 'info');

        try {
            await chrome.runtime.sendMessage({
                action: 'scanCommunity',
                communityId: this.state.currentCommunityId
            });
        } catch (error) {
            console.error('Failed to refresh:', error);
            this.setStatus('Failed to refresh', 'error');
            this.resetScanState();
        }
    }

    handleBackgroundMessage(message) {
        switch (message.type) {
            case 'scan_started':
                this.setStatus('Scanning community...', 'info');
                break;
                
            case 'progress_update':
                this.updateProgress(message.data);
                break;
                
            case 'partial_results':
                this.displayPartialResults(message.data);
                break;
                
            case 'scan_complete':
                this.handleScanComplete(message.data);
                break;
                
            case 'scan_error':
                this.handleScanError(message.error);
                break;
                
            case 'status_update':
                this.setStatus(message.message, message.level || 'info');
                break;
        }
    }

    updateProgress(data) {
        const { processed, total, percentage, message } = data;
        
        this.elements.progressFill.style.width = `${percentage}%`;
        this.elements.progressText.textContent = `${percentage}% (${processed}/${total})`;
        
        if (message) {
            this.setStatus(message, 'info');
        }
    }

    displayPartialResults(data) {
        const { leaderboard, stats, isLive } = data;
        
        this.displayLeaderboard(leaderboard);
        this.updateStats(stats);
        
        if (isLive) {
            this.setStatus(`🔴 Live: ${stats.withRAP} wealthy members found`, 'info');
        }
    }

    async handleScanComplete(data) {
        const { leaderboard, stats } = data;
        
        this.displayResults(data);
        
        // Cache results
        await chrome.storage.local.set({
            lastCommunityId: this.state.currentCommunityId,
            lastResults: data
        });
        
        this.setStatus(`✅ Scan complete! Found ${stats.withRAP} wealthy members`, 'success');
        this.resetScanState();
        this.elements.refreshBtn.disabled = false;
    }

    handleScanError(error) {
        console.error('Scan error:', error);
        this.setStatus(error || 'Scan failed', 'error');
        this.resetScanState();
    }

    displayResults(data) {
        this.displayLeaderboard(data.leaderboard);
        this.updateStats(data.stats);
        this.state.cachedResults = data;
    }

    displayLeaderboard(players) {
        const container = this.elements.leaderboard;
        container.innerHTML = '';

        if (!players || players.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">🔍</div>
                    <h3>No wealthy members found</h3>
                    <p>This community has no members with valuable limited items (>10k RAP)</p>
                </div>
            `;
            return;
        }

        // Show stats bar
        this.elements.statsBar.classList.remove('hidden');

        players.forEach((player, index) => {
            const rank = index + 1;
            const card = this.createPlayerCard(player, rank);
            container.appendChild(card);
        });
    }

    createPlayerCard(player, rank) {
        const card = document.createElement('div');
        card.className = `player-card ${rank <= 3 ? `rank-${rank}` : ''}`;
        card.style.animationDelay = `${Math.min(rank * 50, 1000)}ms`;

        card.innerHTML = `
            <div class="rank-badge">${rank}</div>
            <div class="player-info">
                <img 
                    src="https://www.roblox.com/headshot-thumbnail/image?userId=${player.userId}&width=32&height=32&format=png" 
                    alt="${player.username}"
                    class="avatar"
                    loading="lazy"
                    onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIGZpbGw9IiM2NjYiIHZpZXdCb3g9IjAgMCAzMiAzMiI+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiLz48L3N2Zz4='"
                >
                <div class="player-details">
                    <div class="username">@${player.username}</div>
                    <div class="user-id">ID: ${player.userId}</div>
                </div>
            </div>
            <div class="rap-display">
                <div class="rap-value">${this.formatCurrency(player.totalRAP)}</div>
                <div class="rap-label">Total RAP</div>
            </div>
        `;

        return card;
    }

    updateStats(stats) {
        this.elements.memberCount.textContent = stats.totalMembers.toLocaleString();
        this.elements.rapCount.textContent = stats.withRAP.toLocaleString();
        this.elements.totalValue.textContent = this.formatCurrency(stats.totalRAP);
    }

    formatCurrency(amount) {
        if (amount >= 1e9) return `R$ ${(amount / 1e9).toFixed(1)}B`;
        if (amount >= 1e6) return `R$ ${(amount / 1e6).toFixed(1)}M`;
        if (amount >= 1e3) return `R$ ${(amount / 1e3).toFixed(1)}K`;
        return `R$ ${amount.toLocaleString()}`;
    }

    setStatus(message, level = 'info') {
        const display = this.elements.statusDisplay;
        display.textContent = message;
        display.className = `status-display ${level}`;
    }

    showProgress() {
        this.elements.progressContainer.classList.remove('hidden');
        this.elements.progressFill.style.width = '0%';
        this.elements.progressText.textContent = '0%';
    }

    hideProgress() {
        this.elements.progressContainer.classList.add('hidden');
    }

    clearResults() {
        this.elements.leaderboard.innerHTML = '';
        this.elements.statsBar.classList.add('hidden');
    }

    resetScanState() {
        this.state.isScanning = false;
        this.elements.scanBtn.disabled = false;
        this.hideProgress();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new WealthTracker();
});