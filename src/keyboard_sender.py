"""
BMAD GUI - Keyboard Sender
通过键盘模拟向 Claude Code 窗口发送命令
"""

import asyncio
import logging
import sys
import time
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger("bmad-gui")

# 检查依赖
PYAUTOGUI_AVAILABLE = False
PYGETWINDOW_AVAILABLE = False

try:
    import pyautogui
    pyautogui.FAILSAFE = False  # 禁用故障安全（移动到角落不会中断）
    pyautogui.PAUSE = 0.02      # 每个动作之间的间隔
    PYAUTOGUI_AVAILABLE = True
except ImportError:
    logger.warning("pyautogui 未安装，键盘模拟功能不可用")

try:
    import pygetwindow as gw
    PYGETWINDOW_AVAILABLE = True
except ImportError:
    logger.warning("pygetwindow 未安装，窗口查找功能不可用")

# Windows 特定导入
if sys.platform == "win32":
    try:
        import win32gui
        import win32con
        import win32api
        WIN32_AVAILABLE = True
    except ImportError:
        WIN32_AVAILABLE = False
        logger.warning("pywin32 未安装，部分 Windows 功能不可用")
else:
    WIN32_AVAILABLE = False


class KeyboardSender:
    """键盘模拟发送器"""

    def __init__(self):
        self.last_window_handle = None
        self.last_window_title = None

    def is_available(self) -> bool:
        """检查键盘模拟功能是否可用"""
        return PYAUTOGUI_AVAILABLE and PYGETWINDOW_AVAILABLE

    def find_claude_window(self, project_path: str = None) -> Optional[Tuple[any, str]]:
        """
        查找 Claude Code 运行的窗口

        Args:
            project_path: 项目路径，用于匹配窗口标题

        Returns:
            (window_object, window_title) 或 None
        """
        if not PYGETWINDOW_AVAILABLE:
            return None

        project_name = Path(project_path).name.lower() if project_path else None

        try:
            all_windows = gw.getAllWindows()

            # 优先查找标题包含项目名和 claude 的窗口
            for win in all_windows:
                title_lower = win.title.lower()
                if project_name and project_name in title_lower:
                    # 检查是否是终端窗口
                    if any(term in title_lower for term in ['claude', 'cmd', 'powershell', 'terminal', 'windows terminal']):
                        logger.info(f"找到项目窗口: {win.title}")
                        return (win, win.title)

            # 其次查找任何包含 claude 的窗口
            for win in all_windows:
                title_lower = win.title.lower()
                if 'claude' in title_lower:
                    logger.info(f"找到 Claude 窗口: {win.title}")
                    return (win, win.title)

            # 最后查找包含项目路径的窗口
            if project_path:
                for win in all_windows:
                    if project_path.lower() in win.title.lower():
                        logger.info(f"找到路径匹配窗口: {win.title}")
                        return (win, win.title)

            logger.warning("未找到 Claude 窗口")
            return None

        except Exception as e:
            logger.error(f"查找窗口失败: {e}")
            return None

    def activate_window(self, window) -> bool:
        """
        激活指定窗口

        Args:
            window: pygetwindow 窗口对象

        Returns:
            是否成功激活
        """
        try:
            # 如果窗口最小化，先恢复
            if window.isMinimized:
                window.restore()
                time.sleep(0.1)

            # Windows 强制激活方案
            if WIN32_AVAILABLE:
                try:
                    import ctypes
                    from ctypes import wintypes

                    hwnd = win32gui.FindWindow(None, window.title)
                    if hwnd:
                        # 获取当前前台窗口的线程ID
                        foreground_hwnd = win32gui.GetForegroundWindow()
                        foreground_thread_id = ctypes.windll.user32.GetWindowThreadProcessId(
                            foreground_hwnd, None
                        )
                        # 获取目标窗口的线程ID
                        target_thread_id = ctypes.windll.user32.GetWindowThreadProcessId(
                            hwnd, None
                        )
                        # 获取当前线程ID
                        current_thread_id = ctypes.windll.kernel32.GetCurrentThreadId()

                        # 附加线程输入
                        if foreground_thread_id != current_thread_id:
                            ctypes.windll.user32.AttachThreadInput(
                                current_thread_id, foreground_thread_id, True
                            )

                        # 模拟 Alt 键按下（绕过前台锁定）
                        ctypes.windll.user32.keybd_event(0x12, 0, 0, 0)  # Alt down
                        ctypes.windll.user32.keybd_event(0x12, 0, 2, 0)  # Alt up

                        # 如果最小化，恢复窗口
                        if win32gui.IsIconic(hwnd):
                            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                            time.sleep(0.1)

                        # 设置前台窗口
                        win32gui.SetForegroundWindow(hwnd)
                        time.sleep(0.1)

                        # 确保窗口在最前面
                        win32gui.BringWindowToTop(hwnd)

                        # 分离线程输入
                        if foreground_thread_id != current_thread_id:
                            ctypes.windll.user32.AttachThreadInput(
                                current_thread_id, foreground_thread_id, False
                            )

                        time.sleep(0.2)

                        # 验证是否成功
                        if win32gui.GetForegroundWindow() == hwnd:
                            logger.info(f"窗口已激活 (win32): {window.title}")
                            return True

                except Exception as e:
                    logger.warning(f"win32 激活失败: {e}")

            # 备用方案：使用 pygetwindow
            try:
                window.activate()
                time.sleep(0.2)
                if window.isActive:
                    logger.info(f"窗口已激活 (pygetwindow): {window.title}")
                    return True
            except Exception as e:
                logger.warning(f"pygetwindow 激活失败: {e}")

            logger.warning(f"无法激活窗口: {window.title}")
            return False

        except Exception as e:
            logger.error(f"激活窗口失败: {e}")
            return False

    async def send_text(self, text: str, project_path: str = None, use_clipboard: bool = True, force_send: bool = True) -> dict:
        """
        向 Claude 窗口发送文本

        Args:
            text: 要发送的文本
            project_path: 项目路径
            use_clipboard: 是否使用剪贴板（推荐，支持中文和特殊字符）
            force_send: 即使激活失败也尝试发送

        Returns:
            {"success": bool, "message": str, "window_title": str}
        """
        if not self.is_available():
            return {
                "success": False,
                "message": "键盘模拟功能不可用，请安装: pip install pyautogui pygetwindow",
                "window_title": None
            }

        # 查找窗口
        result = self.find_claude_window(project_path)
        if not result:
            return {
                "success": False,
                "message": f"未找到 Claude 窗口 (项目: {project_path})",
                "window_title": None
            }

        window, window_title = result

        # 激活窗口
        activated = self.activate_window(window)
        if not activated and not force_send:
            return {
                "success": False,
                "message": f"无法激活窗口: {window_title}",
                "window_title": window_title
            }

        if not activated:
            logger.warning(f"窗口激活失败，但仍尝试发送: {window_title}")

        try:
            if use_clipboard:
                # 使用剪贴板方式（支持中文和特殊字符）
                await self._send_via_clipboard(text)
            else:
                # 直接键盘输入（仅支持 ASCII）
                await self._send_via_keyboard(text)

            # 按回车发送
            await asyncio.sleep(0.1)
            pyautogui.press('enter')

            logger.info(f"命令已发送到窗口: {window_title}")
            self.last_window_handle = window
            self.last_window_title = window_title

            return {
                "success": True,
                "message": "命令已发送",
                "window_title": window_title
            }

        except Exception as e:
            logger.error(f"发送文本失败: {e}")
            return {
                "success": False,
                "message": f"发送失败: {str(e)}",
                "window_title": window_title
            }

    async def _send_via_clipboard(self, text: str):
        """通过剪贴板发送文本"""
        try:
            import pyperclip
            # 保存原剪贴板内容
            original = pyperclip.paste()

            # 复制新内容
            pyperclip.copy(text)
            await asyncio.sleep(0.05)

            # 粘贴
            pyautogui.hotkey('ctrl', 'v')
            await asyncio.sleep(0.1)

            # 恢复原剪贴板内容
            try:
                pyperclip.copy(original)
            except:
                pass

        except ImportError:
            # 如果没有 pyperclip，使用 Windows API
            if WIN32_AVAILABLE:
                import win32clipboard
                win32clipboard.OpenClipboard()
                win32clipboard.EmptyClipboard()
                win32clipboard.SetClipboardText(text, win32clipboard.CF_UNICODETEXT)
                win32clipboard.CloseClipboard()
                await asyncio.sleep(0.05)
                pyautogui.hotkey('ctrl', 'v')
                await asyncio.sleep(0.1)
            else:
                # 回退到键盘输入
                await self._send_via_keyboard(text)

    async def _send_via_keyboard(self, text: str):
        """直接键盘输入（仅支持 ASCII）"""
        # 使用 typewrite 输入（不支持中文）
        pyautogui.typewrite(text, interval=0.02)

    async def send_enter(self, project_path: str = None) -> dict:
        """发送回车键"""
        result = self.find_claude_window(project_path)
        if not result:
            return {"success": False, "message": "未找到 Claude 窗口", "window_title": None}

        window, window_title = result
        activated = self.activate_window(window)
        if not activated:
            logger.warning(f"窗口激活失败，但仍尝试发送回车: {window_title}")

        pyautogui.press('enter')
        return {"success": True, "message": "已发送回车", "window_title": window_title}

    async def send_escape(self, project_path: str = None) -> dict:
        """发送 ESC 键（取消当前操作）"""
        result = self.find_claude_window(project_path)
        if not result:
            return {"success": False, "message": "未找到 Claude 窗口", "window_title": None}

        window, window_title = result
        activated = self.activate_window(window)
        if not activated:
            logger.warning(f"窗口激活失败，但仍尝试发送 ESC: {window_title}")

        pyautogui.press('escape')
        return {"success": True, "message": "已发送 ESC", "window_title": window_title}

    async def send_ctrl_c(self, project_path: str = None) -> dict:
        """发送 Ctrl+C（中断当前操作）"""
        result = self.find_claude_window(project_path)
        if not result:
            return {"success": False, "message": "未找到 Claude 窗口", "window_title": None}

        window, window_title = result
        activated = self.activate_window(window)
        if not activated:
            logger.warning(f"窗口激活失败，但仍尝试发送 Ctrl+C: {window_title}")

        pyautogui.hotkey('ctrl', 'c')
        return {"success": True, "message": "已发送 Ctrl+C", "window_title": window_title}


# 全局实例
keyboard_sender = KeyboardSender()
