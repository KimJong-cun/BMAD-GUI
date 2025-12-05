/**
 * BMAD GUI - Setup Wizard Component
 * 设置向导组件
 */

/**
 * Render progress bar for wizard
 * @param {number} currentStep - Current step (1-4)
 * @param {number} totalSteps - Total steps
 */
function renderProgressBar(currentStep, totalSteps) {
    const steps = [];
    const stepLabels = ['选择文件夹', '基础配置', '选择模块', '确认创建'];

    for (let i = 1; i <= totalSteps; i++) {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;
        const statusClass = isCompleted ? 'completed' : (isCurrent ? 'current' : 'pending');

        steps.push(`
            <div class="progress-step ${statusClass}">
                <div class="progress-step-circle">${i}</div>
                <div class="progress-step-label">${stepLabels[i - 1]}</div>
            </div>
            ${i < totalSteps ? `<div class="progress-line ${isCompleted ? 'completed' : ''}"></div>` : ''}
        `);
    }

    return `
        <div class="wizard-progress">
            <div class="progress-header">Step ${currentStep}/${totalSteps}</div>
            <div class="progress-steps">${steps.join('')}</div>
        </div>
    `;
}

/**
 * Navigate to next wizard step
 */
function nextStep() {
    if (state.setupWizard.step < 4) {
        state.setupWizard.step++;
        renderSetup();
    }
}

/**
 * Navigate to previous wizard step
 */
function prevStep() {
    if (state.setupWizard.step > 1) {
        state.setupWizard.step--;
        renderSetup();
    }
}

/**
 * Reset wizard state
 */
function resetWizard() {
    state.setupWizard = {
        step: 1,
        path: '',
        config: {
            user_name: '',
            communication_language: 'Chinese',
            output_folder: 'md/'
        },
        modules: ['bmm', 'core'],
        isCreating: false
    };
}

/**
 * Render Step 1 - Select Folder
 */
function renderSetupStep1() {
    const wizard = state.setupWizard;
    const canProceed = wizard.path.trim() !== '';

    return `
        <div class="wizard-step-content">
            <h2 class="wizard-step-title">选择项目文件夹</h2>
            <p class="wizard-step-desc">请输入要创建 BMAD 项目的目录路径</p>

            <div class="form-group">
                <label class="form-label">项目路径</label>
                <input type="text"
                    class="form-input"
                    id="project-path-input"
                    placeholder="例如: C:/Projects/my-project"
                    value="${escapeHtml(wizard.path)}"
                />
                <p class="form-hint">请输入完整的目录路径。该目录必须已存在且不能包含 .bmad 文件夹。</p>
            </div>

            <div class="wizard-actions">
                <button class="btn btn-secondary" onclick="location.hash='#/'">取消</button>
                <button class="btn btn-primary" id="btn-next" ${canProceed ? '' : 'disabled'}>下一步</button>
            </div>
        </div>
    `;
}

/**
 * Render Step 2 - Basic Configuration
 */
function renderSetupStep2() {
    const wizard = state.setupWizard;
    const canProceed = wizard.config.user_name.trim() !== '';

    return `
        <div class="wizard-step-content">
            <h2 class="wizard-step-title">基础配置</h2>
            <p class="wizard-step-desc">设置项目的基本信息</p>

            <div class="form-group">
                <label class="form-label">用户名 <span class="required">*</span></label>
                <input type="text"
                    class="form-input"
                    id="user-name-input"
                    placeholder="输入您的用户名"
                    value="${escapeHtml(wizard.config.user_name)}"
                />
            </div>

            <div class="form-group">
                <label class="form-label">通讯语言</label>
                <select class="form-select" id="language-select">
                    <option value="Chinese" ${wizard.config.communication_language === 'Chinese' ? 'selected' : ''}>中文</option>
                    <option value="English" ${wizard.config.communication_language === 'English' ? 'selected' : ''}>English</option>
                </select>
            </div>

            <div class="form-group">
                <label class="form-label">输出目录</label>
                <input type="text"
                    class="form-input"
                    id="output-folder-input"
                    placeholder="md/"
                    value="${escapeHtml(wizard.config.output_folder)}"
                />
                <p class="form-hint">存放生成文档的目录，相对于项目根目录</p>
            </div>

            <div class="wizard-actions">
                <button class="btn btn-secondary" id="btn-prev">上一步</button>
                <button class="btn btn-primary" id="btn-next" ${canProceed ? '' : 'disabled'}>下一步</button>
            </div>
        </div>
    `;
}

/**
 * Render Step 3 - Select Modules
 */
function renderSetupStep3() {
    const wizard = state.setupWizard;
    const canProceed = wizard.modules.length > 0;

    return `
        <div class="wizard-step-content">
            <h2 class="wizard-step-title">选择模块</h2>
            <p class="wizard-step-desc">选择要安装的 BMAD 模块</p>

            <div class="module-cards">
                <label class="module-card ${wizard.modules.includes('bmm') ? 'selected' : ''}">
                    <input type="checkbox"
                        class="module-checkbox"
                        value="bmm"
                        ${wizard.modules.includes('bmm') ? 'checked' : ''}
                    />
                    <div class="module-card-content">
                        <div class="module-card-title">BMM</div>
                        <div class="module-card-desc">核心方法论模块，包含 Agents 和 Workflows</div>
                    </div>
                </label>

                <label class="module-card ${wizard.modules.includes('core') ? 'selected' : ''}">
                    <input type="checkbox"
                        class="module-checkbox"
                        value="core"
                        ${wizard.modules.includes('core') ? 'checked' : ''}
                    />
                    <div class="module-card-content">
                        <div class="module-card-title">Core</div>
                        <div class="module-card-desc">基础工具模块，提供核心功能</div>
                    </div>
                </label>
            </div>

            <p class="form-hint" style="margin-top: 16px; text-align: center;">至少需要选择一个模块</p>

            <div class="wizard-actions">
                <button class="btn btn-secondary" id="btn-prev">上一步</button>
                <button class="btn btn-primary" id="btn-next" ${canProceed ? '' : 'disabled'}>下一步</button>
            </div>
        </div>
    `;
}

/**
 * Render Step 4 - Confirm and Create
 */
function renderSetupStep4() {
    const wizard = state.setupWizard;
    const languageLabel = wizard.config.communication_language === 'Chinese' ? '中文' : 'English';

    return `
        <div class="wizard-step-content">
            <h2 class="wizard-step-title">确认并创建</h2>
            <p class="wizard-step-desc">请确认以下配置信息</p>

            <div class="summary-card">
                <div class="summary-item">
                    <span class="summary-label">项目路径</span>
                    <span class="summary-value">${escapeHtml(wizard.path)}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">用户名</span>
                    <span class="summary-value">${escapeHtml(wizard.config.user_name)}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">通讯语言</span>
                    <span class="summary-value">${languageLabel}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">输出目录</span>
                    <span class="summary-value">${escapeHtml(wizard.config.output_folder)}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">安装模块</span>
                    <span class="summary-value">${wizard.modules.join(', ')}</span>
                </div>
            </div>

            <div class="wizard-actions">
                <button class="btn btn-secondary" id="btn-prev" ${wizard.isCreating ? 'disabled' : ''}>上一步</button>
                <button class="btn btn-primary btn-create" id="btn-create" ${wizard.isCreating ? 'disabled' : ''}>
                    ${wizard.isCreating ? '<span class="spinner"></span> 创建中...' : '创建项目'}
                </button>
            </div>
        </div>
    `;
}

/**
 * Render setup wizard page
 */
function renderSetup() {
    const content = document.getElementById('app-content');
    const wizard = state.setupWizard;

    let stepContent = '';
    switch (wizard.step) {
        case 1:
            stepContent = renderSetupStep1();
            break;
        case 2:
            stepContent = renderSetupStep2();
            break;
        case 3:
            stepContent = renderSetupStep3();
            break;
        case 4:
            stepContent = renderSetupStep4();
            break;
    }

    content.innerHTML = `
        <div class="setup-wizard">
            ${renderProgressBar(wizard.step, 4)}
            <div class="wizard-container">
                ${stepContent}
            </div>
        </div>
    `;

    bindWizardEvents();

    log('Rendered: Setup wizard step', wizard.step);
}

/**
 * Bind event handlers for wizard
 */
function bindWizardEvents() {
    const wizard = state.setupWizard;

    if (wizard.step === 1) {
        const pathInput = document.getElementById('project-path-input');
        const btnNext = document.getElementById('btn-next');

        if (pathInput) {
            pathInput.addEventListener('input', (e) => {
                wizard.path = e.target.value;
                btnNext.disabled = wizard.path.trim() === '';
            });
        }

        if (btnNext) {
            btnNext.addEventListener('click', nextStep);
        }
    }

    if (wizard.step === 2) {
        const userNameInput = document.getElementById('user-name-input');
        const languageSelect = document.getElementById('language-select');
        const outputFolderInput = document.getElementById('output-folder-input');
        const btnPrev = document.getElementById('btn-prev');
        const btnNext = document.getElementById('btn-next');

        if (userNameInput) {
            userNameInput.addEventListener('input', (e) => {
                wizard.config.user_name = e.target.value;
                btnNext.disabled = wizard.config.user_name.trim() === '';
            });
        }

        if (languageSelect) {
            languageSelect.addEventListener('change', (e) => {
                wizard.config.communication_language = e.target.value;
            });
        }

        if (outputFolderInput) {
            outputFolderInput.addEventListener('input', (e) => {
                wizard.config.output_folder = e.target.value || 'md/';
            });
        }

        if (btnPrev) btnPrev.addEventListener('click', prevStep);
        if (btnNext) btnNext.addEventListener('click', nextStep);
    }

    if (wizard.step === 3) {
        const moduleCheckboxes = document.querySelectorAll('.module-checkbox');
        const btnPrev = document.getElementById('btn-prev');
        const btnNext = document.getElementById('btn-next');

        moduleCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const checked = Array.from(document.querySelectorAll('.module-checkbox:checked'))
                    .map(cb => cb.value);
                wizard.modules = checked;
                btnNext.disabled = checked.length === 0;

                document.querySelectorAll('.module-card').forEach(card => {
                    const cb = card.querySelector('.module-checkbox');
                    card.classList.toggle('selected', cb.checked);
                });
            });
        });

        if (btnPrev) btnPrev.addEventListener('click', prevStep);
        if (btnNext) btnNext.addEventListener('click', nextStep);
    }

    if (wizard.step === 4) {
        const btnPrev = document.getElementById('btn-prev');
        const btnCreate = document.getElementById('btn-create');

        if (btnPrev) btnPrev.addEventListener('click', prevStep);
        if (btnCreate) btnCreate.addEventListener('click', handleCreateProject);
    }
}

/**
 * Handle project creation
 */
async function handleCreateProject() {
    const wizard = state.setupWizard;

    if (wizard.isCreating) return;

    wizard.isCreating = true;
    renderSetup();

    const result = await createProject(wizard.path, wizard.config, wizard.modules);

    if (result && result.success) {
        state.currentProject = result.data;
        showToast(`项目创建成功: ${result.data.name}`, 'success');
        resetWizard();
        location.hash = '#/command';
    } else {
        wizard.isCreating = false;
        renderSetup();
    }
}
