"""
BMAD GUI - File Watchers
文件监听模块
"""

import asyncio
import logging
from pathlib import Path

import yaml

from config import WATCHED_FILES
from handlers.sse import broadcast_sse_event, set_current_project
from handlers.workflow import parse_workflow_status, parse_sprint_status

logger = logging.getLogger("bmad-gui")

# watchfiles 支持
try:
    import watchfiles
    WATCHFILES_AVAILABLE = True
except ImportError:
    WATCHFILES_AVAILABLE = False
    logger.warning("watchfiles 未安装，文件监听功能将不可用")

# 全局变量
file_watcher_task = None
current_project_path: Path | None = None


async def watch_project_files(project_path: Path) -> None:
    """监听项目相关文件变化"""
    if not WATCHFILES_AVAILABLE:
        logger.warning("watchfiles 未安装，无法启动文件监听")
        return

    watch_dirs = set()

    md_dir = project_path / "md"
    if md_dir.exists():
        watch_dirs.add(md_dir)
        sprint_artifacts = md_dir / "sprint-artifacts"
        if sprint_artifacts.exists():
            watch_dirs.add(sprint_artifacts)

    watch_dirs.add(project_path)

    if not watch_dirs:
        logger.warning(f"没有可监听的目录: {project_path}")
        return

    logger.info(f"开始监听项目文件，目录: {[str(d) for d in watch_dirs]}")

    try:
        async for changes in watchfiles.awatch(*watch_dirs):
            for change_type, change_path in changes:
                change_path = Path(change_path)
                filename = change_path.name

                if filename in WATCHED_FILES:
                    file_type = WATCHED_FILES[filename]
                    logger.info(f"检测到文件变化: {change_type} - {change_path} (类型: {file_type})")

                    if file_type == "workflow":
                        await handle_workflow_file_change(change_path)
                    elif file_type == "sprint":
                        await handle_sprint_file_change(change_path)

    except asyncio.CancelledError:
        logger.info("文件监听任务已取消")
    except Exception as e:
        logger.error(f"文件监听错误: {e}")


async def handle_workflow_file_change(yaml_file: Path) -> None:
    """处理工作流状态文件变化"""
    try:
        await asyncio.sleep(0.1)

        with open(yaml_file, 'r', encoding='utf-8') as f:
            yaml_data = yaml.safe_load(f)

        result = parse_workflow_status(yaml_data)
        await broadcast_sse_event("workflow_update", result)
        logger.info(f"已广播工作流更新")

    except yaml.YAMLError as e:
        logger.error(f"YAML 解析失败: {e}")
    except Exception as e:
        logger.error(f"处理文件变化失败: {e}")


async def handle_sprint_file_change(yaml_file: Path) -> None:
    """处理 Sprint 状态文件变化"""
    try:
        await asyncio.sleep(0.1)

        with open(yaml_file, 'r', encoding='utf-8') as f:
            yaml_data = yaml.safe_load(f)

        result = parse_sprint_status(yaml_data)
        await broadcast_sse_event("sprint_update", result)
        logger.info(f"已广播 Sprint 更新")

    except yaml.YAMLError as e:
        logger.error(f"Sprint YAML 解析失败: {e}")
    except Exception as e:
        logger.error(f"处理 Sprint 文件变化失败: {e}")


async def start_file_watcher(project_path: Path) -> None:
    """启动文件监听任务"""
    global file_watcher_task, current_project_path

    await stop_file_watcher()

    current_project_path = project_path
    set_current_project(project_path)
    file_watcher_task = asyncio.create_task(watch_project_files(project_path))
    logger.info(f"文件监听已启动: {project_path}")


async def stop_file_watcher() -> None:
    """停止文件监听任务"""
    global file_watcher_task, current_project_path

    if file_watcher_task:
        file_watcher_task.cancel()
        try:
            await file_watcher_task
        except asyncio.CancelledError:
            pass
        file_watcher_task = None
        logger.info("文件监听已停止")
