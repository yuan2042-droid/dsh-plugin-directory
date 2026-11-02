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
     * 分类（与数据里的 c 字段对应）
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
     * 样式（只注入一次；前缀统一 dcat-，避免污染宿主）
     * ------------------------------------------------------------------ */
    const STYLE = [
      '.dcat{position:relative;display:flex;flex-direction:column;height:100%;min-height:320px;gap:9px;padding:14px 16px 8px;font:13px/1.5 "Segoe UI","Microsoft YaHei UI",system-ui,sans-serif;color:inherit;box-sizing:border-box}',
      '.dcat *{box-sizing:border-box}',
      '.dcat-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.dcat-title{display:flex;flex-direction:column;margin-right:auto;min-width:140px}',
      '.dcat-h{font-size:15px;font-weight:650;letter-spacing:.2px}',
      '.dcat-sub{font-size:11px;opacity:.55}',
      '.dcat-search{height:30px;min-width:200px;flex:0 1 260px;padding:0 10px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:rgba(128,128,128,.1);color:inherit;outline:none;font-size:12.5px}',
      '.dcat-search:focus{border-color:rgba(47,185,138,.8)}',
      '.dcat-sel{height:30px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:rgba(128,128,128,.1);color:inherit;font-size:12px;padding:0 6px;outline:none}',
      '.dcat-sel option{color:#111}',
      '.dcat-btn{height:30px;min-width:30px;padding:0 9px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:transparent;color:inherit;font-size:12.5px;cursor:pointer;line-height:1}',
      '.dcat-btn:hover{background:rgba(128,128,128,.16)}',
      '.dcat-seg{display:flex;border:1px solid rgba(128,128,128,.3);border-radius:8px;overflow:hidden}',
      '.dcat-seg-b{height:28px;padding:0 10px;border:0;background:transparent;color:inherit;opacity:.6;font-size:12px;cursor:pointer}',
      '.dcat-seg-b+.dcat-seg-b{border-left:1px solid rgba(128,128,128,.22)}',
      '.dcat-seg-b.on{opacity:1;background:rgba(47,185,138,.18);color:#2fb98a;font-weight:600}',
      '.dcat-chips{display:flex;flex-wrap:wrap;gap:6px;padding-bottom:2px}',
      '.dcat-chip{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;border:1px solid rgba(128,128,128,.26);background:transparent;color:inherit;font-size:11.5px;cursor:pointer;opacity:.8}',
      '.dcat-chip:hover{opacity:1;background:rgba(128,128,128,.12)}',
      '.dcat-chip.on{opacity:1;border-color:rgba(47,185,138,.65);background:rgba(47,185,138,.15);color:#2fb98a}',
      '.dcat-chip i{width:7px;height:7px;border-radius:50%;display:inline-block;flex:none}',
      '.dcat-chip b{font-weight:500;opacity:.6}',
      '.dcat-body{flex:1;min-height:0;overflow:auto;padding-right:2px}',
      '.dcat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(295px,1fr));gap:10px;padding-bottom:6px}',
      '.dcat-card{display:flex;flex-direction:column;gap:7px;padding:11px 12px;border-radius:11px;border:1px solid rgba(128,128,128,.22);background:rgba(128,128,128,.05);cursor:pointer}',
      '.dcat-card:hover{border-color:rgba(47,185,138,.55);background:rgba(47,185,138,.08)}',
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
      '.dcat-detail{position:absolute;inset:0;background:rgba(10,14,18,.45);display:flex;align-items:center;justify-content:center;padding:18px;z-index:9}',
      '.dcat-detail-box{width:100%;max-width:560px;max-height:82%;overflow:auto;border-radius:14px;border:1px solid rgba(128,128,128,.35);background:rgba(128,128,128,.16);backdrop-filter:blur(22px) saturate(1.1);padding:16px 18px}',
      '.dcat-detail-box h3{margin:0 0 2px;font-size:16px}',
      '.dcat-detail-box .dcat-repo{margin-bottom:10px}',
      '.dcat-detail-box p{font-size:12.5px;opacity:.8;line-height:1.65;margin:0 0 12px;white-space:pre-wrap}',
      '.dcat-kv{display:grid;grid-template-columns:76px 1fr;gap:5px 10px;font-size:11.5px}',
      '.dcat-kv dt{opacity:.5}',
      '.dcat-kv dd{margin:0;word-break:break-word}',
      '.dcat-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px}',
      '.dcat-link{display:inline-flex;align-items:center;height:30px;padding:0 12px;border-radius:8px;border:1px solid rgba(47,185,138,.6);background:rgba(47,185,138,.16);color:#2fb98a;text-decoration:none;font-size:12.5px;font-weight:600}',
      '.dcat-link:hover{background:rgba(47,185,138,.26)}'
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
      const install = 'dsh plugin add github:' + r.r
      return h('div', { className: 'dcat-detail', onClick: props.onClose },
        h('div', { className: 'dcat-detail-box', onClick: (e) => e.stopPropagation() },
          h('h3', null, r.n, ' ',
            h('span', { className: 'dcat-tag', style: { color: c.color, borderColor: c.color + '66', verticalAlign: 'middle' } }, c.name)),
          h('div', { className: 'dcat-repo' }, r.r),
          h('p', null, r.d || '（该仓库暂无描述）'),
          h('div', { className: 'dcat-actions' },
            h('a', { className: 'dcat-link', href: r.u, target: '_blank', rel: 'noopener noreferrer' }, '打开 GitHub 仓库'),
            h('button', {
              className: 'dcat-btn',
              onClick: () => {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(install).then(() => { props.toast('已复制安装命令') }, () => { props.toast('复制失败，命令：' + install) })
                } else {
                  props.toast('安装命令：' + install)
                }
              }
            }, '复制安装命令')
          ),
          h('dl', { className: 'dcat-kv' },
            h('dt', null, 'Star'), h('dd', null, String(r.s || 0)),
            h('dt', null, 'Fork'), h('dd', null, String(r.f || 0)),
            h('dt', null, 'Issue'), h('dd', null, String(r.i || 0)),
            h('dt', null, '语言'), h('dd', null, r.l || '—'),
            h('dt', null, '最近更新'), h('dd', null, rel(r.p) + '（' + String(r.p || '').slice(0, 10) + '）'),
            h('dt', null, '标签'), h('dd', null, (r.t || []).length ? (r.t || []).join('、') : '—')
          ),
          h('div', { className: 'dcat-actions' },
            h('button', { className: 'dcat-btn', onClick: props.onClose }, '关闭')
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
      const [toast, setToast] = react.useState('')

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

      react.useEffect(() => {
        if (!toast) return undefined
        const t = setTimeout(() => setToast(''), 1600)
        return () => clearTimeout(t)
      }, [toast])

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
        h('div', { className: 'dcat-foot' }, '共 ' + rows.length + ' 条结果' + (rows.length > shown.length ? '，已显示 ' + shown.length : '') + ' · 数据来自 GitHub，安装以各仓库 README 为准' + (toast ? ' · ' + toast : '')),
        detail ? h(Detail, { row: detail, onClose: () => setDetail(null), toast: setToast }) : null
      )
    }

    /* ------------------------------------------------------------------ *
     * 插件入口
     * ------------------------------------------------------------------ */
    exports.inject = ['slots', 'layout']

    exports.apply = function apply(ctx) {
      installStyles()
      const layout = (ctx && typeof ctx.get === 'function') ? ctx.get('layout') : null

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
        () => h(Panel, { onClose: () => layout.selectPanel(null) })
      ))
    }

    return exports
  }
})
