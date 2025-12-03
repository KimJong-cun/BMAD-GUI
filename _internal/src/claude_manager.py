"""
BMAD GUI - Claude Code Manager
Claude Code 进程管理器
"""

import asyncio
import logging
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional

logger = logging.getLogger("bmad-gui")

# Windows PTY 支持
try:
    import winpty
    WINPTY_AVAILABLE = True
except ImportError:
    WINPTY_AVAILABLE = False


class ProcessStatus(Enum):
    """Claude Code 进程状态枚举"""
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    ERROR = "error"


@dataclass
class OutputEvent:
    """Claude Code 输出事件"""
    event_type: str  # "text", "code", "error"
    content: str
    timestamp: float


class ClaudeCodeManager:
    """Claude Code 进程管理器

    在 Windows 上使用 winpty (PTY) 模拟真实终端，保持会话状态和上下文记忆。
    在其他平台使用标准 asyncio subprocess。
    """

    def __init__(self, project_path: str, broadcast_func=None):
        self.project_path = project_path
        self.status: ProcessStatus = ProcessStatus.STOPPED
        self.pid: Optional[int] = None
        self.started_at: Optional[datetime] = None
        self.error_message: Optional[str] = None
        self._pty_process = None
        self._read_task: Optional[asyncio.Task] = None
        self._output_buffer = ""
        self._broadcast_func = broadcast_func

    async def _broadcast(self, event_type: str, data: dict):
        """广播事件"""
        if self._broadcast_func:
            await self._broadcast_func(event_type, data)

    async def start(self) -> bool:
        """启动 Claude Code 进程"""
        if self.status == ProcessStatus.RUNNING:
            logger.info("Claude Code 已在运行中")
            return True

        try:
            self.status = ProcessStatus.STARTING
            logger.info(f"正在启动 Claude Code: project={self.project_path}")
            await self._broadcast("claude_status", {"status": "starting"})

            if sys.platform == "win32" and WINPTY_AVAILABLE:
                import os
                os.chdir(self.project_path)
                self._pty_process = winpty.PtyProcess.spawn('claude')
                self.pid = self._pty_process.pid
                logger.info(f"Claude Code (PTY) 启动成功: pid={self.pid}")
                self._read_task = asyncio.create_task(self._read_pty_output())
            else:
                logger.warning("未安装 winpty，将使用无状态模式（每个命令独立执行）")
                check_proc = await asyncio.create_subprocess_shell(
                    "claude --version",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, stderr = await check_proc.communicate()
                if check_proc.returncode != 0:
                    raise FileNotFoundError("claude command not found")
                version = stdout.decode('utf-8', errors='replace').strip()
                logger.info(f"Claude Code CLI 版本: {version}")
                self.pid = 1

            self.started_at = datetime.now()
            self.status = ProcessStatus.RUNNING
            self.error_message = None

            await self._broadcast("claude_status", {
                "status": "running",
                "pid": self.pid
            })
            return True

        except FileNotFoundError:
            self.status = ProcessStatus.ERROR
            self.error_message = "未找到 claude 命令，请确保 Claude Code CLI 已安装"
            logger.error(f"Claude Code 启动失败: {self.error_message}")
            await self._broadcast("claude_status", {
                "status": "error",
                "message": self.error_message
            })
            return False
        except Exception as e:
            self.status = ProcessStatus.ERROR
            self.error_message = str(e)
            logger.error(f"Claude Code 启动失败: {e}")
            await self._broadcast("claude_status", {
                "status": "error",
                "message": str(e)
            })
            return False

    async def stop(self) -> bool:
        """停止 Claude Code 进程"""
        if self._read_task and not self._read_task.done():
            self._read_task.cancel()
            try:
                await self._read_task
            except asyncio.CancelledError:
                pass

        if self._pty_process:
            try:
                self._pty_process.close()
            except Exception as e:
                logger.error(f"关闭 PTY 进程失败: {e}")
            self._pty_process = None

        self.status = ProcessStatus.STOPPED
        self.pid = None
        logger.info("Claude Code 已停止")
        await self._broadcast("claude_status", {"status": "stopped"})
        return True

    def get_status(self) -> dict:
        """获取进程状态"""
        return {
            "status": self.status.value,
            "pid": self.pid,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "error_message": self.error_message
        }

    async def send_command(self, command: str) -> bool:
        """发送命令到 Claude Code"""
        if self.status != ProcessStatus.RUNNING:
            logger.warning("Claude Code 未运行，无法发送命令")
            return False

        logger.info(f"发送命令: {command[:50]}{'...' if len(command) > 50 else ''}")
        await self._broadcast("command_sent", {"command": command})

        try:
            if self._pty_process:
                self._pty_process.write(command + '\n')
                return True
            else:
                asyncio.create_task(self._execute_stateless(command))
                return True
        except Exception as e:
            logger.error(f"命令发送失败: {e}")
            return False

    async def _read_pty_output(self):
        """持续读取 PTY 输出并广播"""
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*\x07)')

        while self._pty_process and self.status == ProcessStatus.RUNNING:
            try:
                output = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: self._pty_process.read(4096) if self._pty_process.isalive() else ""
                )

                if output:
                    logger.debug(f"PTY 原始输出 ({len(output)} bytes): {repr(output[:200])}")
                    clean_output = ansi_escape.sub('', output)
                    if clean_output:
                        logger.info(f"广播输出: {clean_output[:100]}...")
                        await self._broadcast("claude_output", {
                            "event_type": "text",
                            "content": clean_output,
                            "timestamp": time.time() * 1000
                        })
                else:
                    await asyncio.sleep(0.1)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"读取 PTY 输出错误: {e}")
                await asyncio.sleep(0.5)

        if self._pty_process and not self._pty_process.isalive():
            logger.info("Claude Code PTY 进程已退出")
            self.status = ProcessStatus.STOPPED
            await self._broadcast("claude_status", {"status": "stopped"})

    async def _execute_stateless(self, command: str):
        """无状态模式：使用 claude -p 执行单个命令"""
        try:
            escaped_command = command.replace('"', '\\"')

            if sys.platform == "win32":
                process = await asyncio.create_subprocess_shell(
                    f'claude -p "{escaped_command}"',
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=self.project_path
                )
            else:
                process = await asyncio.create_subprocess_exec(
                    "claude", "-p", command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=self.project_path
                )

            async def read_stream(stream, event_type):
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    content = line.decode('utf-8', errors='replace').rstrip()
                    if content:
                        await self._broadcast("claude_output", {
                            "event_type": event_type,
                            "content": content,
                            "timestamp": time.time() * 1000
                        })

            await asyncio.gather(
                read_stream(process.stdout, "text"),
                read_stream(process.stderr, "error")
            )

            await process.wait()
            await self._broadcast("claude_output", {
                "event_type": "complete",
                "content": "",
                "timestamp": time.time() * 1000,
                "exit_code": process.returncode
            })

        except Exception as e:
            logger.error(f"命令执行失败: {e}")
            await self._broadcast("claude_output", {
                "event_type": "error",
                "content": f"执行失败: {str(e)}",
                "timestamp": time.time() * 1000
            })
