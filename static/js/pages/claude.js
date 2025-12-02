/**
 * BMAD GUI - Claude Launcher Page
 * Claude Code 启动器页面
 */

/**
 * 发送输入到 Claude 窗口
 * @param {string} text - 要发送的文本
 * @param {string} action - 操作类型: send, enter, escape, ctrl_c
 */
async function sendInputToClaude(text = '', action = 'send') {
    try {
        const response = await fetch('/api/claude/send-input', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, action })
        });
        const result = await response.json();

        if (result.success) {
            if (action === 'send') {
                showToast(`已发送到 Claude: ${result.data.window_title}`, 'success');
            } else {
                showToast(result.data.message, 'success');
            }
            return true;
        } else {
            showToast(result.message || '发送失败', 'error');
            return false;
        }
    } catch (e) {
        console.error('发送失败:', e);
        showToast('发送失败: ' + e.message, 'error');
        return false;
    }
}

/**
 * Render Claude Code launcher page
 */
function renderClaude() {
    const content = document.getElementById('app-content');

    // 获取当前项目路径
    const currentPath = state.currentProject?.path || state.recentProjects?.[0]?.path || '';
    const projectName = state.currentProject?.name || state.recentProjects?.[0]?.name || '未选择项目';

    content.innerHTML = `
        <div class="claude-page">
            <div class="claude-header">
                <h2>Claude Code 启动器</h2>
                <p class="claude-subtitle">在当前项目目录下启动 Claude Code 终端</p>
            </div>

            <div class="claude-project-info">
                <span class="claude-project-label">当前项目：</span>
                <span class="claude-project-name">${escapeHtml(projectName)}</span>
                <span class="claude-project-path">${escapeHtml(currentPath)}</span>
            </div>

            <div class="claude-launch-cards">
                <div class="claude-launch-card claude-launch-standard" id="launch-standard">
                    <div class="claude-launch-icon">▶</div>
                    <div class="claude-launch-content">
                        <h3>标准模式</h3>
                        <p>正常启动 Claude Code，需要确认每个操作</p>
                        <code>claude</code>
                    </div>
                </div>

                <div class="claude-launch-card claude-launch-dangerous" id="launch-dangerous">
                    <div class="claude-launch-icon">⚡</div>
                    <div class="claude-launch-content">
                        <h3>危险模式</h3>
                        <p>跳过权限检查，自动执行所有操作</p>
                        <code>claude --dangerously-skip-permissions</code>
                    </div>
                    <div class="claude-launch-warning">
                        ⚠️ 谨慎使用：此模式会自动执行所有文件操作
                    </div>
                </div>
            </div>

            <div class="claude-input-section">
                <h3>发送命令到 Claude</h3>
                <p class="claude-input-hint">通过键盘模拟向已运行的 Claude 窗口发送命令</p>

                <div class="claude-input-wrapper">
                    <textarea
                        id="claude-input-text"
                        class="claude-input-textarea"
                        placeholder="输入要发送给 Claude 的命令或问题..."
                        rows="4"
                    ></textarea>

                    <div class="claude-input-actions">
                        <button class="claude-btn claude-btn-primary" id="btn-send-input">
                            发送
                        </button>
                        <div class="claude-btn-group">
                            <button class="claude-btn claude-btn-secondary" id="btn-send-enter" title="发送回车键">
                                Enter
                            </button>
                            <button class="claude-btn claude-btn-secondary" id="btn-send-escape" title="发送 ESC 键">
                                ESC
                            </button>
                            <button class="claude-btn claude-btn-danger" id="btn-send-ctrlc" title="发送 Ctrl+C 中断">
                                Ctrl+C
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Bind launch handlers
    document.getElementById('launch-standard')?.addEventListener('click', () => {
        if (!currentPath) {
            showToast('请先选择一个项目', 'warning');
            return;
        }
        launchClaudeCode(currentPath, false);
    });

    document.getElementById('launch-dangerous')?.addEventListener('click', () => {
        if (!currentPath) {
            showToast('请先选择一个项目', 'warning');
            return;
        }
        launchClaudeCode(currentPath, true);
    });

    // Bind input handlers
    const inputTextarea = document.getElementById('claude-input-text');

    document.getElementById('btn-send-input')?.addEventListener('click', async () => {
        const text = inputTextarea?.value?.trim();
        if (!text) {
            showToast('请输入要发送的内容', 'warning');
            return;
        }
        const success = await sendInputToClaude(text, 'send');
        if (success) {
            inputTextarea.value = '';
        }
    });

    document.getElementById('btn-send-enter')?.addEventListener('click', () => {
        sendInputToClaude('', 'enter');
    });

    document.getElementById('btn-send-escape')?.addEventListener('click', () => {
        sendInputToClaude('', 'escape');
    });

    document.getElementById('btn-send-ctrlc')?.addEventListener('click', () => {
        sendInputToClaude('', 'ctrl_c');
    });

    // Ctrl+Enter to send
    inputTextarea?.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btn-send-input')?.click();
        }
    });

    log('Rendered: Claude launcher');
}

// 暴露到全局
window.sendInputToClaude = sendInputToClaude;
