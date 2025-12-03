"""
BMAD GUI - Claude Handlers
Claude Code API 处理器
"""

import asyncio
import json
import logging
import re
import sys
from pathlib import Path

from aiohttp import web

from file_ops import load_recent_projects
from claude_manager import ClaudeCodeManager, ProcessStatus
from keyboard_sender import keyboard_sender
from .response import error_response, success_response
from .sse import broadcast_sse_event

logger = logging.getLogger("bmad-gui")

# 全局 ClaudeCodeManager 实例
claude_manager = None


async def detect_project_claude_process(project_path: str = None) -> dict:
    """
    检测指定项目目录中是否有 Claude Code 进程在运行

    Args:
        project_path: 项目路径，如果为 None 则检测全局 Claude 进程

    Returns:
        dict: {"running": bool, "pid": int|None, "cwd": str|None, "match_type": str}
        match_type: "project" = 匹配到项目, "global" = 只检测到 Claude 但无法确定项目
    """
    result = {"running": False, "pid": None, "cwd": None, "match_type": None, "window_title": None}

    try:
        if sys.platform == "win32":
            # 方法1: 通过命令行参数检测 Claude 进程
            # 只检测 node.exe 进程，且命令行包含 "claude-code" 或 "@anthropic-ai"（Claude Code 的特征）
            ps_cmd_cmdline = '''powershell -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'claude-code|@anthropic-ai' } | Select-Object ProcessId,Name,@{N='CmdLine';E={if($_.CommandLine.Length -gt 300){$_.CommandLine.Substring(0,300)}else{$_.CommandLine}}} | ConvertTo-Json -Compress"'''

            proc = await asyncio.create_subprocess_shell(
                ps_cmd_cmdline,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            output = stdout.decode('utf-8', errors='replace').strip()

            claude_processes = []
            if output:
                try:
                    data = json.loads(output)
                    if isinstance(data, dict):
                        data = [data]
                    claude_processes = data
                except json.JSONDecodeError:
                    pass

            # 方法2: 获取所有终端窗口（cmd/powershell/terminal），检查标题是否包含项目路径
            # 因为 cmd 窗口标题通常显示当前目录
            terminal_windows = []
            if project_path:
                ps_cmd_terminal = '''powershell -Command "Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' -and ($_.ProcessName -eq 'cmd' -or $_.ProcessName -eq 'powershell' -or $_.ProcessName -eq 'WindowsTerminal' -or $_.ProcessName -eq 'pwsh') } | Select-Object Id,ProcessName,MainWindowTitle | ConvertTo-Json -Compress"'''

                proc = await asyncio.create_subprocess_shell(
                    ps_cmd_terminal,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, _ = await proc.communicate()
                output = stdout.decode('utf-8', errors='replace').strip()

                if output:
                    try:
                        data = json.loads(output)
                        if isinstance(data, dict):
                            data = [data]
                        terminal_windows = data
                    except json.JSONDecodeError:
                        pass

            # 方法2.5: 获取从 GUI 启动的 cmd.exe 进程（命令行包含 "cd /d" 和 "claude"）
            claude_related_processes = []
            ps_cmd_related = '''powershell -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -match 'cd /d.*claude' } | Select-Object ProcessId,Name,@{N='CmdLine';E={if($_.CommandLine.Length -gt 500){$_.CommandLine.Substring(0,500)}else{$_.CommandLine}}} | ConvertTo-Json -Compress"'''
            proc = await asyncio.create_subprocess_shell(
                ps_cmd_related,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            output = stdout.decode('utf-8', errors='replace').strip()
            if output:
                try:
                    data = json.loads(output)
                    if isinstance(data, dict):
                        data = [data]
                    claude_related_processes = data
                except json.JSONDecodeError:
                    pass

            # 如果找到了 Claude 进程
            if claude_processes:
                matched_process = None
                matched_terminal = None

                if project_path:
                    project_name = Path(project_path).name.lower()
                    project_path_lower = project_path.lower().replace('/', '\\')
                    # 提取项目路径中的字母数字部分用于模糊匹配（处理编码问题）
                    project_path_ascii = re.sub(r'[^a-zA-Z0-9\\:/]', '', project_path_lower)

                    # 先检查命令行中是否包含项目路径
                    for proc_info in claude_processes:
                        cmdline = proc_info.get('CmdLine', '').lower()
                        if project_path_lower in cmdline or project_name in cmdline:
                            matched_process = proc_info
                            result["match_type"] = "project"
                            logger.info(f"检测到项目 Claude 进程 (命令行匹配): 项目={project_name}, PID={proc_info.get('ProcessId')}")
                            break

                    # 检查 claude_related 中的 cmd.exe 命令行是否包含项目路径
                    if not matched_process and claude_related_processes:
                        for proc_info in claude_related_processes:
                            if proc_info.get('Name', '').lower() == 'cmd.exe':
                                cmdline = proc_info.get('CmdLine', '').lower()
                                cmdline_ascii = re.sub(r'[^a-zA-Z0-9\\:/]', '', cmdline)
                                # 使用 ASCII 版本匹配（处理中文乱码）
                                if project_path_ascii in cmdline_ascii:
                                    matched_process = claude_processes[0]
                                    result["match_type"] = "project"
                                    logger.info(f"检测到项目 Claude 进程 (cmd.exe 命令行匹配): 项目={project_name}")
                                    break

                    # 如果命令行没匹配到，检查终端窗口标题是否包含项目路径
                    if not matched_process and terminal_windows:
                        for terminal in terminal_windows:
                            title = terminal.get('MainWindowTitle', '').lower()
                            # 检查窗口标题是否包含项目路径或项目名
                            if project_path_lower in title or project_name in title:
                                matched_terminal = terminal
                                matched_process = claude_processes[0]  # 使用第一个 Claude 进程
                                result["match_type"] = "project"
                                logger.info(f"检测到项目 Claude 进程 (终端窗口匹配): 项目={project_name}, 终端标题={title}")
                                break

                # 如果没找到项目匹配，使用第一个 Claude 进程
                if not matched_process:
                    matched_process = claude_processes[0]
                    result["match_type"] = "global"
                    logger.info(f"检测到 Claude 进程 (全局): PID={matched_process.get('ProcessId')}")

                result["running"] = True
                result["pid"] = matched_process.get('ProcessId')
                result["cwd"] = project_path
                if matched_terminal:
                    result["window_title"] = matched_terminal.get('MainWindowTitle', f"Claude (PID: {matched_process.get('ProcessId')})")
                else:
                    result["window_title"] = f"Claude (PID: {matched_process.get('ProcessId')})"
                return result

            # 方法3: 备用 - 通过窗口标题检测（当命令行检测失败时）
            ps_cmd_window = '''powershell -Command "Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*claude*' } | Select-Object Id,MainWindowTitle | ConvertTo-Json -Compress"'''

            proc = await asyncio.create_subprocess_shell(
                ps_cmd_window,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            output = stdout.decode('utf-8', errors='replace').strip()

            claude_windows = []
            if output:
                try:
                    data = json.loads(output)
                    if isinstance(data, dict):
                        data = [data]
                    claude_windows = data
                except json.JSONDecodeError:
                    pass

            if claude_windows:
                matched_window = None

                # 如果有项目路径，尝试匹配项目名
                if project_path:
                    project_name = Path(project_path).name.lower()
                    for win in claude_windows:
                        title = win.get('MainWindowTitle', '').lower()
                        # 检查窗口标题是否包含项目名
                        if project_name in title:
                            matched_window = win
                            result["match_type"] = "project"
                            logger.info(f"检测到项目 Claude 窗口: 项目={project_name}, 标题={title}")
                            break

                # 如果没找到项目匹配，使用第一个 Claude 窗口
                if not matched_window:
                    matched_window = claude_windows[0]
                    result["match_type"] = "global"
                    logger.info(f"检测到 Claude 窗口 (全局): 标题={matched_window.get('MainWindowTitle')}")

                result["running"] = True
                result["pid"] = matched_window.get('Id')
                result["cwd"] = project_path
                result["window_title"] = matched_window.get('MainWindowTitle')

        else:
            # Linux/macOS - 使用 lsof 检查进程的工作目录
            proc = await asyncio.create_subprocess_shell(
                f'lsof +D "{project_path}" 2>/dev/null | grep -i claude | head -1 | awk \'{{print $2}}\'',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            output = stdout.decode('utf-8', errors='replace').strip()

            if output:
                try:
                    pid = int(output)
                    result["running"] = True
                    result["pid"] = pid
                    result["cwd"] = project_path
                except ValueError:
                    pass

    except Exception as e:
        logger.error(f"检测项目 Claude 进程失败: {e}")

    return result


async def debug_claude_processes_handler(request: web.Request) -> web.Response:
    """调试端点 - 列出所有可能的 Claude 相关进程"""
    debug_info = {
        "platform": sys.platform,
        "detection_results": {},
        "node_processes": [],
        "claude_related": [],
        "terminal_windows": [],
        "all_windows_with_title": [],
        "current_project": None,
        "project_name": None
    }

    try:
        # 获取当前项目信息
        projects = await load_recent_projects()
        project_path = projects[0].get("path") if projects else None
        debug_info["current_project"] = project_path
        if project_path:
            debug_info["project_name"] = Path(project_path).name

        # 获取所有有窗口标题的进程
        if sys.platform == "win32":
            ps_cmd_all = '''powershell -Command "Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id,ProcessName,MainWindowTitle | ConvertTo-Json -Compress"'''
            proc = await asyncio.create_subprocess_shell(
                ps_cmd_all,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            output = stdout.decode('utf-8', errors='replace').strip()
            if output:
                try:
                    data = json.loads(output)
                    if isinstance(data, dict):
                        data = [data]
                    debug_info["all_windows_with_title"] = data
                except json.JSONDecodeError:
                    debug_info["all_windows_raw"] = output[:1000]
        if sys.platform == "win32":
            # 获取所有 Node.js 进程
            ps_cmd1 = '''powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' } | Select-Object ProcessId,Name,@{N='CmdLine';E={$_.CommandLine.Substring(0, [Math]::Min(200, $_.CommandLine.Length))}} | ConvertTo-Json -Compress"'''
            proc1 = await asyncio.create_subprocess_shell(
                ps_cmd1,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout1, _ = await proc1.communicate()
            output1 = stdout1.decode('utf-8', errors='replace').strip()

            if output1:
                try:
                    data = json.loads(output1)
                    if isinstance(data, dict):
                        data = [data]
                    debug_info["node_processes"] = data
                except json.JSONDecodeError:
                    debug_info["node_processes_raw"] = output1[:500]

            # 获取命令行包含 claude 或 anthropic 的进程
            ps_cmd2 = '''powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'claude|anthropic' } | Select-Object ProcessId,Name,@{N='CmdLine';E={$_.CommandLine.Substring(0, [Math]::Min(200, $_.CommandLine.Length))}} | ConvertTo-Json -Compress"'''
            proc2 = await asyncio.create_subprocess_shell(
                ps_cmd2,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout2, _ = await proc2.communicate()
            output2 = stdout2.decode('utf-8', errors='replace').strip()

            if output2:
                try:
                    data = json.loads(output2)
                    if isinstance(data, dict):
                        data = [data]
                    debug_info["claude_related"] = data
                except json.JSONDecodeError:
                    debug_info["claude_related_raw"] = output2[:500]

            # 获取窗口标题
            ps_cmd3 = '''powershell -Command "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id,ProcessName,MainWindowTitle | ConvertTo-Json -Compress"'''
            proc3 = await asyncio.create_subprocess_shell(
                ps_cmd3,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout3, _ = await proc3.communicate()
            output3 = stdout3.decode('utf-8', errors='replace').strip()

            if output3:
                try:
                    data = json.loads(output3)
                    if isinstance(data, dict):
                        data = [data]
                    # 只保留包含 claude 的窗口或终端窗口
                    filtered = [p for p in data if 'claude' in p.get('MainWindowTitle', '').lower()
                               or p.get('ProcessName', '').lower() in ('cmd', 'powershell', 'windowsterminal')]
                    debug_info["terminal_windows"] = filtered[:10]  # 限制数量
                except json.JSONDecodeError:
                    debug_info["terminal_windows_raw"] = output3[:500]

            # 获取当前项目路径
            projects = await load_recent_projects()
            project_path = projects[0].get("path") if projects else None
            debug_info["current_project"] = project_path

            # 运行检测函数
            detection_result = await detect_project_claude_process(project_path)
            debug_info["detection_results"] = detection_result

    except Exception as e:
        debug_info["error"] = str(e)
        import traceback
        debug_info["traceback"] = traceback.format_exc()

    return success_response(debug_info)


async def start_claude_handler(request: web.Request) -> web.Response:
    """处理 POST /api/claude/start 请求 - 启动 Claude Code 进程"""
    global claude_manager

    projects = await load_recent_projects()
    if not projects:
        return error_response("FILE_NOT_FOUND", "没有打开的项目，请先打开一个 BMAD 项目")

    project_path = Path(projects[0].get("path", ""))
    if not project_path.exists():
        return error_response("FILE_NOT_FOUND", "项目路径不存在")

    if claude_manager is None or claude_manager.project_path != str(project_path):
        claude_manager = ClaudeCodeManager(str(project_path), broadcast_sse_event)

    success = await claude_manager.start()
    if success:
        return success_response({
            "status": "starting",
            "message": "Claude Code 正在启动...",
            "pid": claude_manager.pid
        })
    else:
        return error_response("START_FAILED", claude_manager.error_message or "启动失败")


async def stop_claude_handler(request: web.Request) -> web.Response:
    """处理 POST /api/claude/stop 请求 - 停止 Claude Code 进程"""
    global claude_manager

    if claude_manager is None:
        return success_response({
            "status": "stopped",
            "message": "进程未运行"
        })

    success = await claude_manager.stop()
    if success:
        return success_response({
            "status": "stopped",
            "message": "Claude Code 已停止"
        })
    else:
        return error_response("STOP_FAILED", "停止失败")


async def get_claude_status_handler(request: web.Request) -> web.Response:
    """处理 GET /api/claude/status 请求 - 获取 Claude Code 进程状态"""
    global claude_manager

    # 获取当前项目路径
    projects = await load_recent_projects()
    project_path = projects[0].get("path") if projects else None

    # 检测指定项目的 Claude 状态
    project_status = await detect_project_claude_process(project_path)

    if project_status["running"]:
        return success_response({
            "status": "running",
            "pid": project_status["pid"],
            "cwd": project_status["cwd"],
            "window_title": project_status.get("window_title"),
            "match_type": project_status.get("match_type"),  # "project" 或 "global"
            "started_at": None,
            "error_message": None,
            "source": "project"
        })

    if claude_manager is not None:
        status = claude_manager.get_status()
        status["source"] = "gui"
        return success_response(status)

    return success_response({
        "status": "stopped",
        "pid": None,
        "started_at": None,
        "error_message": None,
        "source": None
    })


async def launch_claude_window_handler(request: web.Request) -> web.Response:
    """处理 POST /api/claude/launch 请求 - 在新窗口中启动 Claude Code"""
    try:
        body = await request.json()
        project_path = body.get("path", "").strip()
        dangerous_mode = body.get("dangerousMode", False)
    except Exception:
        project_path = ""
        dangerous_mode = False

    if not project_path:
        projects = await load_recent_projects()
        if not projects:
            return error_response("FILE_NOT_FOUND", "请指定项目路径或先打开一个项目")
        project_path = projects[0].get("path", "")

    project_path = Path(project_path)
    if not project_path.exists():
        return error_response("FILE_NOT_FOUND", f"项目路径不存在: {project_path}")

    claude_cmd = "claude --dangerously-skip-permissions" if dangerous_mode else "claude"
    mode_label = "危险模式" if dangerous_mode else "标准模式"

    try:
        if sys.platform == "win32":
            import subprocess
            cmd = f'start cmd /k "cd /d {project_path} && {claude_cmd}"'
            subprocess.Popen(cmd, shell=True)
            logger.info(f"在新窗口中启动 Claude Code ({mode_label}): {project_path}")
        else:
            import subprocess
            if sys.platform == "darwin":
                script = f'tell app "Terminal" to do script "cd {project_path} && {claude_cmd}"'
                subprocess.Popen(['osascript', '-e', script])
            else:
                for terminal in ['gnome-terminal', 'konsole', 'xterm']:
                    try:
                        subprocess.Popen([terminal, '--', 'bash', '-c', f'cd {project_path} && {claude_cmd}'])
                        break
                    except FileNotFoundError:
                        continue
            logger.info(f"在新终端中启动 Claude Code ({mode_label}): {project_path}")

        return success_response({
            "status": "launched",
            "message": f"Claude Code ({mode_label}) 已在新窗口中启动",
            "path": str(project_path),
            "dangerousMode": dangerous_mode
        })
    except Exception as e:
        logger.error(f"启动 Claude Code 窗口失败: {e}")
        return error_response("LAUNCH_FAILED", f"启动失败: {str(e)}")


async def send_command_handler(request: web.Request) -> web.Response:
    """处理 POST /api/command 请求 - 发送命令到 Claude Code"""
    global claude_manager

    if claude_manager is None or claude_manager.status != ProcessStatus.RUNNING:
        return error_response("PROCESS_NOT_RUNNING", "Claude Code 进程未运行，请先启动")

    try:
        body = await request.json()
        command = body.get("command", "").strip()
    except Exception:
        return error_response("INVALID_REQUEST", "无效的请求体")

    if not command:
        return error_response("INVALID_COMMAND", "命令不能为空")

    success = await claude_manager.send_command(command)
    if success:
        return success_response({
            "message": "命令已发送",
            "command": command
        })
    else:
        return error_response("SEND_FAILED", "命令发送失败")


async def send_input_handler(request: web.Request) -> web.Response:
    """处理 POST /api/claude/send-input 请求 - 通过键盘模拟向 Claude 窗口发送输入"""
    if not keyboard_sender.is_available():
        return error_response(
            "NOT_AVAILABLE",
            "键盘模拟功能不可用，请安装: pip install pyautogui pygetwindow pyperclip"
        )

    try:
        body = await request.json()
        text = body.get("text", "").strip()
        action = body.get("action", "send")  # send, enter, escape, ctrl_c
    except Exception:
        return error_response("INVALID_REQUEST", "无效的请求体")

    # 获取当前项目路径
    projects = await load_recent_projects()
    project_path = projects[0].get("path") if projects else None

    if action == "send":
        if not text:
            return error_response("INVALID_INPUT", "文本不能为空")
        result = await keyboard_sender.send_text(text, project_path)
    elif action == "enter":
        result = await keyboard_sender.send_enter(project_path)
    elif action == "escape":
        result = await keyboard_sender.send_escape(project_path)
    elif action == "ctrl_c":
        result = await keyboard_sender.send_ctrl_c(project_path)
    else:
        return error_response("INVALID_ACTION", f"不支持的操作: {action}")

    if result["success"]:
        return success_response(result)
    else:
        return error_response("SEND_FAILED", result["message"])
