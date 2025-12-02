/**
 * BMAD GUI - Agent Selector Component
 * Agent 选择器组件
 */

/**
 * 显示 Agent 选择器弹窗
 */
async function showAgentSelector() {
    if (document.getElementById('agent-selector-overlay')) {
        return;
    }

    const res = await api('/agents');
    if (!res || !res.success) {
        showToast('获取 Agent 列表失败', 'error');
        return;
    }

    const agents = res.data;
    const currentAgentName = state.currentAgent?.name;

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

    document.body.insertAdjacentHTML('beforeend', selectorHtml);
    bindAgentSelectorEvents();

    log('Agent 选择器已打开');
}

/**
 * 关闭 Agent 选择器
 */
function closeAgentSelector() {
    const overlay = document.getElementById('agent-selector-overlay');
    if (overlay) {
        overlay.remove();
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
 */
function bindAgentSelectorEvents() {
    const overlay = document.getElementById('agent-selector-overlay');
    const closeBtn = document.getElementById('agent-selector-close');
    const items = document.querySelectorAll('.agent-selector-item');

    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeAgentSelector();
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeAgentSelector);
    }

    items.forEach(item => {
        item.addEventListener('click', () => {
            const agentName = item.dataset.agent;
            if (agentName) {
                selectAgent(agentName);
            }
        });
    });

    document.addEventListener('keydown', handleAgentSelectorKeydown);
}

/**
 * 切换 Agent
 * @param {string} agentName - Agent 名称
 */
async function selectAgent(agentName) {
    if (agentName === state.currentAgent?.name) {
        closeAgentSelector();
        return;
    }

    const res = await api(`/agents/${agentName}`);
    if (!res || !res.success) {
        showToast('获取 Agent 详情失败', 'error');
        return;
    }

    state.currentAgent = res.data;
    closeAgentSelector();

    const taskCardsContainer = document.querySelector('.task-cards-container');
    if (taskCardsContainer) {
        taskCardsContainer.outerHTML = renderTaskCards();
    }

    const statusBar = document.querySelector('.status-bar');
    if (statusBar) {
        statusBar.outerHTML = renderStatusBar();
    }

    showToast(`已切换到 ${getAgentCnName(res.data)}`, 'success');
    log('Agent 已切换:', agentName);
}
