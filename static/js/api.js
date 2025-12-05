/**
 * BMAD GUI - API Functions
 * 后端 API 调用函数
 */

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
 * Fetch sprint status from backend
 * @returns {Promise<object|null>} Sprint status data or null on error
 */
async function fetchSprintStatus() {
    console.log('[BMAD] Fetching sprint status...');
    const result = await api('/sprint-status');
    console.log('[BMAD] Sprint status result:', result);
    if (result && result.data) {
        state.sprintStatus = result.data;
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
