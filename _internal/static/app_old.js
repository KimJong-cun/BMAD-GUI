/**
 * BMAD GUI - Frontend Application
 *
 * Vanilla JS application with hash-based routing and state management.
 *
 * Structure:
 * 1. Constants & Config
 * 2. State Management
 * 3. API Functions
 * 4. SSE Functions
 * 5. Utility Functions
 * 6. Component Renderers
 * 7. Event Handlers
 * 8. Router
 * 9. Initialization
 */

// =============================================================================
// 1. Constants & Config
// =============================================================================
const DEBUG = location.hostname === 'localhost';
const API_BASE_URL = '/api';

// =============================================================================
// 2. State Management
// =============================================================================
const state = {
    currentProject: null,
    workflowStatus: null,
    sprintStatus: null,
    config: null,
    recentProjects: [],
    sseConnection: null,
    // Agent 相关状态
    agents: [],
    currentAgent: null,
    isExecutingCommand: false,
    setupWizard: {
        step: 1,
        path: '',
        config: {
            user_name: '',
            communication_language: 'Chinese',
            output_folder: 'md/'
        },
        modules: ['bmm', 'core'],
        isCreating: false
    }
};

// =============================================================================
// 3. API Functions
// =============================================================================

/**
 * Generic API request wrapper
 * @param {string} path - API path (e.g., '/project/open')
 * @param {object} options - Fetch options
 * @returns {Promise<object|null>} Response data or null on error
 */
async function api(path, options = {}) {
    try {
        const res = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        const data = await res.json();
        if (data.error) {
            showToast(data.message || '请求失败', 'error');
            return null;
        }
        return data;
    } catch (e) {
        log('API error:', e);
        showToast('网络连接失败', 'error');
        return null;
    }
}

/**
 * Open a BMAD project
 * @param {string} path - Project directory path
 * @returns {Promise<object|null>} Project data or null on error
 */
async function openProject(path) {
    return await api('/project/open', {
        method: 'POST',
        body: JSON.stringify({ path })
    });
}

/**
 * Get recent projects list
 * @returns {Promise<object|null>} Recent projects data or null on error
 */
async function getRecentProjects() {
    return await api('/recent-projects');
}

/**
 * Remove a project from recent projects list (persistent)
 * @param {string} path - Project path to remove
 * @returns {Promise<boolean>} True if successful
 */
async function removeRecentProject(path) {
    const result = await api('/recent-projects', {
        method: 'DELETE',
        body: JSON.stringify({ path })
    });
    return result !== null;
}

/**
 * Create a new BMAD project
 * @param {string} path - Project directory path
 * @param {object} config - Project configuration
 * @param {string[]} modules - Modules to install
 * @returns {Promise<object|null>} Project data or null on error
 */
async function createProject(path, config, modules) {
    return await api('/project/create', {
        method: 'POST',
        body: JSON.stringify({ path, config, modules })
    });
}

/**
 * Fetch workflow status from backend
 * @returns {Promise<object|null>} Workflow status data or null on error
 */
async function fetchWorkflowStatus() {
    const result = await api('/workflow-status');
    if (result && result.data) {
        state.workflowStatus = result.data;
        return result.data;
    }
    return null;
}

/**
 * Fetch all agents list
 * @returns {Promise<Array|null>} Agents list or null on error
 */
async function fetchAgents() {
    const result = await api('/agents');
    if (result && result.data) {
        state.agents = result.data;
        return result.data;
    }
    return null;
}

/**
 * Fetch agent detail with commands
 * @param {string} agentName - Agent name
 * @returns {Promise<object|null>} Agent detail or null on error
 */
async function fetchAgentDetail(agentName) {
    const result = await api(`/agents/${agentName}`);
    if (result && result.data) {
        return result.data;
    }
    return null;
}

// =============================================================================
// 4. SSE Functions
// =============================================================================

/**
 * SSE 重连配置
 */
const SSE_RECONNECT_DELAY = 3000; // 重连延迟（毫秒）
const SSE_MAX_RECONNECT_ATTEMPTS = 10; // 最大重连次数
let sseReconnectAttempts = 0;
let sseReconnectTimeout = null;

/**
 * 连接 SSE 事件流
 * 建立与后端的 SSE 连接，接收实时更新
 */
function connectSSE() {
    // 如果已有连接，先断开
    disconnectSSE();

    log('正在连接 SSE...');

    try {
        state.sseConnection = new EventSource(`${API_BASE_URL}/events`);

        // 连接打开
        state.sseConnection.onopen = () => {
            log('SSE 连接已建立');
            sseReconnectAttempts = 0; // 重置重连计数
        };

        // 监听连接确认事件
        state.sseConnection.addEventListener('connected', (event) => {
            log('SSE 连接确认:', JSON.parse(event.data));
        });

        // 监听工作流更新事件
        state.sseConnection.addEventListener('workflow_update', (event) => {
            const data = JSON.parse(event.data);
            log('收到工作流更新:', data);
            handleWorkflowUpdate(data);
        });

        // 监听 Sprint 更新事件
        state.sseConnection.addEventListener('sprint_update', (event) => {
            const data = JSON.parse(event.data);
            log('收到 Sprint 更新:', data);
            handleSprintUpdate(data);
        });

        // 监听心跳事件
        state.sseConnection.addEventListener('heartbeat', (event) => {
            log('收到心跳:', JSON.parse(event.data));
        });

        // 监听 Claude 状态事件
        state.sseConnection.addEventListener('claude_status', (event) => {
            const data = JSON.parse(event.data);
            log('收到 Claude 状态更新:', data);
            if (typeof handleClaudeStatusEvent === 'function') {
                handleClaudeStatusEvent(data);
            }
        });

        // 错误处理和自动重连
        state.sseConnection.onerror = (error) => {
            log('SSE 连接错误:', error);

            // 检查连接状态
            if (state.sseConnection.readyState === EventSource.CLOSED) {
                log('SSE 连接已关闭，尝试重连...');
                scheduleReconnect();
            }
        };

    } catch (e) {
        log('SSE 连接失败:', e);
        scheduleReconnect();
    }
}

/**
 * 断开 SSE 连接
 */
function disconnectSSE() {
    if (sseReconnectTimeout) {
        clearTimeout(sseReconnectTimeout);
        sseReconnectTimeout = null;
    }

    if (state.sseConnection) {
        state.sseConnection.close();
        state.sseConnection = null;
        log('SSE 连接已断开');
    }
}

/**
 * 安排 SSE 重连
 */
function scheduleReconnect() {
    if (sseReconnectAttempts >= SSE_MAX_RECONNECT_ATTEMPTS) {
        log('SSE 重连次数已达上限，停止重连');
        showToast('实时更新连接失败，请刷新页面', 'warning');
        return;
    }

    sseReconnectAttempts++;
    const delay = SSE_RECONNECT_DELAY * Math.min(sseReconnectAttempts, 3); // 逐步增加延迟

    log(`将在 ${delay}ms 后重连 (第 ${sseReconnectAttempts} 次)`);

    sseReconnectTimeout = setTimeout(() => {
        // 在指挥部或 Sprint 页面才重连
        if (location.hash === '#/command' || location.hash === '#/sprint') {
            connectSSE();
        }
    }, delay);
}

/**
 * 处理工作流更新
 * @param {object} data - 工作流状态数据
 */
function handleWorkflowUpdate(data) {
    // 更新状态
    state.workflowStatus = data;

    // 检查当前是否在指挥部页面
    if (location.hash !== '#/command') {
        return;
    }

    // 记录当前展开的阶段
    const currentExpandedPhaseId = expandedPhaseId;

    // 重新渲染工作流面板
    const workflowPanelContainer = document.querySelector('.workflow-panel');
    if (workflowPanelContainer) {
        // 获取所有节点，添加脉冲动画
        const oldNodes = document.querySelectorAll('.workflow-node');
        const oldStatuses = Array.from(oldNodes).map(node => ({
            id: node.dataset.phaseId,
            status: node.className
        }));

        // 重新渲染
        workflowPanelContainer.outerHTML = renderWorkflowPanel();

        // 绑定事件
        bindTooltipEvents();
        bindNodeClickEvents();

        // 比较并添加脉冲动画
        const newNodes = document.querySelectorAll('.workflow-node');
        newNodes.forEach((node, index) => {
            const oldStatus = oldStatuses[index];
            if (oldStatus && oldStatus.status !== node.className) {
                // 状态发生变化，添加脉冲动画
                node.classList.add('pulse');
                setTimeout(() => {
                    node.classList.remove('pulse');
                }, 1000);
            }
        });
    }

    // 如果详情面板是打开的，更新面板内容
    if (currentExpandedPhaseId !== null) {
        const phase = data.phases?.find(p => p.id == currentExpandedPhaseId);
        if (phase) {
            // 重新展开同一个阶段
            showPhaseDetail(phase);
        }
    }

    // 刷新状态栏和任务卡片（推荐状态可能变化）
    const statusBar = document.querySelector('.status-bar');
    if (statusBar) {
        statusBar.outerHTML = renderStatusBar();
    }

    const taskCardsContainer = document.querySelector('.task-cards-container');
    if (taskCardsContainer) {
        taskCardsContainer.outerHTML = renderTaskCards();
    }

    // 刷新下一步建议
    const nextStepSuggestion = document.querySelector('.next-step-suggestion');
    if (nextStepSuggestion) {
        nextStepSuggestion.outerHTML = renderNextStepSuggestion();
    }

    log('界面已更新');
}

/**
 * 处理 Sprint 更新
 * @param {object} data - Sprint 状态数据
 */
function handleSprintUpdate(data) {
    // 存储 Sprint 数据到状态
    state.sprintStatus = data;

    // 检查当前是否在 Sprint 看板页面
    if (location.hash !== '#/sprint') {
        return;
    }

    // 重新渲染 Sprint 页面
    renderSprint();

    // 显示更新提示
    showToast('Sprint 状态已更新', 'info');
    log('Sprint 界面已更新');
}

// =============================================================================
// 5. Utility Functions
// =============================================================================
function log(...args) {
    if (DEBUG) console.log('[BMAD-GUI]', ...args);
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Format date string to relative time (Chinese)
 * @param {string} dateString - ISO date string
 * @returns {string} Relative time string
 */
function formatRelativeTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return '刚刚';
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN');
}

// =============================================================================
// 6. Component Renderers
// =============================================================================

/**
 * Show a toast notification
 * @param {string} message - Toast message
 * @param {string} type - Toast type: 'success' | 'warning' | 'error' | 'info'
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);

    log('Toast:', type, message);
}

/**
 * 在新窗口中启动 Claude Code
 * @param {string} projectPath - 项目路径
 * @param {boolean} dangerousMode - 是否使用危险模式（跳过权限检查）
 */
async function launchClaudeCode(projectPath, dangerousMode = false) {
    const modeLabel = dangerousMode ? '危险模式' : '标准模式';
    try {
        showToast(`正在启动 Claude Code (${modeLabel})...`, 'info');

        const response = await fetch('/api/claude/launch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: projectPath, dangerousMode })
        });

        const result = await response.json();
        if (result.success) {
            showToast(`Claude Code (${modeLabel}) 已在新窗口中启动`, 'success');
        } else {
            showToast(result.error?.message || '启动失败', 'error');
        }
    } catch (error) {
        log('Launch Claude Code error:', error);
        showToast('启动 Claude Code 失败', 'error');
    }
}

// 暴露给全局
window.launchClaudeCode = launchClaudeCode;

/**
 * Render recent projects list
 * @param {Array} projects - Array of project objects
 */
function renderRecentProjects(projects) {
    const container = document.getElementById('recent-projects-list');
    if (!container) return;

    if (!projects || projects.length === 0) {
        container.innerHTML = `
            <div class="recent-projects-empty">
                <div class="recent-projects-empty-icon">📁</div>
                <div class="recent-projects-empty-text">还没有项目，创建一个吧！</div>
            </div>
        `;
        return;
    }

    container.innerHTML = projects.map(project => `
        <div class="recent-project-item" data-path="${escapeHtml(project.path)}">
            <span class="recent-project-icon">📁</span>
            <div class="recent-project-info">
                <div class="recent-project-name">${escapeHtml(project.name)}</div>
                <div class="recent-project-path">${escapeHtml(project.path)}</div>
            </div>
            <div class="recent-project-actions">
                <button class="btn-launch-claude" data-path="${escapeHtml(project.path)}" title="启动 Claude Code">
                    <span class="launch-icon">▶</span>
                </button>
                <span class="recent-project-time">${formatRelativeTime(project.lastOpened)}</span>
            </div>
        </div>
    `).join('');

    // Bind click handlers for project items (open project)
    container.querySelectorAll('.recent-project-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // 不要在点击启动按钮时触发打开项目
            if (e.target.closest('.btn-launch-claude')) return;
            handleRecentClick(item.dataset.path);
        });
    });

    // Bind click handlers for launch buttons
    container.querySelectorAll('.btn-launch-claude').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            launchClaudeCode(btn.dataset.path);
        });
    });
}

/**
 * Render landing page (project selection)
 */
function renderLanding() {
    const content = document.getElementById('app-content');
    content.innerHTML = `
        <div class="landing-page">
            <h1 class="landing-title">BMAD GUI</h1>

            <div class="action-cards">
                <div class="action-card" id="create-project-card">
                    <span class="action-card-icon">➕</span>
                    <span class="action-card-label">创建新项目</span>
                </div>
                <div class="action-card" id="import-project-card">
                    <span class="action-card-icon">📂</span>
                    <span class="action-card-label">导入项目</span>
                </div>
            </div>

            <div class="recent-projects">
                <h3 class="recent-projects-title">最近项目</h3>
                <div class="recent-projects-list" id="recent-projects-list">
                    <!-- Populated by loadRecentProjects() -->
                </div>
            </div>
        </div>
    `;

    // Bind event handlers
    document.getElementById('create-project-card').addEventListener('click', handleCreateClick);
    document.getElementById('import-project-card').addEventListener('click', handleImportClick);

    // Load recent projects
    loadRecentProjects();

    log('Rendered: Landing page');
}

/**
 * Get CSS class name for workflow status
 * @param {string} status - Status value (completed, in_progress, pending, blocked)
 * @returns {string} CSS class name
 */
function getStatusClass(status) {
    const statusMap = {
        'completed': 'completed',
        'in_progress': 'in-progress',
        'pending': 'pending',
        'blocked': 'blocked',
        'optional': 'optional',
        'recommended': 'recommended',
        'conditional': 'conditional',
        'skipped': 'skipped'
    };
    return statusMap[status] || 'pending';
}

/**
 * Get status icon for workflow status
 * @param {string} status - Status value
 * @returns {string} Status icon character
 */
function getStatusIcon(status) {
    const iconMap = {
        'completed': '✓',
        'in_progress': '●',
        'pending': '○',
        'blocked': '⚠',
        'optional': '◇',
        'recommended': '◆',
        'conditional': '◈',
        'skipped': '–'
    };
    return iconMap[status] || '○';
}

/**
 * Render a single workflow node
 * @param {object} phase - Phase data object
 * @returns {string} HTML string for the node
 */
function renderWorkflowNode(phase) {
    const statusClass = getStatusClass(phase.status);
    const statusIcon = getStatusIcon(phase.status);
    const completedCount = phase.completedCount || 0;

    // 只在 completedCount > 0 时显示数量标记
    const countBadge = completedCount > 0
        ? `<span class="node-count">${completedCount}</span>`
        : '';

    return `
        <div class="workflow-node ${statusClass}" data-phase-id="${phase.id}">
            <span class="node-icon">${statusIcon}</span>
            <span class="node-name">${escapeHtml(phase.name)}</span>
            ${countBadge}
        </div>
    `;
}

// Tooltip state
let tooltipTimeout = null;

/**
 * Get status label in Chinese
 * @param {string} status - Status value
 * @returns {string} Chinese label
 */
function getStatusLabel(status) {
    const labelMap = {
        'completed': '已完成',
        'in_progress': '进行中',
        'pending': '待办',
        'blocked': '有问题',
        'optional': '可选',
        'recommended': '推荐',
        'conditional': '条件',
        'skipped': '已跳过'
    };
    return labelMap[status] || '待办';
}

/**
 * Show tooltip for a workflow node
 * @param {HTMLElement} nodeElement - The node element
 * @param {object} phase - Phase data
 */
function showTooltip(nodeElement, phase) {
    // Remove existing tooltip
    hideTooltip();

    // Find in-progress workflow
    const inProgressWorkflow = phase.workflows?.find(w => w.status === 'in_progress');
    const inProgressText = inProgressWorkflow
        ? `<div class="tooltip-row">进行中: ${escapeHtml(inProgressWorkflow.name)}</div>`
        : '';

    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'workflow-tooltip';
    tooltip.innerHTML = `
        <div class="tooltip-title">${escapeHtml(phase.name)}</div>
        <div class="tooltip-row">状态: ${getStatusLabel(phase.status)}</div>
        <div class="tooltip-row">完成: ${phase.completedCount || 0} / ${phase.totalCount || 0}</div>
        ${inProgressText}
    `;

    // Position tooltip below node, centered
    const rect = nodeElement.getBoundingClientRect();
    const panelRect = nodeElement.closest('.workflow-panel').getBoundingClientRect();

    tooltip.style.left = `${rect.left - panelRect.left + rect.width / 2}px`;
    tooltip.style.top = `${rect.bottom - panelRect.top + 8}px`;

    nodeElement.closest('.workflow-panel').appendChild(tooltip);
}

/**
 * Hide the tooltip
 */
function hideTooltip() {
    const existing = document.querySelector('.workflow-tooltip');
    if (existing) existing.remove();
}

/**
 * Bind tooltip events to workflow nodes
 */
function bindTooltipEvents() {
    const nodes = document.querySelectorAll('.workflow-node');
    const phases = state.workflowStatus?.phases || [];

    nodes.forEach((node, index) => {
        const phase = phases[index];
        if (!phase) return;

        node.addEventListener('mouseenter', () => {
            tooltipTimeout = setTimeout(() => {
                showTooltip(node, phase);
            }, 200);
        });

        node.addEventListener('mouseleave', () => {
            if (tooltipTimeout) {
                clearTimeout(tooltipTimeout);
                tooltipTimeout = null;
            }
            hideTooltip();
        });
    });
}

// Track currently expanded phase
let expandedPhaseId = null;

/**
 * Render phase detail panel
 * @param {object} phase - Phase data
 * @returns {string} HTML string for detail panel
 */
function renderPhaseDetail(phase) {
    let contentHtml = '';

    // Init 阶段且未初始化时，显示特殊提示
    if (phase.id === -1 && phase.status === 'pending') {
        contentHtml = `
            <div class="workflow-item pending">
                <span class="workflow-icon">○</span>
                <span class="workflow-name">开始新项目</span>
                <span class="workflow-status-text">待办</span>
            </div>
            <div class="workflow-init-hint">
                <p>📋 通过 BMAD 的 <code>workflow-init</code> 命令初始化项目工作流状态</p>
                <p class="hint-detail">在 Claude Code 中运行该命令，系统会引导你选择项目类型和工作流路径</p>
            </div>
        `;
    } else {
        contentHtml = phase.workflows?.map(wf => {
            const icon = getStatusIcon(wf.status);
            const statusClass = getStatusClass(wf.status);
            const outputText = wf.outputPath
                ? `<span class="workflow-output">${escapeHtml(wf.outputPath)}</span>`
                : `<span class="workflow-status-text">${getStatusLabel(wf.status)}</span>`;

            return `
                <div class="workflow-item ${statusClass}">
                    <span class="workflow-icon">${icon}</span>
                    <span class="workflow-name">${escapeHtml(getCommandLabel(wf.name))}</span>
                    ${outputText}
                </div>
            `;
        }).join('') || '<div class="workflow-item">无工作流</div>';
    }

    return `
        <div class="phase-detail" data-phase-id="${phase.id}">
            <div class="phase-detail-header">
                <span class="phase-detail-title">${escapeHtml(phase.name)}</span>
                <button class="phase-detail-close" onclick="closePhaseDetail()">▲</button>
            </div>
            <div class="phase-detail-content">
                ${contentHtml}
            </div>
        </div>
    `;
}

/**
 * Show phase detail panel
 * @param {object} phase - Phase data
 */
function showPhaseDetail(phase) {
    // Close existing panel first
    closePhaseDetail();

    // Create and append detail panel
    const panel = document.querySelector('.workflow-panel');
    const detailHtml = renderPhaseDetail(phase);
    panel.insertAdjacentHTML('afterend', detailHtml);

    // Mark as expanded
    expandedPhaseId = phase.id;

    // Add active class to node
    document.querySelectorAll('.workflow-node').forEach(node => {
        node.classList.toggle('active', node.dataset.phaseId == phase.id);
    });
}

/**
 * Close phase detail panel
 */
function closePhaseDetail() {
    const existing = document.querySelector('.phase-detail');
    if (existing) existing.remove();
    expandedPhaseId = null;

    // Remove active class from all nodes
    document.querySelectorAll('.workflow-node').forEach(node => {
        node.classList.remove('active');
    });
}

/**
 * Bind click events to workflow nodes for detail panel
 */
function bindNodeClickEvents() {
    const nodes = document.querySelectorAll('.workflow-node');

    // 构建与 renderWorkflowPanel 相同的 phases 数组（包含 Init）
    const data = state.workflowStatus;
    const trackMode = data?.trackMode || 'standard';
    const hasWorkflowData = data && data.phases && data.phases.length > 0;

    const initPhase = {
        id: -1,
        name: 'Init',
        status: hasWorkflowData ? 'completed' : 'pending',
        workflows: [{
            id: 'workflow-init',
            name: 'workflow-init',
            status: hasWorkflowData ? 'completed' : 'pending',
            agent: 'sm'
        }]
    };

    const defaultPhasesStandard = [
        { id: 0, name: 'Discovery', workflows: [] },
        { id: 1, name: 'Planning', workflows: [] },
        { id: 2, name: 'Solutioning', workflows: [] },
        { id: 3, name: 'Implementation', workflows: [] }
    ];

    const defaultPhasesQuick = [
        { id: 0, name: 'Discovery', workflows: [] },
        { id: 1, name: 'Planning', workflows: [] },
        { id: 2, name: 'Implementation', workflows: [] }
    ];

    const defaultPhases = trackMode === 'quick' ? defaultPhasesQuick : defaultPhasesStandard;

    const phases = hasWorkflowData
        ? [initPhase, ...data.phases]
        : [initPhase, ...defaultPhases];

    nodes.forEach((node, index) => {
        const phase = phases[index];
        if (!phase) return;

        node.addEventListener('click', () => {
            // If clicking same node, toggle close
            if (expandedPhaseId === phase.id) {
                closePhaseDetail();
            } else {
                showPhaseDetail(phase);
            }
        });
    });
}

/**
 * Render workflow panel with all phase nodes
 * @returns {string} HTML string for the workflow panel
 */
function renderWorkflowPanel() {
    const data = state.workflowStatus;
    const trackMode = data?.trackMode || 'standard';
    const hasWorkflowData = data && data.phases && data.phases.length > 0;

    // Init 阶段（当没有工作流数据时显示）
    const initPhase = {
        id: -1,
        name: 'Init',
        status: hasWorkflowData ? 'completed' : 'pending',
        workflows: [{
            id: 'workflow-init',
            name: 'workflow-init',
            status: hasWorkflowData ? 'completed' : 'pending',
            agent: 'sm'
        }]
    };

    // 根据模式显示不同的默认阶段
    const defaultPhasesStandard = [
        { id: 0, name: 'Discovery' },
        { id: 1, name: 'Planning' },
        { id: 2, name: 'Solutioning' },
        { id: 3, name: 'Implementation' }
    ];

    const defaultPhasesQuick = [
        { id: 0, name: 'Discovery' },
        { id: 1, name: 'Planning' },
        { id: 2, name: 'Implementation' }
    ];

    const defaultPhases = trackMode === 'quick' ? defaultPhasesQuick : defaultPhasesStandard;

    // 在所有阶段前加上 Init 阶段
    const phases = hasWorkflowData
        ? [initPhase, ...data.phases]
        : [initPhase, ...defaultPhases];

    // 构建节点和连接线
    const nodesHtml = phases.map((phase, index) => {
        const nodeHtml = renderWorkflowNode(phase);
        // 最后一个节点后不加连接线
        const connectorHtml = index < phases.length - 1
            ? '<div class="workflow-connector"></div>'
            : '';
        return nodeHtml + connectorHtml;
    }).join('');

    return `
        <div class="workflow-panel">
            ${nodesHtml}
        </div>
    `;
}

// =============================================================================
// Task Cards (任务卡片)
// =============================================================================

/**
 * 获取推荐的下一个任务
 * 基于工作流状态，找到第一个 required 且未完成的工作流
 * @returns {string|null} 推荐的工作流 ID 或 null
 */
function getRecommendedTask() {
    if (!state.workflowStatus || !state.workflowStatus.phases) {
        return null;
    }

    // 遍历所有阶段
    for (const phase of state.workflowStatus.phases) {
        if (!phase.workflows) continue;

        // 找到第一个 pending 状态的工作流
        for (const wf of phase.workflows) {
            if (wf.status === 'pending') {
                return wf.id || wf.name;
            }
        }
    }

    return null;
}

/**
 * 渲染状态栏
 * @returns {string} HTML 字符串
 */
function renderStatusBar() {
    const agent = state.currentAgent;
    const agentIcon = agent?.icon || '🤖';
    const agentName = agent?.name || 'sm';

    // 获取当前阶段
    let currentPhase = '准备中';
    if (state.workflowStatus?.phases) {
        const inProgress = state.workflowStatus.phases.find(p => p.status === 'in_progress');
        const pending = state.workflowStatus.phases.find(p => p.status === 'pending');
        currentPhase = inProgress?.name || pending?.name || '全部完成';
    }

    // 获取当前模式
    const trackMode = state.workflowStatus?.trackMode || 'standard';
    const modeLabel = trackMode === 'quick' ? '快速模式' : '标准模式';
    const modeClass = trackMode === 'quick' ? 'mode-quick' : 'mode-standard';

    // Claude 状态指示器
    const claudeStatusHtml = typeof renderClaudeStatusIndicator === 'function'
        ? `<span id="claude-status-container">${renderClaudeStatusIndicator()}</span>`
        : '<span id="claude-status-container"></span>';

    return `
        <div class="status-bar">
            <div class="status-bar-left">
                <span>当前阶段：${escapeHtml(currentPhase)}</span>
                <span class="status-bar-mode ${modeClass}">${modeLabel}</span>
                ${claudeStatusHtml}
            </div>
            <div class="status-bar-right">
                <div class="status-bar-agent" onclick="showAgentSelector()">
                    <span class="status-bar-agent-icon">${agentIcon}</span>
                    <span>Agent:</span>
                    <span class="status-bar-agent-name">${escapeHtml(agentName)}</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Agent 中文名称映射
 */
const AGENT_CN_NAMES = {
    'analyst': '业务分析师',
    'architect': '架构师',
    'dev': '开发工程师',
    'pm': '产品经理',
    'sm': '敏捷教练',
    'ux-designer': 'UX 设计师',
    'tech-writer': '技术文档',
    'tea': '测试架构师'
};

/**
 * Agent 中文描述映射
 */
const AGENT_CN_DESC = {
    'analyst': '需求梳理与业务建模',
    'architect': '系统设计与技术选型',
    'dev': '编码实现与单元测试',
    'pm': '产品规划与需求管理',
    'sm': '迭代管理与故事拆分',
    'ux-designer': '交互设计与原型绘制',
    'tech-writer': '文档编写与知识沉淀',
    'tea': '测试策略与质量保障'
};

/**
 * 获取 Agent 中文名称
 * @param {Object} agent - Agent 对象
 * @returns {string} 中文名称
 */
function getAgentCnName(agent) {
    return AGENT_CN_NAMES[agent.name] || agent.title || agent.name;
}

/**
 * 获取 Agent 中文描述
 * @param {Object} agent - Agent 对象
 * @returns {string} 中文描述
 */
function getAgentCnDesc(agent) {
    return AGENT_CN_DESC[agent.name] || agent.description || '';
}

/**
 * 命令名称的中文映射
 */
const COMMAND_LABELS_ZH = {
    // SM (敏捷教练) 命令
    'workflow-status': '查看进度',
    'workflow-init': '开始新项目',
    'sprint-planning': '迭代规划',
    'create-epic-tech-context': 'Epic 技术方案',
    'validate-epic-tech-context': '校验技术方案',
    'create-story': '编写故事',
    'validate-create-story': '校验故事',
    'create-story-context': '生成故事上下文',
    'validate-create-story-context': '校验故事上下文',
    'story-ready-for-dev': '就绪交付',
    'epic-retrospective': 'Epic 复盘',
    'correct-course': '方向调整',
    'party-mode': '团队协作',

    // PM (产品经理) 命令
    'brainstorm-project': '头脑风暴',
    'research': '调研分析',
    'product-brief': '产品概要',
    'prd': '需求文档',
    'create-prd': '编写需求文档',
    'validate-prd': '校验需求文档',
    'tech-spec': '技术规格',
    'validate-tech-spec': '校验技术规格',

    // Architect (架构师) 命令
    'architecture': '架构设计',
    'create-architecture': '编写架构',
    'validate-architecture': '校验架构',
    'implementation-readiness': '交付评审',
    'create-epics-and-stories': '拆分 Epic',

    // Dev (开发工程师) 命令
    'dev-story': '开发故事',
    'develop-story': '开发故事',
    'code-review': '代码评审',
    'story-done': '标记完成',

    // UX Designer 命令
    'create-ux-design': '体验设计',
    'validate-design': '校验设计',
    'create-excalidraw-wireframe': '绘制原型',
    'create-excalidraw-diagram': '绘制架构图',
    'create-excalidraw-flowchart': '绘制流程图',
    'create-excalidraw-dataflow': '绘制数据流',

    // TEA (测试架构师) 命令
    'framework': '搭建框架',
    'atdd': 'E2E 测试',
    'automate': '自动化测试',
    'test-design': '测试设计',
    'trace': '需求追溯',
    'nfr-assess': '非功能验收',
    'ci': 'CI/CD 配置',
    'test-review': '测试评审',

    // Analyst (业务分析师) 命令
    'document-project': '项目文档化',

    // Tech Writer (技术文档) 命令
    'create-api-docs': 'API 文档',
    'create-architecture-docs': '架构文档',
    'create-user-guide': '用户指南',
    'audit-docs': '文档审计',
    'generate-mermaid': '生成流程图',
    'validate-doc': '校验文档',
    'improve-readme': '优化 README',
    'explain-concept': '概念讲解',
    'standards-guide': '文档规范',

    // 通用命令
    'help': '帮助',
    'exit': '退出'
};

/**
 * 获取命令的中文标签
 * @param {string} commandName - 命令名称
 * @param {string} fallbackLabel - 回退标签
 * @returns {string} 中文标签
 */
function getCommandLabel(commandName, fallbackLabel) {
    return COMMAND_LABELS_ZH[commandName] || fallbackLabel || commandName;
}

/**
 * 截短命令名称用于显示
 * @param {string} name - 命令名称
 * @param {number} maxLen - 最大长度
 * @returns {string} 截短后的名称
 */
function truncateCommand(name, maxLen = 18) {
    if (name.length <= maxLen) return name;
    return name.substring(0, maxLen - 2) + '..';
}

/**
 * 渲染单个任务卡片
 * @param {object} command - 命令对象
 * @param {boolean} isRecommended - 是否是推荐任务
 * @returns {string} HTML 字符串
 */
function renderTaskCard(command, isRecommended) {
    const recommendedClass = isRecommended ? 'recommended' : '';
    const disabledClass = state.isExecutingCommand ? 'disabled' : '';
    const recommendedTag = isRecommended ? '<span class="task-card-tag">推荐</span>' : '';
    // 优先使用中文标签
    const displayLabel = getCommandLabel(command.name, command.label);
    const displayCommand = truncateCommand(command.name);

    return `
        <div class="task-card ${recommendedClass} ${disabledClass}"
             data-command="${escapeHtml(command.name)}"
             onclick="handleTaskCardClick('${escapeHtml(command.name)}')"
             title="${escapeHtml(command.label || command.name)}">
            <span class="task-card-icon">${command.icon || '📋'}</span>
            <span class="task-card-label">${escapeHtml(displayLabel)}</span>
            <span class="task-card-command">${escapeHtml(displayCommand)}</span>
            ${recommendedTag}
        </div>
    `;
}

/**
 * 渲染任务卡片区域
 * @returns {string} HTML 字符串
 */
function renderTaskCards() {
    const agent = state.currentAgent;

    if (!agent || !agent.commands || agent.commands.length === 0) {
        // 显示默认卡片
        const defaultCommands = [
            { name: 'brainstorm-project', label: '头脑风暴', icon: '🧠' },
            { name: 'research', label: '研究分析', icon: '🔍' },
            { name: 'product-brief', label: '产品简报', icon: '📋' },
            { name: 'prd', label: 'PRD 文档', icon: '📄' },
            { name: 'architecture', label: '架构设计', icon: '🏗️' },
            { name: 'create-epics-and-stories', label: 'Epic 分解', icon: '📚' }
        ];

        const recommended = getRecommendedTask();
        const cardsHtml = defaultCommands.map(cmd =>
            renderTaskCard(cmd, cmd.name === recommended)
        ).join('');

        return `
            <div class="task-cards-container">
                <div class="task-cards-header">
                    <span class="task-cards-title">可用任务</span>
                </div>
                <div class="task-cards-grid">
                    ${cardsHtml}
                </div>
            </div>
        `;
    }

    const recommended = getRecommendedTask();
    const cardsHtml = agent.commands.map(cmd =>
        renderTaskCard(cmd, cmd.name === recommended)
    ).join('');

    return `
        <div class="task-cards-container">
            <div class="task-cards-header">
                <span class="task-cards-title">${escapeHtml(getAgentCnName(agent))} 的可用任务</span>
            </div>
            <div class="task-cards-grid">
                ${cardsHtml}
            </div>
        </div>
    `;
}

/**
 * 获取下一个待办任务及其代理信息
 * @returns {object|null} { workflow, agent, phase } 或 null
 */
function getNextPendingTask() {
    if (!state.workflowStatus || !state.workflowStatus.phases) {
        return null;
    }

    // 遍历所有阶段，找到第一个 pending 状态的必须工作流
    for (const phase of state.workflowStatus.phases) {
        if (!phase.workflows) continue;

        for (const wf of phase.workflows) {
            // 跳过可选/推荐/条件性工作流
            if (wf.status === 'pending') {
                return {
                    workflow: wf,
                    phase: phase
                };
            }
        }
    }

    return null;
}

/**
 * 渲染下一步建议区域
 * @returns {string} HTML 字符串
 */
function renderNextStepSuggestion() {
    const nextTask = getNextPendingTask();

    // 如果没有待办任务
    if (!nextTask) {
        // 检查是否已完成所有任务
        const hasWorkflowData = state.workflowStatus && state.workflowStatus.phases && state.workflowStatus.phases.length > 0;
        if (!hasWorkflowData) {
            // 未初始化
            return `
                <div class="next-step-suggestion">
                    <div class="next-step-icon">🚀</div>
                    <div class="next-step-content">
                        <div class="next-step-title">开始你的项目</div>
                        <div class="next-step-desc">
                            运行 <code>workflow-init</code> 命令初始化项目工作流，
                            找 <span class="agent-highlight">敏捷教练 (SM)</span> 开始吧！
                        </div>
                    </div>
                </div>
            `;
        }
        // 已完成所有任务
        return `
            <div class="next-step-suggestion completed">
                <div class="next-step-icon">🎉</div>
                <div class="next-step-content">
                    <div class="next-step-title">太棒了！</div>
                    <div class="next-step-desc">
                        当前阶段的所有必要任务都已完成。
                    </div>
                </div>
            </div>
        `;
    }

    // 有待办任务
    const { workflow, phase } = nextTask;
    const agentName = workflow.agent || 'sm';
    const agentCnName = AGENT_CN_NAMES[agentName] || agentName;
    const commandLabel = getCommandLabel(workflow.name || workflow.command, workflow.name);

    // 获取代理图标
    const agentIcons = {
        'analyst': '📊',
        'architect': '🏗️',
        'dev': '💻',
        'pm': '📋',
        'sm': '🎯',
        'ux-designer': '🎨',
        'tech-writer': '📝',
        'tea': '🧪'
    };
    const agentIcon = agentIcons[agentName] || '🤖';

    return `
        <div class="next-step-suggestion">
            <div class="next-step-icon">${agentIcon}</div>
            <div class="next-step-content">
                <div class="next-step-title">下一步建议</div>
                <div class="next-step-desc">
                    当前在 <span class="phase-highlight">${escapeHtml(phase.name)}</span> 阶段，
                    下一个任务是 <span class="task-highlight">${escapeHtml(commandLabel)}</span>，
                    请找 <span class="agent-highlight">${agentIcon} ${escapeHtml(agentCnName)}</span>
                </div>
            </div>
            <button class="next-step-action" onclick="switchToAgent('${agentName}')">
                切换到 ${escapeHtml(agentCnName)}
            </button>
        </div>
    `;
}

/**
 * 切换到指定代理并刷新任务卡片
 * @param {string} agentName - 代理名称
 */
async function switchToAgent(agentName) {
    await selectAgent(agentName);
}

/**
 * 处理任务卡片点击
 * @param {string} commandName - 命令名称
 */
async function handleTaskCardClick(commandName) {
    if (state.isExecutingCommand) {
        return;
    }

    log('任务卡片点击:', commandName);

    // 获取所有卡片和被点击的卡片
    const cards = document.querySelectorAll('.task-card');
    const clickedCard = document.querySelector(`.task-card[data-command="${commandName}"]`);

    if (!clickedCard) {
        log('未找到被点击的卡片');
        return;
    }

    // 1. 设置执行状态
    state.isExecutingCommand = true;

    // 2. 设置被点击卡片为 loading 状态
    clickedCard.classList.add('loading');

    // 3. 禁用所有其他卡片
    cards.forEach(card => {
        if (card !== clickedCard) {
            card.classList.add('disabled');
        }
    });

    // 构建完整命令 (带 * 前缀)
    const fullCommand = `*${commandName}`;

    try {
        // 调用 /api/command 发送命令
        const res = await api('/command', {
            method: 'POST',
            body: JSON.stringify({
                command: fullCommand
            })
        });

        if (res && res.success) {
            showToast('命令已发送', 'success');
        } else if (res && res.error) {
            showToast(res.message || '命令发送失败', 'error');
        }
    } catch (e) {
        showToast('命令执行失败，请重试', 'error');
        log('命令执行失败:', e);
    } finally {
        // 恢复所有卡片状态
        clickedCard.classList.remove('loading');
        cards.forEach(card => card.classList.remove('disabled'));
        state.isExecutingCommand = false;
    }
}

/**
 * 显示 Agent 选择器弹窗
 * AC3: 点击后显示 Agent 选择器，列出所有可用 Agent
 * AC4: 选择器显示每个 Agent 的图标、名称、描述
 * AC5: 当前 Agent 有选中标记（✓）
 */
async function showAgentSelector() {
    // 防止重复打开
    if (document.getElementById('agent-selector-overlay')) {
        return;
    }

    // 获取 Agent 列表
    const res = await api('/agents');
    if (!res || !res.success) {
        showToast('获取 Agent 列表失败', 'error');
        return;
    }

    const agents = res.data;
    const currentAgentName = state.currentAgent?.name;

    // 创建选择器 HTML (AC4: 显示图标、名称、描述; AC5: 当前 Agent 选中标记)
    // 粗体字显示中文名称，细体字显示英文描述
    const selectorHtml = `
        <div class="agent-selector-overlay" id="agent-selector-overlay">
            <div class="agent-selector">
                <div class="agent-selector-header">
                    <span>选择 Agent</span>
                    <button class="agent-selector-close" id="agent-selector-close">×</button>
                </div>
                <div class="agent-selector-list">
                    ${agents.map(agent => `
                        <div class="agent-selector-item ${agent.name === currentAgentName ? 'selected' : ''}"
                             data-agent="${escapeHtml(agent.name)}">
                            <span class="agent-selector-icon">${agent.icon || '🤖'}</span>
                            <div class="agent-selector-info">
                                <span class="agent-selector-name">${escapeHtml(getAgentCnName(agent))}</span>
                                <span class="agent-selector-desc">${escapeHtml(getAgentCnDesc(agent))}</span>
                            </div>
                            ${agent.name === currentAgentName ? '<span class="agent-selector-check">✓</span>' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    // 插入到 DOM
    document.body.insertAdjacentHTML('beforeend', selectorHtml);

    // 绑定事件
    bindAgentSelectorEvents();

    log('Agent 选择器已打开');
}

/**
 * 关闭 Agent 选择器
 * AC3: 选择器关闭逻辑
 */
function closeAgentSelector() {
    const overlay = document.getElementById('agent-selector-overlay');
    if (overlay) {
        overlay.remove();
        // 移除全局事件监听
        document.removeEventListener('keydown', handleAgentSelectorKeydown);
        log('Agent 选择器已关闭');
    }
}

/**
 * 处理 Agent 选择器键盘事件
 * @param {KeyboardEvent} e - 键盘事件
 */
function handleAgentSelectorKeydown(e) {
    if (e.key === 'Escape') {
        closeAgentSelector();
    }
}

/**
 * 绑定 Agent 选择器事件
 * - 点击 Agent 项切换
 * - 点击关闭按钮关闭
 * - 点击遮罩层关闭
 * - 按 Esc 键关闭
 */
function bindAgentSelectorEvents() {
    const overlay = document.getElementById('agent-selector-overlay');
    const closeBtn = document.getElementById('agent-selector-close');
    const items = document.querySelectorAll('.agent-selector-item');

    // 点击遮罩层关闭
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeAgentSelector();
            }
        });
    }

    // 点击关闭按钮
    if (closeBtn) {
        closeBtn.addEventListener('click', closeAgentSelector);
    }

    // 点击 Agent 项
    items.forEach(item => {
        item.addEventListener('click', () => {
            const agentName = item.dataset.agent;
            if (agentName) {
                selectAgent(agentName);
            }
        });
    });

    // 按 Esc 键关闭
    document.addEventListener('keydown', handleAgentSelectorKeydown);
}

/**
 * 切换 Agent
 * AC6: 选择新 Agent 后，任务卡片区刷新为新 Agent 的命令
 * @param {string} agentName - Agent 名称
 */
async function selectAgent(agentName) {
    // 如果选择的是当前 Agent，直接关闭
    if (agentName === state.currentAgent?.name) {
        closeAgentSelector();
        return;
    }

    // 获取 Agent 详情（包含命令列表）
    const res = await api(`/agents/${agentName}`);
    if (!res || !res.success) {
        showToast('获取 Agent 详情失败', 'error');
        return;
    }

    // 更新状态
    state.currentAgent = res.data;

    // 关闭选择器
    closeAgentSelector();

    // AC6: 刷新任务卡片区域
    const taskCardsContainer = document.querySelector('.task-cards-container');
    if (taskCardsContainer) {
        taskCardsContainer.outerHTML = renderTaskCards();
    }

    // 更新状态栏显示
    const statusBar = document.querySelector('.status-bar');
    if (statusBar) {
        statusBar.outerHTML = renderStatusBar();
    }

    showToast(`已切换到 ${getAgentCnName(res.data)}`, 'success');
    log('Agent 已切换:', agentName);
}


/**
 * 加载 Agent 数据
 */
async function loadAgentData() {
    // 加载 Agent 列表
    await fetchAgents();

    // 默认选择 sm (Scrum Master) 作为当前 Agent
    if (state.agents.length > 0) {
        const defaultAgent = state.agents.find(a => a.name === 'sm') || state.agents[0];
        const agentDetail = await fetchAgentDetail(defaultAgent.name);
        if (agentDetail) {
            state.currentAgent = agentDetail;
        }
    }
}

/**
 * Render command center page
 */
async function renderCommand() {
    const content = document.getElementById('app-content');

    // 先渲染加载状态
    content.innerHTML = `
        <div class="workflow-panel">
            <div class="workflow-loading">加载中...</div>
        </div>
        <div class="page-placeholder">
            <h2>指挥部</h2>
            <p>加载任务数据中...</p>
        </div>
    `;

    // 并行加载工作流数据和 Agent 数据
    await Promise.all([
        fetchWorkflowStatus(),
        loadAgentData()
    ]);

    // 重新渲染完整页面
    content.innerHTML = `
        ${renderStatusBar()}
        ${renderWorkflowPanel()}
        ${renderTaskCards()}
        ${renderNextStepSuggestion()}
    `;

    // Bind events after DOM is ready
    bindTooltipEvents();
    bindNodeClickEvents();

    // 初始化 Claude 状态
    if (typeof initClaudeStatus === 'function') {
        initClaudeStatus();
    }

    // 连接 SSE 以接收实时更新
    connectSSE();

    log('Rendered: Command center');
}

/**
 * Render Claude Code launcher page
 */
function renderClaude() {
    const content = document.getElementById('app-content');

    // 获取当前项目路径
    const currentPath = state.currentProject?.path || state.recentProjects?.[0]?.path || '';
    const projectName = state.currentProject?.name || state.recentProjects?.[0]?.name || '未选择项目';

    content.innerHTML = `
        <div class="claude-page">
            <div class="claude-header">
                <h2>Claude Code 启动器</h2>
                <p class="claude-subtitle">在当前项目目录下启动 Claude Code 终端</p>
            </div>

            <div class="claude-project-info">
                <span class="claude-project-label">当前项目：</span>
                <span class="claude-project-name">${escapeHtml(projectName)}</span>
                <span class="claude-project-path">${escapeHtml(currentPath)}</span>
            </div>

            <div class="claude-launch-cards">
                <div class="claude-launch-card claude-launch-standard" id="launch-standard">
                    <div class="claude-launch-icon">▶</div>
                    <div class="claude-launch-content">
                        <h3>标准模式</h3>
                        <p>正常启动 Claude Code，需要确认每个操作</p>
                        <code>claude</code>
                    </div>
                </div>

                <div class="claude-launch-card claude-launch-dangerous" id="launch-dangerous">
                    <div class="claude-launch-icon">⚡</div>
                    <div class="claude-launch-content">
                        <h3>危险模式</h3>
                        <p>跳过权限检查，自动执行所有操作</p>
                        <code>claude --dangerously-skip-permissions</code>
                    </div>
                    <div class="claude-launch-warning">
                        ⚠️ 谨慎使用：此模式会自动执行所有文件操作
                    </div>
                </div>
            </div>
        </div>
    `;

    // Bind click handlers
    document.getElementById('launch-standard')?.addEventListener('click', () => {
        if (!currentPath) {
            showToast('请先选择一个项目', 'warning');
            return;
        }
        launchClaudeCode(currentPath, false);
    });

    document.getElementById('launch-dangerous')?.addEventListener('click', () => {
        if (!currentPath) {
            showToast('请先选择一个项目', 'warning');
            return;
        }
        launchClaudeCode(currentPath, true);
    });

    log('Rendered: Claude launcher');
}

/**
 * Render configuration center page
 */
function renderConfig() {
    const content = document.getElementById('app-content');
    content.innerHTML = `
        <div class="page-placeholder">
            <h2>配置中心</h2>
            <p>BMAD 模块配置和管理</p>
            <p style="margin-top: 16px; font-size: 12px; color: #6E6E6E;">
                （配置中心功能将在后续 Story 中实现）
            </p>
        </div>
    `;
    log('Rendered: Config center');
}

// =============================================================================
// Sprint 看板
// =============================================================================

/**
 * 获取状态的中文标签
 * @param {string} status - 状态值
 * @returns {string} 中文标签
 */
function getSprintStatusLabel(status) {
    const labels = {
        'backlog': '待办',
        'contexted': '已上下文',
        'drafted': '已起草',
        'ready-for-dev': '待开发',
        'in-progress': '开发中',
        'review': '评审中',
        'done': '已完成',
        'optional': '可选',
        'completed': '已完成'
    };
    return labels[status] || status;
}

/**
 * 获取状态的 CSS 类名
 * @param {string} status - 状态值
 * @returns {string} CSS 类名
 */
function getSprintStatusClass(status) {
    const classes = {
        'backlog': 'status-backlog',
        'contexted': 'status-contexted',
        'drafted': 'status-drafted',
        'ready-for-dev': 'status-ready',
        'in-progress': 'status-progress',
        'review': 'status-review',
        'done': 'status-done',
        'optional': 'status-optional',
        'completed': 'status-done'
    };
    return classes[status] || 'status-backlog';
}

/**
 * 获取 Story 状态流程的完成情况
 * @param {string} status - 当前状态
 * @returns {Array} 状态流程数组，每项包含 {name, done, current}
 */
function getStoryStatusFlow(status) {
    const flow = [
        { key: 'drafted', name: '故事已创建', icon: '📝' },
        { key: 'ready-for-dev', name: '上下文已就绪', icon: '📋' },
        { key: 'in-progress', name: '开发实现中', icon: '💻' },
        { key: 'done', name: '已完成', icon: '✅' }
    ];

    // 状态优先级
    const statusOrder = {
        'backlog': 0,
        'drafted': 1,
        'ready-for-dev': 2,
        'in-progress': 3,
        'review': 3.5,  // review 视为 in-progress 的后半段
        'done': 4
    };

    const currentOrder = statusOrder[status] || 0;

    return flow.map(item => ({
        name: item.name,
        icon: item.icon,
        done: statusOrder[item.key] <= currentOrder,
        current: Math.floor(statusOrder[item.key]) === Math.floor(currentOrder)
    }));
}

/**
 * 渲染单个 Story 卡片
 * @param {object} story - Story 数据
 * @returns {string} HTML 字符串
 */
function renderStoryCard(story) {
    const statusClass = getSprintStatusClass(story.status);
    const statusLabel = getSprintStatusLabel(story.status);

    // 生成状态流程 HTML
    const statusFlow = getStoryStatusFlow(story.status);
    const flowHtml = statusFlow.map(item => {
        const stepClass = item.done ? 'done' : (item.current ? 'current' : '');
        return `<div class="flow-step ${stepClass}">
            <span class="flow-icon">${item.done ? '✓' : '○'}</span>
            <span class="flow-name">${item.name}</span>
        </div>`;
    }).join('');

    // 计算进度百分比
    const doneCount = statusFlow.filter(s => s.done).length;
    const progressPercent = Math.round((doneCount / statusFlow.length) * 100);

    return `
        <div class="story-card ${statusClass}">
            <div class="story-card-header">
                <span class="story-id">${escapeHtml(story.storyId)}</span>
                <span class="story-status-badge ${statusClass}">${statusLabel}</span>
            </div>
            <div class="story-card-title">${escapeHtml(story.name)}</div>
            <div class="story-progress-mini">
                <div class="story-progress-bar">
                    <div class="story-progress-fill" style="width: ${progressPercent}%"></div>
                </div>
            </div>
            <div class="story-tooltip">
                <div class="tooltip-flow">${flowHtml}</div>
            </div>
        </div>
    `;
}

/**
 * 渲染单个 Epic 卡片（包含其 Stories）
 * @param {object} epic - Epic 数据
 * @returns {string} HTML 字符串
 */
function renderEpicCard(epic) {
    const epicStatusClass = getSprintStatusClass(epic.status);
    const epicStatusLabel = getSprintStatusLabel(epic.status);

    // 计算进度
    const totalStories = epic.stories.length;
    const doneStories = epic.stories.filter(s => s.status === 'done').length;
    const progressPercent = totalStories > 0 ? Math.round((doneStories / totalStories) * 100) : 0;

    const storiesHtml = epic.stories.map(renderStoryCard).join('');

    // 回顾状态
    const retroHtml = epic.retrospective ? `
        <div class="epic-retro">
            <span class="retro-label">回顾:</span>
            <span class="retro-status ${getSprintStatusClass(epic.retrospective)}">${getSprintStatusLabel(epic.retrospective)}</span>
        </div>
    ` : '';

    return `
        <div class="epic-card">
            <div class="epic-card-header">
                <div class="epic-title-row">
                    <span class="epic-number">${escapeHtml(epic.name)}</span>
                    <span class="epic-status-badge ${epicStatusClass}">${epicStatusLabel}</span>
                </div>
                <div class="epic-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progressPercent}%"></div>
                    </div>
                    <span class="progress-text">${doneStories}/${totalStories}</span>
                </div>
                ${retroHtml}
            </div>
            <div class="epic-stories">
                ${storiesHtml}
            </div>
        </div>
    `;
}

/**
 * 渲染 Sprint 看板页面
 */
async function renderSprint() {
    const content = document.getElementById('app-content');

    // 显示加载状态
    content.innerHTML = `
        <div class="sprint-page">
            <div class="sprint-header">
                <h2>Sprint 看板</h2>
            </div>
            <div class="sprint-loading">加载中...</div>
        </div>
    `;

    // 获取 Sprint 状态数据
    const result = await api('/sprint-status');

    if (!result || !result.success) {
        content.innerHTML = `
            <div class="sprint-page">
                <div class="sprint-header">
                    <h2>Sprint 看板</h2>
                </div>
                <div class="sprint-empty">
                    <p>无法加载 Sprint 状态</p>
                    <p style="font-size: 12px; color: #6E6E6E;">请确保项目中存在 sprint-status.yaml 文件</p>
                </div>
            </div>
        `;
        return;
    }

    const data = result.data;
    const epicsHtml = data.epics.map(renderEpicCard).join('');

    // 计算总体进度
    let totalStories = 0;
    let doneStories = 0;
    data.epics.forEach(epic => {
        totalStories += epic.stories.length;
        doneStories += epic.stories.filter(s => s.status === 'done').length;
    });
    const overallProgress = totalStories > 0 ? Math.round((doneStories / totalStories) * 100) : 0;

    content.innerHTML = `
        <div class="sprint-page">
            <div class="sprint-header">
                <h2>Sprint 看板</h2>
                <div class="sprint-summary">
                    <span class="project-name">${escapeHtml(data.project)}</span>
                    <span class="overall-progress">总进度: ${doneStories}/${totalStories} (${overallProgress}%)</span>
                </div>
            </div>
            <div class="epics-container">
                ${epicsHtml}
            </div>
        </div>
    `;

    // 连接 SSE 以接收实时更新
    connectSSE();

    log('Rendered: Sprint board');
}

/**
 * Render progress bar for wizard
 * @param {number} currentStep - Current step (1-4)
 * @param {number} totalSteps - Total steps
 */
function renderProgressBar(currentStep, totalSteps) {
    const steps = [];
    const stepLabels = ['选择文件夹', '基础配置', '选择模块', '确认创建'];

    for (let i = 1; i <= totalSteps; i++) {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;
        const statusClass = isCompleted ? 'completed' : (isCurrent ? 'current' : 'pending');

        steps.push(`
            <div class="progress-step ${statusClass}">
                <div class="progress-step-circle">${i}</div>
                <div class="progress-step-label">${stepLabels[i - 1]}</div>
            </div>
            ${i < totalSteps ? `<div class="progress-line ${isCompleted ? 'completed' : ''}"></div>` : ''}
        `);
    }

    return `
        <div class="wizard-progress">
            <div class="progress-header">Step ${currentStep}/${totalSteps}</div>
            <div class="progress-steps">${steps.join('')}</div>
        </div>
    `;
}

/**
 * Navigate to next wizard step
 */
function nextStep() {
    if (state.setupWizard.step < 4) {
        state.setupWizard.step++;
        renderSetup();
    }
}

/**
 * Navigate to previous wizard step
 */
function prevStep() {
    if (state.setupWizard.step > 1) {
        state.setupWizard.step--;
        renderSetup();
    }
}

/**
 * Reset wizard state
 */
function resetWizard() {
    state.setupWizard = {
        step: 1,
        path: '',
        config: {
            user_name: '',
            communication_language: 'Chinese',
            output_folder: 'md/'
        },
        modules: ['bmm', 'core'],
        isCreating: false
    };
}

/**
 * Render Step 1 - Select Folder
 */
function renderSetupStep1() {
    const wizard = state.setupWizard;
    const canProceed = wizard.path.trim() !== '';

    return `
        <div class="wizard-step-content">
            <h2 class="wizard-step-title">选择项目文件夹</h2>
            <p class="wizard-step-desc">请输入要创建 BMAD 项目的目录路径</p>

            <div class="form-group">
                <label class="form-label">项目路径</label>
                <input type="text"
                    class="form-input"
                    id="project-path-input"
                    placeholder="例如: C:/Projects/my-project"
                    value="${escapeHtml(wizard.path)}"
                />
                <p class="form-hint">请输入完整的目录路径。该目录必须已存在且不能包含 .bmad 文件夹。</p>
            </div>

            <div class="wizard-actions">
                <button class="btn btn-secondary" onclick="location.hash='#/'">取消</button>
                <button class="btn btn-primary" id="btn-next" ${canProceed ? '' : 'disabled'}>下一步</button>
            </div>
        </div>
    `;
}

/**
 * Render Step 2 - Basic Configuration
 */
function renderSetupStep2() {
    const wizard = state.setupWizard;
    const canProceed = wizard.config.user_name.trim() !== '';

    return `
        <div class="wizard-step-content">
            <h2 class="wizard-step-title">基础配置</h2>
            <p class="wizard-step-desc">设置项目的基本信息</p>

            <div class="form-group">
                <label class="form-label">用户名 <span class="required">*</span></label>
                <input type="text"
                    class="form-input"
                    id="user-name-input"
                    placeholder="输入您的用户名"
                    value="${escapeHtml(wizard.config.user_name)}"
                />
            </div>

            <div class="form-group">
                <label class="form-label">通讯语言</label>
                <select class="form-select" id="language-select">
                    <option value="Chinese" ${wizard.config.communication_language === 'Chinese' ? 'selected' : ''}>中文</option>
                    <option value="English" ${wizard.config.communication_language === 'English' ? 'selected' : ''}>English</option>
                </select>
            </div>

            <div class="form-group">
                <label class="form-label">输出目录</label>
                <input type="text"
                    class="form-input"
                    id="output-folder-input"
                    placeholder="md/"
                    value="${escapeHtml(wizard.config.output_folder)}"
                />
                <p class="form-hint">存放生成文档的目录，相对于项目根目录</p>
            </div>

            <div class="wizard-actions">
                <button class="btn btn-secondary" id="btn-prev">上一步</button>
                <button class="btn btn-primary" id="btn-next" ${canProceed ? '' : 'disabled'}>下一步</button>
            </div>
        </div>
    `;
}

/**
 * Render Step 3 - Select Modules
 */
function renderSetupStep3() {
    const wizard = state.setupWizard;
    const canProceed = wizard.modules.length > 0;

    return `
        <div class="wizard-step-content">
            <h2 class="wizard-step-title">选择模块</h2>
            <p class="wizard-step-desc">选择要安装的 BMAD 模块</p>

            <div class="module-cards">
                <label class="module-card ${wizard.modules.includes('bmm') ? 'selected' : ''}">
                    <input type="checkbox"
                        class="module-checkbox"
                        value="bmm"
                        ${wizard.modules.includes('bmm') ? 'checked' : ''}
                    />
                    <div class="module-card-content">
                        <div class="module-card-title">BMM</div>
                        <div class="module-card-desc">核心方法论模块，包含 Agents 和 Workflows</div>
                    </div>
                </label>

                <label class="module-card ${wizard.modules.includes('core') ? 'selected' : ''}">
                    <input type="checkbox"
                        class="module-checkbox"
                        value="core"
                        ${wizard.modules.includes('core') ? 'checked' : ''}
                    />
                    <div class="module-card-content">
                        <div class="module-card-title">Core</div>
                        <div class="module-card-desc">基础工具模块，提供核心功能</div>
                    </div>
                </label>
            </div>

            <p class="form-hint" style="margin-top: 16px; text-align: center;">至少需要选择一个模块</p>

            <div class="wizard-actions">
                <button class="btn btn-secondary" id="btn-prev">上一步</button>
                <button class="btn btn-primary" id="btn-next" ${canProceed ? '' : 'disabled'}>下一步</button>
            </div>
        </div>
    `;
}

/**
 * Render Step 4 - Confirm and Create
 */
function renderSetupStep4() {
    const wizard = state.setupWizard;
    const languageLabel = wizard.config.communication_language === 'Chinese' ? '中文' : 'English';

    return `
        <div class="wizard-step-content">
            <h2 class="wizard-step-title">确认并创建</h2>
            <p class="wizard-step-desc">请确认以下配置信息</p>

            <div class="summary-card">
                <div class="summary-item">
                    <span class="summary-label">项目路径</span>
                    <span class="summary-value">${escapeHtml(wizard.path)}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">用户名</span>
                    <span class="summary-value">${escapeHtml(wizard.config.user_name)}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">通讯语言</span>
                    <span class="summary-value">${languageLabel}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">输出目录</span>
                    <span class="summary-value">${escapeHtml(wizard.config.output_folder)}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">安装模块</span>
                    <span class="summary-value">${wizard.modules.join(', ')}</span>
                </div>
            </div>

            <div class="wizard-actions">
                <button class="btn btn-secondary" id="btn-prev" ${wizard.isCreating ? 'disabled' : ''}>上一步</button>
                <button class="btn btn-primary btn-create" id="btn-create" ${wizard.isCreating ? 'disabled' : ''}>
                    ${wizard.isCreating ? '<span class="spinner"></span> 创建中...' : '创建项目'}
                </button>
            </div>
        </div>
    `;
}

/**
 * Render setup wizard page
 */
function renderSetup() {
    const content = document.getElementById('app-content');
    const wizard = state.setupWizard;

    let stepContent = '';
    switch (wizard.step) {
        case 1:
            stepContent = renderSetupStep1();
            break;
        case 2:
            stepContent = renderSetupStep2();
            break;
        case 3:
            stepContent = renderSetupStep3();
            break;
        case 4:
            stepContent = renderSetupStep4();
            break;
    }

    content.innerHTML = `
        <div class="setup-wizard">
            ${renderProgressBar(wizard.step, 4)}
            <div class="wizard-container">
                ${stepContent}
            </div>
        </div>
    `;

    // Bind event handlers based on step
    bindWizardEvents();

    log('Rendered: Setup wizard step', wizard.step);
}

/**
 * Bind event handlers for wizard
 */
function bindWizardEvents() {
    const wizard = state.setupWizard;

    // Step 1 events
    if (wizard.step === 1) {
        const pathInput = document.getElementById('project-path-input');
        const btnNext = document.getElementById('btn-next');

        if (pathInput) {
            pathInput.addEventListener('input', (e) => {
                wizard.path = e.target.value;
                btnNext.disabled = wizard.path.trim() === '';
            });
        }

        if (btnNext) {
            btnNext.addEventListener('click', nextStep);
        }
    }

    // Step 2 events
    if (wizard.step === 2) {
        const userNameInput = document.getElementById('user-name-input');
        const languageSelect = document.getElementById('language-select');
        const outputFolderInput = document.getElementById('output-folder-input');
        const btnPrev = document.getElementById('btn-prev');
        const btnNext = document.getElementById('btn-next');

        if (userNameInput) {
            userNameInput.addEventListener('input', (e) => {
                wizard.config.user_name = e.target.value;
                btnNext.disabled = wizard.config.user_name.trim() === '';
            });
        }

        if (languageSelect) {
            languageSelect.addEventListener('change', (e) => {
                wizard.config.communication_language = e.target.value;
            });
        }

        if (outputFolderInput) {
            outputFolderInput.addEventListener('input', (e) => {
                wizard.config.output_folder = e.target.value || 'md/';
            });
        }

        if (btnPrev) btnPrev.addEventListener('click', prevStep);
        if (btnNext) btnNext.addEventListener('click', nextStep);
    }

    // Step 3 events
    if (wizard.step === 3) {
        const moduleCheckboxes = document.querySelectorAll('.module-checkbox');
        const btnPrev = document.getElementById('btn-prev');
        const btnNext = document.getElementById('btn-next');

        moduleCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const checked = Array.from(document.querySelectorAll('.module-checkbox:checked'))
                    .map(cb => cb.value);
                wizard.modules = checked;
                btnNext.disabled = checked.length === 0;

                // Update card visual state
                document.querySelectorAll('.module-card').forEach(card => {
                    const cb = card.querySelector('.module-checkbox');
                    card.classList.toggle('selected', cb.checked);
                });
            });
        });

        if (btnPrev) btnPrev.addEventListener('click', prevStep);
        if (btnNext) btnNext.addEventListener('click', nextStep);
    }

    // Step 4 events
    if (wizard.step === 4) {
        const btnPrev = document.getElementById('btn-prev');
        const btnCreate = document.getElementById('btn-create');

        if (btnPrev) btnPrev.addEventListener('click', prevStep);
        if (btnCreate) btnCreate.addEventListener('click', handleCreateProject);
    }
}

/**
 * Handle project creation
 */
async function handleCreateProject() {
    const wizard = state.setupWizard;

    if (wizard.isCreating) return;

    wizard.isCreating = true;
    renderSetup(); // Re-render to show spinner

    const result = await createProject(wizard.path, wizard.config, wizard.modules);

    if (result && result.success) {
        state.currentProject = result.data;
        showToast(`项目创建成功: ${result.data.name}`, 'success');
        resetWizard();
        location.hash = '#/command';
    } else {
        wizard.isCreating = false;
        renderSetup(); // Re-render to restore button state
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

// =============================================================================
// 7. Event Handlers
// =============================================================================

/**
 * Handle tab click - navigate to route
 * @param {Event} event - Click event
 */
function handleTabClick(event) {
    const route = event.target.dataset.route;
    if (route) {
        location.hash = route;
        log('Tab clicked:', route);
    }
}

/**
 * Handle "Create Project" card click
 */
function handleCreateClick() {
    resetWizard();
    location.hash = '#/setup';
    log('Create project clicked');
}

/**
 * Handle "Import Project" card click - trigger folder picker
 */
function handleImportClick() {
    document.getElementById('folder-input').click();
    log('Import project clicked');
}

/**
 * Handle folder selection from file input
 * @param {Event} event - Change event from file input
 */
async function handleFolderSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Extract directory path from first file's webkitRelativePath
    const firstFile = files[0];
    const relativePath = firstFile.webkitRelativePath;
    const folderName = relativePath.split('/')[0];

    // For web browsers, we need to send the folder name to the backend
    // The backend will resolve it based on known paths or prompt user
    // In Electron/Node environment, we could use files[0].path directly

    log('Folder selected:', folderName, 'Files:', files.length);

    // For now, show info that we need the full path
    // In a real implementation, we'd either:
    // 1. Use Electron's dialog.showOpenDialog for native folder picker
    // 2. Ask user to input the full path
    // 3. Use File System Access API (limited browser support)

    showToast(`请输入项目完整路径或使用命令行启动`, 'info');

    // Reset input for future selections
    event.target.value = '';
}

/**
 * Handle recent project item click
 * @param {string} projectPath - Path to the project
 */
async function handleRecentClick(projectPath) {
    log('Recent project clicked:', projectPath);

    const result = await openProject(projectPath);
    if (result && result.success) {
        state.currentProject = result.data;
        showToast(`已打开项目: ${result.data.name}`, 'success');
        location.hash = '#/command';
    } else {
        // Remove invalid project from local state and re-render
        state.recentProjects = state.recentProjects.filter(p => p.path !== projectPath);
        renderRecentProjects(state.recentProjects);
        // Persist removal to backend
        await removeRecentProject(projectPath);
        log('Removed invalid project from list:', projectPath);
    }
}

/**
 * Load and render recent projects
 */
async function loadRecentProjects() {
    const result = await getRecentProjects();
    if (result && result.success) {
        state.recentProjects = result.data || [];
        renderRecentProjects(state.recentProjects);
    } else {
        // API not implemented yet or error - show empty state
        renderRecentProjects([]);
    }
}

// =============================================================================
// 8. Router
// =============================================================================

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

// Listen for hash changes
window.addEventListener('hashchange', handleRoute);

// =============================================================================
// 9. Initialization
// =============================================================================

/**
 * 返回欢迎页面（关闭当前项目）
 */
function goHome() {
    state.currentProject = null;
    state.workflowStatus = null;
    disconnectSSE();
    location.hash = '#/';
    log('Returned to home');
}

// 暴露给全局，方便 onclick 调用
window.goHome = goHome;
window.switchToAgent = switchToAgent;

/**
 * 初始化应用 - 加载最近项目并自动恢复上次打开的项目
 */
async function initApp() {
    log('BMAD GUI initialized');

    // Bind folder input change handler
    document.getElementById('folder-input').addEventListener('change', handleFolderSelect);

    // Bind nav-brand click to go home
    const navBrand = document.querySelector('.nav-brand');
    if (navBrand) {
        navBrand.style.cursor = 'pointer';
        navBrand.addEventListener('click', goHome);
    }

    // 加载最近项目列表
    const result = await getRecentProjects();
    if (result && result.success && result.data && result.data.length > 0) {
        state.recentProjects = result.data;

        // 自动打开最近的项目
        const lastProject = result.data[0];
        if (lastProject && lastProject.path) {
            const openResult = await openProject(lastProject.path);
            if (openResult && openResult.success) {
                state.currentProject = openResult.data;
                log('Auto-loaded last project:', lastProject.path);
            }
        }
    }

    // 初始化 Claude 状态模块
    if (typeof initClaudeStatus === 'function') {
        initClaudeStatus();
    }

    // Render initial tabs
    renderTabs();

    // Handle initial route
    handleRoute();
}

document.addEventListener('DOMContentLoaded', initApp);
