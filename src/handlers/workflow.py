"""
BMAD GUI - Workflow Handlers
工作流状态 API 处理器
"""

import logging
from pathlib import Path

import yaml
from aiohttp import web

from file_ops import load_recent_projects, find_workflow_status_file, find_sprint_status_file
from .response import error_response, success_response

logger = logging.getLogger("bmad-gui")


def map_workflow_status(status: str) -> str:
    """将 YAML 中的 status 值映射为前端状态"""
    if not status:
        return "pending"
    status_lower = status.lower()
    if status_lower == "required":
        return "pending"
    if status_lower in ("optional", "recommended", "conditional"):
        return status_lower
    if status_lower in ("skipped", "in_progress", "blocked"):
        return status_lower
    if "/" in status or status.endswith(".md") or status.endswith(".yaml"):
        return "completed"
    return "pending"


def calculate_phase_status(workflows: list) -> str:
    """计算阶段状态"""
    statuses = [w.get("status", "pending") for w in workflows]

    if "in_progress" in statuses:
        return "in_progress"
    if "blocked" in statuses:
        return "blocked"

    non_blocking_statuses = {"skipped", "optional", "recommended", "conditional"}
    required_statuses = [s for s in statuses if s not in non_blocking_statuses]

    if required_statuses and all(s == "completed" for s in required_statuses):
        return "completed"

    if not required_statuses:
        return "completed"

    return "pending"


def parse_workflow_status(yaml_data: dict) -> dict:
    """解析 YAML 数据并转换为前端友好的 JSON 结构"""
    project = yaml_data.get("project", "Unknown Project")
    selected_track = yaml_data.get("selected_track", "bmad-method")
    workflow_status = yaml_data.get("workflow_status", [])

    phases = []
    for phase_data in workflow_status:
        phase_id = phase_data.get("phase", 0)
        phase_name = phase_data.get("name", f"Phase {phase_id}")
        workflows_raw = phase_data.get("workflows", [])

        workflows = []
        completed_count = 0
        total_count = 0

        for wf in workflows_raw:
            wf_id = wf.get("id", "")
            wf_status_raw = wf.get("status", "required")
            wf_status = map_workflow_status(wf_status_raw)

            workflow_obj = {
                "id": wf_id,
                "name": wf.get("command", wf_id),
                "status": wf_status,
                "agent": wf.get("agent", ""),
            }

            if wf_status == "completed" and "/" in wf_status_raw:
                workflow_obj["outputPath"] = wf_status_raw

            workflows.append(workflow_obj)

            non_blocking = {"skipped", "optional", "recommended", "conditional"}
            if wf_status not in non_blocking:
                total_count += 1
                if wf_status == "completed":
                    completed_count += 1

        phase_status = calculate_phase_status(workflows)

        phases.append({
            "id": phase_id,
            "name": phase_name,
            "status": phase_status,
            "completedCount": completed_count,
            "totalCount": total_count,
            "workflows": workflows
        })

    track_mode = "quick" if "quick" in selected_track.lower() else "standard"

    return {
        "project": project,
        "track": selected_track,
        "trackMode": track_mode,
        "phases": phases
    }


def parse_sprint_status(yaml_data: dict) -> dict:
    """解析 sprint-status.yaml 并转换为前端友好的 JSON 结构"""
    project = yaml_data.get("project", "Unknown Project")
    dev_status = yaml_data.get("development_status", {})

    epics_dict = {}

    for key, status in dev_status.items():
        if key.startswith("epic-") and key.count("-") == 1:
            epic_num = key.split("-")[1]
            if epic_num.isdigit():
                epics_dict[int(epic_num)] = {
                    "id": key,
                    "number": int(epic_num),
                    "name": f"Epic {epic_num}",
                    "status": status,
                    "stories": [],
                    "retrospective": None
                }

    for key, status in dev_status.items():
        if key.endswith("-retrospective"):
            epic_num_str = key.replace("epic-", "").replace("-retrospective", "")
            if epic_num_str.isdigit():
                epic_num = int(epic_num_str)
                if epic_num in epics_dict:
                    epics_dict[epic_num]["retrospective"] = status

        elif not key.startswith("epic-"):
            parts = key.split("-")
            if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
                epic_num = int(parts[0])
                story_num = parts[1]
                story_name = "-".join(parts[2:]).replace("-", " ").title() if len(parts) > 2 else key

                if epic_num in epics_dict:
                    epics_dict[epic_num]["stories"].append({
                        "id": key,
                        "storyId": f"{epic_num}-{story_num}",
                        "name": story_name,
                        "status": status
                    })

    epics = [epics_dict[num] for num in sorted(epics_dict.keys())]

    return {
        "project": project,
        "epics": epics
    }


async def workflow_status_handler(request: web.Request) -> web.Response:
    """处理 GET /api/workflow-status 请求 - 返回工作流状态"""
    projects = await load_recent_projects()
    if not projects:
        return error_response("FILE_NOT_FOUND", "没有打开的项目")

    project_path = Path(projects[0].get("path", ""))
    if not project_path.exists():
        return error_response("FILE_NOT_FOUND", "项目路径不存在")

    yaml_file = find_workflow_status_file(project_path)
    if not yaml_file:
        return error_response("FILE_NOT_FOUND", "工作流状态文件不存在")

    try:
        with open(yaml_file, 'r', encoding='utf-8') as f:
            yaml_data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        logger.error(f"YAML 解析失败: {e}")
        return error_response("PARSE_ERROR", f"工作流状态文件解析失败: {str(e)}")
    except Exception as e:
        logger.error(f"读取文件失败: {e}")
        return error_response("FILE_NOT_FOUND", f"无法读取工作流状态文件: {str(e)}")

    try:
        result = parse_workflow_status(yaml_data)
    except Exception as e:
        logger.error(f"数据转换失败: {e}")
        return error_response("PARSE_ERROR", f"数据转换失败: {str(e)}")

    return success_response(result)


async def sprint_status_handler(request: web.Request) -> web.Response:
    """处理 GET /api/sprint-status 请求 - 返回 Sprint 状态"""
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

    try:
        result = parse_sprint_status(yaml_data)
    except Exception as e:
        logger.error(f"数据转换失败: {e}")
        return error_response("PARSE_ERROR", f"数据转换失败: {str(e)}")

    return success_response(result)


def find_story_file(project_path: Path, story_id: str) -> Path | None:
    """查找故事文件，story_id 格式为 '7-1'"""
    sprint_artifacts_dir = project_path / "md" / "sprint-artifacts"
    if not sprint_artifacts_dir.exists():
        return None

    # 查找以 story_id 开头的 .md 文件
    for file in sprint_artifacts_dir.glob(f"{story_id}-*.md"):
        return file

    # 也尝试直接匹配 story_id.md
    direct_file = sprint_artifacts_dir / f"{story_id}.md"
    if direct_file.exists():
        return direct_file

    return None


def update_story_file_status(file_path: Path, new_status: str) -> bool:
    """更新故事文件中的 Status 字段"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # 查找并替换 Status 字段
        import re
        # 匹配 Status: xxx 格式（在行首或前面有空格）
        pattern = r'(Status:\s*)(\S+)'

        if re.search(pattern, content):
            new_content = re.sub(pattern, f'\\1{new_status}', content)
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            logger.info(f"故事文件状态已更新: {file_path} -> {new_status}")
            return True
        else:
            logger.warning(f"故事文件中未找到 Status 字段: {file_path}")
            return False
    except Exception as e:
        logger.error(f"更新故事文件失败: {e}")
        return False


def delete_story_file(file_path: Path) -> bool:
    """删除故事文件"""
    try:
        if file_path.exists():
            file_path.unlink()
            logger.info(f"故事文件已删除: {file_path}")
            return True
        return False
    except Exception as e:
        logger.error(f"删除故事文件失败: {e}")
        return False


async def update_story_status_handler(request: web.Request) -> web.Response:
    """处理 POST /api/story/update-status 请求 - 手动更新 Story 状态"""
    try:
        data = await request.json()
    except Exception:
        return error_response("INVALID_REQUEST", "无效的请求数据")

    story_id = data.get("storyId")
    new_status = data.get("status")

    if not story_id or not new_status:
        return error_response("INVALID_REQUEST", "缺少 storyId 或 status 参数")

    # 验证状态值
    valid_statuses = ["backlog", "drafted", "ready-for-dev", "in-progress", "review", "done"]
    if new_status not in valid_statuses:
        return error_response("INVALID_REQUEST", f"无效的状态值: {new_status}")

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
        logger.error(f"读取 Sprint 状态文件失败: {e}")
        return error_response("FILE_NOT_FOUND", f"无法读取 Sprint 状态文件: {str(e)}")

    # 查找并更新 story 状态
    dev_status = yaml_data.get("development_status", {})

    # story_id 格式为 "6-1"，需要查找匹配的 key
    # YAML 中的 key 格式为 "6-1-story-name" 或类似
    found = False
    found_key = None
    for key in dev_status.keys():
        if key.startswith(story_id + "-") or key == story_id:
            dev_status[key] = new_status
            found = True
            found_key = key
            logger.info(f"更新 Story 状态: {key} -> {new_status}")
            break

    if not found:
        return error_response("NOT_FOUND", f"未找到 Story: {story_id}")

    # 处理故事文件
    story_file = find_story_file(project_path, story_id)
    story_file_updated = False
    story_file_deleted = False

    if new_status == "backlog":
        # 待办状态：删除故事文件
        if story_file:
            story_file_deleted = delete_story_file(story_file)
    elif new_status in ["ready-for-dev", "in-progress", "review", "done"]:
        # 其他状态：更新故事文件中的 Status 字段
        if story_file:
            story_file_updated = update_story_file_status(story_file, new_status)

    # 保存 YAML 文件
    try:
        with open(yaml_file, 'w', encoding='utf-8') as f:
            yaml.dump(yaml_data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
        logger.info(f"Sprint 状态文件已更新: {yaml_file}")
    except Exception as e:
        logger.error(f"保存 Sprint 状态文件失败: {e}")
        return error_response("SAVE_ERROR", f"保存文件失败: {str(e)}")

    result_message = "状态更新成功"
    if story_file_deleted:
        result_message += "，故事文件已删除"
    elif story_file_updated:
        result_message += "，故事文件已更新"
    elif story_file is None and new_status != "backlog":
        result_message += "（未找到故事文件）"

    return success_response({
        "storyId": story_id,
        "status": new_status,
        "message": result_message,
        "storyFileUpdated": story_file_updated,
        "storyFileDeleted": story_file_deleted
    })
