/**
 * BMAD GUI - Task Cards Component
 * 任务卡片组件
 */

/**
 * 获取推荐的下一个任务
 * @returns {string|null} 推荐的工作流 ID 或 null
 */
function getRecommendedTask() {
    if (!state.workflowStatus || !state.workflowStatus.phases) {
        return null;
    }

    for (const phase of state.workflowStatus.phases) {
        if (!phase.workflows) continue;

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

    let currentPhase = '准备中';
    if (state.workflowStatus?.phases) {
        const inProgress = state.workflowStatus.phases.find(p => p.status === 'in_progress');
        const pending = state.workflowStatus.phases.find(p => p.status === 'pending');
        currentPhase = inProgress?.name || pending?.name || '全部完成';
    }

    const trackMode = state.workflowStatus?.trackMode || 'standard';
    const modeLabel = trackMode === 'quick' ? '快速模式' : '标准模式';
    const modeClass = trackMode === 'quick' ? 'mode-quick' : 'mode-standard';

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
 * 渲染单个任务卡片
 * @param {object} command - 命令对象
 * @param {boolean} isRecommended - 是否是推荐任务
 * @returns {string} HTML 字符串
 */
function renderTaskCard(command, isRecommended) {
    const recommendedClass = isRecommended ? 'recommended' : '';
    const disabledClass = state.isExecutingCommand ? 'disabled' : '';
    const recommendedTag = isRecommended ? '<span class="task-card-tag">推荐</span>' : '';
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

    for (const phase of state.workflowStatus.phases) {
        if (!phase.workflows) continue;

        for (const wf of phase.workflows) {
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

    if (!nextTask) {
        const hasWorkflowData = state.workflowStatus && state.workflowStatus.phases && state.workflowStatus.phases.length > 0;
        if (!hasWorkflowData) {
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

    const { workflow, phase } = nextTask;
    const agentName = workflow.agent || 'sm';
    const agentCnName = AGENT_CN_NAMES[agentName] || agentName;
    const commandLabel = getCommandLabel(workflow.name || workflow.command, workflow.name);

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
 * 显示确认发送到 Claude 的对话框
 * @param {string} commandName - 命令名称
 * @param {string} commandLabel - 命令显示名称
 * @returns {Promise<boolean>} 用户是否确认
 */
function showSendToClaudeConfirm(commandName, commandLabel) {
    return new Promise((resolve) => {
        // 移除已有的对话框
        const existing = document.querySelector('.claude-confirm-overlay');
        if (existing) existing.remove();

        const fullCommand = `/${commandName}`;

        const overlay = document.createElement('div');
        overlay.className = 'claude-confirm-overlay';
        overlay.innerHTML = `
            <div class="claude-confirm-dialog">
                <div class="claude-confirm-header">
                    <span class="claude-confirm-icon">🚀</span>
                    <h3>发送到 Claude Code</h3>
                </div>
                <div class="claude-confirm-body">
                    <p>将执行以下命令：</p>
                    <div class="claude-confirm-command">
                        <code>${escapeHtml(fullCommand)}</code>
                    </div>
                    <p class="claude-confirm-hint">确认后将通过键盘模拟发送到 Claude Code 窗口</p>
                </div>
                <div class="claude-confirm-actions">
                    <button class="claude-confirm-btn claude-confirm-cancel">取消</button>
                    <button class="claude-confirm-btn claude-confirm-ok">确认发送</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // 绑定事件
        const cancelBtn = overlay.querySelector('.claude-confirm-cancel');
        const okBtn = overlay.querySelector('.claude-confirm-ok');

        const close = (result) => {
            overlay.remove();
            resolve(result);
        };

        cancelBtn.addEventListener('click', () => close(false));
        okBtn.addEventListener('click', () => close(true));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(false);
        });

        // ESC 关闭
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                close(false);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);

        // 聚焦确认按钮
        okBtn.focus();
    });
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

    // 获取命令标签
    const commandLabel = getCommandLabel(commandName, commandName);

    // 显示确认对话框
    const confirmed = await showSendToClaudeConfirm(commandName, commandLabel);
    if (!confirmed) {
        log('用户取消发送');
        return;
    }

    const cards = document.querySelectorAll('.task-card');
    const clickedCard = document.querySelector(`.task-card[data-command="${commandName}"]`);

    if (clickedCard) {
        state.isExecutingCommand = true;
        clickedCard.classList.add('loading');
        cards.forEach(card => {
            if (card !== clickedCard) {
                card.classList.add('disabled');
            }
        });
    }

    const fullCommand = `/${commandName}`;

    try {
        // 发送到 Claude Code 窗口
        const success = await sendInputToClaude(fullCommand, 'send');

        if (success) {
            log('命令已发送到 Claude:', fullCommand);
        }
    } catch (e) {
        showToast('命令发送失败，请重试', 'error');
        log('命令发送失败:', e);
    } finally {
        if (clickedCard) {
            clickedCard.classList.remove('loading');
            cards.forEach(card => card.classList.remove('disabled'));
        }
        state.isExecutingCommand = false;
    }
}

// 暴露给全局
window.switchToAgent = switchToAgent;
