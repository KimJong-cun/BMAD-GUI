/**
 * BMAD GUI - SSE Functions
 * Server-Sent Events 连接管理
 */

// SSE 重连配置
const SSE_RECONNECT_DELAY = 3000;
const SSE_MAX_RECONNECT_ATTEMPTS = 10;
let sseReconnectAttempts = 0;
let sseReconnectTimeout = null;

/**
 * 连接 SSE 事件流
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
            sseReconnectAttempts = 0;
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
    const delay = SSE_RECONNECT_DELAY * Math.min(sseReconnectAttempts, 3);

    log(`将在 ${delay}ms 后重连 (第 ${sseReconnectAttempts} 次)`);

    sseReconnectTimeout = setTimeout(() => {
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
    state.workflowStatus = data;

    if (location.hash !== '#/command') {
        return;
    }

    const currentExpandedPhaseId = expandedPhaseId;

    // 重新渲染工作流面板
    const workflowPanelContainer = document.querySelector('.workflow-panel');
    if (workflowPanelContainer) {
        const oldNodes = document.querySelectorAll('.workflow-node');
        const oldStatuses = Array.from(oldNodes).map(node => ({
            id: node.dataset.phaseId,
            status: node.className
        }));

        workflowPanelContainer.outerHTML = renderWorkflowPanel();

        bindTooltipEvents();
        bindNodeClickEvents();

        const newNodes = document.querySelectorAll('.workflow-node');
        newNodes.forEach((node, index) => {
            const oldStatus = oldStatuses[index];
            if (oldStatus && oldStatus.status !== node.className) {
                node.classList.add('pulse');
                setTimeout(() => {
                    node.classList.remove('pulse');
                }, 1000);
            }
        });
    }

    if (currentExpandedPhaseId !== null) {
        const phase = data.phases?.find(p => p.id == currentExpandedPhaseId);
        if (phase) {
            showPhaseDetail(phase);
        }
    }

    // 刷新状态栏和任务卡片
    const statusBar = document.querySelector('.status-bar');
    if (statusBar) {
        statusBar.outerHTML = renderStatusBar();
    }

    const taskCardsContainer = document.querySelector('.task-cards-container');
    if (taskCardsContainer) {
        taskCardsContainer.outerHTML = renderTaskCards();
    }

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
    state.sprintStatus = data;

    // 刷新 Story 执行面板（如果在 command 页面且展开了 Implementation 阶段）
    if (location.hash === '#/command') {
        const storyPanel = document.querySelector('.story-execution-panel');
        if (storyPanel && typeof refreshStoryPanel === 'function') {
            refreshStoryPanel();
            log('Story 面板已刷新');
        }
    }

    if (location.hash !== '#/sprint') {
        return;
    }

    renderSprint();
    showToast('Sprint 状态已更新', 'info');
    log('Sprint 界面已更新');
}
