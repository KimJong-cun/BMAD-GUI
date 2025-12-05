# BMAD GUI 开发文档

## 项目概述

BMAD GUI 是一个可视化项目管理工具，用于管理 BMAD 方法论的工作流程。它通过 Web 界面与 Claude Code 进行交互，支持任务管理、工作流追踪和命令发送。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.8+, aiohttp (异步 Web 框架) |
| 前端 | Vanilla JavaScript (无框架), HTML5, CSS3 |
| 通信 | REST API, Server-Sent Events (SSE) |
| 进程交互 | pyautogui, pygetwindow, pyperclip (键盘模拟) |

## 项目结构

```
bmad-gui/
├── run.py                 # 启动脚本（自动检查依赖）
├── DEVELOPMENT.md         # 开发文档
│
├── src/                   # Python 源代码
│   ├── __init__.py
│   ├── server.py          # 主入口，路由配置
│   ├── config.py          # 配置常量
│   ├── utils.py           # 工具函数
│   ├── file_ops.py        # 文件操作
│   ├── watchers.py        # 文件监听
│   ├── claude_manager.py  # Claude 进程管理
│   ├── keyboard_sender.py # 键盘模拟发送器
│   │
│   └── handlers/          # API 处理器
│       ├── __init__.py
│       ├── response.py    # 统一响应格式
│       ├── sse.py         # SSE 事件推送
│       ├── project.py     # 项目管理 API
│       ├── agents.py      # Agent API
│       ├── command.py     # 命令执行 API
│       ├── claude.py      # Claude 状态/控制 API
│       └── workflow.py    # 工作流状态 API
│
├── static/                # 前端静态文件
│   ├── index.html         # 主页面
│   ├── style.css          # 主样式入口 (@import)
│   ├── claude-status.js   # Claude 状态模块
│   ├── claude-status.css  # Claude 状态样式
│   │
│   ├── css/               # 模块化 CSS
│   │   ├── variables.css  # CSS 变量
│   │   ├── base.css       # 基础样式
│   │   ├── navigation.css # 导航栏
│   │   ├── toast.css      # 提示消息
│   │   ├── landing.css    # 首页
│   │   ├── wizard.css     # 设置向导
│   │   ├── workflow.css   # 工作流面板
│   │   ├── task-cards.css # 任务卡片
│   │   ├── status-bar.css # 状态栏
│   │   ├── agent-selector.css # Agent 选择器
│   │   ├── sprint.css     # Sprint 看板
│   │   ├── claude-page.css # Claude 页面
│   │   └── responsive.css # 响应式
│   │
│   └── js/                # 模块化 JavaScript
│       ├── config.js      # 配置常量
│       ├── state.js       # 全局状态
│       ├── utils.js       # 工具函数
│       ├── api.js         # API 封装
│       ├── sse.js         # SSE 连接
│       ├── router.js      # 路由管理
│       ├── main.js        # 主入口
│       │
│       ├── components/    # UI 组件
│       │   ├── toast.js   # 提示消息
│       │   ├── workflow.js # 工作流面板
│       │   ├── task-cards.js # 任务卡片
│       │   ├── agent-selector.js # Agent 选择
│       │   ├── sprint.js  # Sprint 看板
│       │   └── wizard.js  # 设置向导
│       │
│       └── pages/         # 页面
│           ├── landing.js # 首页
│           ├── command.js # 指挥部
│           ├── claude.js  # Claude 启动器
│           └── config.js  # 配置页
```

## 后端 API 接口

### 项目管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/project/open` | 打开项目 |
| POST | `/api/project/create` | 创建项目 |
| GET | `/api/recent-projects` | 获取最近项目列表 |
| DELETE | `/api/recent-projects` | 删除最近项目记录 |

### 工作流

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/workflow-status` | 获取工作流状态 |
| GET | `/api/sprint-status` | 获取 Sprint 状态 |

### Agent

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agents` | 获取所有 Agent 列表 |
| GET | `/api/agents/{name}` | 获取 Agent 详情 |

### Claude 控制

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/claude/status` | 获取 Claude 运行状态 |
| POST | `/api/claude/launch` | 在新窗口启动 Claude |
| POST | `/api/claude/send-input` | 发送键盘输入到 Claude |
| GET | `/api/claude/debug` | 调试信息 |

### SSE 事件

| 路径 | 说明 |
|------|------|
| GET | `/api/events` | SSE 事件流 |

**SSE 事件类型：**
- `workflow_update` - 工作流状态更新
- `sprint_update` - Sprint 状态更新
- `claude_status` - Claude 状态变化
- `heartbeat` - 心跳包

## 前端架构

### 全局状态 (state.js)

```javascript
const state = {
    currentProject: null,    // 当前项目
    recentProjects: [],      // 最近项目列表
    currentAgent: null,      // 当前选中的 Agent
    agents: [],              // Agent 列表
    workflowStatus: null,    // 工作流状态
    sprintStatus: null,      // Sprint 状态
    isExecutingCommand: false // 是否正在执行命令
};
```

### 路由 (router.js)

基于 hash 的路由：
- `#/` - 首页 (Landing)
- `#/command` - 指挥部
- `#/claude` - Claude 启动器
- `#/sprint` - Sprint 看板
- `#/config` - 配置页

### API 调用 (api.js)

```javascript
// 通用 API 调用
const result = await api('/endpoint', { method: 'POST', body: JSON.stringify(data) });

// 专用函数
await openProject(path);
await getRecentProjects();
await fetchWorkflowStatus();
```

### 添加新页面

1. 在 `static/js/pages/` 创建页面文件：
```javascript
// pages/mypage.js
function renderMyPage() {
    const content = document.getElementById('app-content');
    content.innerHTML = `<div>My Page Content</div>`;
}
```

2. 在 `router.js` 添加路由：
```javascript
const routes = {
    // ...
    '#/mypage': renderMyPage,
};
```

3. 在 `index.html` 添加导航和脚本引用。

### 添加新组件

1. 在 `static/js/components/` 创建组件文件
2. 在 `static/css/` 创建对应样式文件
3. 在 `style.css` 中 `@import` 样式
4. 在 `index.html` 中引入 JS 文件（注意顺序）

## 后端开发

### 添加新 API 端点

1. 在 `handlers/` 创建或修改处理器：
```python
# handlers/myhandler.py
from aiohttp import web
from .response import success_response, error_response

async def my_handler(request: web.Request) -> web.Response:
    # 处理逻辑
    return success_response({"data": "value"})
```

2. 在 `server.py` 添加路由：
```python
from handlers.myhandler import my_handler

# 在 create_app() 中
app.router.add_get('/api/my-endpoint', my_handler)
```

### 响应格式

```python
# 成功响应
success_response({"key": "value"})
# => {"success": true, "data": {"key": "value"}}

# 错误响应
error_response("ERROR_CODE", "错误描述")
# => {"success": false, "error": "ERROR_CODE", "message": "错误描述"}
```

### SSE 事件推送

```python
from handlers.sse import broadcast_sse_event

# 广播事件
await broadcast_sse_event("event_type", {"key": "value"})
```

## 键盘模拟功能

### 发送文本到 Claude

```python
from keyboard_sender import keyboard_sender

# 发送文本
result = await keyboard_sender.send_text("你好", project_path)

# 发送按键
await keyboard_sender.send_enter(project_path)
await keyboard_sender.send_escape(project_path)
await keyboard_sender.send_ctrl_c(project_path)
```

### 前端调用

```javascript
// 发送文本
await sendInputToClaude("/workflow-status", "send");

// 发送按键
await sendInputToClaude("", "enter");
await sendInputToClaude("", "escape");
await sendInputToClaude("", "ctrl_c");
```

## Claude 状态检测

检测逻辑 (`handlers/claude.py`):
1. 查找窗口标题包含 "claude" 的进程
2. 如果有项目路径，检查窗口标题是否包含项目名
3. 返回 `match_type`: "project" (匹配当前项目) 或 "global" (其他项目)

## 常见开发任务

### 添加新的任务卡片操作

修改 `static/js/components/task-cards.js`:
```javascript
async function handleTaskCardClick(commandName) {
    // 添加确认对话框
    const confirmed = await showSendToClaudeConfirm(commandName, label);
    if (!confirmed) return;

    // 发送到 Claude
    await sendInputToClaude(`/${commandName}`, 'send');
}
```

### 添加新的 Agent

1. 在 `.bmad/agents/` 目录创建 agent 配置文件
2. Agent 会自动被 `/api/agents` 接口读取

### 修改 CSS 变量

编辑 `static/css/variables.css`:
```css
:root {
    --accent-orange: #FE8019;
    --bg-primary: #1a1a2e;
    /* ... */
}
```

## 调试技巧

### 后端日志

```python
import logging
logger = logging.getLogger("bmad-gui")
logger.info("调试信息")
logger.error("错误信息")
```

### 前端日志

```javascript
function log(...args) {
    console.log('[BMAD]', ...args);
}
```

### Claude 状态调试

访问 `/api/claude/debug` 查看详细的进程检测信息。

## 依赖安装

```bash
# 必需
pip install aiohttp watchdog pyyaml

# 键盘模拟（可选）
pip install pyautogui pygetwindow pyperclip pywin32
```

## 启动方式

```bash
# 推荐方式：使用启动脚本（自动检查依赖）
python run.py

# 直接启动（需要先安装依赖）
cd src && python server.py

# 指定端口
python run.py --port 8080

# 调试模式
python run.py --debug

# 不打开浏览器
python run.py --no-browser
```

### 启动脚本功能 (run.py)
- 检查 Python 版本 (>= 3.8)
- 自动检查并安装缺失的必需依赖
- 询问是否安装可选依赖（键盘模拟功能）
- 启动 Web 服务器

## 文件加载顺序

**CSS (style.css @import 顺序):**
1. variables.css
2. base.css
3. 其他组件样式

**JS (index.html 加载顺序):**
1. config.js (常量)
2. state.js (状态)
3. utils.js (工具)
4. api.js (API)
5. components/*.js (组件)
6. pages/*.js (页面)
7. router.js (路由)
8. sse.js (SSE)
9. main.js (入口)

## 注意事项

1. **JS 无模块系统** - 使用全局变量，注意加载顺序
2. **异步操作** - 后端使用 async/await，前端使用 Promise
3. **中文支持** - 键盘模拟使用剪贴板方式支持中文
4. **Windows 特性** - 窗口激活使用 win32 API 绕过限制
5. **SSE 重连** - 断开后自动重连，间隔 3 秒
