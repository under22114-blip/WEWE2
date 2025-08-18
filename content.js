(function () {
  const REQUEST_TYPE = "GET_ROBUX_BALANCE";
  const CACHE_TTL_MS = 30_000; // refresh every 30s to track live changes

  let cachedRobux = null;
  let cachedAt = 0;
  let debounceTimer = null;

  function isCacheFresh() {
    return cachedRobux !== null && Date.now() - cachedAt < CACHE_TTL_MS;
  }

  function requestRobux() {
    if (isCacheFresh()) {
      return Promise.resolve(cachedRobux);
    }
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: REQUEST_TYPE }, (response) => {
        if (!response || !response.ok) {
          reject(new Error(response && response.error ? response.error : "Failed to fetch Robux"));
          return;
        }
        cachedRobux = response.robux;
        cachedAt = Date.now();
        resolve(cachedRobux);
      });
    });
  }

  function looksLikeAbbreviated(text) {
    if (!text) return false;
    const trimmed = text.trim();
    if (!trimmed) return false;
    // Common formats: 1,234; 1.2K; 1M+; 1.2M; 999K+
    return /[,]|\b[KM]\b|[KM]\+|\d+\.\d+[KM]/i.test(trimmed);
  }

  function replaceIfRobuxNode(node, robux) {
    if (!node) return false;

    // Roblox often has aria-labels and elements like span[title="Robux"] or specific classes.
    // We'll target common header indicators but fall back to any element near a Robux icon.

    // 1) If the node has a data-testid or known class, replace directly.
    const text = node.textContent;
    if (typeof text === "string" && looksLikeAbbreviated(text)) {
      node.textContent = String(robux);
      return true;
    }
    return false;
  }

  function scanAndReplace(root, robux) {
    if (!root) return 0;
    let replaced = 0;

    // Restrict to header/nav areas to avoid touching item prices or other robux numbers.
    const headerRoots = Array.from(
      root.querySelectorAll('header, nav, [class*="navbar" i], [id*="nav" i], [role="navigation"]')
    );
    const scopedRoots = headerRoots.length ? headerRoots : [document];

    const selectorList = [
      'span[title="Robux"]',
      '.nav-robux-balance',
      '.icon-robux + span',
      '.rbx-text-robux',
      '.text-robux',
      '[data-testid*="robux" i]',
      '[class*="robux" i]'
    ].join(',');

    for (const container of scopedRoots) {
      const candidates = container.querySelectorAll(selectorList);
      candidates.forEach((el) => {
        if (replaceIfRobuxNode(el, robux)) replaced += 1;
      });

      // Also try tight siblings of a robux icon element
      const iconCandidates = container.querySelectorAll('[class*="icon-robux" i], [data-testid*="icon" i][data-testid*="robux" i]');
      iconCandidates.forEach((icon) => {
        const next = icon.nextElementSibling;
        if (next && replaceIfRobuxNode(next, robux)) replaced += 1;
      });
    }

    return replaced;
  }

  async function updateAll() {
    try {
      const robux = await requestRobux();
      scanAndReplace(document, robux);
    } catch (e) {
      // Silent fail to avoid console noise for users not logged in
    }
  }

  // Observe DOM changes so dynamically loaded headers/pages are handled.
  const observer = new MutationObserver(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      updateAll();
    }, 250);
  });

  function start() {
    updateAll();
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

