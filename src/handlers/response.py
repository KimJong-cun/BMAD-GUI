"""
BMAD GUI - Response Helpers
统一的响应格式
"""

import json
from aiohttp import web

from config import ERROR_CODES


def json_response(data: dict, status: int = 200) -> web.Response:
    """统一的 JSON 响应"""
    return web.Response(
        text=json.dumps(data, ensure_ascii=False),
        content_type='application/json',
        status=status
    )


def error_response(code: str, message: str) -> web.Response:
    """统一的错误响应"""
    status = ERROR_CODES.get(code, 400)
    return json_response({'error': True, 'code': code, 'message': message}, status)


def success_response(data: dict) -> web.Response:
    """统一的成功响应"""
    return json_response({'success': True, 'data': data})
