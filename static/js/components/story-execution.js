/**
 * BMAD GUI - Story Execution Component
 * Story 执行流程组件
 */

console.log('[BMAD] story-execution.js loaded');

// Story 状态对应的操作映射
// 命令需要完整的 bmad:bmm:workflows: 前缀
const STORY_ACTIONS = {
    'backlog': [
        { id: 'create-story', label: '创建 Story', icon: '📝', command: 'bmad:bmm:workflows:create-story' }
    ],
    'drafted': [
        { id: 'story-context', label: '生成技术上下文', icon: '📄', command: 'bmad:bmm:workflows:story-context' },
        { id: 'dev-story', label: '执行', icon: '▶️', command: 'bmad:bmm:workflows:dev-story' }
    ],
    'ready-for-dev': [
        { id: 'story-done', label: '标记 Done', icon: '✅', command: 'bmad:bmm:workflows:story-done' },
        { id: 'code-review', label: '进行 Review', icon: '👀', command: 'bmad:bmm:workflows:code-review' }
    ],
    'in-progress': [
        { id: 'story-done', label: '标记 Done', icon: '✅', command: 'bmad:bmm:workflows:story-done' },
        { id: 'code-review', label: '进行 Review', icon: '👀', command: 'bmad:bmm:workflows:code-review' }
    ],
    'review': [
        { id: 'story-done', label: '标记 Done', icon: '✅', command: 'bmad:bmm:workflows:story-done' }
    ],
    'done': []
};

// Story 状态标签
const STORY_STATUS_LABELS = {
    'backlog': '待创建',
    'drafted': '已创建',
    'ready-for-dev': '准备开发',
    'in-progress': '开发中',
    'review': '待审核',
    'done': '已完成'
};

// Story 状态图标
const STORY_STATUS_ICONS = {
    'backlog': '○',
    'drafted': '◐',
    'ready-for-dev': '◑',
    'in-progress': '●',
    'review': '◉',
    'done': '✓'
};

/**
 * 从 sprint 状态中获取下一个活跃的 Story
 * @returns {object|null} Story 信息，或包含 reason 的对象，或 null
 */
function getNextActiveStory() {
    console.log('[BMAD] getNextActiveStory called, sprintStatus:', state.sprintStatus);

    if (!state.sprintStatus) {
        console.log('[BMAD] No sprint status');
        return { empty: true, reason: 'no_sprint' };
    }

    // 检查 fileCreated 标志（Sprint 文件存在但无内容）
    if (state.sprintStatus.fileCreated && (!state.sprintStatus.epics || state.sprintStatus.epics.length === 0)) {
        console.log('[BMAD] Sprint file created but no epics');
        return { empty: true, reason: 'file_created', message: state.sprintStatus.message };
    }

    if (!state.sprintStatus.epics || state.sprintStatus.epics.length === 0) {
        console.log('[BMAD] No epics');
        return { empty: true, reason: 'no_epics' };
    }

    // 检查是否有任何 Story
    let hasAnyStory = false;
    for (const epic of state.sprintStatus.epics) {
        if (epic.stories && epic.stories.length > 0) {
            hasAnyStory = true;
            break;
        }
    }

    if (!hasAnyStory) {
        return { empty: true, reason: 'no_stories' };
    }

    // 遍历所有 Epic 找到第一个非 done 的 Story
    for (const epic of state.sprintStatus.epics) {
        if (!epic.stories) continue;

        for (const story of epic.stories) {
            if (story.status !== 'done') {
                return {
                    ...story,
                    epicId: epic.id,
                    epicNumber: epic.number,
                    epicName: epic.name
                };
            }
        }

        // 如果 Epic 中所有 Story 都完成了，检查是否还有 backlog 的 Story
        // 这种情况下，Epic 的下一个 Story 应该被创建
        if (epic.status === 'contexted') {
            // 检查是否还有待创建的 Story
            const allDone = epic.stories.every(s => s.status === 'done');
            if (allDone) {
                // 检查 Epic 是否有回顾
                if (epic.retrospective === 'optional') {
                    continue; // 继续下一个 Epic
                }
            }
        }
    }

    // 如果所有 Story 都完成了，检查是否有 contexted 的 Epic 需要新 Story
    for (const epic of state.sprintStatus.epics) {
        if (epic.status === 'contexted' || epic.status === 'backlog') {
            // 检查是否有 backlog 状态的 Story（从 sprint-status.yaml 中）
            if (epic.stories) {
                const backlogStory = epic.stories.find(s => s.status === 'backlog');
                if (backlogStory) {
                    return {
                        ...backlogStory,
                        epicId: epic.id,
                        epicNumber: epic.number,
                        epicName: epic.name
                    };
                }
            }
        }
    }

    // 真的是所有 Story 都完成了
    return { empty: true, reason: 'all_done' };
}

/**
 * 获取 Story 的操作按钮
 * @param {string} status - Story 状态
 * @returns {array} 操作按钮数组
 */
function getStoryActions(status) {
    return STORY_ACTIONS[status] || [];
}

/**
 * 渲染 Story 信息卡片
 * @param {object} story - Story 对象
 * @returns {string} HTML 字符串
 */
function renderStoryInfo(story) {
    // 处理空状态或带有 reason 的对象
    if (!story || story.empty) {
        let icon = '📋';
        let text = 'Sprint 状态未知';
        let actionHtml = '';
        let flowHtml = '';

        if (story && story.reason) {
            switch (story.reason) {
                case 'no_sprint':
                    icon = '📋';
                    text = '等待生成 Sprint 状态文件';
                    break;
                case 'file_created':
                case 'no_epics':
                    icon = '📂';
                    text = story.message || 'Sprint 文件已创建，需要拆分 Epic 和 Story';
                    actionHtml = `
                        <button class="story-action-btn primary" 
                                onclick="handleTaskCardClick('create-epics-and-stories')">
                            <span class="action-icon">📚</span>
                            <span class="action-label">创建 Epic 和 Story</span>
                        </button>
                    `;
                    break;
                case 'no_stories':
                    icon = '📝';
                    text = '等待创建 Story';
                    break;
                case 'all_done':
                    icon = '🎉';
                    text = '所有 Story 已完成';
                    break;
                case 'flow_status':
                    // 显示流程状态
                    icon = '📊';
                    text = 'Implementation 阶段进度';
                    if (story.flowData) {
                        const { steps, nextStep, trackMode } = story.flowData;
                        const modeLabel = trackMode === 'quick' ? '快速模式' : '标准模式';

                        flowHtml = `
                            <div class="impl-flow-status">
                                <div class="flow-mode-badge">${modeLabel}</div>
                                <div class="flow-steps">
                                    ${steps.map(s => `
                                        <div class="flow-step ${s.status}">
                                            <span class="flow-step-icon">${s.status === 'completed' ? '✅' : '○'}</span>
                                            <span class="flow-step-name">${s.name}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `;

                        if (nextStep) {
                            text = `下一步: ${nextStep.name}`;
                            actionHtml = `
                                <button class="story-action-btn primary" 
                                        onclick="handleTaskCardClick('${nextStep.command}')">
                                    <span class="action-icon">▶️</span>
                                    <span class="action-label">执行 ${nextStep.name}</span>
                                </button>
                            `;
                        } else {
                            text = '所有步骤已完成';
                            icon = '🎉';
                        }
                    }
                    break;
            }
        }

        return `
            <div class="story-info story-info-empty">
                <span class="story-info-icon">${icon}</span>
                <span class="story-info-text">${text}</span>
                ${flowHtml}
                ${actionHtml ? `<div class="story-actions" style="margin-top: 12px;">${actionHtml}</div>` : ''}
            </div>
        `;
    }

    const statusLabel = STORY_STATUS_LABELS[story.status] || story.status;
    const statusIcon = STORY_STATUS_ICONS[story.status] || '○';
    const storyName = story.name || story.id;

    return `
        <div class="story-info">
            <div class="story-info-header">
                <span class="story-info-icon">📋</span>
                <span class="story-info-title">当前 Story: ${escapeHtml(story.storyId)}</span>
            </div>
            <div class="story-info-name">${escapeHtml(storyName)}</div>
            <div class="story-info-meta">
                <span class="story-status-badge status-${story.status}">
                    <span class="status-icon">${statusIcon}</span>
                    ${escapeHtml(statusLabel)}
                </span>
                <span class="story-epic-badge">Epic ${story.epicNumber}</span>
            </div>
        </div>
    `;
}

/**
 * 渲染 Story 操作按钮
 * @param {object} story - Story 对象
 * @returns {string} HTML 字符串
 */
function renderStoryActions(story) {
    if (!story) {
        return '';
    }

    const actions = getStoryActions(story.status);
    if (actions.length === 0) {
        return '';
    }

    // 将 storyId 从 "6-1" 格式转换为 "6.1" 格式
    const storyIdForCommand = story.storyId ? story.storyId.replace('-', '.') : '';

    const buttonsHtml = actions.map((action, index) => {
        const primaryClass = index === 0 ? 'primary' : '';
        return `
            <button class="story-action-btn ${primaryClass}"
                    data-command="${escapeHtml(action.command)}"
                    data-story-id="${escapeHtml(storyIdForCommand)}"
                    onclick="handleStoryActionClick('${escapeHtml(action.command)}', '${escapeHtml(storyIdForCommand)}')">
                <span class="action-icon">${action.icon}</span>
                <span class="action-label">${escapeHtml(action.label)}</span>
            </button>
        `;
    }).join('');

    return `
        <div class="story-actions">
            ${buttonsHtml}
        </div>
    `;
}

/**
 * 获取 Implementation 阶段流程状态
 * @returns {Promise<object|null>} 流程状态数据
 */
async function fetchImplementationFlow() {
    try {
        const res = await fetch(`${API_BASE_URL}/implementation-flow`);
        const result = await res.json();
        if (result && result.data) {
            state.implementationFlow = result.data;
            return result.data;
        }
    } catch (e) {
        console.error('[BMAD] Failed to fetch implementation flow:', e);
    }
    return null;
}

/**
 * 渲染 Story 执行面板（用于 Implementation 阶段）
 * @param {object} phase - 阶段对象
 * @returns {string} HTML 字符串
 */
function renderStoryExecutionPanel(phase) {
    let story = getNextActiveStory();

    // 如果没有活跃的 Story，检查是否有 implementation flow 数据
    if (story && story.empty && story.reason !== 'all_done') {
        // 使用缓存的 implementation flow 数据
        if (state.implementationFlow) {
            story = {
                empty: true,
                reason: 'flow_status',
                flowData: state.implementationFlow
            };
        }
    }

    // 同时显示原有的工作流列表
    let workflowsHtml = '';
    if (phase.workflows && phase.workflows.length > 0) {
        workflowsHtml = `
            <div class="story-workflows">
                <div class="story-workflows-title">工作流</div>
                ${phase.workflows.map(wf => {
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
        }).join('')}
            </div>
        `;
    }

    return `
        <div class="phase-detail story-execution-panel" data-phase-id="${phase.id}">
            <div class="phase-detail-header">
                <span class="phase-detail-title">${escapeHtml(phase.name)}</span>
                <button class="phase-detail-close" onclick="closePhaseDetail()">▲</button>
            </div>
            <div class="phase-detail-content">
                <div class="story-execution-content">
                    ${renderStoryInfo(story)}
                    ${renderStoryActions(story)}
                </div>
                ${workflowsHtml}
            </div>
        </div>
    `;
}

/**
 * 处理 Story 操作按钮点击
 * @param {string} command - 命令名称
 * @param {string} storyId - Story ID
 */
async function handleStoryActionClick(command, storyId) {
    if (state.isExecutingCommand) {
        return;
    }

    log('Story 操作点击:', command, storyId);

    // 获取命令标签
    const action = Object.values(STORY_ACTIONS).flat().find(a => a.command === command);
    const commandLabel = action ? action.label : command;

    // 显示确认对话框
    const confirmed = await showSendToClaudeConfirm(command, commandLabel);
    if (!confirmed) {
        log('用户取消发送');
        return;
    }

    // 禁用按钮
    const btn = document.querySelector(`.story-action-btn[data-command="${command}"]`);
    if (btn) {
        btn.classList.add('loading');
        btn.disabled = true;
    }

    // 命令格式: /command storyId (例如: /create-story 6.1)
    const fullCommand = storyId ? `/${command} ${storyId}` : `/${command}`;

    try {
        // 发送到 Claude Code 窗口
        const success = await sendInputToClaude(fullCommand, 'send');

        if (success) {
            log('Story 命令已发送到 Claude:', fullCommand);
        }
    } catch (e) {
        showToast('命令发送失败，请重试', 'error');
        log('Story 命令发送失败:', e);
    } finally {
        if (btn) {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    }
}

/**
 * 刷新 Story 面板
 */
function refreshStoryPanel() {
    const panel = document.querySelector('.story-execution-panel');
    if (!panel) return;

    const phaseId = parseInt(panel.dataset.phaseId);
    const phases = state.workflowStatus?.phases || [];
    const phase = phases.find(p => p.id === phaseId);

    if (phase) {
        const newPanel = renderStoryExecutionPanel(phase);
        panel.outerHTML = newPanel;
    }
}

// 暴露给全局
window.handleStoryActionClick = handleStoryActionClick;
window.refreshStoryPanel = refreshStoryPanel;
window.renderStoryExecutionPanel = renderStoryExecutionPanel;
window.getNextActiveStory = getNextActiveStory;
