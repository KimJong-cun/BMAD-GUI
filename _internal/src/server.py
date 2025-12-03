#!/usr/bin/env python3
"""
BMAD GUI - Backend Server

A lightweight HTTP server for BMAD GUI using aiohttp.
Provides static file serving, REST API, and SSE endpoints.
"""

import argparse
import asyncio
import logging
import webbrowser
from pathlib import Path

from aiohttp import web

from config import DEFAULT_PORT, STATIC_DIR
from utils import find_available_port
from file_ops import is_bmad_project, load_recent_projects
from watchers import start_file_watcher, stop_file_watcher
from handlers.project import (
    open_project_handler, create_project_handler,
    recent_projects_handler, delete_recent_project_handler,
    set_file_watcher_func
)
from handlers.agents import get_agents_handler, get_agent_detail_handler
from handlers.command import execute_command_handler
from handlers.claude import (
    start_claude_handler, stop_claude_handler,
    get_claude_status_handler, launch_claude_window_handler,
    send_command_handler, debug_claude_processes_handler,
    send_input_handler
)
from handlers.workflow import workflow_status_handler, sprint_status_handler, update_story_status_handler
from handlers.story import get_active_story_handler, get_story_detail_handler
from handlers.config import config_handler
from handlers.sse import sse_handler, sse_heartbeat_task, get_sse_clients

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("bmad-gui")

# 注入文件监听函数
set_file_watcher_func(start_file_watcher)


async def index_handler(request: web.Request) -> web.FileResponse:
    """返回 index.html"""
    return web.FileResponse(STATIC_DIR / "index.html")


def create_app() -> web.Application:
    """Create and configure the aiohttp application."""
    app = web.Application()

    # 静态文件路由
    app.router.add_get('/', index_handler)
    app.router.add_static('/static/', STATIC_DIR)

    # 项目 API
    app.router.add_post('/api/project/open', open_project_handler)
    app.router.add_post('/api/project/create', create_project_handler)
    app.router.add_get('/api/recent-projects', recent_projects_handler)
    app.router.add_delete('/api/recent-projects', delete_recent_project_handler)

    # 工作流 API
    app.router.add_get('/api/workflow-status', workflow_status_handler)
    app.router.add_get('/api/sprint-status', sprint_status_handler)
    app.router.add_post('/api/story/update-status', update_story_status_handler)

    # Story API
    app.router.add_get('/api/story/active', get_active_story_handler)
    app.router.add_get('/api/story/{story_id}', get_story_detail_handler)

    # Agent API
    app.router.add_get('/api/agents', get_agents_handler)
    app.router.add_get('/api/agents/{name}', get_agent_detail_handler)

    # Config API
    app.router.add_get('/api/config', config_handler)

    # 命令 API
    app.router.add_post('/api/command/execute', execute_command_handler)

    # Claude Code API
    app.router.add_post('/api/claude/start', start_claude_handler)
    app.router.add_post('/api/claude/stop', stop_claude_handler)
    app.router.add_get('/api/claude/status', get_claude_status_handler)
    app.router.add_post('/api/claude/launch', launch_claude_window_handler)
    app.router.add_post('/api/command', send_command_handler)
    app.router.add_get('/api/claude/debug', debug_claude_processes_handler)
    app.router.add_post('/api/claude/send-input', send_input_handler)

    # SSE API
    app.router.add_get('/api/events', sse_handler)

    return app


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="BMAD GUI Server")
    parser.add_argument(
        "--port", "-p",
        type=int,
        default=DEFAULT_PORT,
        help=f"Server port (default: {DEFAULT_PORT})"
    )
    parser.add_argument(
        "--debug", "-d",
        action="store_true",
        help="Enable debug mode"
    )
    parser.add_argument(
        "--project",
        type=str,
        default=None,
        help="Path to BMAD project directory"
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not open browser automatically"
    )
    return parser.parse_args()


async def on_startup(app: web.Application) -> None:
    """服务器启动后的回调"""
    port = app["port"]
    no_browser = app["no_browser"]
    url = f"http://localhost:{port}"
    logger.info(f"BMAD GUI 服务器已启动: {url}")

    # 启动 SSE 心跳任务
    app["heartbeat_task"] = asyncio.create_task(sse_heartbeat_task())
    logger.info("SSE 心跳任务已启动")

    # 如果有最近项目，自动启动文件监听
    projects = await load_recent_projects()
    if projects:
        project_path = Path(projects[0].get("path", ""))
        if project_path.exists() and is_bmad_project(project_path):
            await start_file_watcher(project_path)

    if not no_browser:
        webbrowser.open(url)


async def on_shutdown(app: web.Application) -> None:
    """服务器关闭时的回调"""
    # 停止心跳任务
    heartbeat_task = app.get("heartbeat_task")
    if heartbeat_task:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        logger.info("SSE 心跳任务已停止")

    # 停止文件监听
    await stop_file_watcher()

    # 关闭所有 SSE 连接
    sse_clients = get_sse_clients()
    for client in list(sse_clients):
        sse_clients.discard(client)
    logger.info("所有 SSE 连接已关闭")


def main() -> None:
    """Main entry point for BMAD GUI server."""
    args = parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
        logger.debug("Debug mode enabled")

    try:
        port = find_available_port(args.port)
    except RuntimeError as e:
        logger.error(str(e))
        return

    logger.info(f"Starting BMAD GUI server on port {port}")

    app = create_app()
    app["port"] = port
    app["no_browser"] = args.no_browser
    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)
    web.run_app(app, host="localhost", port=port, print=None)


if __name__ == "__main__":
    main()
