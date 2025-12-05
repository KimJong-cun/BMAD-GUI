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


# 工作流 ID 到预期输出文件的映射
WORKFLOW_OUTPUT_FILES = {
    "workflow-init": ["md/bmm-workflow-status.yaml", "bmm-workflow-status.yaml"],
    "brainstorm-project": ["md/brainstorm.md", "brainstorm.md"],
    "research": ["md/research.md", "research.md"],
    "tech-spec": ["md/tech-spec.md", "tech-spec.md"],
    "product-brief": ["md/product-brief.md", "product-brief.md"],
    "prd": ["md/prd.md", "prd.md"],
    "architecture": ["md/architecture.md", "architecture.md"],
    "create-epics-and-stories": ["md/epics.md", "epics.md"],
    "sprint-planning": ["md/sprint-status.yaml", "sprint-status.yaml"],
}

# 快速模式 Implementation 阶段流程
QUICK_MODE_IMPL_FLOW = [
    {"id": "tech-spec", "name": "技术规格", "files": ["md/tech-spec.md", "tech-spec.md"]},
    {"id": "create-epics-and-stories", "name": "Epic 分解", "files": ["md/epics.md", "epics.md"]},
    {"id": "sprint-planning", "name": "冲刺规划", "check": "sprint_has_stories"},
]

# 标准模式 Implementation 阶段流程
STANDARD_MODE_IMPL_FLOW = [
    {"id": "product-brief", "name": "产品简介", "files": ["md/product-brief.md", "product-brief.md"]},
    {"id": "prd", "name": "需求文档", "files": ["md/prd.md", "prd.md"]},
    {"id": "architecture", "name": "架构设计", "files": ["md/architecture.md", "architecture.md"]},
    {"id": "create-epics-and-stories", "name": "Epic 分解", "files": ["md/epics.md", "epics.md"]},
    {"id": "sprint-planning", "name": "冲刺规划", "check": "sprint_has_stories"},
]


def check_workflow_file_exists(project_path: Path, workflow_id: str) -> str | None:
    """检查工作流对应的输出文件是否存在
    
    Args:
        project_path: 项目根目录路径
        workflow_id: 工作流 ID
        
    Returns:
        如果文件存在，返回文件相对路径；否则返回 None
    """
    possible_files = WORKFLOW_OUTPUT_FILES.get(workflow_id, [])
    for file_path in possible_files:
        full_path = project_path / file_path
        if full_path.exists():
            return file_path
    return None


def check_sprint_has_stories(project_path: Path) -> bool:
    """检查 sprint-status.yaml 是否包含 development_status 内容"""
    import yaml
    for file_name in ["md/sprint-status.yaml", "sprint-status.yaml"]:
        file_path = project_path / file_name
        if file_path.exists():
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f)
                if data and data.get("development_status"):
                    return True
            except Exception:
                pass
    return False


def get_implementation_flow_status(project_path: Path, track_mode: str = "quick") -> dict:
    """获取 Implementation 阶段的流程状态
    
    Args:
        project_path: 项目根目录路径
        track_mode: 轨道模式 ("quick" 或 "standard")
        
    Returns:
        包含流程状态和下一步建议的字典
    """
    flow = QUICK_MODE_IMPL_FLOW if track_mode == "quick" else STANDARD_MODE_IMPL_FLOW
    
    completed_steps = []
    next_step = None
    
    for step in flow:
        step_id = step["id"]
        step_name = step["name"]
        
        # 特殊检查：sprint_has_stories
        if step.get("check") == "sprint_has_stories":
            if check_sprint_has_stories(project_path):
                completed_steps.append({"id": step_id, "name": step_name, "status": "completed"})
            else:
                if next_step is None:
                    next_step = {"id": step_id, "name": step_name, "command": step_id}
                completed_steps.append({"id": step_id, "name": step_name, "status": "pending"})
        else:
            # 文件检查
            files = step.get("files", [])
            found = False
            for file_path in files:
                if (project_path / file_path).exists():
                    found = True
                    break
            
            if found:
                completed_steps.append({"id": step_id, "name": step_name, "status": "completed"})
            else:
                if next_step is None:
                    next_step = {"id": step_id, "name": step_name, "command": step_id}
                completed_steps.append({"id": step_id, "name": step_name, "status": "pending"})
    
    all_done = all(s["status"] == "completed" for s in completed_steps)
    
    return {
        "trackMode": track_mode,
        "steps": completed_steps,
        "nextStep": next_step,
        "allCompleted": all_done
    }


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


def parse_workflow_status(yaml_data: dict, project_path: Path = None) -> dict:
    """解析 YAML 数据并转换为前端友好的 JSON 结构

    支持两种 YAML 结构:
    1. 嵌套结构 (每个 phase 包含 workflows 数组)
    2. 扁平结构 (每个 workflow 单独一条，包含 phase 字段)
    
    同时支持 workflow_status 为字符串的情况 (YAML 使用 | 语法时)
    
    Args:
        yaml_data: 解析后的 YAML 数据
        project_path: 项目根目录路径，用于文件检测
    """
    project = yaml_data.get("project", "Unknown Project")
    selected_track = yaml_data.get("selected_track", "bmad-method")
    workflow_status = yaml_data.get("workflow_status", [])

    # 如果 workflow_status 是字符串（YAML 使用 | 语法），需要再次解析
    if isinstance(workflow_status, str):
        try:
            parsed = yaml.safe_load(workflow_status)
            if isinstance(parsed, dict) and "phases" in parsed:
                workflow_status = parsed.get("phases", [])
            elif isinstance(parsed, list):
                workflow_status = parsed
            else:
                logger.warning(f"workflow_status 字符串解析结果格式异常: {type(parsed)}")
                workflow_status = []
        except Exception as e:
            logger.error(f"workflow_status 字符串解析失败: {e}")
            workflow_status = []

    # 检测是扁平结构还是嵌套结构
    # 扁平结构: 每个条目有 id 和 phase 字段，没有 workflows 字段
    # 嵌套结构: 每个条目有 workflows 字段
    is_flat_structure = False
    if workflow_status and len(workflow_status) > 0:
        first_item = workflow_status[0]
        # 如果有 id 字段且没有 workflows 字段，则是扁平结构
        if "id" in first_item and "workflows" not in first_item:
            is_flat_structure = True

    track_mode = "quick" if "quick" in selected_track.lower() else "standard"

    if is_flat_structure:
        # 扁平结构: 按 phase 分组
        phases = _parse_flat_workflow_status(workflow_status, track_mode, project_path)
    else:
        # 嵌套结构: 原有逻辑
        phases = _parse_nested_workflow_status(workflow_status, project_path)

    return {
        "project": project,
        "track": selected_track,
        "trackMode": track_mode,
        "phases": phases
    }


def _parse_flat_workflow_status(workflow_status: list, track_mode: str = "standard", project_path: Path = None) -> list:
    """解析扁平结构的工作流状态 (每个 workflow 是单独条目)

    Args:
        workflow_status: 工作流状态列表
        track_mode: 轨道模式 ("standard" 或 "quick")
        project_path: 项目根目录路径，用于文件检测
    """
    # 按 phase 分组
    phases_dict = {}

    # 根据 track_mode 确定 phase 名称
    if track_mode == "quick":
        # quick-flow 模式: 没有 Solutioning 阶段
        phase_names = {
            0: "Discovery",
            1: "Planning",
            2: "Implementation"
        }
    else:
        # standard 模式: 完整的四个阶段
        phase_names = {
            0: "Discovery",
            1: "Planning",
            2: "Solutioning",
            3: "Implementation"
        }

    for wf in workflow_status:
        phase_id = wf.get("phase", 0)
        wf_id = wf.get("id", "")
        wf_status_raw = wf.get("status", "required")
        wf_status = map_workflow_status(wf_status_raw)

        # 如果状态是 pending 且项目路径存在，检查文件是否已生成
        if wf_status == "pending" and project_path:
            detected_file = check_workflow_file_exists(project_path, wf_id)
            if detected_file:
                wf_status = "completed"
                wf_status_raw = detected_file
                logger.info(f"自动检测到工作流输出文件: {wf_id} -> {detected_file}")

        workflow_obj = {
            "id": wf_id,
            "name": wf.get("command", wf.get("name", wf_id)),
            "status": wf_status,
            "agent": wf.get("agent", ""),
        }

        if wf_status == "completed" and "/" in wf_status_raw:
            workflow_obj["outputPath"] = wf_status_raw

        if phase_id not in phases_dict:
            phases_dict[phase_id] = {
                "id": phase_id,
                "name": phase_names.get(phase_id, f"Phase {phase_id}"),
                "workflows": []
            }

        phases_dict[phase_id]["workflows"].append(workflow_obj)

    # 计算每个阶段的状态和计数
    phases = []
    for phase_id in sorted(phases_dict.keys()):
        phase_data = phases_dict[phase_id]
        workflows = phase_data["workflows"]

        completed_count = 0
        total_count = 0
        non_blocking = {"skipped", "optional", "recommended", "conditional"}

        for wf in workflows:
            if wf["status"] not in non_blocking:
                total_count += 1
                if wf["status"] == "completed":
                    completed_count += 1

        phase_status = calculate_phase_status(workflows)

        phases.append({
            "id": phase_id,
            "name": phase_data["name"],
            "status": phase_status,
            "completedCount": completed_count,
            "totalCount": total_count,
            "workflows": workflows
        })

    return phases


def _parse_nested_workflow_status(workflow_status: list, project_path: Path = None) -> list:
    """解析嵌套结构的工作流状态 (每个 phase 包含 workflows 数组)
    
    Args:
        workflow_status: 工作流状态列表
        project_path: 项目根目录路径，用于文件检测
    """
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

            # 如果状态是 pending 且项目路径存在，检查文件是否已生成
            if wf_status == "pending" and project_path:
                detected_file = check_workflow_file_exists(project_path, wf_id)
                if detected_file:
                    wf_status = "completed"
                    wf_status_raw = detected_file
                    logger.info(f"自动检测到工作流输出文件: {wf_id} -> {detected_file}")

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

    return phases


def _get_story_file_status(project_path: Path, story_location: str, story_id: str) -> str | None:
    """从 story 文件中读取 Status 字段"""
    import re
    # story_location 可能是 "md/sprint_artifacts" 或 "md/sprint-artifacts"
    story_dir = project_path / story_location.replace("\\", "/")
    if not story_dir.exists():
        # 尝试替换下划线/连字符
        alt_location = story_location.replace("_", "-") if "_" in story_location else story_location.replace("-", "_")
        story_dir = project_path / alt_location
        if not story_dir.exists():
            return None

    # 查找以 story_id 开头的 .md 文件
    for file in story_dir.glob(f"{story_id}-*.md"):
        try:
            content = file.read_text(encoding='utf-8')
            # 匹配 **Status:** xxx 或 Status: xxx
            match = re.search(r'\*?\*?Status:?\*?\*?\s*(\S+)', content, re.IGNORECASE)
            if match:
                return match.group(1).lower()
        except Exception:
            pass
    return None


def parse_sprint_status(yaml_data: dict, project_path: Path = None) -> dict:
    """解析 sprint-status.yaml 并转换为前端友好的 JSON 结构

    如果提供 project_path，会检查 story 文件中的实际状态
    """
    # 处理 yaml_data 为 None 的情况
    if yaml_data is None:
        return {
            "project": "Unknown Project",
            "epics": [],
            "fileCreated": True,
            "message": "Sprint 文件已创建，但尚无内容"
        }

    project = yaml_data.get("project", "Unknown Project")
    dev_status = yaml_data.get("development_status")
    story_location = yaml_data.get("story_location", "md/sprint_artifacts")

    # 如果 development_status 不存在或为空，返回文件已创建状态
    if not dev_status:
        return {
            "project": project,
            "epics": [],
            "fileCreated": True,
            "message": "Sprint 文件已创建，等待生成 Epic 和 Story"
        }

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
                story_id = f"{epic_num}-{story_num}"

                # 尝试从 story 文件读取真实状态
                real_status = status
                if project_path:
                    real_status = _get_story_file_status(project_path, story_location, story_id) or status

                if epic_num in epics_dict:
                    epics_dict[epic_num]["stories"].append({
                        "id": key,
                        "storyId": story_id,
                        "name": story_name,
                        "status": real_status
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
        result = parse_workflow_status(yaml_data, project_path)
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
        result = parse_sprint_status(yaml_data, project_path)
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


async def implementation_flow_handler(request: web.Request) -> web.Response:
    """处理 GET /api/implementation-flow 请求 - 返回 Implementation 阶段流程状态"""
    projects = await load_recent_projects()
    if not projects:
        return error_response("FILE_NOT_FOUND", "没有打开的项目")

    project_path = Path(projects[0].get("path", ""))
    if not project_path.exists():
        return error_response("FILE_NOT_FOUND", "项目路径不存在")

    # 获取 track_mode
    track_mode = "quick"
    yaml_file = find_workflow_status_file(project_path)
    if yaml_file:
        try:
            with open(yaml_file, 'r', encoding='utf-8') as f:
                yaml_data = yaml.safe_load(f)
            if yaml_data:
                selected_track = yaml_data.get("selected_track", "")
                if "quick" in selected_track.lower():
                    track_mode = "quick"
                else:
                    track_mode = "standard"
        except Exception:
            pass

    result = get_implementation_flow_status(project_path, track_mode)
    return success_response(result)
