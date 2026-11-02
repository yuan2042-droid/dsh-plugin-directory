/**
 * dsh-plugin-directory —— 浏览器半身（DSH client plugin）
 *
 * 宿主按 package.json 的 `dsh.client` 把本文件作为一个浏览器模块 serve 进 boot graph，
 * 因此必须走宿主自己的模块容器：`window.__ModuleLoader__.load({ id, factory })`，
 * 在 factory 里拿到 `require('react')`，最后把 `inject` / `apply` 挂到 exports 上。
 *
 * 界面由两个槽位组成（0.1.5+ 的标准面板入口）：
 *   - `sidebar.panellist`：左栏导航图标，`id` 必须与 main 的 `key` 同名，
 *     否则点击时 `layout.selectPanel(id)` 反查不到 main 注册项会抛错；
 *   - `main`：中央面板本体，`key` 与上面的 `id` 同名。
 *
 * 数据在构建期由 tools/build.mjs 注入（注入点是下面的 `const CATALOG` 与
 * `const GENERATED_AT` 两行），运行时零网络请求；想更新数据就重跑构建脚本，
 * 或等仓库发新版本。
 *
 * 一键安装走宿主自己的插件管理 RPC：`ctx.remote.pluginManager.installBundle(spec, { enabled })`，
 * 与设置页「插件」用的是同一条路径；宿主没有这个接口时只保留复制命令。
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-directory',
  factory: (require) => {
    const exports = {}
    const react = require('react')
    const h = react.createElement

    const PANEL_ID = 'dsh-plugin-directory'
    const CATALOG = __CATALOG_DATA__
    const GENERATED_AT = '__GENERATED_AT__'

    /* ------------------------------------------------------------------ *
     * 分类
     * ------------------------------------------------------------------ */
    const CATS = [
      ['official', '官方与核心', '#3fd0a4'],
      ['market', '市场与资源', '#c792ea'],
      ['docs', '文档与教程', '#8ddb8c'],
      ['office', '办公与科研', '#d2a8ff'],
      ['context', '上下文与记忆', '#79c0ff'],
      ['model', '模型与推理', '#ffa657'],
      ['ui', '界面与外观', '#a5d6ff'],
      ['app', '客户端与移动端', '#58a6ff'],
      ['integration', '集成与连接', '#d28bff'],
      ['dev', '开发与调试', '#7ee787'],
      ['fun', '趣味与内容', '#ff9ecd'],
      ['session', '会话与协作', '#ff7b72'],
      ['tool', '工具与能力', '#9ecbff'],
      ['skills', '技能与预设', '#f0b429'],
      ['other', '其他与周边', '#8b949e']
    ]
    const CAT_INDEX = {}
    const CAT_INFO = {}
    CATS.forEach((c, i) => {
      CAT_INDEX[c[0]] = i
      CAT_INFO[c[0]] = { id: c[0], name: c[1], color: c[2] }
    })
    function catOf(id) {
      return CAT_INFO[id] || CAT_INFO.other
    }

    /* ------------------------------------------------------------------ *
     * 小工具
     * ------------------------------------------------------------------ */
    const DAY = 86400000
    function days(iso) {
      const t = Date.parse(iso || '')
      return t ? (Date.now() - t) / DAY : Infinity
    }
    function rel(iso) {
      const d = days(iso)
      if (!isFinite(d)) return '未知'
      if (d < 1) return '今天'
      if (d < 2) return '昨天'
      if (d < 30) return Math.round(d) + ' 天前'
      if (d < 365) return Math.round(d / 30) + ' 个月前'
      return Math.round(d / 365) + ' 年前'
    }
    function num(n) {
      n = Number(n) || 0
      if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'm'
      if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
      return String(n)
    }
    function rankOf(r) {
      const fresh = Math.max(0, 3 - days(r.p) / 60)
      return Math.log10((r.s || 0) + 1) * 4 + (isFinite(fresh) ? fresh : 0)
    }

    /* ------------------------------------------------------------------ *
     * 主题变量：按宿主实际背景色决定弹窗这类实心表面的配色
     * ------------------------------------------------------------------ */
    function applyThemeVars() {
      if (typeof document === 'undefined' || !document.body) return
      const bg = getComputedStyle(document.body).backgroundColor || ''
      const nums = bg.match(/[\d.]+/g)
      const dark = !nums || nums.length < 3
        ? true
        : (0.299 * Number(nums[0]) + 0.587 * Number(nums[1]) + 0.114 * Number(nums[2])) < 128
      const s = document.documentElement.style
      if (dark) {
        s.setProperty('--dcat-surface', '#1c2128')
        s.setProperty('--dcat-surface-2', 'rgba(255,255,255,0.06)')
        s.setProperty('--dcat-line', 'rgba(255,255,255,0.13)')
        s.setProperty('--dcat-text', '#e9eff7')
        s.setProperty('--dcat-muted', 'rgba(233,239,247,0.6)')
        s.setProperty('--dcat-mask', 'rgba(4,7,11,0.6)')
        s.setProperty('--dcat-shadow', '0 24px 60px rgba(0,0,0,0.55)')
      } else {
        s.setProperty('--dcat-surface', '#ffffff')
        s.setProperty('--dcat-surface-2', 'rgba(15,25,40,0.05)')
        s.setProperty('--dcat-line', 'rgba(15,25,40,0.14)')
        s.setProperty('--dcat-text', '#1b2431')
        s.setProperty('--dcat-muted', 'rgba(27,36,49,0.6)')
        s.setProperty('--dcat-mask', 'rgba(18,26,38,0.38)')
        s.setProperty('--dcat-shadow', '0 24px 60px rgba(20,32,50,0.22)')
      }
    }

    /* ------------------------------------------------------------------ *
     * 样式（只注入一次；前缀统一 dcat-，避免污染宿主）
     * ------------------------------------------------------------------ */
    const STYLE = [
      '.dcat{position:relative;display:flex;flex-direction:column;height:100%;min-height:320px;gap:9px;padding:14px 16px 8px;font:13px/1.5 "Segoe UI","Microsoft YaHei UI",system-ui,sans-serif;color:inherit;box-sizing:border-box}',
      '.dcat *{box-sizing:border-box}',
      '.dcat-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.dcat-title{display:flex;flex-direction:column;margin-right:auto;min-width:140px}',
      '.dcat-h{font-size:15px;font-weight:650;letter-spacing:.2px}',
      '.dcat-sub{font-size:11px;opacity:.55}',
      '.dcat-search{height:30px;min-width:200px;flex:0 1 250px;padding:0 10px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:rgba(128,128,128,.1);color:inherit;outline:none;font-size:12.5px}',
      '.dcat-search:focus{border-color:rgba(47,185,138,.85);box-shadow:0 0 0 3px rgba(47,185,138,.15)}',
      '.dcat-sel{height:30px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:rgba(128,128,128,.1);color:inherit;font-size:12px;padding:0 6px;outline:none}',
      '.dcat-sel option{color:#111}',
      '.dcat-btn{height:30px;min-width:30px;padding:0 10px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:transparent;color:inherit;font-size:12.5px;cursor:pointer;line-height:1;transition:background .12s,border-color .12s,transform .05s}',
      '.dcat-btn:hover{background:rgba(128,128,128,.16);border-color:rgba(128,128,128,.5)}',
      '.dcat-btn:active{transform:translateY(1px)}',
      '.dcat-seg{display:flex;border:1px solid rgba(128,128,128,.3);border-radius:8px;overflow:hidden}',
      '.dcat-seg-b{height:28px;padding:0 10px;border:0;background:transparent;color:inherit;opacity:.6;font-size:12px;cursor:pointer;transition:background .12s,opacity .12s}',
      '.dcat-seg-b+.dcat-seg-b{border-left:1px solid rgba(128,128,128,.22)}',
      '.dcat-seg-b:hover{opacity:.9;background:rgba(128,128,128,.12)}',
      '.dcat-seg-b.on{opacity:1;background:rgba(47,185,138,.18);color:#2fb98a;font-weight:600}',
      '.dcat-chips{display:flex;flex-wrap:wrap;gap:6px;padding-bottom:2px}',
      '.dcat-chip{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;border:1px solid rgba(128,128,128,.26);background:transparent;color:inherit;font-size:11.5px;cursor:pointer;opacity:.8;transition:opacity .12s,background .12s,border-color .12s}',
      '.dcat-chip:hover{opacity:1;background:rgba(128,128,128,.12)}',
      '.dcat-chip.on{opacity:1;border-color:rgba(47,185,138,.65);background:rgba(47,185,138,.15);color:#2fb98a}',
      '.dcat-chip i{width:7px;height:7px;border-radius:50%;display:inline-block;flex:none}',
      '.dcat-chip b{font-weight:500;opacity:.6}',
      '.dcat-body{flex:1;min-height:0;overflow:auto;padding-right:2px}',
      '.dcat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(295px,1fr));gap:10px;padding-bottom:6px}',
      '.dcat-card{display:flex;flex-direction:column;gap:7px;padding:11px 12px;border-radius:11px;border:1px solid rgba(128,128,128,.22);background:rgba(128,128,128,.05);cursor:pointer;transition:border-color .12s,background .12s,transform .12s}',
      '.dcat-card:hover{border-color:rgba(47,185,138,.55);background:rgba(47,185,138,.08);transform:translateY(-1px)}',
      '.dcat-card-top{display:flex;align-items:flex-start;gap:8px}',
      '.dcat-names{flex:1;min-width:0}',
      '.dcat-name{font-size:13px;font-weight:650;word-break:break-word}',
      '.dcat-repo{font-size:10.5px;opacity:.5;word-break:break-all}',
      '.dcat-tag{font-size:10px;padding:1px 7px;border-radius:999px;border:1px solid;white-space:nowrap;flex:none}',
      '.dcat-desc{font-size:11.5px;opacity:.72;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
      '.dcat-meta{display:flex;gap:10px;font-size:10.5px;opacity:.55;flex-wrap:wrap;margin-top:auto}',
      '.dcat-star{color:#e3b341;opacity:.95}',
      '.dcat-table{width:100%;border-collapse:collapse;font-size:11.5px}',
      '.dcat-table th{text-align:left;font-size:10.5px;font-weight:600;opacity:.55;padding:6px 8px;border-bottom:1px solid rgba(128,128,128,.25)}',
      '.dcat-table td{padding:6px 8px;border-bottom:1px solid rgba(128,128,128,.16);vertical-align:top}',
      '.dcat-table tr:hover td{background:rgba(128,128,128,.09)}',
      '.dcat-more{display:block;margin:4px auto 10px;padding:6px 14px;border-radius:9px;border:1px solid rgba(128,128,128,.3);background:transparent;color:inherit;font-size:12px;cursor:pointer}',
      '.dcat-more:hover{background:rgba(128,128,128,.14)}',
      '.dcat-foot{font-size:11px;opacity:.5}',

      /* ---- 详情弹窗 ---- */
      '.dcat-mask{position:absolute;inset:0;z-index:20;background:var(--dcat-mask);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px;animation:dcat-fade .12s ease-out}',
      '@keyframes dcat-fade{from{opacity:0}to{opacity:1}}',
      '.dcat-modal{position:relative;width:100%;max-width:560px;max-height:84%;display:flex;flex-direction:column;border-radius:16px;border:1px solid var(--dcat-line);background:var(--dcat-surface);color:var(--dcat-text);box-shadow:var(--dcat-shadow);animation:dcat-pop .14s ease-out;overflow:hidden}',
      '@keyframes dcat-pop{from{opacity:0;transform:translateY(8px) scale(.99)}to{opacity:1;transform:none}}',
      '.dcat-modal-head{display:flex;align-items:flex-start;gap:12px;padding:20px 20px 0}',
      '.dcat-modal-title{font-size:17px;font-weight:700;line-height:1.35;word-break:break-word;margin:0}',
      '.dcat-modal-sub{font-size:11.5px;color:var(--dcat-muted);word-break:break-all;margin-top:3px}',
      '.dcat-close{flex:none;width:30px;height:30px;border-radius:8px;border:1px solid var(--dcat-line);background:transparent;color:var(--dcat-muted);font-size:16px;line-height:1;cursor:pointer}',
      '.dcat-close:hover{background:var(--dcat-surface-2);color:var(--dcat-text)}',
      '.dcat-modal-body{padding:14px 20px 18px;overflow:auto}',
      '.dcat-modal-desc{font-size:12.5px;line-height:1.75;color:var(--dcat-text);opacity:.88;white-space:pre-wrap;margin:0 0 14px}',
      '.dcat-actions{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}',
      '.dcat-primary{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:9px;border:1px solid rgba(47,185,138,.75);background:#1f9d76;color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:background .12s,transform .05s,opacity .12s}',
      '.dcat-primary:hover{background:#25b184}',
      '.dcat-primary:active{transform:translateY(1px)}',
      '.dcat-primary[disabled]{opacity:.55;cursor:default;transform:none}',
      '.dcat-ghost{display:inline-flex;align-items:center;height:34px;padding:0 13px;border-radius:9px;border:1px solid var(--dcat-line);background:var(--dcat-surface-2);color:var(--dcat-text);font-size:12.5px;cursor:pointer;text-decoration:none;transition:background .12s,border-color .12s}',
      '.dcat-ghost:hover{background:rgba(128,128,128,.18);border-color:rgba(128,128,128,.45)}',
      '.dcat-status{margin:2px 0 12px;padding:9px 11px;border-radius:9px;font-size:12px;line-height:1.6;border:1px solid var(--dcat-line);background:var(--dcat-surface-2)}',
      '.dcat-status.ok{border-color:rgba(47,185,138,.6);background:rgba(47,185,138,.14);color:#2fb98a}',
      '.dcat-status.err{border-color:rgba(248,81,73,.6);background:rgba(248,81,73,.12);color:#ff8078}',
      '.dcat-status code{font-family:"Cascadia Mono",Consolas,monospace;font-size:11px;word-break:break-all}',
      '.dcat-kv{display:grid;grid-template-columns:78px 1fr;gap:7px 12px;font-size:12px}',
      '.dcat-kv dt{color:var(--dcat-muted)}',
      '.dcat-kv dd{margin:0;word-break:break-word}',
      '.dcat-hint{font-size:11px;color:var(--dcat-muted);line-height:1.6;margin-top:10px}'
    ].join('\n')

    function installStyles() {
      if (typeof document === 'undefined') return
      if (document.getElementById('dsh-plugin-directory-style')) return
      const el = document.createElement('style')
      el.id = 'dsh-plugin-directory-style'
      el.textContent = STYLE
      document.head.appendChild(el)
    }

    /* ------------------------------------------------------------------ *
     * 组件
     * ------------------------------------------------------------------ */
    function DirectoryIcon(props) {
      const size = (props && props.size) || 18
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true'
      },
        h('rect', { x: 3, y: 3, width: 7.5, height: 7.5, rx: 1.6 }),
        h('rect', { x: 13.5, y: 3, width: 7.5, height: 7.5, rx: 1.6 }),
        h('rect', { x: 3, y: 13.5, width: 7.5, height: 7.5, rx: 1.6 }),
        h('rect', { x: 13.5, y: 13.5, width: 7.5, height: 7.5, rx: 1.6 })
      )
    }

    function Chip(props) {
      const c = props.info
      return h('button', {
        className: 'dcat-chip' + (props.active ? ' on' : ''),
        onClick: props.onClick,
        title: c ? c.name : '全部插件'
      },
        c ? h('i', { style: { background: c.color } }) : null,
        h('span', null, c ? c.name : '全部'),
        h('b', null, props.count)
      )
    }

    function Card(props) {
      const r = props.row
      const c = catOf(r.c)
      const tags = (r.t || []).slice(0, 3).map((t) => h('span', { className: 'dcat-tag', key: t, style: { opacity: .6 } }, t))
      return h('article', {
        className: 'dcat-card',
        onClick: () => props.onOpen(r),
        title: '查看详情'
      },
        h('div', { className: 'dcat-card-top' },
          h('div', { className: 'dcat-names' },
            h('div', { className: 'dcat-name' }, r.n),
            h('div', { className: 'dcat-repo' }, r.r)
          ),
          h('span', { className: 'dcat-tag', style: { color: c.color, borderColor: c.color + '66' } }, c.name)
        ),
        h('div', { className: 'dcat-desc' }, r.d || '（该仓库暂无描述）'),
        tags.length ? h('div', { className: 'dcat-meta' }, tags) : null,
        h('div', { className: 'dcat-meta' },
          h('span', { className: 'dcat-star' }, '★ ' + num(r.s)),
          r.l ? h('span', null, r.l) : null,
          h('span', null, rel(r.p) + '更新'),
          r.o ? h('span', { style: { color: '#3fd0a4' } }, '官方') : null
        )
      )
    }

    function Detail(props) {
      const r = props.row
      const c = catOf(r.c)
      const [phase, setPhase] = react.useState('idle')   // idle | running | done | error
      const [msg, setMsg] = react.useState('')
      const spec = 'github:' + r.r

      const canInstall = !!(props.manager && typeof props.manager.installBundle === 'function')

      const install = () => {
        if (!canInstall || phase === 'running') return
        setPhase('running')
        setMsg('正在安装 ' + spec + ' …（GitHub 源会先做连通性检查）')
        Promise.resolve()
          .then(() => props.manager.installBundle(spec, { enabled: true }))
          .then((res) => {
            if (res && res.ok) {
              setPhase('done')
              setMsg('已安装 ' + r.n + '。刷新页面或重启应用后生效。')
            } else {
              const err = (res && res.error) || {}
              setPhase('error')
              setMsg('安装失败：' + (err.message || err.code || '未知错误'))
            }
          })
          .catch((e) => {
            setPhase('error')
            setMsg('安装失败：' + String((e && e.message) || e))
          })
      }

      const copy = (text) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            () => setMsg('已复制：' + text),
            () => setMsg('复制失败，请手动复制：' + text)
          )
        } else {
          setMsg('请手动复制：' + text)
        }
      }

      return h('div', { className: 'dcat-mask', onClick: props.onClose },
        h('div', { className: 'dcat-modal', onClick: (e) => e.stopPropagation() },
          h('div', { className: 'dcat-modal-head' },
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('h3', { className: 'dcat-modal-title' }, r.n),
              h('div', { className: 'dcat-modal-sub' },
                r.r, ' · ',
                h('span', { style: { color: c.color } }, c.name),
                r.o ? ' · 官方' : ''
              )
            ),
            h('button', { className: 'dcat-close', title: '关闭', onClick: props.onClose }, '×')
          ),
          h('div', { className: 'dcat-modal-body' },
            h('p', { className: 'dcat-modal-desc' }, r.d || '（该仓库暂无描述）'),
            h('div', { className: 'dcat-actions' },
              h('button', {
                className: 'dcat-primary',
                disabled: !canInstall || phase === 'running',
                title: canInstall ? '调用宿主插件管理器安装' : '当前宿主没有插件管理接口',
                onClick: install
              }, phase === 'running' ? '安装中…' : '一键安装'),
              h('button', { className: 'dcat-ghost', onClick: () => copy('dsh plugin add ' + spec) }, '复制安装命令'),
              h('a', { className: 'dcat-ghost', href: r.u, target: '_blank', rel: 'noopener noreferrer' }, '打开 GitHub ↗')
            ),
            (phase === 'running' || msg)
              ? h('div', { className: 'dcat-status' + (phase === 'done' ? ' ok' : phase === 'error' ? ' err' : '') },
                  h('div', null, msg),
                  (phase === 'error' || phase === 'idle')
                    ? h('div', { style: { marginTop: 6 } }, h('code', null, 'dsh plugin add ' + spec))
                    : null
                )
              : null,
            h('dl', { className: 'dcat-kv' },
              h('dt', null, 'Star'), h('dd', null, String(r.s || 0)),
              h('dt', null, 'Fork'), h('dd', null, String(r.f || 0)),
              h('dt', null, 'Issue'), h('dd', null, String(r.i || 0)),
              h('dt', null, '语言'), h('dd', null, r.l || '—'),
              h('dt', null, '最近更新'), h('dd', null, rel(r.p) + '（' + String(r.p || '').slice(0, 10) + '）'),
              h('dt', null, '标签'), h('dd', null, (r.t || []).length ? (r.t || []).join('、') : '—')
            ),
            h('div', { className: 'dcat-hint' },
              canInstall
                ? '一键安装用的就是宿主插件管理器（与「设置 → 插件」同一套 RPC），安装源是 github:仓库名。若该仓库根目录没有 package.json、或安装脚本被 pnpm 拦下，会在这里显示宿主返回的原因；那时请改用 README 里的 npm 包名。'
                : '当前宿主没有暴露 pluginManager.installBundle，只能用命令行安装（上面的命令）。'
            )
          )
        )
      )
    }

    function Panel(props) {
      const [q, setQ] = react.useState('')
      const [cat, setCat] = react.useState('')
      const [sort, setSort] = react.useState('rank')
      const [dir, setDir] = react.useState('desc')
      const [view, setView] = react.useState('cards')
      const [limit, setLimit] = react.useState(120)
      const [detail, setDetail] = react.useState(null)

      const counts = react.useMemo(() => {
        const m = {}
        for (let i = 0; i < CATALOG.length; i++) {
          const k = CATALOG[i].c
          m[k] = (m[k] || 0) + 1
        }
        return m
      }, [])

      const rows = react.useMemo(() => {
        const toks = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
        const out = []
        for (let i = 0; i < CATALOG.length; i++) {
          const r = CATALOG[i]
          if (cat && r.c !== cat) continue
          if (toks.length) {
            const hay = (r.n + ' ' + r.r + ' ' + (r.d || '') + ' ' + (r.t || []).join(' ') + ' ' + catOf(r.c).name).toLowerCase()
            let ok = true
            for (let t = 0; t < toks.length; t++) {
              if (hay.indexOf(toks[t]) < 0) { ok = false; break }
            }
            if (!ok) continue
          }
          out.push(r)
        }
        const sign = dir === 'asc' ? 1 : -1
        out.sort((a, b) => {
          let v = 0
          if (sort === 'stars') v = (a.s || 0) - (b.s || 0)
          else if (sort === 'forks') v = (a.f || 0) - (b.f || 0)
          else if (sort === 'issues') v = (a.i || 0) - (b.i || 0)
          else if (sort === 'pushed') v = (Date.parse(a.p) || 0) - (Date.parse(b.p) || 0)
          else if (sort === 'name') v = String(a.n).localeCompare(String(b.n))
          else if (sort === 'cat') v = (CAT_INDEX[a.c] || 0) - (CAT_INDEX[b.c] || 0)
          else v = rankOf(a) - rankOf(b)
          return v * sign || (b.s || 0) - (a.s || 0)
        })
        return out
      }, [q, cat, sort, dir])

      const shown = rows.slice(0, limit)

      const header = h('header', { className: 'dcat-head' },
        h('div', { className: 'dcat-title' },
          h('span', { className: 'dcat-h' }, '插件目录'),
          h('span', { className: 'dcat-sub' }, CATALOG.length + ' 个社区插件 · 快照 ' + GENERATED_AT)
        ),
        h('input', {
          className: 'dcat-search',
          value: q,
          placeholder: '搜索名称 / 描述 / 标签…',
          spellCheck: false,
          onChange: (e) => { setQ(e.target.value); setLimit(120) }
        }),
        h('select', {
          className: 'dcat-sel',
          value: sort,
          title: '排序',
          onChange: (e) => { setSort(e.target.value); setDir(e.target.value === 'name' ? 'asc' : 'desc') }
        },
          h('option', { value: 'rank' }, '综合热度'),
          h('option', { value: 'stars' }, 'Star 数'),
          h('option', { value: 'pushed' }, '最近更新'),
          h('option', { value: 'forks' }, 'Fork 数'),
          h('option', { value: 'issues' }, 'Issue 数'),
          h('option', { value: 'name' }, '名称'),
          h('option', { value: 'cat' }, '分类')
        ),
        h('button', {
          className: 'dcat-btn',
          title: dir === 'asc' ? '当前升序，点击切降序' : '当前降序，点击切升序',
          onClick: () => setDir(dir === 'asc' ? 'desc' : 'asc')
        }, dir === 'asc' ? '↑' : '↓'),
        h('div', { className: 'dcat-seg' },
          h('button', { className: 'dcat-seg-b' + (view === 'cards' ? ' on' : ''), onClick: () => setView('cards') }, '卡片'),
          h('button', { className: 'dcat-seg-b' + (view === 'table' ? ' on' : ''), onClick: () => setView('table') }, '表格')
        ),
        props.onClose ? h('button', { className: 'dcat-btn', title: '返回对话', onClick: props.onClose }, '×') : null
      )

      const chips = h('div', { className: 'dcat-chips' },
        h(Chip, { key: 'all', active: !cat, count: CATALOG.length, onClick: () => { setCat(''); setLimit(120) }, info: null }),
        CATS.map((c) => counts[c[0]]
          ? h(Chip, {
              key: c[0],
              active: cat === c[0],
              count: counts[c[0]],
              info: CAT_INFO[c[0]],
              onClick: () => { setCat(cat === c[0] ? '' : c[0]); setLimit(120) }
            })
          : null)
      )

      const body = view === 'cards'
        ? h('div', { className: 'dcat-grid' },
            shown.map((r) => h(Card, { key: r.r, row: r, onOpen: setDetail })),
            rows.length > limit
              ? h('button', { className: 'dcat-more', onClick: () => setLimit(limit + 180) }, '显示更多（还有 ' + (rows.length - limit) + ' 条）')
              : null)
        : h('table', { className: 'dcat-table' },
            h('thead', null,
              h('tr', null,
                h('th', null, '插件'),
                h('th', null, '分类'),
                h('th', null, '描述'),
                h('th', { style: { textAlign: 'right' } }, 'Star'),
                h('th', null, '语言'),
                h('th', null, '更新')
              )
            ),
            h('tbody', null,
              shown.map((r) => {
                const c = catOf(r.c)
                return h('tr', { key: r.r, onClick: () => setDetail(r), style: { cursor: 'pointer' } },
                  h('td', null,
                    h('div', { className: 'dcat-name' }, r.n, r.o ? h('span', { style: { color: '#3fd0a4', fontWeight: 400, fontSize: 10 } }, ' 官方') : null),
                    h('div', { className: 'dcat-repo' }, r.r)
                  ),
                  h('td', { style: { color: c.color, whiteSpace: 'nowrap' } }, c.name),
                  h('td', { style: { opacity: .72, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.d || ''),
                  h('td', { style: { textAlign: 'right' } }, num(r.s)),
                  h('td', null, r.l || '—'),
                  h('td', { style: { whiteSpace: 'nowrap' } }, rel(r.p))
                )
              })
            )
          )

      return h('div', { className: 'dcat' },
        header,
        chips,
        h('div', { className: 'dcat-body' },
          body,
          rows.length === 0 ? h('div', { style: { padding: '30px 0', textAlign: 'center', opacity: .6 } }, '没有符合条件的插件') : null
        ),
        h('div', { className: 'dcat-foot' }, '共 ' + rows.length + ' 条结果' + (rows.length > shown.length ? '，已显示 ' + shown.length : '') + ' · 数据来自 GitHub，安装以各仓库 README 为准'),
        detail ? h(Detail, { row: detail, onClose: () => setDetail(null), manager: props.manager }) : null
      )
    }

    /* ------------------------------------------------------------------ *
     * 插件入口
     * ------------------------------------------------------------------ */
    exports.inject = ['slots', 'layout']

    exports.apply = function apply(ctx) {
      installStyles()
      applyThemeVars()

      // 宿主切主题时重新取一次表面配色（观察 <html> 属性变化，节流到下一帧）
      try {
        if (typeof MutationObserver !== 'undefined' && document.documentElement) {
          let queued = false
          const obs = new MutationObserver(() => {
            if (queued) return
            queued = true
            requestAnimationFrame(() => { queued = false; applyThemeVars() })
          })
          obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
        }
      } catch (e) {
        // 跟随主题失败不影响主功能
      }

      const layout = (ctx && typeof ctx.get === 'function') ? ctx.get('layout') : null
      const manager = (ctx && ctx.remote && ctx.remote.pluginManager) || null

      if (!layout || typeof layout.selectPanel !== 'function') {
        // 宿主没有布局服务（很旧的版本或非 web 平台）：不注册半个面板，直接说明原因
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[dsh-plugin-directory] 当前宿主没有 layout.selectPanel，面板入口未注册（需要 dsh 0.1.5+ 的 web 宿主）')
        }
        return
      }

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
        { name: 'sidebar.panellist', id: PANEL_ID, order: 6, label: '插件目录' },
        (props) => h(DirectoryIcon, props)
      ))

      ctx.slots.inject('main', () => ctx.slots.register(
        { name: 'main', key: PANEL_ID },
        () => h(Panel, { manager, onClose: () => layout.selectPanel(null) })
      ))
    }

    return exports
  }
})
