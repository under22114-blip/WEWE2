class RobloxAPIManager {
    constructor() {
        this.baseDelay = 25; // Ultra-fast delay between requests (ms)
        this.maxConcurrentRequests = 50; // Maximum parallel requests for speed
        this.requestQueue = [];
        this.activeRequests = 0;
        this.rateLimitDelay = 500; // Reduced rate limit delay
        this.rapCache = new Map(); // Cache RAP values to avoid duplicate requests
        this.inventoryCache = new Map(); // Cache inventory data
        this.userCache = new Map(); // Cache user data
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

    async fetchCommunityMembers(communityId, maxMembers = 5000) {
        const members = [];
        let cursor = null;
        let hasNextPage = true;
        let pageCount = 0;

        // For very large communities, we'll use intelligent sampling
        const maxPages = Math.ceil(maxMembers / 100); // Calculate max pages needed

        while (hasNextPage && pageCount < maxPages && members.length < maxMembers) {
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
                this.sendProgressUpdate(members.length, maxMembers, `Fetched ${members.length} members...`);

                // For large communities, fetch multiple pages in parallel
                if (hasNextPage && members.length < maxMembers && pageCount < maxPages) {
                    const parallelFetches = Math.min(3, maxPages - pageCount);
                    const parallelPromises = [];

                    for (let i = 0; i < parallelFetches && hasNextPage; i++) {
                        if (cursor) {
                            const parallelUrl = `https://groups.roblox.com/v1/groups/${communityId}/users?sortOrder=Asc&limit=100&cursor=${cursor}`;
                            parallelPromises.push(this.makeRequest(parallelUrl));
                        }
                    }

                    if (parallelPromises.length > 0) {
                        const parallelResults = await Promise.allSettled(parallelPromises);
                        parallelResults.forEach(result => {
                            if (result.status === 'fulfilled' && result.value.data) {
                                members.push(...result.value.data);
                                if (result.value.nextPageCursor) {
                                    cursor = result.value.nextPageCursor;
                                }
                            }
                        });
                        pageCount += parallelPromises.length;
                    }
                }

            } catch (error) {
                console.error('Error fetching community members:', error);
                break;
            }
        }

        return members.slice(0, maxMembers); // Ensure we don't exceed the limit
    }

    async fetchUserInventory(userId) {
        // Check cache first
        if (this.inventoryCache.has(userId)) {
            return this.inventoryCache.get(userId);
        }

        try {
            // For speed, only fetch the first page of collectibles
            // Most valuable items are typically in the first page anyway
            const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Desc&limit=100`;
            const response = await this.makeRequest(url);
            const items = response.data || [];
            
            // Cache the result
            this.inventoryCache.set(userId, items);
            return items;
        } catch (error) {
            console.error(`Error fetching inventory for user ${userId}:`, error);
            // Cache empty result to avoid retrying
            this.inventoryCache.set(userId, []);
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

            // Process ALL items in parallel for maximum speed
            const rapPromises = inventory.map(async (item) => {
                try {
                    const rap = await this.fetchAssetRAP(item.assetId);
                    return { item, rap };
                } catch (error) {
                    return { item, rap: 0 };
                }
            });

            // Wait for all RAP calculations to complete
            const allResults = await Promise.all(rapPromises);

            // Filter and sum up valuable items
            allResults.forEach(({ item, rap }) => {
                if (rap > 10000) { // Only count items worth more than 10k
                    totalRAP += rap;
                    valuableItems.push({ ...item, rap });
                }
            });

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

    sendPartialResults(data) {
        chrome.runtime.sendMessage({
            type: 'partial_results',
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

            // Fetch community members with intelligent limits
            let maxMembers = 3000; // Default limit for speed
            
            // For smaller communities, fetch more members
            const communityInfo = await this.validateCommunity(communityId);
            if (communityInfo && communityInfo.memberCount && communityInfo.memberCount < 10000) {
                maxMembers = Math.min(communityInfo.memberCount, 5000);
            }
            
            const members = await this.apiManager.fetchCommunityMembers(communityId, maxMembers);
            
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
        
        // Ultra-fast processing: Smart sampling and parallel execution
        let membersToProcess;
        if (members.length > 2000) {
            // For massive communities, intelligently sample members
            // Take first 500, then every 10th member up to 1500 total
            const firstBatch = members.slice(0, 500);
            const sampledBatch = members.slice(500).filter((_, index) => index % 10 === 0).slice(0, 1000);
            membersToProcess = [...firstBatch, ...sampledBatch];
            this.apiManager.sendStatusUpdate(`Smart sampling: Processing ${membersToProcess.length} members from ${members.length} total...`, 'info');
        } else {
            membersToProcess = members;
        }

        // Process members in ultra-fast parallel chunks
        const chunkSize = 100;
        const chunks = [];
        
        for (let i = 0; i < membersToProcess.length; i += chunkSize) {
            chunks.push(membersToProcess.slice(i, i + chunkSize));
        }

                 // Process chunks with staggered starts and real-time updates
         let processedCount = 0;
         const chunkPromises = chunks.map(async (chunk, chunkIndex) => {
             // Stagger chunk starts to avoid overwhelming the API
             await new Promise(resolve => setTimeout(resolve, chunkIndex * 100));
             
             const chunkResults = await Promise.all(chunk.map(async (member) => {
                 try {
                     const timeoutPromise = new Promise((_, reject) => 
                         setTimeout(() => reject(new Error('Timeout')), 8000)
                     );
                     
                     const rapPromise = this.apiManager.calculateUserRAP(member.user.userId);
                     const { totalRAP } = await Promise.race([rapPromise, timeoutPromise]);
                     
                     processedCount++;
                     
                     const result = {
                         userId: member.user.userId,
                         username: member.user.username,
                         displayName: member.user.displayName,
                         totalRAP,
                         avatar: `https://www.roblox.com/headshot-thumbnail/image?userId=${member.user.userId}&width=32&height=32&format=png`
                     };

                     // Add to leaderboard immediately if they have valuable items
                     if (totalRAP > 0) {
                         leaderboard.push(result);
                         
                         // Send partial results every 10 valuable players found
                         if (leaderboard.filter(p => p.totalRAP > 0).length % 10 === 0) {
                             const sortedPartial = leaderboard
                                 .filter(p => p.totalRAP > 0)
                                 .sort((a, b) => b.totalRAP - a.totalRAP)
                                 .slice(0, 50);
                             
                             this.apiManager.sendPartialResults({
                                 leaderboard: sortedPartial,
                                 isPartial: true,
                                 processed: processedCount,
                                 total: membersToProcess.length
                             });
                         }
                     }
                     
                     // Update progress more frequently
                     if (processedCount % 20 === 0) {
                         this.apiManager.sendProgressUpdate(
                             processedCount, 
                             membersToProcess.length, 
                             `Processed ${processedCount}/${membersToProcess.length} members...`
                         );
                     }
                     
                     return result;
                 } catch (error) {
                     processedCount++;
                     return {
                         userId: member.user.userId,
                         username: member.user.username,
                         displayName: member.user.displayName,
                         totalRAP: 0,
                         avatar: `https://www.roblox.com/headshot-thumbnail/image?userId=${member.user.userId}&width=32&height=32&format=png`
                     };
                 }
             }));
             
             return chunkResults;
         });

        // Wait for all chunks to complete
        const allChunkResults = await Promise.all(chunkPromises);
        
        // Flatten results
        allChunkResults.forEach(chunkResult => {
            leaderboard.push(...chunkResult);
        });

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