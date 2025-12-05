/**
 * BMAD GUI - Toast Component
 * Toast 通知组件
 */

/**
 * Show a toast notification
 * @param {string} message - Toast message
 * @param {string} type - Toast type: 'success' | 'warning' | 'error' | 'info'
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);

    log('Toast:', type, message);
}

/**
 * 在新窗口中启动 Claude Code
 * @param {string} projectPath - 项目路径
 * @param {boolean} dangerousMode - 是否使用危险模式
 */
async function launchClaudeCode(projectPath, dangerousMode = false) {
    const modeLabel = dangerousMode ? '危险模式' : '标准模式';
    try {
        showToast(`正在启动 Claude Code (${modeLabel})...`, 'info');

        const response = await fetch('/api/claude/launch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: projectPath, dangerousMode })
        });

        const result = await response.json();
        if (result.success) {
            showToast(`Claude Code (${modeLabel}) 已在新窗口中启动`, 'success');
        } else {
            showToast(result.error?.message || '启动失败', 'error');
        }
    } catch (error) {
        log('Launch Claude Code error:', error);
        showToast('启动 Claude Code 失败', 'error');
    }
}

// 暴露给全局
window.launchClaudeCode = launchClaudeCode;
