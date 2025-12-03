"""
BMAD GUI - Agent Handlers
Agent API 处理器
"""

import re
import logging
from pathlib import Path

import yaml
from aiohttp import web

from file_ops import load_recent_projects
from .response import error_response, success_response

logger = logging.getLogger("bmad-gui")


def parse_agent_file(file_path: Path) -> dict | None:
    """解析 Agent markdown 文件，提取元数据和命令"""
    try:
        content = file_path.read_text(encoding='utf-8')

        agent_data = {
            'name': file_path.stem,
            'title': file_path.stem.title(),
            'icon': '🤖',
            'description': '',
            'commands': []
        }

        # 解析 YAML front matter
        if content.startswith('---'):
            parts = content.split('---', 2)
            if len(parts) >= 3:
                try:
                    front_matter = yaml.safe_load(parts[1])
                    if front_matter:
                        agent_data['title'] = front_matter.get('title', agent_data['title'])
                        agent_data['icon'] = front_matter.get('icon', agent_data['icon'])
                        agent_data['description'] = front_matter.get('description', '')
                except yaml.YAMLError:
                    pass

        # 解析 <agent> 标签
        agent_tag_match = re.search(
            r'<agent[^>]*\s+name="([^"]*)"[^>]*\s+title="([^"]*)"[^>]*\s+icon="([^"]*)"',
            content
        )
        if agent_tag_match:
            agent_data['title'] = agent_tag_match.group(2) or agent_data['title']
            agent_data['icon'] = agent_tag_match.group(3) or agent_data['icon']

        # 解析 <menu> 标签中的命令
        menu_items = re.findall(
            r'<item\s+cmd="([^"]+)"[^>]*>([^<]+)</item>',
            content, re.DOTALL
        )

        for cmd, label in menu_items:
            cmd = cmd.strip()
            label = label.strip()
            if cmd in ('*help', '*exit'):
                continue
            cmd_name = cmd.lstrip('*')
            agent_data['commands'].append({
                'name': cmd_name,
                'label': label,
                'icon': '📋',
                'description': ''
            })

        # 如果没有 menu-item，尝试解析 workflow 引用
        if not agent_data['commands']:
            workflow_matches = re.findall(r'\*\*?(\w[\w-]*)\*\*?.*?(?:workflow|工作流)', content, re.IGNORECASE)
            for wf in workflow_matches[:10]:
                agent_data['commands'].append({
                    'name': wf,
                    'label': wf.replace('-', ' ').title(),
                    'icon': '📋',
                    'description': ''
                })

        return agent_data

    except Exception as e:
        logger.error(f"解析 Agent 文件失败 {file_path}: {e}")
        return None


async def get_agents_handler(request: web.Request) -> web.Response:
    """处理 GET /api/agents 请求 - 获取所有 Agent 列表"""
    projects = await load_recent_projects()
    if not projects:
        return error_response("FILE_NOT_FOUND", "没有打开的项目")

    project_path = Path(projects[0].get("path", ""))
    if not project_path.exists():
        return error_response("FILE_NOT_FOUND", "项目路径不存在")

    agents_dir = project_path / ".bmad" / "bmm" / "agents"
    if not agents_dir.exists():
        return error_response("FILE_NOT_FOUND", "Agents 目录不存在")

    agents = []
    for agent_file in agents_dir.glob("*.md"):
        agent_data = parse_agent_file(agent_file)
        if agent_data:
            agents.append({
                'name': agent_data['name'],
                'title': agent_data['title'],
                'icon': agent_data['icon'],
                'description': agent_data['description']
            })

    logger.info(f"加载了 {len(agents)} 个 Agents")
    return success_response(agents)


async def get_agent_detail_handler(request: web.Request) -> web.Response:
    """处理 GET /api/agents/{name} 请求 - 获取单个 Agent 详情"""
    agent_name = request.match_info.get('name', '')
    if not agent_name:
        return error_response("INVALID_PATH", "缺少 Agent 名称")

    projects = await load_recent_projects()
    if not projects:
        return error_response("FILE_NOT_FOUND", "没有打开的项目")

    project_path = Path(projects[0].get("path", ""))
    agent_file = project_path / ".bmad" / "bmm" / "agents" / f"{agent_name}.md"

    if not agent_file.exists():
        return error_response("FILE_NOT_FOUND", f"Agent '{agent_name}' 不存在")

    agent_data = parse_agent_file(agent_file)
    if not agent_data:
        return error_response("PARSE_ERROR", "Agent 文件解析失败")

    return success_response(agent_data)
