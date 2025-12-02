"""
BMAD GUI - Command Handlers
命令执行 API 处理器
"""

import logging
from aiohttp import web

from .response import error_response, success_response

logger = logging.getLogger("bmad-gui")


async def execute_command_handler(request: web.Request) -> web.Response:
    """处理 POST /api/command/execute 请求 - 执行命令（复制到剪贴板）"""
    try:
        body = await request.json()
        command = body.get('command', '')
        agent = body.get('agent', '')
    except Exception:
        return error_response("INVALID_PATH", "无效的请求体")

    if not command:
        return error_response("INVALID_PATH", "缺少 command 参数")

    # 构造完整命令字符串
    if command.startswith('/') or command.startswith('*'):
        full_command = command
    else:
        full_command = f"/bmad:bmm:workflows:{command}"

    # 尝试复制到剪贴板
    clipboard_success = False
    try:
        import pyperclip
        pyperclip.copy(full_command)
        clipboard_success = True
        logger.info(f"命令已复制到剪贴板: {full_command}")
    except ImportError:
        logger.warning("pyperclip 未安装，无法复制到剪贴板")
    except Exception as e:
        logger.warning(f"剪贴板操作失败: {e}")

    if clipboard_success:
        return success_response({
            'message': '命令已复制到剪贴板',
            'command': full_command,
            'fallback': False
        })
    else:
        return success_response({
            'message': '请手动复制命令',
            'command': full_command,
            'fallback': True
        })
