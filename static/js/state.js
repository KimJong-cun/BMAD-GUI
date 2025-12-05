/**
 * BMAD GUI - State Management
 * 全局状态管理
 */

const state = {
    currentProject: null,
    workflowStatus: null,
    sprintStatus: null,
    implementationFlow: null,
    config: null,
    recentProjects: [],
    sseConnection: null,
    // Agent 相关状态
    agents: [],
    currentAgent: null,
    isExecutingCommand: false,
    // Story 相关状态
    activeStory: null,
    setupWizard: {
        step: 1,
        path: '',
        config: {
            user_name: '',
            communication_language: 'Chinese',
            output_folder: 'md/'
        },
        modules: ['bmm', 'core'],
        isCreating: false
    }
};
