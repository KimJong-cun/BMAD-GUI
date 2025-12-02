/**
 * BMAD GUI - Utility Functions
 * 工具函数
 */

/**
 * Debug logging
 */
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
 * Get CSS class name for workflow status
 * @param {string} status - Status value
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
