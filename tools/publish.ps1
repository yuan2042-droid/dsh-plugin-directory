# 把本仓库推到 GitHub
#
# 用法:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/publish.ps1 -RepoUrl https://github.com/<you>/dsh-plugin-directory.git
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/publish.ps1 -RepoUrl git@github.com:<you>/dsh-plugin-directory.git -Message "feat: 初版"
#
# 前置：本机装了 git；远端仓库已在 GitHub 上创建为空仓库（不要勾选 README/LICENSE）。
param(
  [Parameter(Mandatory = $true)][string]$RepoUrl,
  [string]$Branch = 'main',
  [string]$Message = 'feat: DSH 插件目录 v0.1.0'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw '找不到 git：先安装 Git for Windows（https://git-scm.com/download/win），再重跑本脚本'
}

Push-Location $root
try {
  if (-not (Test-Path (Join-Path $root '.git'))) {
    git init -b $Branch
  }
  if (-not (git config user.email)) { throw 'git 还没配置身份：git config --global user.email "you@example.com" / user.name "Your Name"' }

  git add -A
  $staged = git status --porcelain
  if ($staged) { git commit -m $Message } else { Write-Host '没有变更需要提交' }

  $hasOrigin = $false
  try { git remote get-url origin | Out-Null; $hasOrigin = $true } catch { }
  if ($hasOrigin) { git remote set-url origin $RepoUrl } else { git remote add origin $RepoUrl }

  git branch -M $Branch
  git push -u origin $Branch
  Write-Host "已推送到 $RepoUrl ($Branch)"
} finally {
  Pop-Location
}
