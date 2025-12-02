/**
 * BMAD GUI - Router
 * 路由管理
 */

/**
 * Route definitions mapping hash to render functions
 */
const routes = {
    '#/': renderLanding,
    '#/command': renderCommand,
    '#/claude': renderClaude,
    '#/sprint': renderSprint,
    '#/config': renderConfig,
    '#/setup': renderSetup
};

/**
 * Handle route changes - parse hash and call appropriate render function
 */
function handleRoute() {
    let hash = location.hash || '#/';

    // Default redirect: empty hash or just '#' → '#/'
    if (hash === '' || hash === '#') {
        location.hash = '#/';
        return; // hashchange will fire again
    }

    // 如果离开需要实时更新的页面（指挥部、Sprint），断开 SSE 连接
    if (hash !== '#/command' && hash !== '#/sprint') {
        disconnectSSE();
    }

    const renderFn = routes[hash];
    if (renderFn) {
        renderFn();
        renderTabs(); // Update tab active state
        log('Route changed:', hash);
    } else {
        // Unknown route - redirect to landing
        log('Unknown route:', hash, '→ redirecting to #/');
        location.hash = '#/';
    }
}

/**
 * Render navigation tabs and update active state
 */
function renderTabs() {
    const tabContainer = document.getElementById('tab-container');
    const currentHash = location.hash || '#/';

    const tabs = [
        { hash: '#/command', label: '指挥部' },
        { hash: '#/claude', label: 'Claude' },
        { hash: '#/sprint', label: 'Sprint 看板' },
        { hash: '#/config', label: '配置中心' }
    ];

    tabContainer.innerHTML = tabs.map(tab => {
        const isActive = currentHash === tab.hash ? 'active' : '';
        return `<div class="nav-tab ${isActive}" data-route="${tab.hash}">${tab.label}</div>`;
    }).join('');

    // Add click handlers to tabs
    tabContainer.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', handleTabClick);
    });
}

// Listen for hash changes
window.addEventListener('hashchange', handleRoute);
