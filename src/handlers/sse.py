"""
BMAD GUI - SSE Handlers
Server-Sent Events 处理器
"""

import json
import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Set

import yaml
from aiohttp import web

from config import SSE_RETRY_TIMEOUT
from file_ops import find_workflow_status_file
from .workflow import parse_workflow_status

logger = logging.getLogger("bmad-gui")

# SSE 客户端管理
sse_clients: Set[web.StreamResponse] = set()
current_project_path: Path | None = None


def set_current_project(path: Path | None):
    """设置当前项目路径"""
    global current_project_path
    current_project_path = path


def get_sse_clients() -> Set[web.StreamResponse]:
    """获取 SSE 客户端集合"""
    return sse_clients


async def send_sse_event(response: web.StreamResponse, event_type: str, data: dict) -> bool:
    """发送 SSE 事件到客户端"""
    try:
        event_data = json.dumps(data, ensure_ascii=False)
        message = f"event: {event_type}\ndata: {event_data}\n\n"
        await response.write(message.encode('utf-8'))
        return True
    except (ConnectionResetError, ConnectionAbortedError):
        return False
    except Exception as e:
        logger.error(f"SSE 发送失败: {e}")
        return False


async def broadcast_sse_event(event_type: str, data: dict) -> None:
    """广播 SSE 事件到所有客户端"""
    if not sse_clients:
        return

    disconnected = set()
    for client in sse_clients:
        success = await send_sse_event(client, event_type, data)
        if not success:
            disconnected.add(client)

    for client in disconnected:
        sse_clients.discard(client)
        logger.debug(f"移除断开的 SSE 客户端，当前连接数: {len(sse_clients)}")


async def send_current_workflow_status(response: web.StreamResponse) -> None:
    """发送当前工作流状态到指定客户端"""
    if not current_project_path:
        return

    yaml_file = find_workflow_status_file(current_project_path)
    if not yaml_file:
        return

    try:
        with open(yaml_file, 'r', encoding='utf-8') as f:
            yaml_data = yaml.safe_load(f)
        result = parse_workflow_status(yaml_data, current_project_path)
        await send_sse_event(response, "workflow_update", result)
    except Exception as e:
        logger.error(f"发送工作流状态失败: {e}")


async def sse_handler(request: web.Request) -> web.StreamResponse:
    """处理 GET /api/events 请求 - SSE 事件流"""
    response = web.StreamResponse()
    response.headers['Content-Type'] = 'text/event-stream'
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['Connection'] = 'keep-alive'
    response.headers['Access-Control-Allow-Origin'] = '*'

    await response.prepare(request)

    sse_clients.add(response)
    logger.info(f"新 SSE 客户端连接，当前连接数: {len(sse_clients)}")

    await response.write(f"retry: {SSE_RETRY_TIMEOUT}\n\n".encode('utf-8'))
    await send_sse_event(response, "connected", {"message": "SSE 连接已建立"})

    if current_project_path:
        await send_current_workflow_status(response)

    try:
        while True:
            await asyncio.sleep(1)
            if response not in sse_clients:
                break
    except asyncio.CancelledError:
        pass
    finally:
        sse_clients.discard(response)
        logger.info(f"SSE 客户端断开，当前连接数: {len(sse_clients)}")

    return response


async def sse_heartbeat_task() -> None:
    """SSE 心跳任务"""
    from config import SSE_HEARTBEAT_INTERVAL
    while True:
        await asyncio.sleep(SSE_HEARTBEAT_INTERVAL)
        if sse_clients:
            await broadcast_sse_event("heartbeat", {"timestamp": datetime.now().isoformat()})
            logger.debug(f"发送心跳，当前连接数: {len(sse_clients)}")
