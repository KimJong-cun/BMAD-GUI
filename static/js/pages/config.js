/**
 * BMAD GUI - Config Center Page
 * 配置中心页面
 */

// 当前激活的标签
let activeConfigTab = 'modules';

/**
 * 渲染配置中心页面
 */
async function renderConfig() {
    const content = document.getElementById('app-content');

    // 先显示加载状态
    content.innerHTML = `
        <div class="config-page">
            <div class="config-loading">加载配置信息...</div>
        </div>
    `;

    // 加载配置数据
    await fetchConfigData();

    // 渲染完整页面
    content.innerHTML = `
        <div class="config-page">
            ${renderConfigTabs()}
            ${renderConfigContent()}
        </div>
    `;

    // 绑定标签切换事件
    bindConfigTabEvents();

    log('Rendered: Config center');
}

/**
 * 获取配置数据
 */
async function fetchConfigData() {
    try {
        const result = await api('/config');
        if (result && result.data) {
            state.config = result.data;
        }
    } catch (e) {
        log('获取配置失败:', e);
    }

    // 同时加载 agents 数据
    if (!state.agents || state.agents.length === 0) {
        await fetchAgents();
    }

    // 加载工作流数据
    if (!state.workflowStatus) {
        await fetchWorkflowStatus();
    }
}

/**
 * 渲染标签栏
 */
function renderConfigTabs() {
    const tabs = [
        { id: 'modules', icon: '📦', label: '模块' },
        { id: 'agents', icon: '🤖', label: 'Agents' },
        { id: 'workflows', icon: '🔄', label: 'Workflows' }
    ];

    const tabsHtml = tabs.map(tab => {
        const activeClass = activeConfigTab === tab.id ? 'active' : '';
        return `
            <button class="config-tab ${activeClass}" data-tab="${tab.id}">
                <span class="tab-icon">${tab.icon}</span>
                <span class="tab-label">${tab.label}</span>
            </button>
        `;
    }).join('');

    return `
        <div class="config-tabs">
            ${tabsHtml}
        </div>
    `;
}

/**
 * 渲染标签内容
 */
function renderConfigContent() {
    switch (activeConfigTab) {
        case 'modules':
            return renderModulesTab();
        case 'agents':
            return renderAgentsTab();
        case 'workflows':
            return renderWorkflowsTab();
        default:
            return renderModulesTab();
    }
}

/**
 * 渲染模块标签页
 */
function renderModulesTab() {
    const config = state.config || {};
    const modules = config.modules || [];
    const configYaml = config.configYaml || {};

    // 模块列表
    const modulesHtml = modules.length > 0
        ? modules.map(mod => `
            <div class="module-item">
                <span class="module-icon">✓</span>
                <span class="module-name">${escapeHtml(mod.name)}</span>
                <span class="module-desc">${escapeHtml(mod.description || '')}</span>
            </div>
        `).join('')
        : `
            <div class="module-item empty">
                <span class="module-icon">○</span>
                <span class="module-name">未检测到已安装模块</span>
            </div>
        `;

    // 配置内容
    const configContent = Object.keys(configYaml).length > 0
        ? Object.entries(configYaml).map(([key, value]) => `
            <div class="config-item">
                <span class="config-key">${escapeHtml(key)}:</span>
                <span class="config-value">${escapeHtml(String(value))}</span>
            </div>
        `).join('')
        : '<div class="config-item empty">暂无配置信息</div>';

    return `
        <div class="config-content">
            <div class="config-section">
                <h3 class="section-title">已安装模块</h3>
                <div class="modules-list">
                    ${modulesHtml}
                </div>
            </div>
            <div class="config-section">
                <h3 class="section-title">配置文件</h3>
                <div class="config-yaml">
                    ${configContent}
                </div>
            </div>
        </div>
    `;
}

/**
 * 渲染 Agents 标签页
 */
function renderAgentsTab() {
    const agents = state.agents || [];

    if (agents.length === 0) {
        return `
            <div class="config-content">
                <div class="config-section">
                    <h3 class="section-title">可用 Agents</h3>
                    <div class="empty-state">暂无 Agent 数据</div>
                </div>
            </div>
        `;
    }

    const agentsHtml = agents.map(agent => {
        const icon = getAgentIcon(agent.name);
        const cnName = AGENT_CN_NAMES[agent.name] || agent.name;
        return `
            <div class="agent-card" data-agent="${escapeHtml(agent.name)}">
                <div class="agent-card-header">
                    <span class="agent-icon">${icon}</span>
                    <div class="agent-info">
                        <span class="agent-name">${escapeHtml(cnName)}</span>
                        <span class="agent-id">${escapeHtml(agent.name)}</span>
                    </div>
                </div>
                <div class="agent-card-desc">${escapeHtml(agent.description || '暂无描述')}</div>
                <button class="agent-detail-btn" onclick="showAgentDetail('${escapeHtml(agent.name)}')">
                    查看详情
                </button>
            </div>
        `;
    }).join('');

    return `
        <div class="config-content">
            <div class="config-section">
                <h3 class="section-title">可用 Agents (${agents.length})</h3>
                <div class="agents-grid">
                    ${agentsHtml}
                </div>
            </div>
        </div>
    `;
}

/**
 * 渲染 Workflows 标签页
 */
function renderWorkflowsTab() {
    // 从工作流状态中获取阶段信息
    const phases = state.workflowStatus?.phases || [];

    if (phases.length === 0) {
        return `
            <div class="config-content">
                <div class="config-section">
                    <h3 class="section-title">工作流阶段</h3>
                    <div class="empty-state">暂无工作流数据，请先初始化项目</div>
                </div>
            </div>
        `;
    }

    const phasesHtml = phases.map(phase => {
        const workflows = phase.workflows || [];
        const workflowsHtml = workflows.map(wf => {
            const statusIcon = getStatusIcon(wf.status);
            const statusClass = getStatusClass(wf.status);
            const agentName = wf.agent ? `@${wf.agent}` : '';
            return `
                <div class="workflow-row ${statusClass}">
                    <span class="workflow-status-icon">${statusIcon}</span>
                    <span class="workflow-name">${escapeHtml(getCommandLabel(wf.name))}</span>
                    <span class="workflow-agent">${escapeHtml(agentName)}</span>
                </div>
            `;
        }).join('');

        return `
            <div class="phase-section">
                <h4 class="phase-title">${escapeHtml(phase.name)}</h4>
                <div class="workflows-list">
                    ${workflowsHtml || '<div class="empty-hint">无工作流</div>'}
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="config-content">
            <div class="config-section">
                <h3 class="section-title">工作流阶段</h3>
                ${phasesHtml}
            </div>
        </div>
    `;
}

/**
 * 获取 Agent 图标
 */
function getAgentIcon(agentName) {
    const icons = {
        'analyst': '📊',
        'architect': '🏗️',
        'dev': '💻',
        'pm': '📋',
        'sm': '🎯',
        'ux-designer': '🎨',
        'tech-writer': '📝',
        'tea': '🧪'
    };
    return icons[agentName] || '🤖';
}

/**
 * 显示 Agent 详情
 */
async function showAgentDetail(agentName) {
    const detail = await fetchAgentDetail(agentName);
    if (!detail) {
        showToast('获取 Agent 详情失败', 'error');
        return;
    }

    const icon = getAgentIcon(agentName);
    const cnName = AGENT_CN_NAMES[agentName] || agentName;

    // 命令列表
    const commandsHtml = detail.commands && detail.commands.length > 0
        ? detail.commands.map(cmd => `
            <div class="command-item">
                <span class="command-icon">${cmd.icon || '📋'}</span>
                <span class="command-name">${escapeHtml(getCommandLabel(cmd.name))}</span>
                <code class="command-code">${escapeHtml(cmd.name)}</code>
            </div>
        `).join('')
        : '<div class="empty-hint">暂无可用命令</div>';

    // 创建模态框
    const modal = document.createElement('div');
    modal.className = 'agent-modal-overlay';
    modal.innerHTML = `
        <div class="agent-modal">
            <div class="agent-modal-header">
                <div class="agent-modal-title">
                    <span class="agent-icon">${icon}</span>
                    <span>${escapeHtml(cnName)}</span>
                    <span class="agent-id-badge">${escapeHtml(agentName)}</span>
                </div>
                <button class="agent-modal-close" onclick="closeAgentModal()">✕</button>
            </div>
            <div class="agent-modal-body">
                <div class="agent-modal-section">
                    <h4>描述</h4>
                    <p>${escapeHtml(detail.description || '暂无描述')}</p>
                </div>
                <div class="agent-modal-section">
                    <h4>可用命令 (${detail.commands?.length || 0})</h4>
                    <div class="commands-list">
                        ${commandsHtml}
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 点击遮罩关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAgentModal();
    });

    // ESC 关闭
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closeAgentModal();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

/**
 * 关闭 Agent 模态框
 */
function closeAgentModal() {
    const modal = document.querySelector('.agent-modal-overlay');
    if (modal) modal.remove();
}

/**
 * 绑定标签切换事件
 */
function bindConfigTabEvents() {
    const tabs = document.querySelectorAll('.config-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            if (tabId !== activeConfigTab) {
                activeConfigTab = tabId;

                // 更新标签状态
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // 更新内容
                const contentContainer = document.querySelector('.config-content');
                if (contentContainer) {
                    contentContainer.outerHTML = renderConfigContent();
                }
            }
        });
    });
}

// 暴露全局函数
window.showAgentDetail = showAgentDetail;
window.closeAgentModal = closeAgentModal;
