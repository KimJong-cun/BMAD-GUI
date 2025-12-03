/**
 * BMAD GUI - Command Center Page
 * 指挥部页面
 */

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

    // 并行加载工作流数据、Sprint 数据和 Agent 数据
    await Promise.all([
        fetchWorkflowStatus(),
        fetchSprintStatus(),
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
