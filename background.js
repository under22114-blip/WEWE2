// REVOLUTIONARY TURBO BACKGROUND SCRIPT
// Optimized for EXTREME SPEED

class TurboScanner {
    constructor() {
        this.cache = new Map();
        this.scanning = false;
        this.maxConcurrent = 500; // INSANE concurrency
        this.activeRequests = 0;
        this.requestQueue = [];
    }

    // Ultra-fast fetch with no delays
    async fetch(url) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ url, resolve, reject });
            this.processQueue();
        });
    }

    processQueue() {
        if (this.activeRequests >= this.maxConcurrent || !this.requestQueue.length) return;
        
        const batch = this.requestQueue.splice(0, 50); // Process 50 at once
        
        batch.forEach(async ({ url, resolve, reject }) => {
            this.activeRequests++;
            try {
                const response = await fetch(url, { 
                    signal: AbortSignal.timeout(2000) // 2s timeout
                });
                const data = await response.json();
                resolve(data);
            } catch (err) {
                resolve(null); // Fail silently for speed
            } finally {
                this.activeRequests--;
                this.processQueue();
            }
        });
    }

    // Get community members (FAST)
    async getMembers(communityId) {
        const members = [];
        let cursor = null;
        let pages = 0;
        
        // Only fetch first 500 members for speed
        while (pages < 5) {
            const url = `https://groups.roblox.com/v1/groups/${communityId}/users?limit=100${cursor ? `&cursor=${cursor}` : ''}`;
            const data = await this.fetch(url);
            
            if (!data?.data?.length) break;
            
            members.push(...data.data);
            cursor = data.nextPageCursor;
            pages++;
            
            if (!cursor || members.length >= 500) break;
        }
        
        return members;
    }

    // Get user RAP (ULTRA FAST)
    async getUserRAP(userId) {
        // Check cache first
        if (this.cache.has(userId)) {
            return this.cache.get(userId);
        }
        
        // Get inventory (only first 10 items for speed)
        const invData = await this.fetch(`https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=10&sortOrder=Desc`);
        
        if (!invData?.data?.length) {
            this.cache.set(userId, 0);
            return 0;
        }
        
        // Get RAP for all items in parallel
        const rapPromises = invData.data.map(item => 
            this.fetch(`https://economy.roblox.com/v1/assets/${item.assetId}/resale-data`)
        );
        
        const rapResults = await Promise.all(rapPromises);
        
        // Calculate total RAP
        let totalRAP = 0;
        rapResults.forEach(rapData => {
            if (rapData?.recentAveragePrice > 10000) {
                totalRAP += rapData.recentAveragePrice;
            }
        });
        
        this.cache.set(userId, totalRAP);
        return totalRAP;
    }

    // Send message to popup
    sendMessage(msg) {
        chrome.runtime.sendMessage(msg).catch(() => {});
    }

    // MAIN SCAN FUNCTION - ULTRA OPTIMIZED
    async scan(communityId) {
        if (this.scanning) {
            this.sendMessage({ type: 'error', message: 'Already scanning' });
            return;
        }
        
        this.scanning = true;
        this.cache.clear(); // Fresh cache for each scan
        
        try {
            // Step 1: Get members (fast)
            this.sendMessage({ type: 'progress', percent: 10, message: 'Getting members' });
            const members = await this.getMembers(communityId);
            
            if (!members.length) {
                throw new Error('No members found');
            }
            
            this.sendMessage({ type: 'progress', percent: 20, message: `Processing ${members.length} members` });
            
            // Step 2: Process ALL members in MEGA-PARALLEL
            const results = [];
            let processed = 0;
            
            // Process in chunks of 100 for progress updates
            const chunkSize = 100;
            const chunks = [];
            for (let i = 0; i < members.length; i += chunkSize) {
                chunks.push(members.slice(i, i + chunkSize));
            }
            
            // Process all chunks simultaneously
            const chunkPromises = chunks.map(async (chunk) => {
                const chunkResults = await Promise.all(
                    chunk.map(async (member) => {
                        const rap = await this.getUserRAP(member.user.userId);
                        processed++;
                        
                        // Progress update
                        if (processed % 50 === 0) {
                            const percent = 20 + Math.round((processed / members.length) * 70);
                            this.sendMessage({ 
                                type: 'progress', 
                                percent, 
                                message: `Processed ${processed}/${members.length}` 
                            });
                        }
                        
                        return {
                            id: member.user.userId,
                            name: member.user.username,
                            rap
                        };
                    })
                );
                return chunkResults;
            });
            
            // Wait for all chunks
            const allResults = await Promise.all(chunkPromises);
            
            // Flatten and filter results
            allResults.forEach(chunk => results.push(...chunk));
            
            // Get wealthy players only
            const wealthy = results
                .filter(p => p.rap > 0)
                .sort((a, b) => b.rap - a.rap)
                .slice(0, 50); // Top 50 for performance
            
            this.sendMessage({ type: 'progress', percent: 100, message: 'Complete!' });
            this.sendMessage({ type: 'results', players: wealthy });
            
        } catch (error) {
            this.sendMessage({ type: 'error', message: error.message || 'Scan failed' });
        } finally {
            this.scanning = false;
        }
    }
}

// Global scanner instance
const scanner = new TurboScanner();

// Message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'scan') {
        scanner.scan(msg.communityId);
        sendResponse({ success: true });
    }
    return true;
});

console.log('🚀 Turbo Roblox Wealth Scanner v3.0 loaded');