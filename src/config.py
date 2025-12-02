"""
BMAD GUI - Configuration
配置常量和错误码定义
"""

from pathlib import Path

# 服务器配置
DEFAULT_PORT = 8765

# 目录配置 (src 在项目根目录下，所以需要 parent.parent)
PROJECT_ROOT = Path(__file__).parent.parent
STATIC_DIR = PROJECT_ROOT / "static"
DATA_DIR = PROJECT_ROOT / "data"
BMAD_TEMPLATE_DIR = PROJECT_ROOT.parent / ".bmad"
CLAUDE_TEMPLATE_DIR = PROJECT_ROOT.parent / ".claude"

# 最近项目配置
RECENT_PROJECTS_FILE = DATA_DIR / "recent-projects.json"
MAX_RECENT_PROJECTS = 10

# 错误码定义
ERROR_CODES = {
    "NOT_BMAD_PROJECT": 400,
    "FILE_NOT_FOUND": 404,
    "PARSE_ERROR": 500,
    "INVALID_PATH": 400,
    "ALREADY_EXISTS": 400,
    "CREATE_FAILED": 500,
    "PERMISSION_DENIED": 403,
}

# SSE 配置
SSE_HEARTBEAT_INTERVAL = 30  # 心跳间隔（秒）
SSE_RETRY_TIMEOUT = 3000  # 客户端重连间隔（毫秒）

# 监听的文件模式
WATCHED_FILES = {
    "bmm-workflow-status.yaml": "workflow",
    "sprint-status.yaml": "sprint",
}
