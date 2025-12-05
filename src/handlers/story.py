"""
BMAD GUI - Story Handlers
Story 状态 API 处理器
"""

import logging
from pathlib import Path

import yaml
from aiohttp import web

from file_ops import load_recent_projects, find_sprint_status_file
from .response import error_response, success_response

logger = logging.getLogger("bmad-gui")


def parse_story_id(story_key: str) -> dict:
    """解析 story key 获取 epic 和 story 编号"""
    parts = story_key.split("-")
    if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
        epic_num = int(parts[0])
        story_num = parts[1]
        story_name = "-".join(parts[2:]).replace("-", " ").title() if len(parts) > 2 else story_key
        return {
            "epicNumber": epic_num,
            "storyNumber": story_num,
            "storyId": f"{epic_num}-{story_num}",
            "name": story_name
        }
    return None


def get_active_story(dev_status: dict) -> dict:
    """从开发状态中获取当前活跃的 Story"""
    # 按 Epic 编号组织 Stories
    epics = {}

    for key, status in dev_status.items():
        # 解析 Epic
        if key.startswith("epic-") and key.count("-") == 1:
            epic_num_str = key.split("-")[1]
            if epic_num_str.isdigit():
                epic_num = int(epic_num_str)
                if epic_num not in epics:
                    epics[epic_num] = {
                        "id": key,
                        "number": epic_num,
                        "status": status,
                        "stories": []
                    }
                else:
                    epics[epic_num]["status"] = status

    # 解析 Stories
    for key, status in dev_status.items():
        if key.startswith("epic-") or key.endswith("-retrospective"):
            continue

        story_info = parse_story_id(key)
        if story_info:
            epic_num = story_info["epicNumber"]
            if epic_num not in epics:
                epics[epic_num] = {
                    "id": f"epic-{epic_num}",
                    "number": epic_num,
                    "status": "backlog",
                    "stories": []
                }

            epics[epic_num]["stories"].append({
                "id": key,
                "storyId": story_info["storyId"],
                "name": story_info["name"],
                "status": status
            })

    # 按 Epic 编号排序，找到第一个非 done 的 Story
    for epic_num in sorted(epics.keys()):
        epic = epics[epic_num]
        # 按 story 编号排序
        stories = sorted(epic["stories"], key=lambda s: s["storyId"])

        for story in stories:
            if story["status"] != "done":
                return {
                    **story,
                    "epicId": epic["id"],
                    "epicNumber": epic["number"],
                    "epicStatus": epic["status"]
                }

    return None


async def get_active_story_handler(request: web.Request) -> web.Response:
    """处理 GET /api/story/active 请求 - 返回当前活跃的 Story"""
    projects = await load_recent_projects()
    if not projects:
        return error_response("FILE_NOT_FOUND", "没有打开的项目")

    project_path = Path(projects[0].get("path", ""))
    if not project_path.exists():
        return error_response("FILE_NOT_FOUND", "项目路径不存在")

    yaml_file = find_sprint_status_file(project_path)
    if not yaml_file:
        return error_response("FILE_NOT_FOUND", "Sprint 状态文件不存在")

    try:
        with open(yaml_file, 'r', encoding='utf-8') as f:
            yaml_data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        logger.error(f"YAML 解析失败: {e}")
        return error_response("PARSE_ERROR", f"Sprint 状态文件解析失败: {str(e)}")
    except Exception as e:
        logger.error(f"读取文件失败: {e}")
        return error_response("FILE_NOT_FOUND", f"无法读取 Sprint 状态文件: {str(e)}")

    dev_status = yaml_data.get("development_status", {})
    active_story = get_active_story(dev_status)

    if active_story:
        return success_response(active_story)
    else:
        return success_response({
            "message": "所有 Story 已完成",
            "completed": True
        })


async def get_story_detail_handler(request: web.Request) -> web.Response:
    """处理 GET /api/story/{story_id} 请求 - 返回指定 Story 详情"""
    story_id = request.match_info.get('story_id', '')
    if not story_id:
        return error_response("INVALID_PATH", "缺少 story_id 参数")

    projects = await load_recent_projects()
    if not projects:
        return error_response("FILE_NOT_FOUND", "没有打开的项目")

    project_path = Path(projects[0].get("path", ""))
    if not project_path.exists():
        return error_response("FILE_NOT_FOUND", "项目路径不存在")

    yaml_file = find_sprint_status_file(project_path)
    if not yaml_file:
        return error_response("FILE_NOT_FOUND", "Sprint 状态文件不存在")

    try:
        with open(yaml_file, 'r', encoding='utf-8') as f:
            yaml_data = yaml.safe_load(f)
    except Exception as e:
        logger.error(f"读取文件失败: {e}")
        return error_response("FILE_NOT_FOUND", f"无法读取 Sprint 状态文件: {str(e)}")

    dev_status = yaml_data.get("development_status", {})

    # 查找指定的 Story
    status = dev_status.get(story_id)
    if status is None:
        return error_response("FILE_NOT_FOUND", f"Story {story_id} 不存在")

    story_info = parse_story_id(story_id)
    if not story_info:
        return error_response("PARSE_ERROR", f"无法解析 Story ID: {story_id}")

    return success_response({
        "id": story_id,
        "storyId": story_info["storyId"],
        "name": story_info["name"],
        "status": status,
        "epicNumber": story_info["epicNumber"]
    })
