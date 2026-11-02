# 抓取 GitHub 上的 DSH 插件仓库 -> data/raw.json
#
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File tools/fetch.ps1
# 说明: 未登录的 GitHub Search API 限额约为 10 次/分钟，下面 8 组检索 × 2 页，
#       脚本每页间隔 9 秒，整轮约 2.5 分钟。失败会重试 3 次。
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dataDir = Join-Path $root 'data'
New-Item -ItemType Directory -Force $dataDir | Out-Null

$queries = @(
  'topic:dsh-plugin',
  'topic:deepseek-harness',
  '"deepseek harness" plugin in:description',
  'dsh plugin in:description',
  '"dsh 插件" in:description',
  'dsh- in:name',
  'topic:dsh',
  '"@deepseek-ai/dsh" in:readme'
)

$headers = @{ 'User-Agent' = 'dsh-plugin-directory'; 'Accept' = 'application/vnd.github+json' }
$items = @{}

foreach ($q in $queries) {
  foreach ($page in 1..2) {
    $enc = [uri]::EscapeDataString($q)
    $uri = "https://api.github.com/search/repositories?q=$enc&sort=stars&order=desc&per_page=100&page=$page"
    $res = $null
    foreach ($attempt in 1..3) {
      try {
        $res = Invoke-RestMethod -Uri $uri -Headers $headers -TimeoutSec 45
        break
      } catch {
        Write-Host "ERR [$q p$page #$attempt] $($_.Exception.Message)"
        Start-Sleep -Seconds 12
      }
    }
    if ($null -eq $res) { continue }
    foreach ($it in $res.items) {
      $items[$it.full_name] = [ordered]@{
        full_name   = $it.full_name
        html_url    = $it.html_url
        description = $it.description
        stars       = $it.stargazers_count
        forks       = $it.forks_count
        issues      = $it.open_issues_count
        language    = $it.language
        pushed_at   = $it.pushed_at
        created_at  = $it.created_at
        topics      = @($it.topics)
        homepage    = $it.homepage
      }
    }
    Write-Host "[$q p$page] got=$($res.items.Count) total=$($items.Count)"
    Start-Sleep -Seconds 9
  }
}

$sorted = @($items.Values | Sort-Object { $_.stars } -Descending)
$json = ConvertTo-Json -InputObject $sorted -Depth 6
[System.IO.File]::WriteAllText((Join-Path $dataDir 'raw.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "saved $($sorted.Count) repos -> data/raw.json ；接着运行 tools/build.ps1"
