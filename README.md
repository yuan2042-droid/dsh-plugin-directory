# dsh-plugin-directory

在 **DeepSeek Harness（DSH）** 的左侧栏里加一个「插件目录」入口：把 GitHub 上的社区 DSH 插件按中文分类归档，支持搜索、多维排序、卡片/表格两种视图，点开还能看详情、复制安装命令。

界面完全本地渲染，数据随包发布，不联网、不上报。

![icon](icon.svg)

## 它长什么样

- **侧边栏**：多一个四宫格图标「插件目录」，点一下在中央面板打开目录，点 `×` 回到对话。
- **面板**：顶部搜索框 + 排序下拉 + 升降序 + 卡片/表格切换；下方一排分类标签（带数量）；再往下是插件卡片。
- **卡片**：插件名、仓库名、分类色标、三行描述、标签、Star / 语言 / 更新时间、官方标记；点开是详情（指标、标签、GitHub 链接、一键复制 `dsh plugin add github:owner/repo`）。

## 功能

| 能力 | 说明 |
| --- | --- |
| 15 个分类 | 官方与核心 / 市场与资源 / 文档与教程 / 办公与科研 / 上下文与记忆 / 模型与推理 / 界面与外观 / 客户端与移动端 / 集成与连接 / 开发与调试 / 趣味与内容 / 会话与协作 / 工具与能力 / 技能与预设 / 其他与周边 |
| 排序 | 综合热度、Star、最近更新、Fork、Issue、名称、分类；可切升/降序 |
| 搜索 | 名称 / 仓库 / 描述 / 标签 / 分类名，空格分词，全部命中 |
| 视图 | 卡片、表格 |
| 详情 | 指标、时间、标签、仓库链接、复制安装命令 |
| 零网络 | 数据在构建期打进 `client.js`，运行时不需要请求 GitHub，也没有第三方脚本 |

## 安装

**推荐：Release 里的离线包**（不需要 git，也不需要构建权限）

```powershell
dsh plugin --profile web add https://github.com/yuan2042-droid/dsh-plugin-directory/releases/download/v0.1.0/dsh-plugin-directory-0.1.0.tgz
# 桌面端把 web 换成 desktop，然后重启应用
```

### DSH Desktop

打开 **设置 → 插件**，搜索 `dsh-plugin-directory` 安装；或用上面那条命令（`--profile desktop`）装进桌面端 profile 后重启应用。

### 普通 `dsh web`

```powershell
dsh plugin --profile web add https://github.com/yuan2042-droid/dsh-plugin-directory/releases/download/v0.1.0/dsh-plugin-directory-0.1.0.tgz
# 然后重启 dsh web
```

### 从源码仓库安装

```powershell
dsh plugin --profile web add github:yuan2042-droid/dsh-plugin-directory
```

这条要求本机有 **git**，且 pnpm ≥10 默认拦下 git 依赖的构建脚本，首次会失败并提示把包键写进 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds`——本包没有 `prepare` 脚本，构建产物 `client.js` 已随仓库提交，只是链路比离线包长。

### 本地 checkout（开发用）

```powershell
dsh plugin --profile demo add .\dsh-plugin-directory
dsh --profile demo --dump-config   # 应能看到 "# == dsh-plugin-directory" 这一层
```

装好后在左侧栏点「插件目录」。

> 仓库里同时提交了源码（`src/`、`data/`、`tools/`）与构建产物（`client.js`），所以两种安装方式都不需要在安装时跑构建脚本。

## 数据与分类

数据来源是 GitHub Search API 的 8 组检索（`topic:dsh-plugin`、`"dsh 插件"`、`"@deepseek-ai/dsh"` 等），每轮约 850 个候选仓库，去重后按规则筛出约 650 个插件。

**收录判定**（`tools/build.mjs` 的 `isDshPlugin`）：

- owner 是 `deepseek-ai`；
- 或仓库名带 `dsh`（`dsh-xxx` / `xxx-dsh`）；
- 或描述里同时出现 DSH / DeepSeek Harness 与「插件 / plugin / preset / skill / 扩展」这类自我定位词。

只靠 `dsh-plugin` 标签的项目**不收录**——该标签在生态里被大量非插件项目复用，放进来会污染榜单。

**分类**按「名称 + 描述 + topics」的关键词表匹配，顺序即优先级，规则集中在 `tools/build.mjs` 的 `RULES` 数组，改一行就能调整归类。

### 刷新数据

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/fetch.ps1   # 抓 GitHub -> data/raw.json（约 2.5 分钟）
node tools/build.mjs                                                  # -> data/catalog.json + client.js
```

`fetch.ps1` 需要联网；`build.mjs` 只读本地文件，Node ≥ 18 即可，无第三方依赖。未登录的 GitHub Search API 限额约为 10 次/分钟，脚本已按页间隔限速。

## 目录结构

```
dsh-plugin-directory/
├─ package.json          # dsh.bundle + dsh.client 声明
├─ cordis.patch.yml      # 组合层：insert 一行 plugin-directory
├─ index.js              # Host 半身（装载日志）
├─ client.js             # 浏览器半身（构建产物，数据已注入）
├─ data/
│  ├─ raw.json           # GitHub 原始快照
│  └─ catalog.json       # 归类裁剪后的数据
├─ src/client.js         # 浏览器半身的源码（含注入点）
├─ tools/
│  ├─ fetch.ps1          # 抓取
│  ├─ build.mjs          # 归类 + 生成 client.js
│  └─ publish.ps1        # 推到 GitHub 的辅助脚本
└─ icon.svg
```

## 实现要点

DSH 的浏览器插件不是普通 ESM，而是走宿主的模块容器：

```js
window.__ModuleLoader__.load({
  id: 'dsh-plugin-directory',
  factory: (require) => {
    const react = require('react')
    exports.inject = ['slots', 'layout']
    exports.apply = (ctx) => { /* ctx.slots.inject / ctx.slots.register */ }
    return exports
  }
})
```

面板用两个槽位：`sidebar.panellist`（左栏图标）与 `main`（中央面板），**两边的 `id` / `key` 必须同名**，否则 `layout.selectPanel(id)` 反查不到对应面板会抛错；关闭面板用 `layout.selectPanel(null)`。

依赖的宿主服务只有 `slots` 与 `layout`；没有 `layout.selectPanel` 的宿主（0.1.5 以前的 web）不会注册半个面板，只在 console 里说明原因。

## 兼容性

- 需要带 `sidebar.panellist` / `main` 槽位的 web 宿主，实测于 **DSH Desktop 0.2.1-rc.5**（`dsh web` 同样是 web 宿主）。
- 没有声明 `engines.dsh`：不同 DSH 版本的版本号带 rc 后缀，写死范围容易把合法版本挡在门外；如果你的 profile 因为兼容性门禁拒绝安装，把 `engines` 那段删掉即可，实际起作用的是槽位 API。
- `client.js` 里内联了约 230 KB 数据，首次加载会解析一次；目录规模再大时建议改成 Host 侧接口 + 分页。

## 许可

MIT
