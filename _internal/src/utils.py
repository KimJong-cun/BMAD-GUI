"""
BMAD GUI - Utility Functions
工具函数
"""

import socket
import logging
from pathlib import Path

logger = logging.getLogger("bmad-gui")


def is_port_available(port: int) -> bool:
    """检测端口是否可用"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('localhost', port))
            return True
        except OSError:
            return False


def find_available_port(start_port: int, max_attempts: int = 10) -> int:
    """查找可用端口，从 start_port 开始尝试，最多尝试 max_attempts 次"""
    for i in range(max_attempts):
        port = start_port + i
        if is_port_available(port):
            if i > 0:
                logger.warning(f"端口 {start_port} 被占用，使用端口 {port}")
            return port
    raise RuntimeError(f"无法找到可用端口（已尝试 {start_port}-{start_port + max_attempts - 1}）")


def validate_path_safety(path_str: str) -> tuple[bool, Path | None, str]:
    """验证路径安全性并返回解析后的路径

    Returns:
        (is_valid, resolved_path, error_code)
    """
    if not path_str:
        return False, None, "INVALID_PATH"
    try:
        path = Path(path_str).resolve()
        if not path.exists():
            return False, None, "FILE_NOT_FOUND"
        if not path.is_dir():
            return False, None, "INVALID_PATH"
        return True, path, ""
    except (ValueError, OSError):
        return False, None, "INVALID_PATH"
