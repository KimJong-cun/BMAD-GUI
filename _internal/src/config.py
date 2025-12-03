"""
BMAD GUI - Configuration
配置常量和错误码定义
"""

import sys
from pathlib import Path

# 服务器配置
DEFAULT_PORT = 8765

# 检测是否为打包后的环境
def get_base_path() -> Path:
    """获取基础路径，支持打包和开发环境"""
    if getattr(sys, 'frozen', False):
        # PyInstaller 打包后的路径
        return Path(sys._MEIPASS)
    else:
        # 开发环境：src 在项目根目录下
        return Path(__file__).parent.parent

def get_data_path() -> Path:
    """获取数据目录路径（用户可写）"""
    if getattr(sys, 'frozen', False):
        # 打包后使用 exe 所在目录
        return Path(sys.executable).parent / "data"
    else:
        return Path(__file__).parent.parent / "data"

# 目录配置
PROJECT_ROOT = get_base_path()
STATIC_DIR = PROJECT_ROOT / "static"
DATA_DIR = get_data_path()
BMAD_TEMPLATE_DIR = PROJECT_ROOT / ".bmad"
CLAUDE_TEMPLATE_DIR = PROJECT_ROOT / ".claude"

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
