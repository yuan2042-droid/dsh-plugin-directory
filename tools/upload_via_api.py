#!/usr/bin/env python3
"""把本仓库上传到 GitHub（不需要 git，只用标准库 + GitHub REST API）。

用法（token 只在本地输入，不会出现在命令行历史里）：

    py tools/upload_via_api.py --owner yuan2042-droid

    # 或者先放环境变量
    set GITHUB_TOKEN=github_pat_xxx
    py tools/upload_via_api.py --owner yuan2042-droid

    # 只看会传哪些文件，不真的请求
    py tools/upload_via_api.py --owner yuan2042-droid --dry-run

token 只需要 public_repo（或 fine-grained token 的 "Contents: Read and write"
+ "Administration: Read and write"，用于首次建仓）。
"""
import argparse
import base64
import getpass
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.github.com"
SKIP_DIRS = {".git", "node_modules", "dist", "__pycache__"}
SKIP_FILES = {".DS_Store", "Thumbs.db"}


def call(method, path, token, payload=None):
    url = path if path.startswith("http") else API + path
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("User-Agent", "dsh-plugin-directory-uploader")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            body = res.read().decode("utf-8")
            return res.status, (json.loads(body) if body.strip() else {})
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = {"message": body}
        return e.code, parsed


def collect(root):
    files = []
    for base, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in names:
            if name in SKIP_FILES:
                continue
            full = os.path.join(base, name)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            files.append((rel, full))
    files.sort()
    return files


def main():
    parser = argparse.ArgumentParser(description="Upload this plugin repo to GitHub without git")
    parser.add_argument("--owner", required=True, help="GitHub 用户名/组织，例如 yuan2042-droid")
    parser.add_argument("--repo", default="dsh-plugin-directory", help="仓库名（默认 dsh-plugin-directory）")
    parser.add_argument("--token", default=os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN"),
                        help="PAT；不填则从 GITHUB_TOKEN 读取或交互输入")
    parser.add_argument("--branch", default="main")
    parser.add_argument("--private", action="store_true", help="建私有仓")
    parser.add_argument("--dry-run", action="store_true", help="只列出要上传的文件")
    args = parser.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    files = collect(root)
    total = sum(os.path.getsize(path) for _, path in files)
    print(f"待上传 {len(files)} 个文件，共 {total/1024:.0f} KB")
    for rel, full in files:
        print(f"  {os.path.getsize(full):>9,}  {rel}")
    if args.dry_run:
        return 0

    token = args.token or getpass.getpass("GitHub PAT（输入不回显）: ").strip()
    if not token:
        print("没有 token，退出", file=sys.stderr)
        return 2

    status, me = call("GET", "/user", token)
    if status != 200:
        print(f"token 无效或权限不足：HTTP {status} {me.get('message')}", file=sys.stderr)
        return 2
    login = me.get("login")
    if login.lower() != args.owner.lower():
        print(f"注意：token 属于 {login}，不是 {args.owner}；将按 token 的身份建仓")

    full_name = f"{args.owner}/{args.repo}"
    status, repo = call("GET", f"/repos/{full_name}", token)
    if status == 404:
        print(f"仓库 {full_name} 不存在，创建中…")
        status, repo = call("POST", "/user/repos" if args.owner == login else f"/orgs/{args.owner}/repos", token, {
            "name": args.repo,
            "description": "DSH 插件目录：在 DeepSeek Harness 侧边栏浏览、搜索、排序社区插件",
            "private": args.private,
            "has_issues": True,
            "has_wiki": False,
            "auto_init": True,
        })
        if status not in (200, 201):
            print(f"建仓失败：HTTP {status} {repo.get('message')}", file=sys.stderr)
            return 1
    elif status != 200:
        print(f"读取仓库失败：HTTP {status} {repo.get('message')}", file=sys.stderr)
        return 1

    # 空仓库上 Git Data API 会返回 409 Git Repository is empty：先落一个占位文件做首个提交
    branch = repo.get("default_branch") or args.branch
    status, ref = call("GET", f"/repos/{full_name}/git/ref/heads/{branch}", token)
    if status in (404, 409):
        print("仓库为空，先创建首个提交…")
        status, boot = call("PUT", f"/repos/{full_name}/contents/.gitkeep", token, {
            "message": "chore: bootstrap repository",
            "content": base64.b64encode(b"").decode("ascii"),
        })
        if status not in (200, 201):
            print(f"初始化提交失败：HTTP {status} {boot.get('message')}", file=sys.stderr)
            return 1

    print("创建 blob…")
    tree = []
    for rel, full in files:
        with open(full, "rb") as fh:
            content = base64.b64encode(fh.read()).decode("ascii")
        status, blob = call("POST", f"/repos/{full_name}/git/blobs", token, {"content": content, "encoding": "base64"})
        if status not in (200, 201):
            print(f"blob 失败 {rel}: HTTP {status} {blob.get('message')}", file=sys.stderr)
            return 1
        tree.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})

    print("创建 tree/commit…")
    status, new_tree = call("POST", f"/repos/{full_name}/git/trees", token, {"tree": tree})
    if status not in (200, 201):
        print(f"tree 失败：HTTP {status} {new_tree.get('message')}", file=sys.stderr)
        return 1

    parents = []
    status, ref = call("GET", f"/repos/{full_name}/git/ref/heads/{branch}", token)
    if status == 200:
        parents = [ref["object"]["sha"]]

    status, commit = call("POST", f"/repos/{full_name}/git/commits", token, {
        "message": "feat: DSH 插件目录 v0.1.0",
        "tree": new_tree["sha"],
        "parents": parents,
    })
    if status not in (200, 201):
        print(f"commit 失败：HTTP {status} {commit.get('message')}", file=sys.stderr)
        return 1

    if parents:
        status, _ = call("PATCH", f"/repos/{full_name}/git/refs/heads/{branch}", token, {"sha": commit["sha"]})
    else:
        status, _ = call("POST", f"/repos/{full_name}/git/refs", token, {"ref": f"refs/heads/{branch}", "sha": commit["sha"]})
    if status not in (200, 201):
        print(f"更新分支失败：HTTP {status}", file=sys.stderr)
        return 1

    call("PUT", f"/repos/{full_name}/topics", token, {"names": ["dsh", "dsh-plugin", "deepseek-harness", "plugin-market"]})
    print(f"完成：https://github.com/{full_name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
