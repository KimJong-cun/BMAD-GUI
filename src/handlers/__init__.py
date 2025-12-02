"""
BMAD GUI - API Handlers
API 处理器模块
"""

from .response import json_response, error_response, success_response
from .project import (
    open_project_handler,
    create_project_handler,
    recent_projects_handler,
    delete_recent_project_handler,
)
from .agents import get_agents_handler, get_agent_detail_handler
from .command import execute_command_handler
from .claude import (
    start_claude_handler,
    stop_claude_handler,
    get_claude_status_handler,
    launch_claude_window_handler,
    send_command_handler,
)
from .workflow import workflow_status_handler, sprint_status_handler
from .sse import sse_handler, broadcast_sse_event

__all__ = [
    'json_response', 'error_response', 'success_response',
    'open_project_handler', 'create_project_handler',
    'recent_projects_handler', 'delete_recent_project_handler',
    'get_agents_handler', 'get_agent_detail_handler',
    'execute_command_handler',
    'start_claude_handler', 'stop_claude_handler',
    'get_claude_status_handler', 'launch_claude_window_handler',
    'send_command_handler',
    'workflow_status_handler', 'sprint_status_handler',
    'sse_handler', 'broadcast_sse_event',
]
