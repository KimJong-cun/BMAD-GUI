/**
 * BMAD GUI - Landing Page
 * 首页/项目选择页
 */

/**
 * Render recent projects list
 * @param {Array} projects - Array of project objects
 */
function renderRecentProjects(projects) {
    const container = document.getElementById('recent-projects-list');
    if (!container) return;

    if (!projects || projects.length === 0) {
        container.innerHTML = `
            <div class="recent-projects-empty">
                <div class="recent-projects-empty-icon">📁</div>
                <div class="recent-projects-empty-text">还没有项目，创建一个吧！</div>
            </div>
        `;
        return;
    }

    container.innerHTML = projects.map(project => `
        <div class="recent-project-item" data-path="${escapeHtml(project.path)}">
            <span class="recent-project-icon">📁</span>
            <div class="recent-project-info">
                <div class="recent-project-name">${escapeHtml(project.name)}</div>
                <div class="recent-project-path">${escapeHtml(project.path)}</div>
            </div>
            <div class="recent-project-actions">
                <button class="btn-launch-claude" data-path="${escapeHtml(project.path)}" title="启动 Claude Code">
                    <span class="launch-icon">▶</span>
                </button>
                <span class="recent-project-time">${formatRelativeTime(project.lastOpened)}</span>
            </div>
        </div>
    `).join('');

    // Bind click handlers for project items
    container.querySelectorAll('.recent-project-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.btn-launch-claude')) return;
            handleRecentClick(item.dataset.path);
        });
    });

    // Bind click handlers for launch buttons
    container.querySelectorAll('.btn-launch-claude').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            launchClaudeCode(btn.dataset.path);
        });
    });
}

/**
 * Render landing page (project selection)
 */
function renderLanding() {
    const content = document.getElementById('app-content');
    content.innerHTML = `
        <div class="landing-page">
            <h1 class="landing-title">BMAD GUI</h1>

            <div class="action-cards">
                <div class="action-card" id="create-project-card">
                    <span class="action-card-icon">➕</span>
                    <span class="action-card-label">创建新项目</span>
                </div>
                <div class="action-card" id="import-project-card">
                    <span class="action-card-icon">📂</span>
                    <span class="action-card-label">导入项目</span>
                </div>
            </div>

            <div class="recent-projects">
                <h3 class="recent-projects-title">最近项目</h3>
                <div class="recent-projects-list" id="recent-projects-list">
                    <!-- Populated by loadRecentProjects() -->
                </div>
            </div>
        </div>
    `;

    // Bind event handlers
    document.getElementById('create-project-card').addEventListener('click', handleCreateClick);
    document.getElementById('import-project-card').addEventListener('click', handleImportClick);

    // Load recent projects
    loadRecentProjects();

    log('Rendered: Landing page');
}

/**
 * Load and render recent projects
 */
async function loadRecentProjects() {
    const result = await getRecentProjects();
    if (result && result.success) {
        state.recentProjects = result.data || [];
        renderRecentProjects(state.recentProjects);
    } else {
        renderRecentProjects([]);
    }
}
