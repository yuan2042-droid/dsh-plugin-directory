# 在没有 Node 的 PATH 时也能构建：优先用 PATH 里的 node，其次用 DSH Desktop 自带的运行时
#
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File tools/build.ps1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$build = Join-Path $root 'tools\build.mjs'

$node = $null
$cmd = Get-Command node -ErrorAction SilentlyContinue
if ($cmd) { $node = $cmd.Source }

if (-not $node) {
  # DSH Desktop 自带 Node：以 ELECTRON_RUN_AS_NODE 方式跑 electron
  $appDir = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness'
  $shim = Join-Path $appDir 'resources\runtime\bin\node.cmd'
  $exe = Join-Path $appDir 'DeepSeek Harness.exe'
  if ((Test-Path $shim) -and (Test-Path $exe)) {
    $env:DSH_DESKTOP_NODE_EXECUTABLE = $exe
    $node = $shim
  }
}

if (-not $node) { throw '找不到 node：请安装 Node.js >= 18，或安装 DSH Desktop（它自带运行时）' }

Write-Host "使用: $node"
& $node $build
if ($LASTEXITCODE -ne 0) { throw "构建失败（exit $LASTEXITCODE）" }
