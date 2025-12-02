/**
 * BMAD GUI - Configuration
 * 常量和配置项
 */

const DEBUG = location.hostname === 'localhost';
const API_BASE_URL = '/api';

// Agent 中文名称映射
const AGENT_CN_NAMES = {
    'analyst': '业务分析师',
    'architect': '架构师',
    'dev': '开发工程师',
    'pm': '产品经理',
    'sm': '敏捷教练',
    'ux-designer': 'UX 设计师',
    'tech-writer': '技术文档',
    'tea': '测试架构师'
};

// Agent 中文描述映射
const AGENT_CN_DESC = {
    'analyst': '需求梳理与业务建模',
    'architect': '系统设计与技术选型',
    'dev': '编码实现与单元测试',
    'pm': '产品规划与需求管理',
    'sm': '迭代管理与故事拆分',
    'ux-designer': '交互设计与原型绘制',
    'tech-writer': '文档编写与知识沉淀',
    'tea': '测试策略与质量保障'
};

// 命令名称的中文映射
const COMMAND_LABELS_ZH = {
    // SM (敏捷教练) 命令
    'workflow-status': '查看进度',
    'workflow-init': '开始新项目',
    'sprint-planning': '迭代规划',
    'create-epic-tech-context': 'Epic 技术方案',
    'validate-epic-tech-context': '校验技术方案',
    'create-story': '编写故事',
    'validate-create-story': '校验故事',
    'create-story-context': '生成故事上下文',
    'validate-create-story-context': '校验故事上下文',
    'story-ready-for-dev': '就绪交付',
    'epic-retrospective': 'Epic 复盘',
    'correct-course': '方向调整',
    'party-mode': '团队协作',

    // PM (产品经理) 命令
    'brainstorm-project': '头脑风暴',
    'research': '调研分析',
    'product-brief': '产品概要',
    'prd': '需求文档',
    'create-prd': '编写需求文档',
    'validate-prd': '校验需求文档',
    'tech-spec': '技术规格',
    'validate-tech-spec': '校验技术规格',

    // Architect (架构师) 命令
    'architecture': '架构设计',
    'create-architecture': '编写架构',
    'validate-architecture': '校验架构',
    'implementation-readiness': '交付评审',
    'create-epics-and-stories': '拆分 Epic',

    // Dev (开发工程师) 命令
    'dev-story': '开发故事',
    'develop-story': '开发故事',
    'code-review': '代码评审',
    'story-done': '标记完成',

    // UX Designer 命令
    'create-ux-design': '体验设计',
    'validate-design': '校验设计',
    'create-excalidraw-wireframe': '绘制原型',
    'create-excalidraw-diagram': '绘制架构图',
    'create-excalidraw-flowchart': '绘制流程图',
    'create-excalidraw-dataflow': '绘制数据流',

    // TEA (测试架构师) 命令
    'framework': '搭建框架',
    'atdd': 'E2E 测试',
    'automate': '自动化测试',
    'test-design': '测试设计',
    'trace': '需求追溯',
    'nfr-assess': '非功能验收',
    'ci': 'CI/CD 配置',
    'test-review': '测试评审',

    // Analyst (业务分析师) 命令
    'document-project': '项目文档化',

    // Tech Writer (技术文档) 命令
    'create-api-docs': 'API 文档',
    'create-architecture-docs': '架构文档',
    'create-user-guide': '用户指南',
    'audit-docs': '文档审计',
    'generate-mermaid': '生成流程图',
    'validate-doc': '校验文档',
    'improve-readme': '优化 README',
    'explain-concept': '概念讲解',
    'standards-guide': '文档规范',

    // 通用命令
    'help': '帮助',
    'exit': '退出'
};
