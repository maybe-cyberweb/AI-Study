(() => {
  const state = {
    catalog: null,
    pointById: new Map(),
    pointMetaById: new Map(),
    mdCache: new Map(),
    expansions: null,
    searchOpen: false,
    searchQuery: ''
  }

  const els = { root: null }

  const esc = (s) =>
    String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')

  const normalizePath = (p) => {
    if (!p) return '/'
    const q = p.split('?')[0]
    if (!q.startsWith('/')) return '/' + q
    return q
  }

  const currentPath = () => {
    const hash = window.location.hash || ''
    if (hash.startsWith('#/')) return normalizePath(hash.slice(1))
    return '/'
  }

  const navigate = (path) => {
    const p = normalizePath(path)
    window.location.hash = '#' + p
  }

  const getRoute = (path) => {
    if (path === '/') return { name: 'home' }
    const m1 = path.match(/^\/category\/([^/]+)(?:\/(map))?$/)
    if (m1) return { name: 'category', slug: decodeURIComponent(m1[1]), view: m1[2] === 'map' ? 'map' : 'index' }
    const m2 = path.match(/^\/point\/([^/]+)$/)
    if (m2) return { name: 'point', id: decodeURIComponent(m2[1]) }
    return { name: 'notfound' }
  }

  const flattenPoints = (catalog) => {
    state.pointById.clear()
    state.pointMetaById.clear()
    for (const cat of catalog.categories) {
      let order = 0
      for (const sec of cat.sections) {
        for (const p of sec.points) {
          state.pointById.set(p.id, p)
          state.pointMetaById.set(p.id, {
            categorySlug: cat.slug,
            categoryTitle: cat.title,
            sectionTitle: sec.title,
            order
          })
          order += 1
        }
      }
    }
  }

  const findCategory = (slug) => state.catalog?.categories.find((c) => c.slug === slug) || null

  const categoryPoints = (slug) => {
    const cat = findCategory(slug)
    if (!cat) return []
    const list = []
    for (const sec of cat.sections) for (const p of sec.points) list.push({ ...p, sectionTitle: sec.title })
    return list
  }

  const getPrevNext = (pointId) => {
    const meta = state.pointMetaById.get(pointId)
    if (!meta) return { prev: null, next: null }
    const points = categoryPoints(meta.categorySlug)
    const idx = points.findIndex((p) => p.id === pointId)
    return { prev: idx > 0 ? points[idx - 1] : null, next: idx >= 0 && idx < points.length - 1 ? points[idx + 1] : null }
  }

  const setDocumentMeta = ({ title, description }) => {
    document.title = title
    const meta = document.querySelector('meta[name="description"]')
    if (meta) meta.setAttribute('content', description)
    const ogt = document.querySelector('meta[property="og:title"]')
    const ogd = document.querySelector('meta[property="og:description"]')
    if (ogt) ogt.setAttribute('content', title)
    if (ogd) ogd.setAttribute('content', description)
  }

  const toast = (msg) => {
    const el = document.createElement('div')
    el.className = 'kb-panel kb-toast'
    el.textContent = msg
    document.body.appendChild(el)
    setTimeout(() => {
      el.style.opacity = '0'
      el.style.transition = 'opacity 220ms ease'
    }, 1200)
    setTimeout(() => el.remove(), 1600)
  }

  const copyShare = async () => {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      toast('已复制链接')
    } catch {
      toast('复制失败，请手动复制地址栏链接')
    }
  }

  const mdToHtml = (md) => {
    const src = String(md || '').replace(/\r\n/g, '\n')
    const lines = src.split('\n')
    let i = 0
    let out = ''

    const escText = (t) => esc(t)

    const inline = (t) => {
      let s = escText(t)
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="kb-link" href="$2" target="_blank" rel="noreferrer">$1</a>')
      return s
    }

    const readFence = () => {
      const first = lines[i]
      const lang = first.slice(3).trim()
      i += 1
      let body = ''
      while (i < lines.length && !lines[i].startsWith('```')) {
        body += lines[i] + '\n'
        i += 1
      }
      if (i < lines.length && lines[i].startsWith('```')) i += 1
      return `<pre><code class="kb-code">${escText(body)}</code></pre>`
    }

    const readList = () => {
      let items = ''
      while (i < lines.length) {
        const m = lines[i].match(/^\s*-\s+(.*)$/)
        if (!m) break
        items += `<li>${inline(m[1])}</li>`
        i += 1
      }
      return `<ul>${items}</ul>`
    }

    while (i < lines.length) {
      const line = lines[i]
      if (!line.trim()) {
        i += 1
        continue
      }
      if (line.startsWith('```')) {
        out += readFence()
        continue
      }
      const h = line.match(/^(#{1,3})\s+(.*)$/)
      if (h) {
        const lvl = h[1].length
        out += `<h${lvl}>${inline(h[2])}</h${lvl}>`
        i += 1
        continue
      }
      if (line.match(/^\s*-\s+/)) {
        out += readList()
        continue
      }
      out += `<p>${inline(line)}</p>`
      i += 1
    }
    return out
  }

  const loadMarkdown = async (path) => {
    if (state.mdCache.has(path)) return state.mdCache.get(path)
    const res = await fetch(path, { cache: 'no-store' })
    if (!res.ok) throw new Error('markdown load failed')
    const t = await res.text()
    state.mdCache.set(path, t)
    return t
  }

  const autoExpansionForPoint = (p, meta) => {
    const tags = new Set(p.tags || [])
    const lines = []
    lines.push('## 学习强化（自动生成）')
    lines.push('')
    lines.push('### 学习目标（读完要做到）')
    lines.push(`- 能用自己的话解释「${p.title}」解决的核心问题，以及它在系统里的位置`)
    lines.push('- 能写出最小可用实现（MVP）：输入/输出/关键参数/失败策略')
    lines.push('- 能列出 3 个常见失败模式，并给出可观测指标与回归方法')
    lines.push('')
    lines.push('### 落地到你们项目（干部教育智能化）')
    lines.push('- 对“AI 知识库”：把概念落到索引结构、引用追溯、评测与回归')
    lines.push('- 对“智能测评/推课”：把输出收敛成结构化结果（JSON Schema），并可被系统校验/落库')
    lines.push('- 对“智能伴读”：优先做上下文预算与摘要（避免长对话失控），必要时引入工具链')
    lines.push('')
    lines.push('### 最小可用实现（MVP 步骤）')
    lines.push('- 定义输入：用户问题/干部档案/政策文本/课程库（明确权限边界）')
    lines.push('- 定义输出：必须字段、引用/证据、失败时返回什么（不确定/需要补充材料）')
    lines.push('- 定义校验：schema 校验、引用校验、权限校验、重试次数与预算')
    lines.push('- 定义观测：延迟拆解、token/成本、错误码、命中率/通过率')
    lines.push('')
    lines.push('### 常见坑与对策（工程视角）')
    lines.push('- 只靠提示词：改为“强校验 + 有限重试 + 熔断/降级”')
    lines.push('- 无引用的正确感：改为“结论必须带 citations，且后端校验引用来自检索上下文”')
    lines.push('- 失败不可解释：改为“错误码 + 可读错误 + 可回归样例集”')
    if (tags.has('rag')) {
      lines.push('- 检索不稳：改为 Hybrid（关键词 + 向量）+ RRF + rerank，并固定评测集做回归')
      lines.push('- Chunk 不合理：按条款/段落切分，保留章/节/条路径，控制长度与重叠')
      lines.push('- 注入风险：把检索文本当不可信输入，做隔离与过滤（见提示注入专题）')
    }
    if (tags.has('agent')) {
      lines.push('- 工具调用乱：先定义工具契约（输入/输出/错误码/幂等），再让模型调用')
      lines.push('- 格式漂移：用 JSON Schema/Grammar 把输出约束在解码/校验层')
      lines.push('- 死循环：限制 tool/retry/token 预算，并实现自动降级（仅检索/仅摘要/人工介入）')
    }
    if (tags.has('systems') || tags.has('ops') || tags.has('cost')) {
      lines.push('- 延迟波动：把延迟拆成排队/prefill/decoding/后处理，做连续批处理与限流')
      lines.push('- 成本失控：缓存（答案/检索/前缀）+ 路由（小模型优先）+ 输出长度控制')
      lines.push('- 长上下文爆显存：Select/Compress/Isolate，必要时做摘要与分段回答')
    }
    if (tags.has('security')) {
      lines.push('- 数据外泄：最小权限、检索隔离、多租户隔离、敏感字段阻断、审计日志')
    }
    lines.push('')
    lines.push('### 实战练习（建议加入学习任务）')
    lines.push('- 练习 1：写一个“输入→输出→校验→失败策略”的说明，并给出 3 条坏样例')
    lines.push('- 练习 2：设计一组回归集（至少 20 条），指标包含正确率/引用正确率/schema 通过率/成本')
    lines.push('')
    lines.push('### 延伸阅读（关键词）')
    lines.push('- Harness Engineering / Context Engineering / Agentic RAG / GraphRAG')
    lines.push('- Structured Decoding / JSON Schema / Tool Contracts / Observability')
    lines.push('')
    return lines.join('\n')
  }

  const renderShell = (mainHtml) => {
    const site = state.catalog.site
    const categories = state.catalog.categories
    const path = currentPath()
    const route = getRoute(path)
    const activeCat =
      route.name === 'category' ? route.slug : route.name === 'point' ? state.pointMetaById.get(route.id)?.categorySlug : null

    const headerTabs = categories
      .map((c) => {
        const active = activeCat === c.slug
        return `<a href="#/category/${encodeURIComponent(c.slug)}" class="kb-tab ${active ? 'active' : ''}" data-link>${esc(
          c.title
        )}</a>`
      })
      .join('')

    const searchBox = `
      <div class="kb-search">
        <input id="kb-search" value="${esc(state.searchQuery)}" placeholder="搜索知识点（如：KV Cache / RRF / RoPE）" />
        <div id="kb-search-pop" class="kb-panel kb-pop ${state.searchOpen ? '' : 'hidden'}">
          <div class="kb-scroll" style="max-height: 360px" id="kb-search-results"></div>
        </div>
      </div>
    `

    return `
      <div class="kb-layout">
        <div class="kb-topbar kb-panel">
          <div class="kb-topbar-inner">
            <a href="#/" data-link class="kb-logo">
              <div class="kb-mark"></div>
              <div>
                <div class="kb-title">${esc(site.title)}</div>
                <div class="kb-updated">最后更新 ${esc(site.updatedAt)}</div>
              </div>
            </a>
            <div class="kb-tabs">${headerTabs}</div>
            <div class="kb-grow"></div>
            ${searchBox}
            <button id="kb-share" class="kb-btn">分享</button>
          </div>
        </div>
        <div class="kb-grow">${mainHtml}</div>
        <div class="kb-footer">
          <div class="kb-footer-inner">
            本站点为学习型知识库（静态内容），支持链接分享与离线浏览。目录：
            <a class="kb-link" href="#/" data-link>首页</a> ·
            <a class="kb-link" href="#/category/ai-foundations" data-link>AI 底层</a> ·
            <a class="kb-link" href="#/category/engineering-practice" data-link>工程实战</a>
          </div>
        </div>
      </div>
    `
  }

  const renderHome = () => {
    setDocumentMeta({ title: state.catalog.site.title, description: state.catalog.site.description })
    const categories = state.catalog.categories

    const ia = categories
      .map((c) => {
        const items = c.sections
          .map((s) => `<div style="font-size: 14px"><span style="font-weight: 900">${esc(s.title)}</span><span class="kb-subtle"> · ${s.points.length} 个知识点</span></div>`)
          .join('')
        return `
          <div class="kb-panel kb-card">
            <div style="font-weight: 900">${esc(c.title)} · 信息架构</div>
            <div style="margin-top: 12px; display: grid; gap: 10px">${items}</div>
          </div>
        `
      })
      .join('')

    const cards = categories
      .map((c) => {
        return `
          <div class="kb-panel kb-card">
            <div style="display:flex; align-items:center; gap: 12px">
              <div style="width: 36px; height: 36px; border-radius: 16px; background: rgba(99,102,241,0.25); border: 1px solid rgba(99,102,241,0.35);"></div>
              <div>
                <div style="font-size:16px; font-weight: 950">${esc(c.title)}</div>
                <div style="margin-top: 4px; font-size: 13px" class="kb-subtle">${esc(c.description)}</div>
              </div>
            </div>
            <div style="margin-top: 14px; display:flex; flex-wrap:wrap; gap: 8px">
              <span class="kb-badge">索引</span>
              <span class="kb-badge">脑图</span>
              <span class="kb-badge">可分享</span>
              <span class="kb-badge">离线可读</span>
            </div>
            <div class="kb-actions">
              <a href="#/category/${encodeURIComponent(c.slug)}" data-link class="kb-btn kb-btn-primary">进入大类</a>
              <a href="#/category/${encodeURIComponent(c.slug)}/map" data-link class="kb-btn">查看脑图</a>
            </div>
          </div>
        `
      })
      .join('')

    return renderShell(`
      <div class="kb-container">
        <div class="kb-grid cols-12">
          <div class="kb-panel kb-hero" style="grid-column: span 12;">
            <div class="kicker">LEARNING HUB</div>
            <h1>把 AI 从“能说”变成“能交付”</h1>
            <p>
              以“知识大类 → 章节 → 知识点”组织内容：每个大类支持索引与脑图两种视图；每个知识点给出解释、工程要点与自检清单，适配你们的 AI 知识库/测评/推课/伴读/学习档案项目落地。
            </p>
            <div style="margin-top: 18px; display:flex; flex-wrap:wrap; gap: 8px">
              <span class="kb-badge">AI 底层：Transformer / 训练 / 推理 / Serving</span>
              <span class="kb-badge">工程实战：RAG / Agent / MCP / 评测 / 运维</span>
              <span class="kb-badge">前沿：Agentic RAG / Structured Decoding / Speculative</span>
            </div>
          </div>
        </div>

        <div class="kb-grid cols-12" style="margin-top: 16px">
          <div style="grid-column: span 12;" class="kb-grid" >${ia}</div>
        </div>
        <div class="kb-grid" style="margin-top: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));">${cards}</div>
      </div>
    `)
  }

  const renderCategory = (slug, view) => {
    const cat = findCategory(slug)
    if (!cat) return renderNotFound()
    setDocumentMeta({ title: `${cat.title} - 学习页`, description: cat.description })

    const left = cat.sections
      .map((sec) => {
        const points = sec.points
          .map((p) => {
            return `
              <a href="#/point/${encodeURIComponent(p.id)}" data-link class="kb-item">
                <div class="kb-item-title">${esc(p.title)}</div>
                <div class="kb-item-summary">${esc(p.summary)}</div>
                <div class="kb-item-tags">
                  <span class="kb-badge">${esc(p.level)}</span>
                  ${(p.tags || []).slice(0, 3).map((t) => `<span class="kb-badge">${esc(t)}</span>`).join('')}
                </div>
              </a>
            `
          })
          .join('')
        return `
          <div style="margin-bottom: 10px">
            <div class="kb-section-title">${esc(sec.title)}</div>
            <div style="display:grid; gap: 8px">${points}</div>
          </div>
        `
      })
      .join('')

    const tabs = `
      <div class="kb-viewbar">
        <a href="#/category/${encodeURIComponent(cat.slug)}" data-link class="kb-btn ${view === 'index' ? 'kb-btn-primary' : ''}">索引视图</a>
        <a href="#/category/${encodeURIComponent(cat.slug)}/map" data-link class="kb-btn ${view === 'map' ? 'kb-btn-primary' : ''}">脑图视图</a>
      </div>
    `

    const buildTree = () => {
      const sections = cat.sections
        .map((sec) => {
          const items = sec.points
            .map((p) => `<li><a href="#/point/${encodeURIComponent(p.id)}" data-link><span style="opacity:.85">●</span> ${esc(p.title)}</a></li>`)
            .join('')
          return `
            <details open>
              <summary>${esc(sec.title)} <span class="kb-subtle" style="font-weight:700; margin-left: 6px">(${sec.points.length})</span></summary>
              <ul>${items}</ul>
            </details>
          `
        })
        .join('')
      return `
        <div class="kb-panel kb-tree">
          <div class="root">${esc(cat.title)} · 脑图</div>
          <div class="kb-subtle" style="font-size: 13px; line-height: 1.8; margin-bottom: 12px">
            这是“可点击”的脑图视图：以章节为一级节点、知识点为叶子节点。点击任意知识点即可进入详情页；适合在无法访问外部 CDN 的网络环境中使用。
          </div>
          ${sections}
        </div>
      `
    }

    const main =
      view === 'map'
        ? buildTree()
        : `
          <div class="kb-panel kb-card">
            <div style="font-weight: 950">学习建议（更适合做项目）</div>
            <div class="kb-subtle" style="margin-top: 10px; font-size: 14px; line-height: 1.9">
              1) 先从脑图建立结构；2) 再按左侧索引逐点学习；3) 遇到“跑不通/不稳定/成本高”问题时，用“相关知识点”横向跳转；
              4) 每个知识点都要落到“可验证”：能写出最小复现、能解释参数取舍、能给出监控与回归。
            </div>
            <div style="margin-top: 14px; display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px">
              <div class="kb-panel kb-card" style="padding: 14px">
                <div style="font-size: 12px; letter-spacing: 0.14em; font-weight: 950; color: rgba(199,210,254,.92)">START HERE</div>
                <div style="margin-top: 6px; font-weight: 900">先读脑图，再读索引</div>
                <div class="kb-subtle" style="margin-top: 6px; font-size: 12px; line-height: 1.8">脑图建立结构；索引补齐细节；详情页提供可落地的 checklist。</div>
              </div>
              <div class="kb-panel kb-card" style="padding: 14px">
                <div style="font-size: 12px; letter-spacing: 0.14em; font-weight: 950; color: rgba(167,243,208,.92)">PRACTICE</div>
                <div style="margin-top: 6px; font-weight: 900">把知识点变成工程决策</div>
                <div class="kb-subtle" style="margin-top: 6px; font-size: 12px; line-height: 1.8">选型、预算、熔断、降级、评测与观测缺一不可。</div>
              </div>
            </div>
          </div>
        `

    return renderShell(`
      <div class="kb-container">
        <div style="display:flex; align-items:flex-start; justify-content: space-between; gap: 14px; flex-wrap:wrap">
          <div>
            <div style="font-size: 22px; font-weight: 1000; letter-spacing: -0.02em">${esc(cat.title)}</div>
            <div class="kb-subtle" style="margin-top: 6px; font-size: 14px; line-height: 1.8">${esc(cat.description)}</div>
          </div>
          <div style="display:flex; gap: 10px; align-items:center; flex-wrap:wrap">
            ${tabs}
            <button id="kb-share2" class="kb-btn">分享当前大类</button>
          </div>
        </div>
        <div class="kb-split" style="margin-top: 16px">
          <div class="kb-panel kb-side kb-scroll">${left}</div>
          <div>${main}</div>
        </div>
      </div>
    `)
  }

  const renderPoint = async (id) => {
    const p = state.pointById.get(id)
    const meta = state.pointMetaById.get(id)
    if (!p || !meta) return renderNotFound()

    setDocumentMeta({ title: `${p.title} - ${meta.categoryTitle}`, description: p.summary })
    const { prev, next } = getPrevNext(id)

    const related = (p.related || [])
      .map((rid) => {
        const rp = state.pointById.get(rid)
        if (!rp) return ''
        return `
          <a href="#/point/${encodeURIComponent(rp.id)}" data-link class="kb-panel kb-card" style="padding: 14px">
            <div style="font-weight: 900">${esc(rp.title)}</div>
            <div class="kb-subtle" style="margin-top: 6px; font-size: 12px; line-height: 1.8">${esc(rp.summary)}</div>
          </a>
        `
      })
      .join('')

    const breadcrumb = `
      <div class="kb-subtle" style="font-size: 12px; line-height: 1.8">
        <a class="kb-link" href="#/" data-link>首页</a>
        <span style="margin: 0 8px">/</span>
        <a class="kb-link" href="#/category/${encodeURIComponent(meta.categorySlug)}" data-link>${esc(meta.categoryTitle)}</a>
        <span style="margin: 0 8px">/</span>
        <span>${esc(meta.sectionTitle)}</span>
      </div>
    `

    const mdPath = `/content/${p.md}`
    const mdText = await loadMarkdown(mdPath)
    const html = mdToHtml(mdText)
    const expansionMd = state.expansions && state.expansions[id] ? String(state.expansions[id]) : ''
    const expansionHtml = expansionMd ? mdToHtml(expansionMd) : ''
    const autoHtml = mdToHtml(autoExpansionForPoint(p, meta))

    const navCard = (label, point) => {
      if (!point) {
        return `<div class="kb-panel kb-card" style="padding: 14px; opacity: .55"><div class="kb-subtle" style="font-size: 12px">${label}</div><div style="margin-top: 6px; font-weight: 900">无</div></div>`
      }
      return `<a href="#/point/${encodeURIComponent(point.id)}" data-link class="kb-panel kb-card" style="padding: 14px"><div class="kb-subtle" style="font-size: 12px">${label}</div><div style="margin-top: 6px; font-weight: 900">${esc(point.title)}</div></a>`
    }

    els.root.innerHTML = renderShell(`
      <div class="kb-container">
        ${breadcrumb}
        <div style="margin-top: 10px; display:flex; align-items:flex-start; justify-content: space-between; gap: 14px; flex-wrap:wrap">
          <div>
            <div style="font-size: 28px; font-weight: 1100; letter-spacing: -0.03em">${esc(p.title)}</div>
            <div class="kb-subtle" style="margin-top: 8px; font-size: 14px; line-height: 1.9">${esc(p.summary)}</div>
          </div>
          <button id="kb-share3" class="kb-btn">分享知识点</button>
        </div>
        <div class="kb-grid" style="margin-top: 16px; grid-template-columns: 1.4fr 0.9fr; gap: 16px">
          <div class="kb-panel kb-card">
            <div class="kb-prose">${html}</div>
            ${expansionHtml ? `<div style="height: 12px"></div><div class="kb-prose">${expansionHtml}</div>` : ''}
            <div style="height: 12px"></div><div class="kb-prose">${autoHtml}</div>
          </div>
          <div class="kb-grid" style="grid-auto-rows: min-content">
            <div class="kb-panel kb-card">
              <div style="font-weight: 950">相关知识点</div>
              <div style="margin-top: 12px; display:grid; gap: 10px">${related || '<div class="kb-subtle" style="font-size: 12px">暂无</div>'}</div>
            </div>
            <div class="kb-panel kb-card">
              <div style="font-weight: 950">回到大类</div>
              <div class="kb-subtle" style="margin-top: 8px; font-size: 13px; line-height: 1.8">继续在索引或脑图中定位下一步。</div>
              <div class="kb-actions">
                <a href="#/category/${encodeURIComponent(meta.categorySlug)}" data-link class="kb-btn kb-btn-primary">索引</a>
                <a href="#/category/${encodeURIComponent(meta.categorySlug)}/map" data-link class="kb-btn">脑图</a>
              </div>
            </div>
          </div>
        </div>
        <div class="kb-grid" style="margin-top: 12px; grid-template-columns: 1fr 1fr; gap: 12px">
          ${navCard('上一篇', prev)}
          ${navCard('下一篇', next)}
        </div>
      </div>
    `)

    wireCommon()
  }

  const renderNotFound = () => {
    setDocumentMeta({ title: '页面不存在 - 知识库', description: '找不到页面' })
    return renderShell(`
      <div class="kb-container" style="padding-top: 30px">
        <div class="kb-panel kb-card">
          <div style="font-size: 22px; font-weight: 1000">404：找不到页面</div>
          <div class="kb-subtle" style="margin-top: 10px; font-size: 14px; line-height: 1.9">建议从首页进入或使用搜索。</div>
          <div class="kb-actions">
            <a href="#/" data-link class="kb-btn kb-btn-primary">返回首页</a>
          </div>
        </div>
      </div>
    `)
  }

  const renderSearchResults = () => {
    const pop = document.getElementById('kb-search-pop')
    const list = document.getElementById('kb-search-results')
    if (!pop || !list) return
    pop.classList.toggle('hidden', !state.searchOpen)
    const q = state.searchQuery.trim().toLowerCase()
    const all = Array.from(state.pointById.values())
    const matches = q
      ? all
          .filter((p) => {
            const extra = state.expansions && state.expansions[p.id] ? String(state.expansions[p.id]) : ''
            return (p.title + ' ' + p.summary + ' ' + (p.tags || []).join(' ') + ' ' + extra).toLowerCase().includes(q)
          })
          .slice(0, 14)
      : all.slice(0, 14)
    const html = matches
      .map((p) => {
        const meta = state.pointMetaById.get(p.id)
        return `
          <a href="#/point/${encodeURIComponent(p.id)}" data-link style="display:block; padding: 10px 12px" class="kb-item">
            <div style="font-weight: 900">${esc(p.title)}</div>
            <div class="kb-subtle" style="margin-top: 4px; font-size: 12px">${esc(meta ? meta.categoryTitle + ' · ' + meta.sectionTitle : '')}</div>
          </a>
        `
      })
      .join('')
    list.innerHTML = html || `<div style="padding: 10px 12px" class="kb-subtle">无结果</div>`
  }

  const wireCommon = () => {
    const share1 = document.getElementById('kb-share')
    const share2 = document.getElementById('kb-share2')
    const share3 = document.getElementById('kb-share3')
    if (share1) share1.onclick = copyShare
    if (share2) share2.onclick = copyShare
    if (share3) share3.onclick = copyShare

    const input = document.getElementById('kb-search')
    if (input) {
      input.onfocus = () => {
        state.searchOpen = true
        renderSearchResults()
      }
      input.onblur = () => {
        setTimeout(() => {
          state.searchOpen = false
          renderSearchResults()
        }, 120)
      }
      input.oninput = (e) => {
        state.searchQuery = e.target.value || ''
        state.searchOpen = true
        renderSearchResults()
      }
    }
  }

  const attachLinkInterceptor = () => {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a')
      if (!a) return
      const href = a.getAttribute('href')
      if (!href) return
      if (a.getAttribute('target') === '_blank') return
      if (href.startsWith('http')) return
      if (href.startsWith('mailto:') || href.startsWith('tel:')) return
      if (!href.startsWith('#/')) return
      e.preventDefault()
      window.location.hash = href
    })
    window.addEventListener('hashchange', () => render())
  }

  const render = async () => {
    if (!state.catalog) {
      els.root.innerHTML = `
        <div class="kb-layout">
          <div class="kb-container">
            <div class="kb-panel kb-card" style="text-align:center">
              <div style="font-weight: 1000">正在加载知识库…</div>
              <div class="kb-subtle" style="margin-top: 10px; font-size: 14px">首次加载会读取本地内容索引。</div>
            </div>
          </div>
        </div>
      `
      return
    }

    const route = getRoute(currentPath())
    if (route.name === 'home') {
      els.root.innerHTML = renderHome()
      wireCommon()
      return
    }
    if (route.name === 'category') {
      els.root.innerHTML = renderCategory(route.slug, route.view)
      wireCommon()
      return
    }
    if (route.name === 'point') {
      await renderPoint(route.id)
      return
    }
    els.root.innerHTML = renderNotFound()
    wireCommon()
  }

  const init = async () => {
    els.root = document.getElementById('app')
    attachLinkInterceptor()
    state.expansions = window.__KB_EXPANSIONS__ || null
    const res = await fetch('/content/catalog.json', { cache: 'no-store' })
    if (!res.ok) throw new Error('catalog load failed')
    state.catalog = await res.json()
    flattenPoints(state.catalog)
    render()
  }

  init().catch(() => {
    const root = document.getElementById('app')
    root.innerHTML = `
      <div class="kb-layout">
        <div class="kb-container">
          <div class="kb-panel kb-card">
            <div style="font-size: 18px; font-weight: 1000">加载失败</div>
            <div class="kb-subtle" style="margin-top: 10px; font-size: 14px; line-height: 1.9">
              可能原因：站点静态资源未完整发布（缺少 content 目录）或网络限制导致外部资源加载失败。当前版本已移除外部依赖，如仍失败请检查 /content/catalog.json 是否能访问。
            </div>
            <div class="kb-actions">
              <a href="#/" class="kb-btn kb-btn-primary" data-link>返回首页</a>
            </div>
          </div>
        </div>
      </div>
    `
  })
})()
