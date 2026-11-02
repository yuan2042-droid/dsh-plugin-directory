#!/usr/bin/env node
/**
 * 构建：data/raw.json（GitHub 原始快照）→ data/catalog.json + client.js
 *
 * 收录判定与分类规则集中在本文件，README 的「数据与分类」一节与它保持一致；
 * 改规则只改这里，然后重跑本脚本。
 *
 * 用法: node tools/build.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const rawPath = join(root, 'data', 'raw.json')
const catalogPath = join(root, 'data', 'catalog.json')
const templatePath = join(root, 'src', 'client.js')
const outPath = join(root, 'client.js')

/** 分类规则：顺序即优先级，第一个命中的生效 */
const RULES = [
  ['market', /(插件市场|\bmarket\b|marketplace|registry|\bawesome\b|精选|排行榜|\btop\s?\d+|商店|分发|collection|插件列表|\bhub\b|导航)/i],
  ['docs', /(教程|指南|入门|学习|从 ?0 ?到 ?1|tutorial|guide|learn|\bbook\b|beginner|科普|手册)/i],
  ['office', /(办公|office|表格|幻灯片|\bppt\b|excel|\bword\b|\bpdf\b|latex|论文|科研|arxiv|文献|研究|报表|报告|绘图|图表|文档处理|白板|画布|canvas)/i],
  ['context', /(上下文|context|记忆|memory|压缩|compact|摘要|\brag\b|知识库|召回|embedding)/i],
  ['model', /(模型|推理|思考|reasoning|effort|视觉|多模态|路由|破甲|jailbreak|purge|供应商|\bprovider\b|vision|\bocr\b|余额|balance|计费|配额|router|订阅|subscription)/i],
  ['ui', /(界面|外观|主题|皮肤|侧边栏|sidebar|状态栏|桌宠|宠物|壁纸|\btui\b|渲染|悬浮|字体|图标|theme|wallpaper|\bpet\b|dashboard|面板|动画|配色|启动|开机|\bboot\b|滑块|slider|挂饰)/i],
  ['app', /(桌面端|桌面版|desktop|客户端|\bclient\b|启动器|launcher|安装器|手机|移动端|android|\bios\b|口袋|远程|remote|\bgui\b|workspace|工作台|workbench)/i],
  ['integration', /(集成|接入|桥接|\bbridge\b|\bmcp\b|\bide\b|vscode|obsidian|飞书|微信|\bqq\b|telegram|slack|notion|discord|网关|oauth)/i],
  ['dev', /(开发|调试|debug|测试|\btest\b|\bhmr\b|\bsdk\b|框架|脚手架|示例|\btemplate\b|boilerplate|类型|遥测|telemetry|评测|\beval\b|日志)/i],
  ['fun', /(b\s?站|bilibili|\b视频\b|音乐|游戏|小说|番剧|日报|娱乐|meme|表情包|女友|陪伴|数字人|虚拟人|心情|mood)/i],
  ['session', /(会话|对话|多智能体|智能体|子代理|subagent|agent team|团队|群聊|机器人|\bbot\b|协作|工作流|任务编排|任务管理|看板|taskboard|决策)/i],
  ['tool', /(工具|搜索|检索|文件|终端|shell|命令行|\bgit\b|浏览器|browser|everything|运维|\bops\b|执行|命令|格式|转换|剪贴板|截图|数据库|database|\bsql\b)/i],
  ['skills', /(技能|\bskills?\b|预设|\bpreset\b|提示词|prompt|人格|角色卡|角色扮演|\brp\b|人设)/i]
]

/** 是否属于 DSH 生态的插件类项目 */
function isDshPlugin(repo) {
  const owner = repo.full_name.split('/')[0]
  const name = repo.full_name.split('/').pop()
  const desc = repo.description || ''
  if (owner === 'deepseek-ai') return true
  if (/^dsh[-_]/i.test(name) || /(^|[-_])dsh([-_]|$)/i.test(name)) return true
  if (/dsh\s*插件|为\s*dsh|for\s+(deepseek\s+harness|dsh)\b/i.test(desc)) return true
  if (/\bdsh\b|deepseek[-\s]?harness/i.test(desc) &&
      /插件|plugin|preset|skill|扩展|extension|bundle|主题|theme|工具集|toolkit/i.test(desc)) return true
  return false
}

function classify(repo) {
  const owner = repo.full_name.split('/')[0]
  if (owner === 'deepseek-ai') return 'official'
  const name = repo.full_name.split('/').pop()
  const hay = `${name} ${repo.description || ''} ${(repo.topics || []).join(' ')}`
  for (const [id, re] of RULES) if (re.test(hay)) return id
  return 'other'
}

const raw = JSON.parse(readFileSync(rawPath, 'utf8').replace(/^\uFEFF/, ''))
const rows = []

for (const repo of raw) {
  if (!isDshPlugin(repo)) continue
  const desc = String(repo.description || '').replace(/\s+/g, ' ').slice(0, 220)
  rows.push({
    n: repo.full_name.split('/').pop(),
    r: repo.full_name,
    d: desc,
    s: Number(repo.stars) || 0,
    f: Number(repo.forks) || 0,
    i: Number(repo.issues) || 0,
    l: repo.language || '',
    p: repo.pushed_at || '',
    t: (repo.topics || []).slice(0, 3),
    u: repo.html_url,
    c: classify(repo),
    o: repo.full_name.split('/')[0] === 'deepseek-ai' ? 1 : 0
  })
}

rows.sort((a, b) => b.s - a.s)

const json = JSON.stringify(rows)
writeFileSync(catalogPath, json, 'utf8')

const stamp = new Date().toISOString().slice(0, 10)
const template = readFileSync(templatePath, 'utf8')
const ANCHOR = 'const CATALOG = __CATALOG_DATA__'
if (!template.includes(ANCHOR)) throw new Error('src/client.js 缺少注入点: ' + ANCHOR)
// 用函数式 replacement，避免数据里的 $ 被当成替换模式
const client = template
  .replace(ANCHOR, () => 'const CATALOG = ' + json)
  .replace("'__GENERATED_AT__'", () => "'" + stamp + "'")
if (client.includes('__CATALOG_DATA__') || client.includes('__GENERATED_AT__')) {
  throw new Error('占位符没有全部替换，检查 src/client.js 的注入点')
}
writeFileSync(outPath, client, 'utf8')

const counts = {}
for (const row of rows) counts[row.c] = (counts[row.c] || 0) + 1
const summary = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ')
console.log(`收录 ${rows.length} / ${raw.length} 个仓库`)
console.log(`分类: ${summary}`)
console.log(`data/catalog.json = ${(json.length / 1024).toFixed(0)} KB ; client.js = ${(client.length / 1024).toFixed(0)} KB`)
