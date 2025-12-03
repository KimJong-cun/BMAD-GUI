/**
 * BMAD GUI - Workflow Component
 * 工作流面板组件
 */

// Tooltip state
let tooltipTimeout = null;

// Track currently expanded phase
let expandedPhaseId = null;

/**
 * Render a single workflow node
 * @param {object} phase - Phase data object
 * @returns {string} HTML string for the node
 */
function renderWorkflowNode(phase) {
    const statusClass = getStatusClass(phase.status);
    const statusIcon = getStatusIcon(phase.status);
    const completedCount = phase.completedCount || 0;

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

/**
 * Show tooltip for a workflow node
 * @param {HTMLElement} nodeElement - The node element
 * @param {object} phase - Phase data
 */
function showTooltip(nodeElement, phase) {
    hideTooltip();

    const inProgressWorkflow = phase.workflows?.find(w => w.status === 'in_progress');
    const inProgressText = inProgressWorkflow
        ? `<div class="tooltip-row">进行中: ${escapeHtml(inProgressWorkflow.name)}</div>`
        : '';

    const tooltip = document.createElement('div');
    tooltip.className = 'workflow-tooltip';
    tooltip.innerHTML = `
        <div class="tooltip-title">${escapeHtml(phase.name)}</div>
        <div class="tooltip-row">状态: ${getStatusLabel(phase.status)}</div>
        <div class="tooltip-row">完成: ${phase.completedCount || 0} / ${phase.totalCount || 0}</div>
        ${inProgressText}
    `;

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

/**
 * Render phase detail panel
 * @param {object} phase - Phase data
 * @returns {string} HTML string for detail panel
 */
function renderPhaseDetail(phase) {
    // Implementation 阶段使用 Story 执行面板
    // 使用 == 进行宽松比较，因为 id 可能是字符串或数字
    if (phase.id == 3 && typeof renderStoryExecutionPanel === 'function') {
        console.log('[BMAD] Rendering Story Execution Panel for phase:', phase);
        return renderStoryExecutionPanel(phase);
    }
    console.log('[BMAD] Rendering normal phase detail:', phase.id, phase.name);

    let contentHtml = '';

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
    closePhaseDetail();

    const panel = document.querySelector('.workflow-panel');
    const detailHtml = renderPhaseDetail(phase);
    panel.insertAdjacentHTML('afterend', detailHtml);

    expandedPhaseId = phase.id;

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

    document.querySelectorAll('.workflow-node').forEach(node => {
        node.classList.remove('active');
    });
}

/**
 * Bind click events to workflow nodes for detail panel
 */
function bindNodeClickEvents() {
    const nodes = document.querySelectorAll('.workflow-node');

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
            console.log('[BMAD] Node clicked, index:', index, 'phase:', phase);
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

    const phases = hasWorkflowData
        ? [initPhase, ...data.phases]
        : [initPhase, ...defaultPhases];

    const nodesHtml = phases.map((phase, index) => {
        const nodeHtml = renderWorkflowNode(phase);
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
