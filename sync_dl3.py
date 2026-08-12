# -*- coding: utf-8 -*-
"""
前端镜像同步（L4-19）：以「白名单清单」方式把项目根目录的前端资源同步到 _dl3。
相比旧的 _sync_dl3_ai.py（只同步 4 个文件），本脚本按 manifest 做全量同步：
  - FILES：顶层前端入口/样式/文本
  - DIRS ：整目录镜像（modules / lib / assets / images）
特性：
  - 每个文件用 safe_replace（写 .new 临时文件 + os.replace，带重试）规避 Windows 文件锁
  - 仅“新增/覆盖”清单内文件，绝不删除 _dl3 中清单外的既有文件（避免误删线上数据）
用法：python sync_dl3.py
"""
import os
import shutil
import time
import sys

SRC = r"C:\Users\侯总\WorkBuddy\2026-08-06-08-56-12"
DST = os.path.join(SRC, "_dl3")

# ── 前端镜像清单（白名单）──
FILES = [
    "index.html", "action.html", "app.js", "app_live.js",
    "bd_live.js", "adm_live.js", "css_live.css", "css_live.js",
    "idx_live.html", "styles.css", "styles.override.css",
    "whitepaper.txt", "isokinetic_intro.txt", "sample_isokinetic_report.txt",
    "devices_summary.txt", "requirements.txt",
]
DIRS = ["modules", "lib", "assets", "images"]


def join(base, rel):
    return os.path.join(base, *rel.replace("\\", "/").split("/"))


def safe_replace(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = dst + ".new"
    for attempt in range(1, 6):
        try:
            shutil.copy2(src, tmp)
            os.replace(tmp, dst)
            return True
        except Exception as e:
            if attempt < 5:
                time.sleep(0.4 * attempt)
            else:
                sys.stderr.write("FAIL %s: %s\n" % (dst, e))
                return False
    return False


def sync_file(rel):
    sp = join(SRC, rel)
    dp = join(DST, rel)
    if not os.path.exists(sp):
        print("MISSING SRC", sp)
        return False
    ok = safe_replace(sp, dp)
    print(("OK   " if ok else "ERR  ") + rel)
    return ok


def sync_dir(rel):
    sp = join(SRC, rel)
    if not os.path.isdir(sp):
        print("MISSING SRC DIR", sp)
        return False
    ok = True
    for root, _dirs, files in os.walk(sp):
        for f in files:
            full = os.path.join(root, f)
            relf = os.path.relpath(full, SRC).replace("\\", "/")
            r = sync_file(relf)
            ok = ok and r
    return ok


def main():
    ok = True
    for f in FILES:
        ok = sync_file(f) and ok
    for d in DIRS:
        ok = sync_dir(d) and ok
    print("\nDONE. all_ok =", ok)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
