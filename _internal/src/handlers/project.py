"""
BMAD GUI - Project Handlers
项目相关 API 处理器
"""

import logging
from pathlib import Path

from aiohttp import web

from utils import validate_path_safety
from file_ops import (
    is_bmad_project, parse_bmad_config,
    load_recent_projects, save_recent_projects, update_recent_projects,
    create_bmad_structure, create_claude_structure, generate_config_yaml
)
from .response import error_response, success_response

logger = logging.getLogger("bmad-gui")

# 文件监听启动函数，由 server.py 注入
_start_file_watcher = None


def set_file_watcher_func(func):
    """设置文件监听启动函数"""
    global _start_file_watcher
    _start_file_watcher = func


async def open_project_handler(request: web.Request) -> web.Response:
    """处理 POST /api/project/open 请求"""
    try:
        body = await request.json()
        path_str = body.get('path', '')
    except Exception:
        return error_response("INVALID_PATH", "无效的请求体")

    is_valid, path, err_code = validate_path_safety(path_str)
    if not is_valid:
        messages = {
            "INVALID_PATH": "无效路径",
            "FILE_NOT_FOUND": "路径不存在",
        }
        return error_response(err_code, messages.get(err_code, "路径验证失败"))

    if not is_bmad_project(path):
        return error_response("NOT_BMAD_PROJECT", "该目录不是 BMAD 项目")

    config = parse_bmad_config(path)
    if config is None:
        return error_response("PARSE_ERROR", "配置文件解析失败")

    await update_recent_projects(str(path), config.get('project_name', path.name))

    # 启动文件监听
    if _start_file_watcher:
        await _start_file_watcher(path)

    logger.info(f"项目已打开: {path}")
    return success_response({
        'name': config.get('project_name', path.name),
        'path': str(path),
        'config': config
    })


async def recent_projects_handler(request: web.Request) -> web.Response:
    """处理 GET /api/recent-projects 请求"""
    projects = await load_recent_projects()
    return success_response(projects)


async def delete_recent_project_handler(request: web.Request) -> web.Response:
    """处理 DELETE /api/recent-projects 请求 - 从列表移除指定项目"""
    try:
        body = await request.json()
        path_str = body.get('path', '')
    except Exception:
        return error_response("INVALID_PATH", "无效的请求体")

    if not path_str:
        return error_response("INVALID_PATH", "缺少 path 参数")

    projects = await load_recent_projects()
    original_len = len(projects)
    projects = [p for p in projects if p.get('path') != path_str]
    await save_recent_projects(projects)

    logger.info(f"从最近项目移除: {path_str} (移除 {original_len - len(projects)} 个)")
    return success_response({'removed': original_len - len(projects)})


async def create_project_handler(request: web.Request) -> web.Response:
    """处理 POST /api/project/create 请求 - 创建新项目"""
    try:
        body = await request.json()
        path_str = body.get('path', '')
        config = body.get('config', {})
        modules = body.get('modules', ['bmm', 'core'])
    except Exception:
        return error_response("INVALID_PATH", "无效的请求体")

    if not path_str:
        return error_response("INVALID_PATH", "缺少 path 参数")

    try:
        path = Path(path_str).resolve()
    except (ValueError, OSError):
        return error_response("INVALID_PATH", "无效路径格式")

    if not path.exists():
        return error_response("FILE_NOT_FOUND", "路径不存在")

    if not path.is_dir():
        return error_response("INVALID_PATH", "路径不是目录")

    bmad_dir = path / ".bmad"
    if bmad_dir.exists():
        return error_response("ALREADY_EXISTS", "该目录已存在 .bmad 项目")

    user_name = config.get('user_name', '').strip()
    if not user_name:
        return error_response("INVALID_PATH", "user_name 不能为空")

    try:
        create_bmad_structure(path, modules)
        create_claude_structure(path)

        if 'bmm' in modules:
            config_content = generate_config_yaml(path, config)
            config_file = path / ".bmad" / "bmm" / "config.yaml"
            with open(config_file, 'w', encoding='utf-8') as f:
                f.write(config_content)

        output_folder = config.get('output_folder', 'md/')
        output_path = path / output_folder.rstrip('/')
        output_path.mkdir(parents=True, exist_ok=True)

    except PermissionError:
        return error_response("PERMISSION_DENIED", "权限不足，无法创建目录或文件")
    except Exception as e:
        logger.error(f"项目创建失败: {e}")
        return error_response("CREATE_FAILED", f"项目创建失败: {str(e)}")

    project_name = path.name
    await update_recent_projects(str(path), project_name)

    logger.info(f"项目已创建: {path}")
    return success_response({
        'name': project_name,
        'path': str(path),
        'config': {
            'user_name': config.get('user_name'),
            'communication_language': config.get('communication_language', 'chinese'),
            'output_folder': config.get('output_folder', 'md/'),
            'project_name': project_name
        }
    })
