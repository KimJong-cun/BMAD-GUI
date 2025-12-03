"""
BMAD GUI - Config Handlers
配置 API 处理器
"""

import logging
from pathlib import Path

import yaml
from aiohttp import web

from file_ops import load_recent_projects
from .response import error_response, success_response

logger = logging.getLogger("bmad-gui")

# 模块描述映射
MODULE_DESCRIPTIONS = {
    "bmm": "BMad Method 核心方法论",
    "core": "基础工具和任务"
}


def detect_installed_modules(project_path: Path) -> list:
    """检测已安装的 BMAD 模块"""
    modules = []
    bmad_dir = project_path / ".bmad"

    if not bmad_dir.exists():
        return modules

    # 检查 bmm 模块
    if (bmad_dir / "bmm").exists():
        modules.append({
            "name": "bmm",
            "description": MODULE_DESCRIPTIONS.get("bmm", ""),
            "path": str(bmad_dir / "bmm")
        })

    # 检查 core 模块
    if (bmad_dir / "core").exists():
        modules.append({
            "name": "core",
            "description": MODULE_DESCRIPTIONS.get("core", ""),
            "path": str(bmad_dir / "core")
        })

    return modules


def load_config_yaml(project_path: Path) -> dict:
    """加载项目的 config.yaml 配置"""
    config_file = project_path / ".bmad" / "_cfg" / "config.yaml"

    if not config_file.exists():
        # 尝试其他位置
        config_file = project_path / ".bmad" / "config.yaml"

    if not config_file.exists():
        return {}

    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f) or {}
    except Exception as e:
        logger.error(f"读取配置文件失败: {e}")
        return {}


async def config_handler(request: web.Request) -> web.Response:
    """处理 GET /api/config 请求 - 返回 BMAD 配置信息"""
    projects = await load_recent_projects()
    if not projects:
        return error_response("FILE_NOT_FOUND", "没有打开的项目")

    project_path = Path(projects[0].get("path", ""))
    if not project_path.exists():
        return error_response("FILE_NOT_FOUND", "项目路径不存在")

    # 检测已安装模块
    modules = detect_installed_modules(project_path)

    # 加载配置文件
    config_yaml = load_config_yaml(project_path)

    return success_response({
        "projectPath": str(project_path),
        "modules": modules,
        "configYaml": config_yaml
    })
