/**
 * Roblox Community Wealth Tracker - Background Service Worker
 * Ultra-optimized for lightning-fast processing of massive communities
 */

class TurboAPIClient {
    constructor() {
        this.config = {
            maxConcurrent: 200,        // INSANE concurrency
            requestDelay: 0,           // NO delay
            rateLimitDelay: 100,       // Ultra-fast recovery
            timeout: 3000,             // Even faster timeout
            maxRetries: 1              // Single retry only
        };
        
        this.state = {
            activeRequests: 0,
            requestQueue: [],
            isRateLimited: false
        };
        
        this.cache = {
            rap: new Map(),
            inventory: new Map(),
            community: new Map()
        };
    }

    async request(url, options = {}) {
        return new Promise((resolve, reject) => {
            this.state.requestQueue.push({
                url,
                options,
                resolve,
                reject,
                timestamp: Date.now()
            });
            this.processQueue();
        });
    }

    async processQueue() {
        // Process multiple requests at once for maximum throughput
        const batchSize = Math.min(10, this.config.maxConcurrent - this.state.activeRequests);
        
        if (batchSize <= 0 || this.state.requestQueue.length === 0 || this.state.isRateLimited) {
            return;
        }

        // Process batch of requests
        for (let i = 0; i < batchSize && this.state.requestQueue.length > 0; i++) {
            const request = this.state.requestQueue.shift();
            this.state.activeRequests++;
            this.processRequest(request);
        }
    }

    async processRequest(request) {

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

            const response = await fetch(request.url, {
                ...request.options,
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    ...request.options.headers
                }
            });

            clearTimeout(timeoutId);

            if (response.status === 429) {
                this.handleRateLimit();
                // Retry request
                this.state.requestQueue.unshift(request);
                return;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            request.resolve(data);

        } catch (error) {
            if (error.name === 'AbortError') {
                request.reject(new Error('Request timeout'));
            } else {
                request.reject(error);
            }
        } finally {
            this.state.activeRequests--;
            // Immediate processing - no delay
            this.processQueue();
        }
    }

    handleRateLimit() {
        this.state.isRateLimited = true;
        setTimeout(() => {
            this.state.isRateLimited = false;
            this.processQueue();
        }, this.config.rateLimitDelay);
    }

    async getCommunityMembers(communityId, limit = 2000) {
        const cacheKey = `members_${communityId}_${limit}`;
        if (this.cache.community.has(cacheKey)) {
            return this.cache.community.get(cacheKey);
        }

        const members = [];
        let cursor = null;
        let fetchedPages = 0;
        const maxPages = Math.ceil(limit / 100);

        while (members.length < limit && fetchedPages < maxPages) {
            try {
                let url = `https://groups.roblox.com/v1/groups/${communityId}/users?limit=100&sortOrder=Asc`;
                if (cursor) url += `&cursor=${cursor}`;

                const response = await this.request(url);
                
                if (response.data?.length) {
                    members.push(...response.data);
                    cursor = response.nextPageCursor;
                    fetchedPages++;
                    
                    // Send progress update
                    this.sendMessage({
                        type: 'progress_update',
                        data: {
                            processed: members.length,
                            total: limit,
                            percentage: Math.round((members.length / limit) * 100),
                            message: `Fetched ${members.length} members...`
                        }
                    });
                } else {
                    break;
                }

                if (!cursor) break;
            } catch (error) {
                console.error('Error fetching members:', error);
                break;
            }
        }

        const result = members.slice(0, limit);
        this.cache.community.set(cacheKey, result);
        return result;
    }

    async getUserInventory(userId) {
        if (this.cache.inventory.has(userId)) {
            return this.cache.inventory.get(userId);
        }

        try {
            // Only fetch TOP 20 most valuable items for speed
            const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=20&sortOrder=Desc`;
            const response = await this.request(url);
            const items = response.data || [];
            
            this.cache.inventory.set(userId, items);
            return items;
        } catch (error) {
            this.cache.inventory.set(userId, []);
            return [];
        }
    }

    async getAssetRAP(assetId) {
        if (this.cache.rap.has(assetId)) {
            return this.cache.rap.get(assetId);
        }

        try {
            const url = `https://economy.roblox.com/v1/assets/${assetId}/resale-data`;
            const response = await this.request(url);
            const rap = response.recentAveragePrice || 0;
            
            this.cache.rap.set(assetId, rap);
            return rap;
        } catch (error) {
            this.cache.rap.set(assetId, 0);
            return 0;
        }
    }

    async calculatePlayerWealth(userId) {
        try {
            const inventory = await this.getUserInventory(userId);
            
            // Quick exit for users with no collectibles
            if (!inventory.length) {
                return { totalRAP: 0, valuableItems: [] };
            }

            // Smart filtering: Only check RAP for items that might be valuable
            // Skip obviously worthless items by checking if they're limited/unique
            const potentiallyValuable = inventory.filter(item => 
                item.serialNumber || item.instanceId || item.userAssetId
            );

            if (!potentiallyValuable.length) {
                return { totalRAP: 0, valuableItems: [] };
            }

            // Process only potentially valuable items in parallel
            const rapResults = await Promise.all(
                potentiallyValuable.map(async (item) => {
                    try {
                        const rap = await this.getAssetRAP(item.assetId);
                        return { item, rap };
                    } catch {
                        return { item, rap: 0 };
                    }
                })
            );

            // Filter valuable items and calculate total
            const valuableItems = rapResults.filter(({ rap }) => rap > 10000);
            const totalRAP = valuableItems.reduce((sum, { rap }) => sum + rap, 0);

            return {
                totalRAP,
                valuableItems: valuableItems.map(({ item, rap }) => ({ ...item, rap }))
            };
        } catch (error) {
            return { totalRAP: 0, valuableItems: [] };
        }
    }

    sendMessage(message) {
        chrome.runtime.sendMessage(message).catch(() => {
            // Ignore errors if popup is closed
        });
    }
}

class CommunityScanner {
    constructor() {
        this.api = new TurboAPIClient();
        this.isScanning = false;
        this.scanResults = [];
    }

    async scanCommunity(communityId) {
        if (this.isScanning) {
            this.api.sendMessage({
                type: 'scan_error',
                error: 'Scan already in progress'
            });
            return;
        }

        this.isScanning = true;
        this.scanResults = [];

        try {
            // Notify scan started
            this.api.sendMessage({ type: 'scan_started' });

            // Validate community
            await this.validateCommunity(communityId);

            // Fetch members with intelligent limits
            const members = await this.fetchMembers(communityId);
            
            if (!members.length) {
                throw new Error('No members found in community');
            }

            // Process members with turbo speed
            const results = await this.processMembers(members);

            // Send final results
            this.api.sendMessage({
                type: 'scan_complete',
                data: results
            });

        } catch (error) {
            console.error('Scan error:', error);
            this.api.sendMessage({
                type: 'scan_error',
                error: error.message || 'Scan failed'
            });
        } finally {
            this.isScanning = false;
        }
    }

    async validateCommunity(communityId) {
        this.api.sendMessage({
            type: 'status_update',
            message: 'Validating community...',
            level: 'info'
        });

        try {
            const response = await this.api.request(`https://groups.roblox.com/v1/groups/${communityId}`);
            if (!response.id) {
                throw new Error('Community not found');
            }
            return response;
        } catch (error) {
            throw new Error('Invalid or private community');
        }
    }

    async fetchMembers(communityId) {
        this.api.sendMessage({
            type: 'status_update',
            message: 'Fetching community members...',
            level: 'info'
        });

        // TURBO MODE: Reduced limit for lightning speed
        const limit = 1000; // Ultra-fast processing
        return await this.api.getCommunityMembers(communityId, limit);
    }

    async processMembers(members) {
        this.api.sendMessage({
            type: 'status_update',
            message: `Turbo processing ${members.length} members...`,
            level: 'info'
        });

        const results = [];
        let processed = 0;
        const liveResults = [];

        // MEGA-PARALLEL: Process in super-fast chunks of 50
        const chunkSize = 50;
        const chunks = [];
        
        for (let i = 0; i < members.length; i += chunkSize) {
            chunks.push(members.slice(i, i + chunkSize));
        }

                 // Process chunks with staggered start (no delay between chunks)
         const chunkPromises = chunks.map(async (chunk, chunkIndex) => {
             // Process entire chunk in parallel
             const chunkResults = await Promise.all(chunk.map(async (member) => {
                 try {
                     // Quick pre-filter: Skip users with obvious non-premium indicators
                     if (member.user.username && member.user.username.match(/^(guest|player|user)\d+$/i)) {
                         processed++;
                         return {
                             userId: member.user.userId,
                             username: member.user.username,
                             totalRAP: 0,
                             valuableItems: []
                         };
                     }

                     const wealth = await this.api.calculatePlayerWealth(member.user.userId);
                    
                    const playerData = {
                        userId: member.user.userId,
                        username: member.user.username,
                        totalRAP: wealth.totalRAP,
                        valuableItems: wealth.valuableItems
                    };

                    processed++;

                    // Add wealthy players to live results immediately
                    if (playerData.totalRAP > 0) {
                        liveResults.push(playerData);
                        
                        // Send live updates every 10 wealthy players found
                        if (liveResults.length % 10 === 0) {
                            const sortedLive = liveResults
                                .sort((a, b) => b.totalRAP - a.totalRAP)
                                .slice(0, 50);

                            this.api.sendMessage({
                                type: 'partial_results',
                                data: {
                                    leaderboard: sortedLive,
                                    stats: {
                                        totalMembers: members.length,
                                        withRAP: liveResults.length,
                                        totalRAP: liveResults.reduce((sum, p) => sum + p.totalRAP, 0)
                                    },
                                    isLive: true
                                }
                            });
                        }
                    }

                    // Progress updates every 20 processed
                    if (processed % 20 === 0) {
                        this.api.sendMessage({
                            type: 'progress_update',
                            data: {
                                processed,
                                total: members.length,
                                percentage: Math.round((processed / members.length) * 100),
                                message: `⚡ ${processed}/${members.length} processed (${liveResults.length} wealthy)`
                            }
                        });
                    }

                    return playerData;
                } catch (error) {
                    processed++;
                    return {
                        userId: member.user.userId,
                        username: member.user.username,
                        totalRAP: 0,
                        valuableItems: []
                    };
                }
            }));
            
            return chunkResults;
        });

        // Wait for all chunks to complete
        const allChunkResults = await Promise.all(chunkPromises);
        
        // Flatten results
        allChunkResults.forEach(chunkResult => {
            results.push(...chunkResult);
        });

        // Final sort and filter
        const wealthyMembers = results
            .filter(player => player.totalRAP > 0)
            .sort((a, b) => b.totalRAP - a.totalRAP)
            .slice(0, 100);

        return {
            leaderboard: wealthyMembers,
            stats: this.calculateStats(results, members.length)
        };
    }

    calculateStats(results, totalMembers) {
        const withRAP = results.filter(p => p.totalRAP > 0);
        const totalRAP = withRAP.reduce((sum, p) => sum + p.totalRAP, 0);

        return {
            totalMembers,
            withRAP: withRAP.length,
            totalRAP
        };
    }
}

// Global scanner instance
const scanner = new CommunityScanner();

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'scanCommunity') {
        scanner.scanCommunity(message.communityId);
        sendResponse({ success: true });
    }
    return true;
});

// Extension lifecycle
chrome.runtime.onInstalled.addListener(() => {
    console.log('Roblox Community Wealth Tracker v2.0 installed');
});