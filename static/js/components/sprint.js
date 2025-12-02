/**
 * BMAD GUI - Sprint Board Component
 * Sprint 看板组件
 */

// 可选的状态列表（用户可手动选择）
const MANUAL_STATUS_OPTIONS = [
    { value: 'backlog', label: '待办', icon: '📝' },
    { value: 'ready-for-dev', label: '准备实施', icon: '📋' },
    { value: 'in-progress', label: '开发中', icon: '💻' },
    { value: 'review', label: '等待检查', icon: '🔍' },
    { value: 'done', label: '实施完成', icon: '✅' }
];

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
 * @returns {Array} 状态流程数组
 */
function getStoryStatusFlow(status) {
    const flow = [
        { key: 'drafted', name: '故事已创建', icon: '📝' },
        { key: 'ready-for-dev', name: '上下文已就绪', icon: '📋' },
        { key: 'in-progress', name: '开发实现中', icon: '💻' },
        { key: 'done', name: '已完成', icon: '✅' }
    ];

    const statusOrder = {
        'backlog': 0,
        'drafted': 1,
        'ready-for-dev': 2,
        'in-progress': 3,
        'review': 3.5,
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

    const statusFlow = getStoryStatusFlow(story.status);
    const flowHtml = statusFlow.map(item => {
        const stepClass = item.done ? 'done' : (item.current ? 'current' : '');
        return `<div class="flow-step ${stepClass}">
            <span class="flow-icon">${item.done ? '✓' : '○'}</span>
            <span class="flow-name">${item.name}</span>
        </div>`;
    }).join('');

    const doneCount = statusFlow.filter(s => s.done).length;
    const progressPercent = Math.round((doneCount / statusFlow.length) * 100);

    return `
        <div class="story-card ${statusClass}" data-story-id="${escapeHtml(story.storyId)}" data-story-status="${story.status}" onclick="showStoryStatusMenu(event, '${escapeHtml(story.storyId)}', '${story.status}')">
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
 * 渲染单个 Epic 卡片
 * @param {object} epic - Epic 数据
 * @returns {string} HTML 字符串
 */
function renderEpicCard(epic) {
    const epicStatusClass = getSprintStatusClass(epic.status);
    const epicStatusLabel = getSprintStatusLabel(epic.status);

    const totalStories = epic.stories.length;
    const doneStories = epic.stories.filter(s => s.status === 'done').length;
    const progressPercent = totalStories > 0 ? Math.round((doneStories / totalStories) * 100) : 0;

    const storiesHtml = epic.stories.map(renderStoryCard).join('');

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

    content.innerHTML = `
        <div class="sprint-page">
            <div class="sprint-header">
                <h2>Sprint 看板</h2>
            </div>
            <div class="sprint-loading">加载中...</div>
        </div>
    `;

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
                    <div class="overall-progress-container">
                        <span class="overall-progress-label">总进度</span>
                        <div class="overall-progress-bar">
                            <div class="overall-progress-fill" style="width: ${overallProgress}%"></div>
                        </div>
                        <span class="overall-progress-text">${doneStories}/${totalStories} (${overallProgress}%)</span>
                    </div>
                </div>
            </div>
            <div class="epics-container">
                ${epicsHtml}
            </div>
        </div>
    `;

    connectSSE();

    log('Rendered: Sprint board');
}

/**
 * 显示待办故事菜单（提示创建故事）
 * @param {Event} event - 点击事件
 * @param {string} storyId - Story ID
 * @param {HTMLElement} card - 卡片元素
 */
function showBacklogStoryMenu(event, storyId, card) {
    card.classList.add('menu-open');
    const rect = card.getBoundingClientRect();

    const menu = document.createElement('div');
    menu.className = 'story-status-menu';
    menu.id = 'story-status-menu';
    menu.style.visibility = 'hidden';
    menu.style.position = 'fixed';

    // 将 storyId 从 "6-1" 转换为 "6.1" 格式用于命令
    const storyIdForCommand = storyId.replace('-', '.');

    menu.innerHTML = `
        <div class="status-menu-header">
            <span class="status-menu-title">Story ${escapeHtml(storyId)}</span>
            <button class="status-menu-close" onclick="closeStoryStatusMenu()">✕</button>
        </div>
        <div class="status-menu-options">
            <div class="status-menu-hint">
                <span class="hint-icon">📝</span>
                <span class="hint-text">此故事尚未创建</span>
            </div>
            <div class="status-menu-option create-story" onclick="createStoryFromMenu('${escapeHtml(storyIdForCommand)}')">
                <span class="status-option-icon">✨</span>
                <span class="status-option-label">创建故事</span>
            </div>
        </div>
    `;

    document.body.appendChild(menu);

    // 定位菜单
    requestAnimationFrame(() => {
        const menuRect = menu.getBoundingClientRect();
        let top = rect.top;
        let left = rect.right + 8;

        if (left + menuRect.width > window.innerWidth) {
            left = rect.left - menuRect.width - 8;
        }
        if (left < 0) {
            left = rect.left;
            top = rect.bottom + 8;
        }
        if (top + menuRect.height > window.innerHeight) {
            top = window.innerHeight - menuRect.height - 16;
        }
        if (top < 8) top = 8;
        if (left < 8) left = 8;

        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
        menu.style.visibility = 'visible';
    });

    setTimeout(() => {
        document.addEventListener('click', closeStoryStatusMenu);
    }, 0);
}

/**
 * 从菜单创建故事
 * @param {string} storyId - Story ID (格式: 6.1)
 */
async function createStoryFromMenu(storyId) {
    closeStoryStatusMenu();

    const commandName = `create-story ${storyId}`;

    // 使用统一的发送确认对话框
    if (typeof showSendToClaudeConfirm === 'function') {
        const confirmed = await showSendToClaudeConfirm(commandName, `创建故事 ${storyId}`);
        if (!confirmed) {
            log('用户取消创建故事');
            return;
        }

        try {
            // 先发送切换代理命令
            log('切换到 sm 代理...');
            await sendInputToClaude('/sm', 'send');

            // 等待一小段时间让代理切换完成
            await new Promise(resolve => setTimeout(resolve, 500));

            // 再发送创建故事命令
            const fullCommand = `/${commandName}`;
            const success = await sendInputToClaude(fullCommand, 'send');
            if (success) {
                log('创建故事命令已发送:', fullCommand);
            }
        } catch (e) {
            showToast('命令发送失败，请重试', 'error');
            log('命令发送失败:', e);
        }
    } else {
        showToast('发送功能不可用', 'error');
    }
}

/**
 * 显示 Story 状态选择菜单
 * @param {Event} event - 点击事件
 * @param {string} storyId - Story ID
 * @param {string} currentStatus - 当前状态
 */
function showStoryStatusMenu(event, storyId, currentStatus) {
    event.stopPropagation();

    // 移除已存在的菜单
    closeStoryStatusMenu();

    const card = event.currentTarget;

    // 如果是待办状态，提示创建故事
    if (currentStatus === 'backlog') {
        showBacklogStoryMenu(event, storyId, card);
        return;
    }

    // 隐藏当前卡片的tooltip
    card.classList.add('menu-open');

    const rect = card.getBoundingClientRect();

    // 创建菜单
    const menu = document.createElement('div');
    menu.className = 'story-status-menu';
    menu.id = 'story-status-menu';

    // 先隐藏，计算位置后再显示
    menu.style.visibility = 'hidden';
    menu.style.position = 'fixed';

    const menuHeader = `
        <div class="status-menu-header">
            <span class="status-menu-title">更改状态: ${escapeHtml(storyId)}</span>
            <button class="status-menu-close" onclick="closeStoryStatusMenu()">✕</button>
        </div>
    `;

    const optionsHtml = MANUAL_STATUS_OPTIONS.map(opt => {
        const isActive = opt.value === currentStatus ? 'active' : '';
        return `
            <div class="status-menu-option ${isActive}" onclick="updateStoryStatus('${escapeHtml(storyId)}', '${opt.value}')">
                <span class="status-option-icon">${opt.icon}</span>
                <span class="status-option-label">${opt.label}</span>
                ${isActive ? '<span class="status-option-check">✓</span>' : ''}
            </div>
        `;
    }).join('');

    menu.innerHTML = `
        ${menuHeader}
        <div class="status-menu-options">
            ${optionsHtml}
        </div>
    `;

    document.body.appendChild(menu);

    // 等待渲染后计算位置
    requestAnimationFrame(() => {
        const menuRect = menu.getBoundingClientRect();

        console.log('[Sprint] Card rect:', rect);
        console.log('[Sprint] Menu rect:', menuRect);
        console.log('[Sprint] Window size:', window.innerWidth, window.innerHeight);

        // 默认显示在卡片右侧
        let top = rect.top;
        let left = rect.right + 8;

        // 如果右侧空间不够，显示在左侧
        if (left + menuRect.width > window.innerWidth) {
            left = rect.left - menuRect.width - 8;
        }

        // 如果左侧也不够，显示在卡片下方
        if (left < 0) {
            left = rect.left;
            top = rect.bottom + 8;
        }

        // 确保不超出视窗底部
        if (top + menuRect.height > window.innerHeight) {
            top = window.innerHeight - menuRect.height - 16;
        }

        // 确保不超出视窗顶部
        if (top < 8) {
            top = 8;
        }

        // 确保不超出左边
        if (left < 8) {
            left = 8;
        }

        console.log('[Sprint] Final position:', top, left);

        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
        menu.style.visibility = 'visible';
    });

    // 点击其他地方关闭菜单
    setTimeout(() => {
        document.addEventListener('click', closeStoryStatusMenu);
    }, 0);
}

/**
 * 关闭状态选择菜单
 */
function closeStoryStatusMenu() {
    const menu = document.getElementById('story-status-menu');
    if (menu) {
        menu.remove();
    }
    // 移除所有卡片的 menu-open 类
    document.querySelectorAll('.story-card.menu-open').forEach(card => {
        card.classList.remove('menu-open');
    });
    document.removeEventListener('click', closeStoryStatusMenu);
}

/**
 * 更新 Story 状态
 * @param {string} storyId - Story ID
 * @param {string} newStatus - 新状态
 */
async function updateStoryStatus(storyId, newStatus) {
    closeStoryStatusMenu();

    try {
        const result = await api('/story/update-status', {
            method: 'POST',
            body: JSON.stringify({
                storyId: storyId,
                status: newStatus
            })
        });

        if (result && result.success) {
            const data = result.data || {};
            let msg = `Story ${storyId} 状态已更新为: ${getSprintStatusLabel(newStatus)}`;
            if (data.storyFileDeleted) {
                msg = `Story ${storyId} 已重置为待办，故事文件已删除`;
            } else if (data.storyFileUpdated) {
                msg += '（故事文件已同步）';
            }
            showToast(msg, 'success');
            // 刷新 Sprint 看板
            await renderSprint();
        } else {
            showToast(result?.error?.message || '状态更新失败', 'error');
        }
    } catch (e) {
        log('更新状态失败:', e);
        showToast('状态更新失败', 'error');
    }
}

// 暴露全局函数
window.showStoryStatusMenu = showStoryStatusMenu;
window.closeStoryStatusMenu = closeStoryStatusMenu;
window.updateStoryStatus = updateStoryStatus;
window.showBacklogStoryMenu = showBacklogStoryMenu;
window.createStoryFromMenu = createStoryFromMenu;
