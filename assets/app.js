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
    lines.push('### 1) 知识定位')
    if (meta) {
      lines.push(`- 所属大类：${meta.categoryTitle}`)
      lines.push(`- 所属章节：${meta.sectionTitle}`)
    }
    lines.push(`- 知识点：${p.title}`)
    lines.push(`- 关键词：${(p.tags || []).slice(0, 8).join(' / ') || '（暂无）'}`)
    lines.push('')
    lines.push('### 2) 学习目标（读完要做到）')
    lines.push(`- 能用自己的话解释「${p.title}」解决的核心问题、适用边界与代价`)
    lines.push('- 能写出最小可用实现（MVP）：输入/输出/关键参数/失败策略/验收标准')
    lines.push('- 能列出至少 5 个失败模式，并用可观测指标定位（而不是靠感觉调参）')
    lines.push('- 能把它映射到你们的业务模块：知识库/测评/推课/伴读/终身学习档案')
    lines.push('')
    lines.push('### 3) 核心概念（工程化解释）')
    lines.push('- 先问“它解决什么变量不确定性”：是检索不确定？格式不确定？延迟不确定？还是安全不确定？')
    lines.push('- 再问“它把不确定性转移到哪里”：转移到数据治理/索引/校验器/预算/观测/回归上')
    lines.push('- 最后问“最小验收是什么”：能稳定通过校验、能稳定复现、能稳定回归')
    lines.push('')
    lines.push('### 4) 最小可用实现（MVP 步骤）')
    lines.push('- 定义输入：用户问题/干部档案/政策文本/课程库（明确权限边界与租户隔离）')
    lines.push('- 定义输出：必须字段、引用/证据、失败时返回什么（不确定/需要补充材料/转人工）')
    lines.push('- 定义校验：schema 校验、引用校验、权限校验、预算（token/tool/retry）')
    lines.push('- 定义观测：延迟拆解、token/成本、错误码、通过率/命中率、回归集')
    lines.push('- 定义降级：小模型/仅检索/仅摘要/模板回答/延迟容忍队列')
    lines.push('')
    lines.push('### 5) 关键指标与验收（建议做成面板）')
    lines.push('- 正确性：任务指标（测评维度一致性/推课命中率/引用正确率）')
    lines.push('- 稳定性：schema 通过率、引用校验通过率、工具调用成功率、重试次数分布')
    lines.push('- 体验：TTFT、E2E 延迟、失败可解释性（用户能否知道为何失败）')
    lines.push('- 成本：token/request、tool/request、cache hit rate、模型路由占比')
    lines.push('')
    lines.push('### 6) 常见坑与对策（生产系统视角）')
    lines.push('- 只靠提示词：改为“强校验 + 有限重试 + 熔断/降级”')
    lines.push('- 无引用的正确感：改为“结论必须带 citations，且后端校验引用来自检索上下文”')
    lines.push('- 失败不可解释：改为“错误码 + 可读错误 + 可回归样例集”')
    lines.push('- 线上漂移：改为“固定回归集 + 灰度 + 指标门槛 + 可回滚”')
    lines.push('')
    lines.push('### 7) 结合你们项目（干部教育智能化）')
    lines.push('- AI 知识库：建立目录→检索→引用→评测→回归；输出必须可追溯（来源段落/条款路径）')
    lines.push('- 智能测评：模型做解释，评分用确定性规则/统计/代码；输出 schema 可落库，便于复盘')
    lines.push('- 精准推课：用工具链（检索课程→打分→冲突校验→输出），模型负责生成“原因与建议”')
    lines.push('- 智能伴读：上下文预算优先；对长对话做 Select/Compress；输出分段、可中断、可继续')
    lines.push('- 终身学习档案：写入必须审计；高敏数据默认不进上下文，只能通过受控工具访问')
    lines.push('')
    lines.push('### 8) 实战练习（把知识变成能力）')
    lines.push('- 练习 1：写一个“输入→输出→校验→失败策略”的设计说明，并给出 5 条坏样例')
    lines.push('- 练习 2：做 20 条回归集，指标至少包含引用正确率/schema 通过率/延迟/成本')
    lines.push('- 练习 3：做一次灰度方案：门槛、告警、回滚、审计要素')
    if (tags.has('rag')) {
      lines.push('')
      lines.push('### RAG 深入（当它属于检索增强生成）')
      lines.push('- 数据入库：结构化解析（章/节/条/附件）→ 分段（chunk）→ 生成 embedding → 建索引')
      lines.push('- 检索策略：关键词（BM25）+ 向量（ANN）混合召回 → RRF 合并 → rerank 精排')
      lines.push('- 生成策略：答案必须带引用；缺证据不下结论；证据冲突要解释冲突而不是强行统一')
      lines.push('- 评测回归：离线回归集（命中/引用/忠实度）+ 线上监控（失败率/延迟/成本）')
      lines.push('- 安全边界：把检索文本当不可信输入，做注入过滤与隔离（instructions/context 分区）')
    }
    if (tags.has('agent')) {
      lines.push('')
      lines.push('### Agent 深入（当它属于工具/流程自动化）')
      lines.push('- Agent = Model + Harness：模型只负责生成计划/调用建议；Harness 负责执行、校验、预算与观测')
      lines.push('- 工具契约：输入/输出 schema + 错误码 + 幂等 + 超时 + 重试策略（避免模型瞎猜参数）')
      lines.push('- 输出约束：优先 JSON Schema 强校验；必要时引入 constrained decoding/grammar')
      lines.push('- 循环治理：最大工具次数/最大重试/最大 token；检测“无进展”直接熔断并降级')
    }
    if (tags.has('systems') || tags.has('ops') || tags.has('cost')) {
      lines.push('')
      lines.push('### 系统与成本深入（当它涉及推理服务/性能）')
      lines.push('- 延迟拆解：排队/网络/prefill/decoding/后处理；分别打点，不要只看总耗时')
      lines.push('- 吞吐抓手：连续批处理、prefill/decoding 分离、流式输出、缓存（答案/检索/前缀）')
      lines.push('- 成本抓手：模型路由（小模型优先）、输出长度控制、工具链替代长文本推理')
      lines.push('- 长上下文治理：Select/Compress/Isolate，避免把历史对话全部塞进上下文')
    }
    if (tags.has('security')) {
      lines.push('')
      lines.push('### 安全深入（当它涉及注入/泄露/越权）')
      lines.push('- 威胁模型：提示注入、越权检索、隐私外泄、系统提示词泄露、工具越权执行')
      lines.push('- 防线：入库清洗与分级 → 检索隔离（RLS/namespace）→ 上下文隔离 → 输出阻断 → 审计')
      lines.push('- 验收：用红队样例回归（注入样例/越权样例/敏感字段样例），通过率要可量化')
    }

    lines.push('')
    lines.push('### 9) 参考实现（伪代码）')
    if (tags.has('rag')) {
      lines.push('```')
      lines.push('def answer_with_rag(query, user_ctx):')
      lines.push('  docs_kw = bm25.search(query, topk=50)')
      lines.push('  docs_vec = vectordb.search(embed(query), topk=50)')
      lines.push('  docs = rrf_merge(docs_kw, docs_vec, topk=30)')
      lines.push('  docs = rerank(query, docs, topk=8)')
      lines.push('  ctx = build_context(docs, isolate_untrusted=True)')
      lines.push('  out = llm.generate(query, context=ctx, temperature=0)')
      lines.push('  assert citations_valid(out.citations, docs)')
      lines.push('  return out')
      lines.push('```')
    } else if (tags.has('agent')) {
      lines.push('```')
      lines.push('def run_agent(task):')
      lines.push('  budget = Budget(tokens=8000, tools=8, retries=2)')
      lines.push('  plan = llm.plan(task, schema=PLAN_SCHEMA, temperature=0)')
      lines.push('  for step in plan.steps:')
      lines.push('    budget.consume(step)')
      lines.push('    res = tools.call(step.tool, step.args, timeout=10)')
      lines.push('    plan = llm.revise(plan, observation=res, temperature=0)')
      lines.push('  out = llm.final_answer(schema=ANSWER_SCHEMA, temperature=0)')
      lines.push('  validate_schema(out)')
      lines.push('  return out')
      lines.push('```')
    } else {
      lines.push('```')
      lines.push('def build_feature(input):')
      lines.push('  define_io_contract()')
      lines.push('  add_validation_and_budget()')
      lines.push('  add_observability_and_regression()')
      lines.push('  ship_with_canary_and_rollback()')
      lines.push('```')
    }

    lines.push('')
    lines.push('### 10) 故障排查（从高到低）')
    lines.push('- 先看“输入是否正确”：权限/租户范围/数据是否缺失/是否走错模型或工具')
    lines.push('- 再看“校验为何失败”：schema/引用/工具错误码（把错误原样记录）')
    lines.push('- 再看“检索是否错”：召回是否命中、rerank 是否排序错、chunk 是否切坏')
    lines.push('- 最后看“生成是否错”：提示注入、长上下文稀释、采样参数过大、模型版本漂移')

    lines.push('')
    lines.push('### 11) 自测题（3 题）')
    lines.push(`- 题 1：用 3 句话解释「${p.title}」的适用边界是什么？`)
    lines.push('- 题 2：写出一个最小验收条件（可自动校验），并说明失败时怎么降级？')
    lines.push('- 题 3：列出你会在监控面板上放的 5 个指标（含 1 个成本指标）。')
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
