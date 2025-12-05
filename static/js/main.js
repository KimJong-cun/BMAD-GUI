/**
 * BMAD GUI - Main Entry Point
 * 主入口和初始化
 */

// =============================================================================
// Event Handlers
// =============================================================================

/**
 * Handle tab click - navigate to route
 * @param {Event} event - Click event
 */
function handleTabClick(event) {
    const route = event.target.dataset.route;
    if (route) {
        location.hash = route;
        log('Tab clicked:', route);
    }
}

/**
 * Handle "Create Project" card click
 */
function handleCreateClick() {
    resetWizard();
    location.hash = '#/setup';
    log('Create project clicked');
}

/**
 * Handle "Import Project" card click - show path input dialog
 */
function handleImportClick() {
    showImportDialog();
    log('Import project clicked');
}

/**
 * 显示导入项目对话框
 */
function showImportDialog() {
    // 移除已存在的对话框
    const existing = document.getElementById('import-dialog-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'import-dialog-overlay';
    overlay.className = 'import-dialog-overlay';
    overlay.innerHTML = `
        <div class="import-dialog">
            <div class="import-dialog-header">
                <span class="import-dialog-title">导入项目</span>
                <button class="import-dialog-close" onclick="closeImportDialog()">✕</button>
            </div>
            <div class="import-dialog-body">
                <label class="import-dialog-label">请输入项目路径：</label>
                <input type="text" id="import-path-input" class="import-dialog-input"
                    placeholder="例如: C:\\Users\\xxx\\Desktop\\my-project"
                    autocomplete="off">
                <p class="import-dialog-hint">项目目录需包含 .bmad 文件夹</p>
            </div>
            <div class="import-dialog-footer">
                <button class="import-dialog-btn cancel" onclick="closeImportDialog()">取消</button>
                <button class="import-dialog-btn confirm" onclick="confirmImportProject()">导入</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // 聚焦输入框
    setTimeout(() => {
        const input = document.getElementById('import-path-input');
        if (input) {
            input.focus();
            // 回车确认
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') confirmImportProject();
                if (e.key === 'Escape') closeImportDialog();
            });
        }
    }, 100);

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeImportDialog();
    });
}

/**
 * 关闭导入对话框
 */
function closeImportDialog() {
    const overlay = document.getElementById('import-dialog-overlay');
    if (overlay) overlay.remove();
}

/**
 * 确认导入项目
 */
async function confirmImportProject() {
    const input = document.getElementById('import-path-input');
    if (!input) return;

    const projectPath = input.value.trim();
    if (!projectPath) {
        showToast('请输入项目路径', 'error');
        return;
    }

    closeImportDialog();

    // 调用后端打开项目
    const result = await openProject(projectPath);
    if (result && result.success) {
        state.currentProject = result.data;
        showToast(`已打开项目: ${result.data.name}`, 'success');
        location.hash = '#/command';
    } else {
        showToast(result?.error?.message || '无法打开项目，请检查路径是否正确', 'error');
    }
}

// 暴露全局函数
window.showImportDialog = showImportDialog;
window.closeImportDialog = closeImportDialog;
window.confirmImportProject = confirmImportProject;

/**
 * Handle folder selection from file input (备用)
 * @param {Event} event - Change event from file input
 */
async function handleFolderSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    event.target.value = '';
    // 由于浏览器限制无法获取完整路径，显示输入对话框
    showImportDialog();
}

/**
 * Handle recent project item click
 * @param {string} projectPath - Path to the project
 */
async function handleRecentClick(projectPath) {
    log('Recent project clicked:', projectPath);

    const result = await openProject(projectPath);
    if (result && result.success) {
        state.currentProject = result.data;
        showToast(`已打开项目: ${result.data.name}`, 'success');
        location.hash = '#/command';
    } else {
        state.recentProjects = state.recentProjects.filter(p => p.path !== projectPath);
        renderRecentProjects(state.recentProjects);
        await removeRecentProject(projectPath);
        log('Removed invalid project from list:', projectPath);
    }
}

/**
 * 返回欢迎页面（关闭当前项目）
 */
function goHome() {
    state.currentProject = null;
    state.workflowStatus = null;
    disconnectSSE();
    location.hash = '#/';
    log('Returned to home');
}

// 暴露给全局
window.goHome = goHome;

// =============================================================================
// Initialization
// =============================================================================

/**
 * 初始化应用 - 加载最近项目并自动恢复上次打开的项目
 */
async function initApp() {
    log('BMAD GUI initialized');

    // Bind folder input change handler
    document.getElementById('folder-input').addEventListener('change', handleFolderSelect);

    // Bind nav-brand click to go home
    const navBrand = document.querySelector('.nav-brand');
    if (navBrand) {
        navBrand.style.cursor = 'pointer';
        navBrand.addEventListener('click', goHome);
    }

    // 加载最近项目列表
    const result = await getRecentProjects();
    if (result && result.success && result.data && result.data.length > 0) {
        state.recentProjects = result.data;

        // 自动打开最近的项目
        const lastProject = result.data[0];
        if (lastProject && lastProject.path) {
            const openResult = await openProject(lastProject.path);
            if (openResult && openResult.success) {
                state.currentProject = openResult.data;
                log('Auto-loaded last project:', lastProject.path);
            }
        }
    }

    // 初始化 Claude 状态模块
    if (typeof initClaudeStatus === 'function') {
        initClaudeStatus();
    }

    // Render initial tabs
    renderTabs();

    // Handle initial route
    handleRoute();
}

document.addEventListener('DOMContentLoaded', initApp);
