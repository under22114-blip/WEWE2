const ROBUX_ENDPOINT = "https://economy.roblox.com/v1/user/currency";

async function fetchExactRobuxBalance() {
  try {
    const response = await fetch(ROBUX_ENDPOINT, {
      method: "GET",
      credentials: "include",
      headers: {
        "accept": "application/json, text/plain, */*",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data && typeof data.robux === "number") {
      return data.robux;
    }
    throw new Error("Unexpected response shape");
  } catch (error) {
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "GET_ROBUX_BALANCE") {
    fetchExactRobuxBalance()
      .then((robux) => {
        sendResponse({ ok: true, robux });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
      });
    return true; // Keep the message channel open for async response
  }
});

class RobloxAPIManager {
    constructor() {
        this.baseDelay = 100; // Base delay between requests (ms)
        this.maxConcurrentRequests = 10; // Max parallel requests
        this.requestQueue = [];
        this.activeRequests = 0;
        this.rateLimitDelay = 1000; // Delay when rate limited
        this.rapCache = new Map(); // Cache RAP values to avoid duplicate requests
    }

    async makeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ url, options, resolve, reject });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.activeRequests >= this.maxConcurrentRequests || this.requestQueue.length === 0) {
            return;
        }

        const { url, options, resolve, reject } = this.requestQueue.shift();
        this.activeRequests++;

        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    ...options.headers
                }
            });

            if (response.status === 429) {
                // Rate limited - retry after delay
                setTimeout(() => {
                    this.requestQueue.unshift({ url, options, resolve, reject });
                    this.activeRequests--;
                    this.processQueue();
                }, this.rateLimitDelay);
                return;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            resolve(data);
        } catch (error) {
            reject(error);
        } finally {
            this.activeRequests--;
            setTimeout(() => this.processQueue(), this.baseDelay);
        }
    }

    async fetchCommunityMembers(communityId) {
        const members = [];
        let cursor = null;
        let hasNextPage = true;
        let pageCount = 0;

        while (hasNextPage && pageCount < 100) { // Limit to prevent infinite loops
            try {
                let url = `https://groups.roblox.com/v1/groups/${communityId}/users?sortOrder=Asc&limit=100`;
                if (cursor) {
                    url += `&cursor=${cursor}`;
                }

                const response = await this.makeRequest(url);
                
                if (response.data && response.data.length > 0) {
                    members.push(...response.data);
                }

                cursor = response.nextPageCursor;
                hasNextPage = !!cursor;
                pageCount++;

                // Send progress update
                this.sendProgressUpdate(members.length, null, `Fetched ${members.length} members...`);

            } catch (error) {
                console.error('Error fetching community members:', error);
                break;
            }
        }

        return members;
    }

    async fetchUserInventory(userId) {
        try {
            // Use a more efficient approach - fetch multiple pages if needed
            let allItems = [];
            let cursor = null;
            let pageCount = 0;
            const maxPages = 5; // Limit to prevent excessive API calls

            while (pageCount < maxPages) {
                let url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=100`;
                if (cursor) {
                    url += `&cursor=${cursor}`;
                }

                const response = await this.makeRequest(url);
                const items = response.data || [];
                
                if (items.length === 0) break;
                
                allItems.push(...items);
                cursor = response.nextPageCursor;
                pageCount++;
                
                if (!cursor) break;
            }

            return allItems;
        } catch (error) {
            console.error(`Error fetching inventory for user ${userId}:`, error);
            return [];
        }
    }

    async fetchAssetRAP(assetId) {
        // Check cache first
        if (this.rapCache.has(assetId)) {
            return this.rapCache.get(assetId);
        }

        try {
            const url = `https://economy.roblox.com/v1/assets/${assetId}/resale-data`;
            const response = await this.makeRequest(url);
            const rap = response.recentAveragePrice || 0;
            
            // Cache the result
            this.rapCache.set(assetId, rap);
            return rap;
        } catch (error) {
            console.error(`Error fetching RAP for asset ${assetId}:`, error);
            // Cache the error result as 0 to avoid retrying
            this.rapCache.set(assetId, 0);
            return 0;
        }
    }

    async calculateUserRAP(userId) {
        try {
            const inventory = await this.fetchUserInventory(userId);
            
            if (inventory.length === 0) {
                return { totalRAP: 0, valuableItems: [] };
            }

            let totalRAP = 0;
            const valuableItems = [];

            // Process items in smaller batches for better performance and rate limiting
            const batchSize = 3;
            for (let i = 0; i < inventory.length; i += batchSize) {
                const batch = inventory.slice(i, i + batchSize);
                
                // Create promises for RAP fetching
                const rapPromises = batch.map(async (item) => {
                    try {
                        const rap = await this.fetchAssetRAP(item.assetId);
                        return { item, rap };
                    } catch (error) {
                        return { item, rap: 0 };
                    }
                });

                const batchResults = await Promise.all(rapPromises);

                batchResults.forEach(({ item, rap }) => {
                    if (rap > 10000) { // Only count items worth more than 10k
                        totalRAP += rap;
                        valuableItems.push({ ...item, rap });
                    }
                });

                // Very small delay to be respectful to API
                if (i + batchSize < inventory.length) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }

            return { totalRAP, valuableItems };
        } catch (error) {
            console.error(`Error calculating RAP for user ${userId}:`, error);
            return { totalRAP: 0, valuableItems: [] };
        }
    }

    sendProgressUpdate(current, total, message) {
        chrome.runtime.sendMessage({
            type: 'progress',
            data: { current, total, message }
        }).catch(() => {}); // Ignore errors if popup is closed
    }

    sendStatusUpdate(message, statusType = 'info') {
        chrome.runtime.sendMessage({
            type: 'status',
            message,
            statusType
        }).catch(() => {});
    }

    sendSuccess(data) {
        chrome.runtime.sendMessage({
            type: 'success',
            data
        }).catch(() => {});
    }

    sendError(error) {
        chrome.runtime.sendMessage({
            type: 'error',
            error
        }).catch(() => {});
    }
}

class CommunityTracker {
    constructor() {
        this.apiManager = new RobloxAPIManager();
        this.isProcessing = false;
    }

    async fetchAndRankCommunity(communityId) {
        if (this.isProcessing) {
            this.apiManager.sendError('Already processing a community. Please wait.');
            return;
        }

        this.isProcessing = true;

        try {
            this.apiManager.sendStatusUpdate('Validating community...', 'info');

            // First, validate the community exists
            const communityInfo = await this.validateCommunity(communityId);
            if (!communityInfo) {
                throw new Error('Community not found or invalid');
            }

            this.apiManager.sendStatusUpdate('Fetching community members...', 'info');

            // Fetch all community members
            const members = await this.apiManager.fetchCommunityMembers(communityId);
            
            if (members.length === 0) {
                throw new Error('No members found in this community');
            }

            this.apiManager.sendStatusUpdate(`Processing ${members.length} members...`, 'info');

            // Calculate RAP for each member in parallel batches
            const leaderboard = await this.processMembers(members);

            // Sort by total RAP (descending)
            leaderboard.sort((a, b) => b.totalRAP - a.totalRAP);

            // Filter out users with 0 RAP
            const filteredLeaderboard = leaderboard.filter(player => player.totalRAP > 0);

            const stats = {
                totalMembers: members.length,
                totalWithRAP: filteredLeaderboard.length,
                totalRAP: filteredLeaderboard.reduce((sum, player) => sum + player.totalRAP, 0)
            };

            this.apiManager.sendSuccess({
                leaderboard: filteredLeaderboard.slice(0, 100), // Top 100 for performance
                stats
            });

        } catch (error) {
            console.error('Error fetching community data:', error);
            this.apiManager.sendError(error.message || 'Failed to fetch community data');
        } finally {
            this.isProcessing = false;
        }
    }

    async validateCommunity(communityId) {
        try {
            const url = `https://groups.roblox.com/v1/groups/${communityId}`;
            const response = await this.apiManager.makeRequest(url);
            return response && response.id ? response : null;
        } catch (error) {
            console.error('Error validating community:', error);
            return null;
        }
    }

    async processMembers(members) {
        const leaderboard = [];
        const batchSize = 15; // Optimized batch size for better performance
        
        // For very large communities, we can process a subset first to show quick results
        const maxMembersToProcess = Math.min(members.length, 1000); // Limit for performance
        const membersToProcess = members.slice(0, maxMembersToProcess);
        
        if (members.length > maxMembersToProcess) {
            this.apiManager.sendStatusUpdate(`Processing first ${maxMembersToProcess} members for performance...`, 'info');
        }
        
        for (let i = 0; i < membersToProcess.length; i += batchSize) {
            const batch = membersToProcess.slice(i, i + batchSize);
            
            // Process batch in parallel with timeout protection
            const batchPromises = batch.map(async (member) => {
                try {
                    // Add timeout to prevent hanging on slow users
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Timeout')), 30000)
                    );
                    
                    const rapPromise = this.apiManager.calculateUserRAP(member.user.userId);
                    const { totalRAP } = await Promise.race([rapPromise, timeoutPromise]);
                    
                    return {
                        userId: member.user.userId,
                        username: member.user.username,
                        displayName: member.user.displayName,
                        totalRAP,
                        avatar: `https://www.roblox.com/headshot-thumbnail/image?userId=${member.user.userId}&width=32&height=32&format=png`
                    };
                } catch (error) {
                    console.error(`Error processing member ${member.user.username}:`, error);
                    return {
                        userId: member.user.userId,
                        username: member.user.username,
                        displayName: member.user.displayName,
                        totalRAP: 0,
                        avatar: `https://www.roblox.com/headshot-thumbnail/image?userId=${member.user.userId}&width=32&height=32&format=png`
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            leaderboard.push(...batchResults);

            // Update progress
            const processed = Math.min(i + batchSize, membersToProcess.length);
            this.apiManager.sendProgressUpdate(
                processed, 
                membersToProcess.length, 
                `Processed ${processed}/${membersToProcess.length} members...`
            );

            // Smaller delay between batches for faster processing
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return leaderboard;
    }
}

// Global instance
const communityTracker = new CommunityTracker();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'fetchCommunityData') {
        communityTracker.fetchAndRankCommunity(message.communityId);
        sendResponse({ success: true });
    }
    return true; // Keep message channel open for async response
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('Roblox Community RAP Tracker installed');
});