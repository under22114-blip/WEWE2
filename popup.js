// Ultra-fast popup script
const $ = id => document.getElementById(id);
const url = $('url');
const scan = $('scan');
const status = $('status');
const progress = $('progress');
const results = $('results');

let scanning = false;

// Extract community ID
const extractId = (link) => {
    const match = link.match(/\/communities\/(\d+)/);
    return match ? match[1] : null;
};

// Update status
const setStatus = (msg, type = '') => {
    status.textContent = msg;
    status.className = type ? `status-${type}` : '';
};

// Update progress
const setProgress = (pct) => {
    if (pct > 0) {
        progress.classList.remove('hidden');
        progress.innerHTML = `<div class="progress-bar" style="width:${pct}%"></div>`;
    } else {
        progress.classList.add('hidden');
    }
};

// Format currency
const formatRAP = (val) => {
    if (val >= 1e6) return (val/1e6).toFixed(1) + 'M';
    if (val >= 1e3) return (val/1e3).toFixed(1) + 'K';
    return val.toLocaleString();
};

// Display results
const showResults = (players) => {
    results.innerHTML = '';
    players.forEach((p, i) => {
        const rank = i + 1;
        const div = document.createElement('div');
        div.className = `player ${rank === 1 ? 'top1' : rank <= 3 ? 'top3' : ''}`;
        div.innerHTML = `
            <div class="rank">#${rank}</div>
            <img class="avatar" src="https://www.roblox.com/headshot-thumbnail/image?userId=${p.id}&width=24&height=24&format=png" loading="lazy">
            <div class="name">@${p.name}</div>
            <div class="rap">R$ ${formatRAP(p.rap)}</div>
        `;
        results.appendChild(div);
    });
};

// Scan button click
scan.onclick = async () => {
    if (scanning) return;
    
    const link = url.value.trim();
    const communityId = extractId(link);
    
    if (!communityId) {
        setStatus('Invalid community link', 'error');
        return;
    }
    
    scanning = true;
    scan.disabled = true;
    scan.textContent = 'SCANNING...';
    results.innerHTML = '';
    setStatus('Starting scan...', 'info');
    setProgress(0);
    
    try {
        await chrome.runtime.sendMessage({
            action: 'scan',
            communityId
        });
    } catch (err) {
        setStatus('Scan failed', 'error');
        resetScan();
    }
};

// Reset scan state
const resetScan = () => {
    scanning = false;
    scan.disabled = false;
    scan.textContent = 'SCAN';
    setProgress(0);
};

// Handle messages from background
chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.type) {
        case 'progress':
            setProgress(msg.percent);
            setStatus(`${msg.message} (${msg.percent}%)`, 'info');
            break;
        case 'results':
            showResults(msg.players);
            setStatus(`Found ${msg.players.length} wealthy players`, 'success');
            resetScan();
            break;
        case 'error':
            setStatus(msg.message, 'error');
            resetScan();
            break;
    }
});

// Auto-focus input
url.focus();