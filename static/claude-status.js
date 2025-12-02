/**
 * Claude Status Module
 *
 * 管理 Claude Code 运行状态的显示和更新
 */

// Claude 状态
const claudeState = {
    status: 'stopped',  // stopped, starting, running, error
    pid: null,
    cwd: null,          // 项目工作目录
    windowTitle: null,  // 窗口标题
    matchType: null,    // "project" = 匹配项目, "global" = 全局检测
    startedAt: null,
    errorMessage: null
};

// 状态标签映射
const CLAUDE_STATUS_LABELS = {
    'stopped': '未启动',
    'starting': '启动中',
    'running': '运行中',
    'running_global': '运行中 (其他项目)',
    'error': '错误'
};

/**
 * 获取 Claude 状态标签
 * @param {string} status - 状态值
 * @returns {string} 中文标签
 */
function getClaudeStatusLabel(status) {
    return CLAUDE_STATUS_LABELS[status] || '未知';
}

/**
 * 渲染 Claude 状态指示器
 * @returns {string} HTML 字符串
 */
function renderClaudeStatusIndicator() {
    let status = claudeState.status;
    let displayStatus = status;

    // 如果运行中但是全局匹配（非当前项目），显示不同状态
    if (status === 'running' && claudeState.matchType === 'global') {
        displayStatus = 'running_global';
    }

    const label = getClaudeStatusLabel(displayStatus);
    const statusClass = status === 'running' && claudeState.matchType === 'global' ? 'running global' : status;

    return `
        <div class="claude-status-indicator ${statusClass}"
             onclick="toggleClaudeStatusTooltip(event)"
             title="Claude Code 状态">
            <span class="claude-status-dot"></span>
            <span class="claude-status-text">Claude: ${label}</span>
        </div>
    `;
}

/**
 * 获取 Claude 状态
 */
async function fetchClaudeStatus() {
    try {
        const response = await fetch('/api/claude/status');
        const result = await response.json();

        if (result.success && result.data) {
            updateClaudeState(result.data);
        }
    } catch (e) {
        console.error('[Claude Status] 获取状态失败:', e);
    }
}

/**
 * 更新 Claude 状态
 * @param {object} data - 状态数据
 */
function updateClaudeState(data) {
    claudeState.status = data.status || 'stopped';
    claudeState.pid = data.pid || null;
    claudeState.cwd = data.cwd || null;
    claudeState.windowTitle = data.window_title || null;
    claudeState.matchType = data.match_type || null;
    claudeState.startedAt = data.started_at || null;
    claudeState.errorMessage = data.error_message || null;

    // 更新 UI
    refreshClaudeStatusUI();
}

/**
 * 刷新 Claude 状态 UI
 */
function refreshClaudeStatusUI() {
    const container = document.getElementById('claude-status-container');
    if (container) {
        container.innerHTML = renderClaudeStatusIndicator();
    }
}

/**
 * 处理 SSE claude_status 事件
 * @param {object} data - 状态数据
 */
function handleClaudeStatusEvent(data) {
    console.log('[Claude Status] SSE 事件:', data);

    // 更新状态
    if (data.status) {
        claudeState.status = data.status;
    }
    if (data.pid !== undefined) {
        claudeState.pid = data.pid;
    }
    if (data.message) {
        claudeState.errorMessage = data.message;
    }

    // 刷新 UI
    refreshClaudeStatusUI();
}

/**
 * 切换状态提示框显示
 * @param {Event} event - 点击事件
 */
function toggleClaudeStatusTooltip(event) {
    event.stopPropagation();

    // 移除已有的提示框
    const existing = document.querySelector('.claude-status-tooltip');
    if (existing) {
        existing.remove();
        return;
    }

    // 创建提示框
    const indicator = event.currentTarget;
    const tooltip = document.createElement('div');
    tooltip.className = 'claude-status-tooltip';

    // 格式化启动时间
    let startedAtText = '-';
    if (claudeState.startedAt) {
        const date = new Date(claudeState.startedAt);
        startedAtText = date.toLocaleTimeString('zh-CN');
    }

    // 获取项目名称
    const projectName = claudeState.cwd ? claudeState.cwd.split(/[/\\]/).pop() : '-';

    // 匹配类型说明
    let matchTypeText = '-';
    if (claudeState.matchType === 'project') {
        matchTypeText = '✓ 当前项目';
    } else if (claudeState.matchType === 'global') {
        matchTypeText = '⚠ 其他项目';
    }

    tooltip.innerHTML = `
        <div class="claude-status-tooltip-row">
            <span class="claude-status-tooltip-label">状态</span>
            <span class="claude-status-tooltip-value">${getClaudeStatusLabel(claudeState.status)}</span>
        </div>
        <div class="claude-status-tooltip-row">
            <span class="claude-status-tooltip-label">当前项目</span>
            <span class="claude-status-tooltip-value">${projectName}</span>
        </div>
        ${claudeState.status === 'running' ? `
        <div class="claude-status-tooltip-row">
            <span class="claude-status-tooltip-label">匹配</span>
            <span class="claude-status-tooltip-value" style="color: ${claudeState.matchType === 'project' ? 'var(--status-running)' : 'var(--accent-orange)'};">${matchTypeText}</span>
        </div>
        ` : ''}
        ${claudeState.windowTitle ? `
        <div class="claude-status-tooltip-row">
            <span class="claude-status-tooltip-label">窗口</span>
            <span class="claude-status-tooltip-value">${claudeState.windowTitle}</span>
        </div>
        ` : ''}
        <div class="claude-status-tooltip-row">
            <span class="claude-status-tooltip-label">PID</span>
            <span class="claude-status-tooltip-value">${claudeState.pid || '-'}</span>
        </div>
        ${claudeState.startedAt ? `
        <div class="claude-status-tooltip-row">
            <span class="claude-status-tooltip-label">启动时间</span>
            <span class="claude-status-tooltip-value">${startedAtText}</span>
        </div>
        ` : ''}
        ${claudeState.errorMessage ? `
        <div class="claude-status-tooltip-row">
            <span class="claude-status-tooltip-label">错误</span>
            <span class="claude-status-tooltip-value" style="color: var(--status-error);">${claudeState.errorMessage}</span>
        </div>
        ` : ''}
    `;

    indicator.style.position = 'relative';
    indicator.appendChild(tooltip);

    // 点击其他地方关闭提示框
    const closeTooltip = (e) => {
        if (!indicator.contains(e.target)) {
            tooltip.remove();
            document.removeEventListener('click', closeTooltip);
        }
    };
    setTimeout(() => {
        document.addEventListener('click', closeTooltip);
    }, 0);
}

/**
 * 初始化 Claude 状态模块
 */
function initClaudeStatus() {
    // 获取初始状态
    fetchClaudeStatus();

    // 定期轮询状态（作为 SSE 的备份）
    setInterval(fetchClaudeStatus, 30000);
}

// 暴露到全局
window.handleClaudeStatusEvent = handleClaudeStatusEvent;
window.toggleClaudeStatusTooltip = toggleClaudeStatusTooltip;
window.renderClaudeStatusIndicator = renderClaudeStatusIndicator;
window.initClaudeStatus = initClaudeStatus;
window.refreshClaudeStatusUI = refreshClaudeStatusUI;
