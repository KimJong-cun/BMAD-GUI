#!/usr/bin/env python3
"""
BMAD GUI 启动脚本

功能：
- 检查 Python 版本
- 自动检查并安装缺失的依赖
- 启动 Web 服务器
"""

import sys
import subprocess
import importlib.util
from pathlib import Path

# 最低 Python 版本要求
MIN_PYTHON_VERSION = (3, 8)

# 必需依赖
REQUIRED_PACKAGES = [
    ("aiohttp", "aiohttp"),
    ("yaml", "pyyaml"),
    ("watchdog", "watchdog"),
]

# 可选依赖（键盘模拟功能）
OPTIONAL_PACKAGES = [
    ("pyautogui", "pyautogui"),
    ("pygetwindow", "pygetwindow"),
    ("pyperclip", "pyperclip"),
]

# Windows 特定依赖
WINDOWS_PACKAGES = [
    ("win32gui", "pywin32"),
    ("win32con", "pywin32"),
]


def check_python_version():
    """检查 Python 版本"""
    current = sys.version_info[:2]
    if current < MIN_PYTHON_VERSION:
        print(f"❌ Python 版本过低: {current[0]}.{current[1]}")
        print(f"   需要 Python {MIN_PYTHON_VERSION[0]}.{MIN_PYTHON_VERSION[1]} 或更高版本")
        return False
    print(f"✓ Python 版本: {current[0]}.{current[1]}")
    return True


def check_package(import_name):
    """检查包是否已安装"""
    return importlib.util.find_spec(import_name) is not None


def install_package(pip_name):
    """安装包"""
    print(f"  正在安装 {pip_name}...")
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", pip_name, "-q"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        return True
    except subprocess.CalledProcessError:
        return False


def check_and_install_dependencies():
    """检查并安装依赖"""
    print("\n检查依赖项...")

    missing_required = []
    missing_optional = []

    # 检查必需依赖
    for import_name, pip_name in REQUIRED_PACKAGES:
        if check_package(import_name):
            print(f"  ✓ {pip_name}")
        else:
            print(f"  ✗ {pip_name} (缺失)")
            missing_required.append((import_name, pip_name))

    # 检查可选依赖
    print("\n检查可选依赖（键盘模拟功能）...")
    for import_name, pip_name in OPTIONAL_PACKAGES:
        if check_package(import_name):
            print(f"  ✓ {pip_name}")
        else:
            print(f"  ○ {pip_name} (未安装)")
            missing_optional.append((import_name, pip_name))

    # Windows 特定依赖
    if sys.platform == "win32":
        print("\n检查 Windows 依赖...")
        for import_name, pip_name in WINDOWS_PACKAGES:
            if check_package(import_name):
                print(f"  ✓ {pip_name}")
            else:
                print(f"  ○ {pip_name} (未安装)")
                missing_optional.append((import_name, pip_name))

    # 安装缺失的必需依赖
    if missing_required:
        print("\n安装缺失的必需依赖...")
        for import_name, pip_name in missing_required:
            if install_package(pip_name):
                print(f"  ✓ {pip_name} 安装成功")
            else:
                print(f"  ✗ {pip_name} 安装失败")
                return False

    # 询问是否安装可选依赖
    if missing_optional:
        print("\n是否安装可选依赖？（用于键盘模拟功能）")
        print("  这些依赖用于向 Claude Code 窗口发送命令")
        try:
            choice = input("  输入 y 安装，其他跳过 [y/N]: ").strip().lower()
        except EOFError:
            choice = 'n'

        if choice == 'y':
            print("\n安装可选依赖...")
            for import_name, pip_name in missing_optional:
                if install_package(pip_name):
                    print(f"  ✓ {pip_name} 安装成功")
                else:
                    print(f"  ○ {pip_name} 安装失败（非必需）")

    return True


def start_server(args):
    """启动服务器"""
    # 切换到脚本所在目录
    script_dir = Path(__file__).parent
    src_dir = script_dir / "src"

    # 添加 src 目录到 Python 路径
    if src_dir.exists():
        sys.path.insert(0, str(src_dir))
    else:
        print("❌ src 目录不存在")
        return False

    # 导入并运行服务器
    try:
        from server import main
        main()
    except ImportError as e:
        print(f"\n❌ 导入错误: {e}")
        print("请确保所有文件完整")
        import traceback
        traceback.print_exc()
        return False
    except KeyboardInterrupt:
        print("\n\n服务器已停止")

    return True


def main():
    """主入口"""
    print("=" * 50)
    print("BMAD GUI 启动器")
    print("=" * 50)

    # 检查 Python 版本
    if not check_python_version():
        sys.exit(1)

    # 检查并安装依赖
    if not check_and_install_dependencies():
        print("\n❌ 依赖安装失败，请手动安装：")
        print("   pip install aiohttp pyyaml watchdog")
        sys.exit(1)

    print("\n" + "=" * 50)
    print("启动服务器...")
    print("=" * 50 + "\n")

    # 启动服务器
    start_server(sys.argv[1:])


if __name__ == "__main__":
    main()
