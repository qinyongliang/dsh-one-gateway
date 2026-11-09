/**
 * dsh-one-gateway — browser half (redesigned).
 *
 * One sidebar page (模型网关): tabs for overview / models / groups / aliases /
 * keys / usage charts. No explanatory prose — labels, numbers, icons only.
 * Talks to the host over the authenticated Connection fetch route
 * (api/model-hub); never to a model provider directly.
 */
window.__ModuleLoader__.load({
  id: "dsh-one-gateway",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const react = require("react");
    const { createElement: h, useState, useEffect, useCallback, useMemo, Fragment } = react;

    const NS = "dsh-one-gateway";
    const PANEL_ID = "dsh-one-gateway";
    const SETTINGS_ROUTE = "api/model-hub";
    const STYLE_ATTR = "data-dsh-one-gateway";

    /* ------------------------------------------------------------ icons */
    const icon = (path, size = 16) => h("svg", {
      width: size, height: size, viewBox: "0 0 24 24", fill: "none",
      stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round",
      "aria-hidden": true,
    }, h("path", { d: path }));
    const I = {
      gateway: (s) => icon("M4 7h16M4 12h16M4 17h10 M17 17l3 3m0-3l-3 3", s),
      copy: () => icon("M9 9h10v10H9z M5 15V5h10"),
      check: () => icon("M5 13l4 4L19 7"),
      plus: () => icon("M12 5v14M5 12h14"),
      trash: () => icon("M4 7h16M9 7V5h6v2m-8 0l1 13h8l1-13"),
      edit: () => icon("M4 20l4-1L20 7l-3-3L5 16l-1 4z"),
      refresh: () => icon("M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"),
      key: () => icon("M14 10a4 4 0 1 0-4 4c.5 0 1-.1 1.5-.3L13 15h2v2h2v2h3v-3l-6.3-6.3c.2-.5.3-1 .3-1.7z"),
      lock: () => icon("M6 11h12v9H6z M9 11V7a3 3 0 0 1 6 0v4"),
      unlock: () => icon("M6 11h12v9H6z M9 11V7a3 3 0 0 1 5.8-1"),
      chart: () => icon("M4 20V10M10 20V4M16 20v-8M22 20H2"),
      layers: () => icon("M12 3l9 5-9 5-9-5 9-5z M3 13l9 5 9-5"),
      tag: () => icon("M3 12l9-9h9v9l-9 9-9-9z M16.5 7.5h.01"),
      grid: () => icon("M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z"),
      x: () => icon("M6 6l12 12M18 6L6 18"),
      up: () => icon("M12 19V5M5 12l7-7 7 7"),
      down: () => icon("M12 5v14M5 12l7 7 7-7"),
      search: () => icon("M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM20 20l-4.5-4.5"),
      server: () => icon("M4 5h16v6H4z M4 13h16v6H4z M7 8h.01M7 16h.01"),
      wand: () => icon("M6 18L18 6M15 3v4M13 5h4M5 13v4M3 15h4M19 13v4M17 15h4"),
    };

    /**
     * The default alias for a model: the first whitespace token of its display
     * name, lower-cased and reduced to the alias grammar.
     *
     * Mirrors the rule the host applies during the automatic pass, so pressing
     * the wand on the alias dialog yields the same name the automatic pass
     * would have created.
     *
     * @param display - the model's display name (or id when it has none).
     * @returns the derived alias, or "" when nothing usable is left.
     */
    function autoAliasOf(display) {
      const token = String(display ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      const clean = token.replace(/[^a-z0-9.-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "").slice(0, 64);
      return /^[a-z0-9]/.test(clean) ? clean : "";
    }

    /* ------------------------------------------------------- dictionaries */
    const zh = {
      nav: "模型网关", overview: "总览", models: "模型", groups: "分组", aliases: "别名",
      keys: "密钥", charts: "统计", port: "端口", apply: "应用", off: "关闭",
      baseUrl: "Base URL", running: "运行中", stopped: "未监听", lan: "全网", loopback: "本机",
      copy: "复制", copied: "已复制", add: "添加", save: "保存", cancel: "取消", del: "删除",
      name: "名称", target: "目标", strategy: "调度", sequential: "顺序", "round-robin": "均衡", random: "随机",
      retry429: "429重试", members: "候选", newGroup: "新建分组", editGroup: "编辑分组",
      newAlias: "新别名", newKey: "新密钥", keyLabel: "备注", authOn: "鉴权", authOff: "开放",
      calls: "调用", answered: "应答", refused: "未应答", tokens: "Tokens", days7: "7天", days30: "30天", days90: "90天",
      reset: "清零", loading: "…", empty: "空", search: "搜索", enabled: "启用", disabled: "停用",
      composite: "组合", model: "模型", portInvalid: "0–65535", confirmReset: "确认清零？", confirmDel: "确认删除？",
      keyOnce: "仅此一次", servedBy: "命中", requests: "请求", today: "今日", rate: "应答率", autoAlias: "自动别名",
      stop: "停止调度", resume: "恢复调度", stopped: "已停止", scheduled: "调度中", stoppedHint: "保留在列表中，不参与调度",
      aliasSaved: "别名已保存", mergedToGroup: "名称已被占用，已合并为一个分组", autoGen: "按规则自动生成",
      colModel: "模型", colType: "类型", colEffort: "思考强度", colTokens: "TOKEN",
      colCache: "缓存", colTtft: "首字", colTotal: "总耗时", colTps: "输出 TPS", colTime: "时间",
      streamLabel: "流式", bufferedLabel: "非流式", cacheHit: "缓存比例", inTok: "入", outTok: "出", cacheTok: "缓存",
    };
    const en = {
      nav: "Model hub", overview: "Overview", models: "Models", groups: "Groups", aliases: "Aliases",
      keys: "Keys", charts: "Stats", port: "Port", apply: "Apply", off: "Off",
      baseUrl: "Base URL", running: "Running", stopped: "Not listening", lan: "All interfaces", loopback: "Loopback",
      copy: "Copy", copied: "Copied", add: "Add", save: "Save", cancel: "Cancel", del: "Delete",
      name: "Name", target: "Target", strategy: "Strategy", sequential: "Sequential", "round-robin": "Balanced", random: "Random",
      retry429: "429 retry", members: "Candidates", newGroup: "New group", editGroup: "Edit group",
      newAlias: "New alias", newKey: "New key", keyLabel: "Label", authOn: "Auth", authOff: "Open",
      calls: "Calls", answered: "Answered", refused: "Refused", tokens: "Tokens", days7: "7d", days30: "30d", days90: "90d",
      reset: "Reset", loading: "…", empty: "Empty", search: "Search", enabled: "Enabled", disabled: "Disabled",
      composite: "Composite", model: "Model", portInvalid: "0–65535", confirmReset: "Reset all?", confirmDel: "Delete?",
      keyOnce: "Shown once", servedBy: "Served by", requests: "Requests", today: "Today", rate: "Answer rate", autoAlias: "Auto aliases",
      stop: "Stop scheduling", resume: "Resume scheduling", stopped: "Stopped", scheduled: "Scheduled", stoppedHint: "Kept in the list, skipped by scheduling",
      aliasSaved: "Alias saved", mergedToGroup: "Name taken — merged into a group", autoGen: "Generate from the rule",
      colModel: "Model", colType: "Type", colEffort: "Effort", colTokens: "Tokens",
      colCache: "Cache", colTtft: "TTFT", colTotal: "Total", colTps: "Output TPS", colTime: "Time",
      streamLabel: "Stream", bufferedLabel: "Buffered", cacheHit: "Cache ratio", inTok: "in", outTok: "out", cacheTok: "cached",
    };

    /* ------------------------------------------------------------ styles */
    const CSS = `
[${STYLE_ATTR}]{display:block;height:100%;overflow:auto;color:var(--dsw-alias-label-primary);font-size:13px}
[${STYLE_ATTR}] *{box-sizing:border-box}
[${STYLE_ATTR}] .mh-page{max-width:960px;margin:0 auto;padding:20px 24px 48px;display:flex;flex-direction:column;gap:14px}
[${STYLE_ATTR}] .mh-head{display:flex;align-items:center;gap:10px}
[${STYLE_ATTR}] .mh-title{font-size:16px;font-weight:650;display:flex;align-items:center;gap:8px}
[${STYLE_ATTR}] .mh-spacer{flex:1}
[${STYLE_ATTR}] .mh-tabs{display:flex;gap:2px;border-bottom:1px solid var(--dsw-alias-border-l2);flex-wrap:wrap}
[${STYLE_ATTR}] .mh-tab{display:flex;align-items:center;gap:6px;padding:8px 12px;border:none;background:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;border-bottom:2px solid transparent;margin-bottom:-1px}
[${STYLE_ATTR}] .mh-tab[aria-selected="true"]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}
[${STYLE_ATTR}] .mh-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;border-radius:6px}
[${STYLE_ATTR}] .mh-card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:12px 14px;display:flex;flex-direction:column;gap:8px}
[${STYLE_ATTR}] .mh-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
[${STYLE_ATTR}] .mh-stat{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px 14px;background:var(--dsw-alias-bg-layer-1)}
[${STYLE_ATTR}] .mh-stat-num{font-size:22px;font-weight:650;font-variant-numeric:tabular-nums}
[${STYLE_ATTR}] .mh-stat-label{color:var(--dsw-alias-label-tertiary);font-size:12px;display:flex;align-items:center;gap:5px}
[${STYLE_ATTR}] .mh-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--dsw-alias-border-l1);min-width:0}
[${STYLE_ATTR}] .mh-row:first-of-type{border-top:none}
[${STYLE_ATTR}] .mh-mono{font-family:var(--dsw-font-family-mono,ui-monospace,Menlo,monospace);font-size:12px;word-break:break-all}
[${STYLE_ATTR}] .mh-muted{color:var(--dsw-alias-label-tertiary)}
[${STYLE_ATTR}] .mh-btn{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l3);border-radius:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:5px 10px;font-size:12px;cursor:pointer;white-space:nowrap}
[${STYLE_ATTR}] .mh-btn:hover{background:var(--dsw-alias-bg-layer-2)}
[${STYLE_ATTR}] .mh-btn:disabled{opacity:.5;cursor:default}
[${STYLE_ATTR}] .mh-btn.is-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-inverse,#fff)}
[${STYLE_ATTR}] .mh-btn.is-danger{color:var(--dsw-alias-state-error-primary,#dc2626)}
[${STYLE_ATTR}] .mh-btn.is-icon{padding:5px 6px}
[${STYLE_ATTR}] .mh-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
[${STYLE_ATTR}] .mh-input{padding:6px 9px;border-radius:7px;border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;outline:none;min-width:0}
[${STYLE_ATTR}] .mh-input:focus{border-color:var(--dsw-alias-brand-primary)}
[${STYLE_ATTR}] .mh-pill{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:2px 9px;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
[${STYLE_ATTR}] .mh-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
[${STYLE_ATTR}] .mh-dot.is-on{background:var(--dsw-alias-state-success-primary,#16a34a)}
[${STYLE_ATTR}] .mh-dot.is-warn{background:var(--dsw-alias-state-warning-primary,#d97706)}
[${STYLE_ATTR}] .mh-dot.is-bad{background:var(--dsw-alias-state-error-primary,#dc2626)}
[${STYLE_ATTR}] .mh-input-wrap{position:relative;display:flex;align-items:center}
[${STYLE_ATTR}] .mh-input-wrap .mh-input{width:100%;padding-right:32px}
[${STYLE_ATTR}] .mh-input-suffix{position:absolute;right:4px;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:none;border-radius:6px;background:none;color:var(--dsw-alias-label-tertiary);cursor:pointer}
[${STYLE_ATTR}] .mh-input-suffix:hover{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
[${STYLE_ATTR}] .mh-input-suffix:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
[${STYLE_ATTR}] .mh-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:3px 8px;font-size:12px;background:var(--dsw-alias-bg-layer-2)}
[${STYLE_ATTR}] .mh-chip.is-on{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 10%,transparent);color:var(--dsw-alias-state-success-primary,#16a34a)}
[${STYLE_ATTR}] .mh-chip.is-off{border-color:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#d97706) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#d97706) 10%,transparent);color:var(--dsw-alias-state-warning-primary,#d97706)}
[${STYLE_ATTR}] .mh-name.is-off{color:var(--dsw-alias-label-tertiary)}
[${STYLE_ATTR}] .mh-sched{display:inline-flex;align-items:center;gap:4px;font-size:10px;padding:1px 6px;border-radius:5px;font-weight:600;white-space:nowrap}
[${STYLE_ATTR}] .mh-sched.is-on{color:var(--dsw-alias-state-success-primary,#16a34a);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 12%,transparent)}
[${STYLE_ATTR}] .mh-sched.is-off{color:var(--dsw-alias-state-warning-primary,#d97706);background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#d97706) 12%,transparent)}
[${STYLE_ATTR}] .mh-chips{display:flex;flex-wrap:wrap;gap:5px}
[${STYLE_ATTR}] .mh-dialog-back{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:2147483000}
[${STYLE_ATTR}] .mh-dialog{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;width:min(480px,92vw);display:flex;flex-direction:column;gap:10px;max-height:84vh;overflow:auto}
[${STYLE_ATTR}] .mh-dialog-title{font-weight:650;font-size:14px;display:flex;align-items:center;gap:8px}
[${STYLE_ATTR}] .mh-field{display:flex;flex-direction:column;gap:4px}
[${STYLE_ATTR}] .mh-field>label{font-size:12px;color:var(--dsw-alias-label-secondary)}
[${STYLE_ATTR}] .mh-actions{display:flex;gap:8px;justify-content:flex-end}
[${STYLE_ATTR}] .mh-error{color:var(--dsw-alias-state-error-primary,#dc2626);font-size:12px}
[${STYLE_ATTR}] .mh-wall-block{display:flex;flex-direction:column;gap:5px;overflow-x:auto;padding-bottom:2px}
[${STYLE_ATTR}] .mh-wall-months{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:3px;margin-left:20px;font-size:10px;line-height:1;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
[${STYLE_ATTR}] .mh-wall-wrap{display:flex;align-items:flex-start;gap:8px}
[${STYLE_ATTR}] .mh-wall-days{display:grid;grid-template-rows:repeat(7,1fr);gap:3px;width:14px;font-size:9px;line-height:1;text-align:right;color:var(--dsw-alias-label-tertiary);align-items:center}
[${STYLE_ATTR}] .mh-wall{display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,1fr);grid-auto-columns:minmax(9px,1fr);gap:3px;flex:1;min-width:0}
[${STYLE_ATTR}] .mh-wall-cell{aspect-ratio:1;width:100%;max-width:13px;border-radius:2px;background:#ebedf0}
@media (prefers-color-scheme:dark){[${STYLE_ATTR}] .mh-wall-cell{background:#21262d}}
[${STYLE_ATTR}] .mh-wall-cell:hover{outline:1px solid var(--dsw-alias-border-l3);outline-offset:1px}
[${STYLE_ATTR}] .mh-wall-cell.is-future{visibility:hidden}
[${STYLE_ATTR}] .mh-wall-cell[data-tip]{position:relative}
[${STYLE_ATTR}] .mh-wall-cell[data-tip]::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);z-index:80;white-space:pre;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 6px 18px rgba(0,0,0,.14);color:var(--dsw-alias-label-primary);font-size:11px;line-height:1.5;pointer-events:none;opacity:0;transition:opacity .08s ease}
[${STYLE_ATTR}] .mh-wall-cell[data-tip]:hover::after{opacity:1}
[${STYLE_ATTR}] .mh-wall-cell[data-tip]:hover{z-index:81}
[${STYLE_ATTR}] .mh-wall{overflow:visible}
[${STYLE_ATTR}] .mh-wall-l1{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 24%,var(--dsw-alias-bg-layer-2))}
[${STYLE_ATTR}] .mh-wall-l2{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 46%,var(--dsw-alias-bg-layer-2))}
[${STYLE_ATTR}] .mh-wall-l3{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 70%,var(--dsw-alias-bg-layer-2))}
[${STYLE_ATTR}] .mh-wall-l4{background:var(--dsw-alias-state-success-primary,#16a34a)}
[${STYLE_ATTR}] .mh-pager{display:flex;align-items:center;gap:4px;justify-content:flex-end;padding-top:6px}
[${STYLE_ATTR}] .mh-pager button{min-width:26px}
[${STYLE_ATTR}] .mh-pager .mh-page-num{font-size:11px;color:var(--dsw-alias-label-tertiary);padding:0 6px;font-variant-numeric:tabular-nums}
[${STYLE_ATTR}] .mh-trend{width:100%;height:96px}
[${STYLE_ATTR}] .mh-trend polyline{fill:none;stroke:var(--dsw-alias-brand-primary);stroke-width:1.6}
[${STYLE_ATTR}] .mh-trend .mh-trend-area{fill:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);stroke:none}
[${STYLE_ATTR}] .mh-trend text{font-size:9px;fill:var(--dsw-alias-label-tertiary)}
[${STYLE_ATTR}] .mh-hours{display:flex;align-items:flex-end;gap:2px;height:52px}
[${STYLE_ATTR}] .mh-hours-bar{flex:1;min-width:3px;background:var(--dsw-alias-brand-primary);border-radius:2px 2px 0 0;min-height:1px}
[${STYLE_ATTR}] .mh-seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;overflow:hidden}
[${STYLE_ATTR}] .mh-seg button{border:none;background:none;padding:4px 10px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}
[${STYLE_ATTR}] .mh-seg button[aria-pressed="true"]{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font-weight:600}
[${STYLE_ATTR}] .mh-provider{display:flex;align-items:center;gap:7px;padding:8px 0 4px;font-weight:600;cursor:pointer;user-select:none}
[${STYLE_ATTR}] .mh-caret{color:var(--dsw-alias-label-tertiary);font-size:11px;width:12px}
[${STYLE_ATTR}] .mh-count{color:var(--dsw-alias-label-tertiary);font-weight:400;font-size:11px}
[${STYLE_ATTR}] .mh-toast{position:fixed;right:16px;bottom:16px;z-index:2147483001;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 14px;font-size:12px;display:flex;gap:7px;align-items:center}
[${STYLE_ATTR}] .mh-reveal{border:1px solid var(--dsw-alias-state-warning-primary,#d97706);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-bg-layer-2)}
[${STYLE_ATTR}] .mh-ms{position:relative}
[${STYLE_ATTR}] .mh-ms-btn{display:inline-flex;align-items:center;gap:6px;max-width:170px;padding:5px 10px;border:1px solid var(--dsw-alias-border-l3);border-radius:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer;white-space:nowrap;overflow:hidden}
[${STYLE_ATTR}] .mh-ms-btn.is-active{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
[${STYLE_ATTR}] .mh-ms-ic{font-size:12px}
[${STYLE_ATTR}] .mh-ms-caret{color:var(--dsw-alias-label-tertiary);font-size:10px}
[${STYLE_ATTR}] .mh-ms-pop{position:absolute;top:calc(100% + 4px);left:0;z-index:60;width:230px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 6px 18px rgba(0,0,0,.12);padding:6px;display:flex;flex-direction:column;gap:4px}
[${STYLE_ATTR}] .mh-ms-search{padding:5px 8px;border:1px solid var(--dsw-alias-border-l3);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;outline:none}
[${STYLE_ATTR}] .mh-ms-search:focus{border-color:var(--dsw-alias-brand-primary)}
[${STYLE_ATTR}] .mh-ms-list{max-height:220px;overflow:auto;display:flex;flex-direction:column}
[${STYLE_ATTR}] .mh-ms-opt{display:flex;align-items:center;gap:7px;padding:5px 7px;border:none;background:none;border-radius:6px;color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer;text-align:left}
[${STYLE_ATTR}] .mh-ms-opt:hover{background:var(--dsw-alias-bg-layer-2)}
[${STYLE_ATTR}] .mh-ms-opt.is-on{color:var(--dsw-alias-brand-primary)}
[${STYLE_ATTR}] .mh-ms-check{width:12px;color:var(--dsw-alias-brand-primary)}
[${STYLE_ATTR}] .mh-ms-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[${STYLE_ATTR}] .mh-ms-empty{padding:8px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px}
[${STYLE_ATTR}] .mh-ms-clear{border:none;background:none;color:var(--dsw-alias-label-tertiary);font-size:11px;cursor:pointer;padding:4px;text-align:right}
[${STYLE_ATTR}] .mh-mp-panel{margin-top:6px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1);padding:6px;display:flex;flex-direction:column;gap:4px}
[${STYLE_ATTR}] .mh-mp-list{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden}
[${STYLE_ATTR}] .mh-mp-row{display:flex;align-items:center;gap:8px;padding:7px 9px;border-top:1px solid var(--dsw-alias-border-l1)}
[${STYLE_ATTR}] .mh-mp-row:first-child{border-top:none}
[${STYLE_ATTR}] .mh-mp-idx{width:18px;height:18px;border-radius:5px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-size:11px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;font-variant-numeric:tabular-nums}
[${STYLE_ATTR}] .mh-mp-group{padding:8px 8px 4px;font-size:13px;font-weight:700;color:var(--dsw-alias-label-primary);position:sticky;top:0;background:var(--dsw-alias-bg-layer-1);border-bottom:1px solid var(--dsw-alias-border-l1)}
[${STYLE_ATTR}] .mh-mp-item{box-sizing:border-box;width:calc(100% - 8px);min-height:46px;margin:3px 4px;padding:6px 9px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
[${STYLE_ATTR}] .mh-mp-item:hover{background:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-border-l3)}
[${STYLE_ATTR}] .mh-mp-item.is-added{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,var(--dsw-alias-bg-layer-2));border-color:var(--dsw-alias-brand-primary)}
[${STYLE_ATTR}] .mh-mp-check{width:14px;flex-shrink:0;color:var(--dsw-alias-brand-primary);font-weight:700;text-align:center}
[${STYLE_ATTR}] .mh-mp-name{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
[${STYLE_ATTR}] .mh-mp-id{font-size:10px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[${STYLE_ATTR}] .mh-mp-aliases{display:flex;gap:4px;flex-shrink:0;max-width:130px;overflow:hidden;flex-wrap:nowrap}
[${STYLE_ATTR}] .mh-mp-aliases .mh-chip{max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block}
[${STYLE_ATTR}] .mh-row-fail{cursor:pointer}
[${STYLE_ATTR}] .mh-row-fail:hover{background:var(--dsw-alias-bg-layer-2)}
[${STYLE_ATTR}] .mh-fail-detail{margin:0 0 6px 20px;padding:8px 10px;border-left:2px solid var(--dsw-alias-state-error-primary,#dc2626);background:var(--dsw-alias-bg-layer-2);border-radius:0 6px 6px 0}
[${STYLE_ATTR}] .mh-fail-code{font-size:11px;font-weight:700;color:var(--dsw-alias-state-error-primary,#dc2626);font-family:var(--dsw-font-family-mono,monospace)}
[${STYLE_ATTR}] .mh-fail-msg{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:3px;word-break:break-word;white-space:pre-wrap}
[${STYLE_ATTR}] .mh-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12px}
[${STYLE_ATTR}] .mh-tbl thead th{position:sticky;top:0;background:var(--dsw-alias-bg-layer-1);text-align:left;font-weight:500;color:var(--dsw-alias-label-tertiary);font-size:11px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);white-space:nowrap}
[${STYLE_ATTR}] .mh-tbl tbody td{padding:7px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);vertical-align:top}
[${STYLE_ATTR}] .mh-tbl tbody tr:hover{background:var(--dsw-alias-bg-layer-2)}
[${STYLE_ATTR}] .mh-tbl tr.is-fail{cursor:pointer}
[${STYLE_ATTR}] .mh-tbl .mh-num{font-variant-numeric:tabular-nums;white-space:nowrap}
[${STYLE_ATTR}] .mh-tbl .mh-dim{color:var(--dsw-alias-label-tertiary);font-size:11px}
[${STYLE_ATTR}] .mh-tag{display:inline-block;padding:1px 7px;border-radius:5px;font-size:11px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);white-space:nowrap}
[${STYLE_ATTR}] .mh-tag.is-stream{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);color:var(--dsw-alias-brand-primary)}
[${STYLE_ATTR}] .mh-tps{color:var(--dsw-alias-state-success-primary,#16a34a);font-weight:600}
[${STYLE_ATTR}] .mh-tok-in{color:var(--dsw-alias-brand-primary);font-weight:600}
[${STYLE_ATTR}] .mh-tok-out{color:var(--dsw-alias-state-success-primary,#16a34a);font-weight:600}
[${STYLE_ATTR}] .mh-range{display:inline-flex;align-items:center;gap:4px;padding:2px 4px 2px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-base)}
[${STYLE_ATTR}] .mh-range.is-on{border-color:var(--dsw-alias-brand-primary)}
[${STYLE_ATTR}] .mh-range input{border:none;background:none;color:var(--dsw-alias-label-primary);font-size:11px;outline:none;padding:2px 3px;width:104px;font-variant-numeric:tabular-nums}
[${STYLE_ATTR}] .mh-range-sep{color:var(--dsw-alias-label-tertiary);font-size:11px}
[${STYLE_ATTR}] .mh-tps.is-slow{color:var(--dsw-alias-state-warning-primary,#d97706)}
@media (prefers-reduced-motion:reduce){[${STYLE_ATTR}] *{transition:none!important;animation:none!important}}
`;

    /* ------------------------------------------------------------- rpc */
    async function call(action, payload = {}) {
      const rpcId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      try {
        const response = await fetch(new URL(SETTINGS_ROUTE, document.baseURI), {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ type: "client-request", rpcId, payload: { action, ...payload } }),
        });
        if (!response.ok) return { ok: false, error: { message: `HTTP ${response.status}` } };
        const envelope = await response.json();
        return envelope?.result ?? { ok: false, error: { message: "malformed" } };
      } catch (cause) {
        return { ok: false, error: { message: String(cause?.message ?? cause) } };
      }
    }

    /* ------------------------------------------------------- primitives */
    function Btn({ children, icon: ic, primary, danger, iconOnly, ...rest }) {
      return h("button", {
        type: "button",
        className: `mh-btn${primary ? " is-primary" : ""}${danger ? " is-danger" : ""}${iconOnly ? " is-icon" : ""}`,
        ...rest,
      }, ic ? ic() : null, iconOnly ? null : children);
    }
    function Dot({ state }) { return h("span", { className: `mh-dot${state ? " is-" + state : ""}` }); }
    function Pill({ children, dot }) { return h("span", { className: "mh-pill" }, dot ? h(Dot, { state: dot }) : null, children); }
    /**
     * The scheduling switch, rendered as a state badge rather than a hidden
     * row: a stopped model is not deleted, so both states must be legible.
     * Green = scheduled, amber = stopped.
     */
    function Sched({ stopped, t }) {
      return h("span", { className: "mh-sched" + (stopped ? " is-off" : " is-on"), title: stopped ? t("stoppedHint") : t("scheduled") },
        stopped ? t("stopped") : t("scheduled"));
    }
    function Stat({ label, value, ic }) {
      return h("div", { className: "mh-stat" },
        h("div", { className: "mh-stat-num" }, value),
        h("div", { className: "mh-stat-label" }, ic ? ic() : null, label));
    }
    function Dialog({ title, onClose, children, footer }) {
      useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, [onClose]);
      return h("div", {
        className: "mh-dialog-back",
        // pointerdown, not click: the picker closes its own panel on the same
        // gesture, so the following click would land on the backdrop and close
        // the whole dialog. Acting on press-down plus a containment check keeps
        // a click that started inside the dialog from closing it.
        onPointerDown: (e) => {
          const inside = e.currentTarget.querySelector(".mh-dialog");
          if (inside !== null && inside.contains(e.target)) return;
          onClose();
        },
      }, h("div", { className: "mh-dialog", role: "dialog", "aria-modal": true, "aria-label": title },
        h("div", { className: "mh-dialog-title" }, title, h("span", { className: "mh-spacer" }), h(Btn, { icon: I.x, iconOnly: true, onClick: onClose, "aria-label": "close" })),
        children,
        footer ? h("div", { className: "mh-actions" }, footer) : null));
    }
    function CopyBtn({ text, t, copied, onCopied }) {
      return h(Btn, {
        icon: copied === text ? I.check : I.copy, iconOnly: true,
        title: copied === text ? t("copied") : t("copy"),
        onClick: async () => {
          try { await navigator.clipboard.writeText(text); onCopied(text); } catch { /* clipboard unavailable */ }
        },
      });
    }

    /* ------------------------------------------- searchable multi-select */
    function MultiSelect({ icon, label, options, value, onChange, t }) {
      const [open, setOpen] = useState(false);
      const [q, setQ] = useState("");
      const rootRef = react.useRef(null);
      useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
        // click, not mousedown: see the ModelPicker note. Closing on press-down
        // collapses this panel mid-gesture, and any button below it moves out
        // from under the cursor before the click is dispatched.
        document.addEventListener("click", onDoc);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("click", onDoc); document.removeEventListener("keydown", onKey); };
      }, [open]);
      const needle = q.trim().toLowerCase();
      const shown = options.filter((o) => !needle || o.toLowerCase().includes(needle));
      const toggle = (o) => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);
      return h("div", { className: "mh-ms", ref: rootRef },
        h("button", {
          type: "button", className: "mh-ms-btn" + (value.length ? " is-active" : ""),
          onClick: () => { setOpen(!open); setQ(""); },
          "aria-expanded": open, "aria-haspopup": "listbox",
        },
          h("span", { className: "mh-ms-ic" }, icon),
          value.length === 0 ? label : value.length === 1 ? value[0] : label + " · " + value.length,
          h("span", { className: "mh-ms-caret" }, "▾")),
        open ? h("div", { className: "mh-ms-pop", role: "listbox", "aria-multiselectable": true },
          h("input", {
            className: "mh-ms-search", autoFocus: true, value: q, placeholder: t("search"),
            onChange: (e) => setQ(e.target.value),
          }),
          h("div", { className: "mh-ms-list" },
            shown.length === 0 ? h("div", { className: "mh-ms-empty" }, "—") : null,
            shown.map((o) => h("button", {
              type: "button", key: o, role: "option", "aria-selected": value.includes(o),
              className: "mh-ms-opt" + (value.includes(o) ? " is-on" : ""),
              onClick: () => toggle(o),
            },
              h("span", { className: "mh-ms-check" }, value.includes(o) ? "✓" : ""),
              h("span", { className: "mh-ms-text" }, o)))),
          value.length > 0 ? h("button", {
            type: "button", className: "mh-ms-clear", onClick: () => onChange([]),
          }, t("cancel")) : null) : null);
    }

    /* ------------------------- searchable provider-grouped model picker */
    function ModelPicker({ options, aliases, selected = [], onPick, t }) {
      const [open, setOpen] = useState(false);
      const [q, setQ] = useState("");
      const rootRef = react.useRef(null);
      useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
        // click, not mousedown: see the ModelPicker note. Closing on press-down
        // collapses this panel mid-gesture, and any button below it moves out
        // from under the cursor before the click is dispatched.
        document.addEventListener("click", onDoc);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("click", onDoc); document.removeEventListener("keydown", onKey); };
      }, [open]);
      const aliasesOf = (id) => aliases.filter((a) => a.target === id).map((a) => a.alias);
      const needle = q.trim().toLowerCase();
      const matches = (m) => {
        if (!needle) return true;
        const hay = [m.id, m.name ?? "", ...aliasesOf(m.id)].join(" ").toLowerCase();
        return hay.includes(needle);
      };
      const byProvider = new Map();
      for (const m of options) {
        if (!matches(m)) continue;
        const list = byProvider.get(m.provider) ?? [];
        list.push(m);
        byProvider.set(m.provider, list);
      }
      const renderItem = (m) => {
        const added = selected.includes(m.id);
        const aliasChips = aliasesOf(m.id).map((a) =>
          h("span", { key: a, className: "mh-chip", style: { fontSize: 10, padding: "1px 6px" } }, a));
        return h("button", {
          type: "button", key: m.id, role: "option", "aria-selected": added,
          className: "mh-ms-opt mh-mp-item" + (added ? " is-added" : ""),
          onClick: () => onPick(m.id),
        },
          h("span", { className: "mh-mp-check" }, added ? "✓" : ""),
          h("span", { className: "mh-mp-name" },
            h("span", { className: "mh-ms-text mh-name" + (m.stopped ? " is-off" : "") }, m.name && m.name !== m.id ? m.name : m.id),
            m.name && m.name !== m.id ? h("span", { className: "mh-mono mh-mp-id" }, m.id) : null),
          m.stopped ? h("span", { className: "mh-sched is-off", style: { flexShrink: 0 } }, t("stopped")) : null,
          aliasChips.length > 0 ? h("span", { className: "mh-mp-aliases" }, aliasChips) : null);
      };
      const renderGroup = ([provider, list]) =>
        h("div", { key: provider },
          h("div", { className: "mh-mp-group" }, provider),
          list.map(renderItem));
      return h("div", { className: "mh-ms", ref: rootRef, style: { width: "100%" } },
        h("button", {
          type: "button", className: "mh-ms-btn", style: { width: "100%", maxWidth: "none", justifyContent: "flex-start" },
          onClick: () => { setOpen(!open); setQ(""); },
          "aria-expanded": open, "aria-haspopup": "listbox",
        },
          h("span", { className: "mh-ms-ic" }, "+"), t("add"),
          h("span", { className: "mh-spacer" }),
          h("span", { className: "mh-ms-caret" }, "▾")),
        open ? h("div", { className: "mh-mp-panel", role: "listbox" },
          h("input", {
            className: "mh-ms-search", autoFocus: true, value: q, placeholder: t("search"),
            onChange: (e) => setQ(e.target.value),
          }),
          h("div", { className: "mh-ms-list", style: { maxHeight: 280 } },
            byProvider.size === 0 ? h("div", { className: "mh-ms-empty" }, "—") : null,
            [...byProvider.entries()].map(renderGroup))) : null);
    }

    /* ------------------------------------------------------------ page */
    function GatewayPage() {
      const locale = react.useContext ? undefined : undefined;
      const [t, setT] = useState(() => (key) => zh[key] ?? key);
      const [tab, setTab] = useState("overview");
      const [status, setStatus] = useState(null);
      const [groups, setGroups] = useState([]);
      const [groupModels, setGroupModels] = useState([]);
      const [liveStats, setLiveStats] = useState({});
      const [aliases, setAliases] = useState([]);
      const [history, setHistory] = useState(null);
      const [range, setRange] = useState(30);
      const [fKey, setFKey] = useState([]);
      const [fProvider, setFProvider] = useState([]);
      const [fModel, setFModel] = useState([]);
      const [fFrom, setFFrom] = useState("");
      const [fTo, setFTo] = useState("");
      const [page, setPage] = useState(0);
      const [expanded, setExpanded] = useState(() => new Set());
      const [error, setError] = useState(null);
      const [copied, setCopied] = useState(null);
      const [toast, setToast] = useState(null);
      const [port, setPort] = useState("");
      const [portBusy, setPortBusy] = useState(false);
      const [query, setQuery] = useState("");
      const [openProviders, setOpenProviders] = useState(() => new Set());
      const [groupDialog, setGroupDialog] = useState(null);
      const [aliasDialog, setAliasDialog] = useState(null);
      const [keyDialog, setKeyDialog] = useState(false);
      const [createdKey, setCreatedKey] = useState(null);
      const [keyLabel, setKeyLabel] = useState("");
      const [confirm, setConfirm] = useState(null);
      const [busy, setBusy] = useState(false);
      const [dialogError, setDialogError] = useState(null);

      const onCopied = useCallback((text) => {
        setCopied(text);
        setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
      }, []);
      const notify = useCallback((msg) => {
        setToast(msg);
        setTimeout(() => setToast((m) => (m === msg ? null : m)), 2200);
      }, []);

      const loadStatus = useCallback(async () => {
        const r = await call("status");
        if (r.ok) { setStatus(r.value); setAliases(r.value.aliases ?? []); setError(null); }
        else setError(r.error?.message ?? "error");
        return r;
      }, []);
      const loadGroups = useCallback(async () => {
        const r = await call("listGroups");
        if (r.ok) { setGroups(r.value.groups ?? []); setGroupModels(r.value.models ?? []); setLiveStats(r.value.stats ?? {}); }
      }, []);
      /** Stop/resume scheduling for one catalog id. */
      /**
       * Whether a model, alias or group candidate is stopped for scheduling.
       *
       * The switch is stored under whichever spelling the row toggled, while a
       * group may hold the same model as `provider_model` or `provider/model`,
       * so every spelling is checked. Stopped is never "gone": the row stays
       * in the list, only its colour and its candidacy change.
       */
      const isStopped = useCallback((id) => {
        const ov = status?.overrides ?? {};
        if (ov[id]?.disabled === true) return true;
        const slash = String(id).indexOf("/");
        if (slash > 0) return ov[id.slice(0, slash) + "_" + id.slice(slash + 1)]?.disabled === true;
        const underscore = String(id).indexOf("_");
        if (underscore > 0) return ov[id.slice(0, underscore) + "/" + id.slice(underscore + 1)]?.disabled === true;
        return false;
      }, [status]);

      const toggleModel = useCallback(async (id, disabled) => {
        const r = await call("setModelDisabled", { id, disabled });
        if (r.ok) { await loadStatus(); await loadGroups(); }
        else notify(r.error?.message ?? "error");
      }, []);

      const loadStats = useCallback(async (days) => {
        // A custom window (either bound set) overrides the 7/30/90 preset.
        const from = fFrom ? new Date(fFrom + "T00:00:00").getTime() : undefined;
        const to = fTo ? new Date(fTo + "T23:59:59.999").getTime() : undefined;
        const r = await call("listStats", { days, key: fKey, provider: fProvider, model: fModel, from, to, page, pageSize: 20 });
        if (r.ok) { setHistory(r.value); setLiveStats(r.value.stats ?? {}); }
      }, [fKey, fProvider, fModel, fFrom, fTo, page]);
      const refreshAll = useCallback(async () => {
        await Promise.all([loadStatus(), loadGroups(), loadStats(range)]);
      }, [loadStatus, loadGroups, loadStats, range]);

      useEffect(() => { refreshAll(); }, []);
      useEffect(() => { loadStats(range); }, [range, loadStats]);
      useEffect(() => { setPage(0); }, [fKey.join(","), fProvider.join(","), fModel.join(","), fFrom, fTo]);
      useEffect(() => {
        if (tab !== "overview") return;
        const timer = setInterval(() => { if (!document.hidden) loadStats(range); }, 8000);
        return () => clearInterval(timer);
      }, [tab, range, loadStats]);
      useEffect(() => {
        if (status?.lan) setPort(status.lan.configured === false ? "" : String(status.lan.port ?? ""));
        else if (status) setPort("");
      }, [status?.lan?.port]);

      const allEntries = status?.models ?? [];
      // The catalog carries each model twice once it has an alias: the
      // canonical row and the alias row (alias field set). The models tab
      // shows ONE row per real model; aliases render as chips on that row.
      const models = allEntries.filter((m) => m.alias === undefined && m.provider !== "dsh-one-gateway");
      const groupEntries = allEntries.filter((m) => m.provider === "dsh-one-gateway" && m.alias === undefined);
      const providers = status?.providers ?? [];
      const lan = status?.lan ?? null;
      const origin = lan?.listening
        ? `http://${lan.host === "0.0.0.0" ? location.hostname : lan.host}:${lan.port}`
        : `${location.protocol}//${location.hostname}:${status?.port ?? location.port}`;
      const baseUrl = `${origin}${status?.path ?? "/v1"}`;

      const filterActive = fKey.length > 0 || fProvider.length > 0 || fModel.length > 0 || !!fFrom || !!fTo;
      const totals = useMemo(() => {
        if (history?.ledger?.totals && (filterActive || history.ledger.totals.requests > 0)) {
          const lt = history.ledger.totals;
          return { calls: lt.requests, answered: lt.answered, refused: lt.refused, tokens: lt.inputTokens + lt.outputTokens };
        }
        let calls = 0, answered = 0, refused = 0, tokens = 0;
        const days = history?.days ?? {};
        for (const day of Object.values(days)) {
          const g = day?.global ?? day ?? {};
          calls += g.requests ?? g.calls ?? 0;
          answered += g.answered ?? 0;
          refused += g.refused ?? 0;
          tokens += (g.inputTokens ?? 0) + (g.outputTokens ?? 0);
        }
        return { calls, answered, refused, tokens };
      }, [history, filterActive]);

      /* -------------------------------------------------------- charts */
      const chartsTab = (() => {
        const days = history?.days ?? {};
        const keys = Object.keys(days).sort();
        const dayCalls = keys.map((k) => {
          const g = days[k]?.global ?? days[k] ?? {};
          return { key: k, calls: g.requests ?? g.calls ?? 0, answered: g.answered ?? 0, tokens: (g.inputTokens ?? 0) + (g.outputTokens ?? 0) };
        });
        const max = Math.max(1, ...dayCalls.map((d) => d.calls));
        // trend polyline over the range
        const W = 600, H = 80, pad = 4;
        const points = dayCalls.map((d, i) => {
          const x = dayCalls.length <= 1 ? W / 2 : pad + (i / (dayCalls.length - 1)) * (W - pad * 2);
          const y = H - pad - (d.calls / max) * (H - pad * 2);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(" ");
        const latest = keys.length > 0 ? days[keys[keys.length - 1]] : undefined;
        const hourly = latest?.hours ?? latest?.global?.hours ?? [];
        const hourMax = Math.max(1, ...hourly.map((b) => b?.requests ?? b?.calls ?? 0));
        return h(Fragment, null,
          h("div", { className: "mh-card" },
            h("div", { className: "mh-row" },
              h("span", { className: "mh-seg" },
                [7, 30, 90].map((n) => h("button", {
                  key: n, "aria-pressed": range === n, onClick: () => setRange(n),
                }, t("days" + n)))),
              h("span", { className: "mh-range" + (fFrom || fTo ? " is-on" : "") },
                h("input", {
                  type: "date", value: fFrom, "aria-label": t("colTime"), title: t("colTime"),
                  onChange: (e) => setFFrom(e.target.value),
                }),
                h("span", { className: "mh-range-sep" }, "→"),
                h("input", {
                  type: "date", value: fTo, "aria-label": t("colTime"), title: t("colTime"),
                  onChange: (e) => setFTo(e.target.value),
                }),
                fFrom || fTo ? h(Btn, { icon: I.x, iconOnly: true, title: t("cancel"), onClick: () => { setFFrom(""); setFTo(""); } }) : null),
              h(MultiSelect, { icon: "🔑", label: t("keys"), options: history?.ledger?.filters?.keys ?? [], value: fKey, onChange: setFKey, t }),
              h(MultiSelect, { icon: "⚡", label: "Provider", options: history?.ledger?.filters?.providers ?? [], value: fProvider, onChange: setFProvider, t }),
              h(MultiSelect, { icon: "🧊", label: t("models"), options: history?.ledger?.filters?.models ?? [], value: fModel, onChange: setFModel, t }),
              filterActive ? h(Btn, { icon: I.x, iconOnly: true, title: t("cancel"), onClick: () => { setFKey([]); setFProvider([]); setFModel([]); setFFrom(""); setFTo(""); } }) : null,
              h("span", { className: "mh-spacer" }),
              h(Btn, { icon: I.refresh, iconOnly: true, onClick: () => loadStats(range) }),
              h(Btn, { icon: I.trash, iconOnly: true, danger: true, onClick: () => setConfirm({ label: t("confirmReset"), run: async () => { const r = await call("resetStats"); if (r.ok) await loadStats(range); else notify(r.error?.message ?? "error"); } }) })),
            (() => {
              // GitHub-style contribution wall: one column per week, seven
              // rows (Sun..Sat), newest week rightmost. Counts merge ledger +
              // persisted history via the host's activity map.
              const activity = history?.ledger?.activity ?? {};
              // Per-day consumption for the hover tooltip. The bare count above
              // still drives the colour scale; this is what the day cost.
              const activityDetail = history?.ledger?.activityDetail ?? {};
              // Fill the card: weeks derived from the measured width so the
              // grid always spans the full row (min 18, grows on wide screens).
              const WEEKS = 53;
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const start = new Date(today);
              start.setDate(start.getDate() - (WEEKS - 1) * 7 - start.getDay());
              let maxCount = 1;
              for (const v of Object.values(activity)) maxCount = Math.max(maxCount, v);
              const lvl = (v) => v === 0 ? "" : v / maxCount > 0.75 ? " mh-wall-l4" : v / maxCount > 0.5 ? " mh-wall-l3" : v / maxCount > 0.25 ? " mh-wall-l2" : " mh-wall-l1";
              const cells = [];
              const monthCells = [];
              let lastMonth = -1;
              for (let w = 0; w < WEEKS; w++) {
                const colDate = new Date(start); colDate.setDate(colDate.getDate() + w * 7);
                const monthChanged = colDate.getMonth() !== lastMonth;
                if (monthChanged) lastMonth = colDate.getMonth();
                monthCells.push(h("span", { key: "m" + w }, monthChanged ? (colDate.getMonth() + 1) + "月" : ""));
                for (let d = 0; d < 7; d++) {
                  const date = new Date(start); date.setDate(date.getDate() + w * 7 + d);
                  if (date > today) { cells.push(h("span", { key: w + "-" + d, className: "mh-wall-cell is-future" })); continue; }
                  const key = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
                  const count = activity[key] ?? 0;
                  const detail = activityDetail[key];
                  const tip = detail === undefined
                    ? key + " · " + count + " " + t("requests")
                    : [
                      key,
                      count + " " + t("requests"),
                      t("answered") + " " + (detail.answered ?? 0) + (detail.refused ? " · " + t("refused") + " " + detail.refused : ""),
                      t("inTok") + " " + (detail.inputTokens ?? 0).toLocaleString() + " · " + t("outTok") + " " + (detail.outputTokens ?? 0).toLocaleString(),
                      t("tokens") + " " + ((detail.inputTokens ?? 0) + (detail.outputTokens ?? 0)).toLocaleString(),
                    ].join("\n");
                  cells.push(h("span", {
                    key: w + "-" + d,
                    className: "mh-wall-cell" + lvl(count),
                    "data-tip": tip,
                    title: tip,
                    "aria-label": tip.replace(/\n/g, ", "),
                  }));
                }
              }
              return h("div", { className: "mh-wall-block" },
                h("div", { className: "mh-wall-months" }, monthCells),
                h("div", { className: "mh-wall-wrap" },
                  h("div", { className: "mh-wall-days" },
                    h("span", null, ""), h("span", null, "一"), h("span", null, ""), h("span", null, "三"), h("span", null, ""), h("span", null, "五"), h("span", null, "")),
                  h("div", { className: "mh-wall" }, cells)));
            })(),
            dayCalls.length > 1 ? h("svg", { className: "mh-trend", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none" },
              h("polygon", { className: "mh-trend-area", points: `${pad},${H - pad} ${points} ${W - pad},${H - pad}` }),
              h("polyline", { points })) : null,
            hourly.length > 0 ? h("div", { className: "mh-hours" },
              hourly.map((b, i) => h("span", {
                key: i, className: "mh-hours-bar",
                style: { height: `${Math.max(2, ((b?.requests ?? b?.calls ?? 0) / hourMax) * 100)}%` },
                title: `${i}:00 · ${b?.requests ?? b?.calls ?? 0}`,
              }))) : null),
          h("div", { className: "mh-grid" },
            h(Stat, { label: t("calls"), value: totals.calls, ic: I.chart }),
            h(Stat, { label: t("answered"), value: totals.answered, ic: I.check }),
            h(Stat, { label: t("refused"), value: totals.refused, ic: I.x }),
            h(Stat, { label: t("tokens"), value: totals.tokens.toLocaleString(), ic: I.chart })),
          (() => {
            const rows = history?.ledger?.rows ?? [];
            const totalRows = history?.ledger?.total ?? rows.length;
            const PAGE = history?.ledger?.pageSize ?? 20;
            const pages = Math.max(1, Math.ceil(totalRows / PAGE));
            const cur = Math.min(page, pages - 1);
            const slice = rows;
            // A metric that no visible row carries is dropped instead of shown
            // as a column of dashes: the column would be pure noise.
            const showCache = rows.some((row) => (row.cacheTokens ?? 0) > 0);
            const showTtft = rows.some((row) => row.ttftMs !== null && row.ttftMs !== undefined);
            return h("div", { className: "mh-card" },
              rows.length === 0
                ? h("div", { className: "mh-muted", style: { padding: 18, textAlign: "center" } }, "—")
                : null,
              rows.length > 0 ? h("table", { className: "mh-tbl" },
                h("thead", null, h("tr", null,
                  ["colTime", "keys", "colModel", "colType", "colEffort", "colTokens"]
                    .concat(showCache ? ["colCache"] : [])
                    .concat(showTtft ? ["colTtft"] : [])
                    .concat(["colTotal", "colTps"])
                    .map((label) => h("th", { key: label }, t(label))),
                  h("th", null, "Provider"))),
                h("tbody", null, slice.map((row, i) => {
                  const rid = cur * PAGE + i;
                  const refused = row.status !== "answered";
                  const isOpen = expanded.has(rid);
                  const toggle = () => setExpanded((s) => { const n2 = new Set(s); n2.has(rid) ? n2.delete(rid) : n2.add(rid); return n2; });
                  const totalTok = (row.inputTokens ?? 0) + (row.outputTokens ?? 0);
                  // "Not reported" and "reported as zero" are different facts. A
                  // provider that does not report cache reads at all should not
                  // paint a 0 on every row, which reads as a broken metric.
                  const hasCache = (row.cacheTokens ?? 0) > 0;
                  const cacheRatio = hasCache
                    ? Math.round(((row.cacheTokens ?? 0) / ((row.inputTokens ?? 0) + (row.cacheTokens ?? 0))) * 100)
                    : null;
                  const hasTtft = row.ttftMs !== null && row.ttftMs !== undefined;
                  const tps = row.totalMs !== null && row.totalMs !== undefined && row.totalMs > 0 && (row.outputTokens ?? 0) > 0
                    ? ((row.outputTokens ?? 0) / (row.totalMs / 1000))
                    : null;
                  return h(Fragment, { key: rid },
                    h("tr", {
                      className: refused ? "is-fail" : "",
                      onClick: refused ? toggle : undefined,
                      role: refused ? "button" : undefined,
                      "aria-expanded": refused ? isOpen : undefined,
                    },
                      h("td", { className: "mh-num" },
                        h(Dot, { state: refused ? "bad" : "on" }),
                        " ",
                        new Date(row.ts).toLocaleString()),
                      h("td", null, h("span", { className: "mh-tag" }, row.key)),
                      h("td", null, h("code", { className: "mh-mono" }, row.model)),
                      h("td", null, h("span", { className: "mh-tag" + (row.kind === "stream" ? " is-stream" : "") },
                        row.kind === "stream" ? t("streamLabel") : t("bufferedLabel"))),
                      h("td", null, row.effort ? h("span", { className: "mh-tag" }, row.effort) : h("span", { className: "mh-dim" }, "—")),
                      h("td", { className: "mh-num" },
                        totalTok > 0
                          ? h(Fragment, null,
                            h("span", { className: "mh-tok-in" }, "↓" + (row.inputTokens ?? 0).toLocaleString()),
                            " ",
                            h("span", { className: "mh-tok-out" }, "↑" + (row.outputTokens ?? 0).toLocaleString()))
                          : h("span", { className: "mh-dim" }, "—"),
                        hasCache
                          ? h("div", { className: "mh-dim" }, t("cacheTok") + " " + (row.cacheTokens ?? 0).toLocaleString())
                          : null),
                      showCache ? h("td", { className: "mh-num" },
                        cacheRatio === null ? h("span", { className: "mh-dim" }, "—") : h("span", { className: "mh-tag" }, cacheRatio + "%")) : null,
                      showTtft ? h("td", { className: "mh-num" },
                        hasTtft ? ((row.ttftMs / 1000).toFixed(2) + "s") : h("span", { className: "mh-dim" }, "—")) : null,
                      h("td", { className: "mh-num" },
                        row.totalMs === null || row.totalMs === undefined ? h("span", { className: "mh-dim" }, "—") : ((row.totalMs / 1000).toFixed(2) + "s")),
                      h("td", { className: "mh-num" },
                        tps === null ? h("span", { className: "mh-dim" }, "—") : h("span", { className: "mh-tps" + (tps < 10 ? " is-slow" : "") }, tps.toFixed(1))),
                      h("td", { className: "mh-dim" }, row.provider),
                      refused ? h("td", { className: "mh-caret" }, isOpen ? "▾" : "▸") : h("td", null)),
                    refused && isOpen ? h("tr", null, h("td", { colSpan: 11 },
                      h("div", { className: "mh-fail-detail", style: { marginLeft: 0 } },
                        h("div", { className: "mh-fail-code" }, row.errorCode ?? "ERROR"),
                        h("div", { className: "mh-fail-msg" }, row.errorMessage ?? "—")))) : null);
                }))) : null,
              rows.length > 0 ? h("div", { className: "mh-pager" },
                h(Btn, { icon: I.up, iconOnly: true, disabled: cur === 0, title: "←", onClick: () => setPage(cur - 1), style: { transform: "rotate(-90deg)" } }),
                h("span", { className: "mh-page-num" }, (cur + 1) + " / " + pages + " · " + totalRows),
                h(Btn, { icon: I.down, iconOnly: true, disabled: cur >= pages - 1, title: "→", onClick: () => setPage(cur + 1), style: { transform: "rotate(-90deg)" } })) : null);
          })());
      })();

      /* ------------------------------------------------------ overview */
      const overviewTab = h(Fragment, null,
        h("div", { className: "mh-grid" },
          h(Stat, { label: t("models"), value: models.length, ic: I.grid }),
          h(Stat, { label: t("aliases"), value: aliases.length, ic: I.tag }),
          h(Stat, { label: t("requests"), value: totals.calls, ic: I.chart }),
          h(Stat, { label: t("tokens"), value: totals.tokens.toLocaleString(), ic: I.chart })),
        h("div", { className: "mh-card" },
          h("div", { className: "mh-row" },
            h("span", { className: "mh-muted", style: { width: 70 } }, t("baseUrl")),
            h("code", { className: "mh-mono", style: { flex: 1 } }, baseUrl),
            h(CopyBtn, { text: baseUrl, t, copied, onCopied })),
          h("div", { className: "mh-row" },
            h("span", { className: "mh-muted", style: { width: 70 } }, "Chat"),
            h("code", { className: "mh-mono", style: { flex: 1 } }, `${baseUrl}/chat/completions`),
            h(CopyBtn, { text: `${baseUrl}/chat/completions`, t, copied, onCopied })),
          h("div", { className: "mh-row" },
            h("span", { className: "mh-muted", style: { width: 70 } }, "Responses"),
            h("code", { className: "mh-mono", style: { flex: 1 } }, `${baseUrl}/responses`),
            h(CopyBtn, { text: `${baseUrl}/responses`, t, copied, onCopied })),
          h("div", { className: "mh-row" },
            h("span", { className: "mh-muted", style: { width: 70 } }, t("port")),
            h("input", {
              className: "mh-input", style: { width: 90 }, value: port, placeholder: t("off"),
              onChange: (e) => setPort(e.target.value), inputMode: "numeric",
            }),
            h(Btn, {
              primary: true, disabled: portBusy,
              onClick: async () => {
                const raw = port.trim();
                const value = raw === "" ? false : Number(raw);
                if (value !== false && (!Number.isInteger(value) || value < 0 || value > 65535)) { notify(t("portInvalid")); return; }
                setPortBusy(true);
                const r = await call("setPort", { port: value });
                setPortBusy(false);
                if (r.ok) { notify(t("apply") + " ✓"); setTimeout(refreshAll, 1200); }
                else notify(r.error?.message ?? "error");
              },
            }, t("apply")),
            lan
              ? h(Pill, { dot: lan.listening ? "on" : "bad" }, `${lan.host}:${lan.port}`)
              : h(Pill, { dot: "warn" }, t("off")),
            h("span", { className: "mh-spacer" }),
            h(Pill, { dot: status?.authRequired ? "on" : "warn" },
              status?.authRequired ? t("authOn") : t("authOff")))),
        chartsTab);

      /* -------------------------------------------------------- models */
      const modelsTab = (() => {
        const needle = query.trim().toLowerCase();
        const byProvider = new Map();
        for (const m of models) {
          if (needle && !`${m.id} ${m.name ?? ""}`.toLowerCase().includes(needle)) continue;
          const list = byProvider.get(m.provider) ?? [];
          list.push(m);
          byProvider.set(m.provider, list);
        }
        return h("div", { className: "mh-card" },
          h("div", { className: "mh-row" },
            h("span", { style: { display: "inline-flex", color: "var(--dsw-alias-label-tertiary)" } }, I.search()),
            h("input", {
              className: "mh-input", style: { flex: 1 }, value: query, placeholder: t("search"),
              onChange: (e) => setQuery(e.target.value), type: "search",
            }),
            h(Pill, null, `${models.length} · ${providers.length}`),
            h(Btn, {
              icon: I.wand, iconOnly: true, title: t("autoAlias"),
              onClick: async () => {
                const r = await call("autoAlias");
                if (r.ok) {
                  await refreshAll();
                  notify(`+${r.value.aliases.length} 🏷 · +${r.value.groups.length} 📦`);
                } else notify(r.error?.message ?? "error");
              },
            }),
            h(Btn, { icon: I.refresh, iconOnly: true, onClick: refreshAll, title: t("apply") })),
          byProvider.size === 0 ? h("div", { className: "mh-muted", style: { padding: 12, textAlign: "center" } }, t("empty")) : null,
          [...byProvider.entries()].map(([provider, list]) => {
            const open = needle !== "" || openProviders.has(provider);
            return h("div", { key: provider },
              h("div", {
                className: "mh-provider", role: "button", tabIndex: 0,
                onClick: () => setOpenProviders((s) => { const n = new Set(s); n.has(provider) ? n.delete(provider) : n.add(provider); return n; }),
                onKeyDown: (e) => { if (e.key === "Enter") setOpenProviders((s) => { const n = new Set(s); n.has(provider) ? n.delete(provider) : n.add(provider); return n; }); },
              },
                h("span", { className: "mh-caret" }, open ? "▾" : "▸"),
                provider,
                h("span", { className: "mh-count" }, list.length)),
              open ? list.map((m) => {
                const myGroups = groups.filter((g) => (g.models ?? []).includes(m.id));
                // A name that a group owns is not also an alias chip: the group
                // is what the name resolves to, so rendering both would show the
                // same name twice with different buttons on it.
                const groupNames = new Set(myGroups.map((g) => g.name));
                const myAliases = aliases.filter((a) => (a.target === m.id || a.target === m.rawId) && !groupNames.has(a.alias));
                const stopped = isStopped(m.id);
                return h("div", { className: "mh-row", key: m.id, style: { paddingLeft: 19, alignItems: "flex-start" } },
                  h("div", { style: { minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 } },
                    h("span", { className: "mh-name" + (stopped ? " is-off" : ""), style: { display: "flex", alignItems: "center", gap: 6 } },
                      m.name && m.name !== m.id ? m.name : m.id,
                      h(Sched, { stopped, t })),
                    m.name && m.name !== m.id ? h("span", { className: "mh-muted mh-mono", style: { fontSize: 11 } }, m.id) : null,
                    myAliases.length > 0 || myGroups.length > 0 ? h("span", { className: "mh-chips" },
                      myAliases.map((a) => {
                        const aliasStopped = isStopped(a.alias);
                        return h("span", { className: "mh-chip" + (aliasStopped ? " is-off" : " is-on"), key: "a:" + a.alias },
                          h("span", { style: { display: "inline-flex" } }, I.tag()),
                          a.alias,
                          h(Btn, {
                            icon: aliasStopped ? I.unlock : I.lock, iconOnly: true,
                            title: aliasStopped ? t("resume") : t("stop"),
                            onClick: () => toggleModel(a.alias, !aliasStopped),
                          }),
                          h(CopyBtn, { text: a.alias, t, copied, onCopied }),
                          h(Btn, {
                            icon: I.x, iconOnly: true, title: t("del"),
                            onClick: async () => {
                              const r = await call("removeAlias", { alias: a.alias });
                              if (r.ok) await loadStatus(); else notify(r.error?.message ?? "error");
                            },
                          }));
                      }),
                      myGroups.map((g) => h("span", { className: "mh-chip" + (g.enabled === false ? " is-off" : " is-on"), key: "g:" + g.id },
                        h("span", { style: { display: "inline-flex", color: "var(--dsw-alias-label-tertiary)" } }, I.layers()),
                        g.name,
                        h(Btn, {
                          icon: g.enabled === false ? I.unlock : I.lock, iconOnly: true,
                          title: g.enabled === false ? t("resume") : t("stop"),
                          onClick: async () => {
                            const r = await call("updateGroup", { id: g.id, enabled: g.enabled === false });
                            if (r.ok) await loadGroups(); else notify(r.error?.message ?? "error");
                          },
                        }),
                        h(CopyBtn, { text: g.name, t, copied, onCopied }),
                        h(Btn, {
                          icon: I.x, iconOnly: true, title: t("del"),
                          onClick: async () => {
                            const r = await call("updateGroup", { id: g.id, models: (g.models ?? []).filter((x) => x !== m.id) });
                            if (r.ok) await loadGroups(); else notify(r.error?.message ?? "error");
                          },
                        })))) : null),
                  h(Btn, {
                    icon: stopped ? I.unlock : I.lock, iconOnly: true,
                    title: stopped ? t("resume") : t("stop"),
                    onClick: () => toggleModel(m.id, !stopped),
                  }),
                  h(Btn, {
                    icon: I.tag, iconOnly: true, title: t("newAlias"),
                    onClick: () => { setDialogError(null); setAliasDialog({ alias: "", target: m.id }); },
                  }),
                  groups.filter((g) => (g.kind ?? "model") === "model").length > 0 ? h("select", {
                    className: "mh-input", style: { maxWidth: 110 }, value: "", title: t("groups"),
                    onChange: async (e) => {
                      const gid = e.target.value;
                      if (!gid) return;
                      const g = groups.find((x) => x.id === gid);
                      if (!g) return;
                      if ((g.models ?? []).includes(m.id)) { notify(g.name + " ✓"); return; }
                      const r = await call("updateGroup", { id: g.id, models: [...(g.models ?? []), m.id] });
                      if (r.ok) { await loadGroups(); notify(g.name + " ✓"); }
                      else notify(r.error?.message ?? "error");
                    },
                  },
                    h("option", { value: "" }, "+ " + t("groups")),
                    groups.filter((g) => (g.kind ?? "model") === "model" && !(g.models ?? []).includes(m.id))
                      .map((g) => h("option", { key: g.id, value: g.id }, g.name))) : null,
                  h(CopyBtn, { text: m.id, t, copied, onCopied }));
              }) : null);
          }));
      })();

      /* -------------------------------------------------------- groups */
      const rateOf = (groupName, leg) => {
        const s = liveStats?.[groupName]?.[leg];
        if (!s || !(s.attempts > 0)) return null;
        const recent = s.recent ?? [];
        const answered = recent.filter((r) => r === "answered" || r?.outcome === "answered").length;
        return recent.length > 0 ? Math.round((answered / recent.length) * 100) : null;
      };
      const groupsTab = h("div", { className: "mh-card" },
        h("div", { className: "mh-row" },
          h("span", { className: "mh-spacer" }),
          h(Btn, { icon: I.refresh, iconOnly: true, onClick: loadGroups }),
          h(Btn, { icon: I.plus, primary: true, onClick: () => { setDialogError(null); setGroupDialog({ mode: "create", name: "", kind: "model", models: [], strategy: "sequential", retry429: 0 }); } }, t("newGroup"))),
        groups.length === 0 ? h("div", { className: "mh-muted", style: { padding: 12, textAlign: "center" } }, t("empty")) : null,
        groups.map((g) => h("div", { className: "mh-row", key: g.id, style: { alignItems: "flex-start" } },
          h("div", { style: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 } },
            h("div", { style: { display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" } },
              h(Dot, { state: g.enabled ? "on" : "warn" }),
              h("strong", null, g.name),
              h(Pill, null, t(g.strategy) ?? g.strategy),
              g.retry429 > 0 ? h(Pill, null, `429×${g.retry429}`) : null,
              g.kind === "composite" ? h(Pill, null, t("composite")) : null,
              h(CopyBtn, { text: g.name, t, copied, onCopied })),
            h("div", { className: "mh-chips" },
              (g.models ?? []).map((m) => {
                const rate = rateOf(g.name, m);
                // A candidate carries its own scheduling switch, so a member
                // can be taken out of rotation without deleting it from the
                // group. It stays listed either way.
                const legStopped = isStopped(m);
                return h("span", { className: "mh-chip" + (legStopped ? " is-off" : " is-on"), key: m },
                  h("span", { className: "mh-mono", style: { fontSize: 11 } }, m),
                  rate !== null ? h("span", {
                    style: { fontSize: 11, fontWeight: 600, color: rate >= 90 ? "var(--dsw-alias-state-success-primary,#16a34a)" : rate >= 50 ? "var(--dsw-alias-state-warning-primary,#d97706)" : "var(--dsw-alias-state-error-primary,#dc2626)" },
                  }, rate + "%") : null,
                  h(Btn, {
                    icon: legStopped ? I.unlock : I.lock, iconOnly: true,
                    title: legStopped ? t("resume") : t("stop"),
                    onClick: () => toggleModel(m, !legStopped),
                  }));
              }))),
          h(Btn, { icon: I.edit, iconOnly: true, onClick: () => { setDialogError(null); setGroupDialog({ mode: "edit", id: g.id, name: g.name, kind: g.kind ?? "model", models: [...(g.models ?? [])], strategy: g.strategy ?? "sequential", retry429: g.retry429 ?? 0, enabled: g.enabled !== false }); } }),
          h(Btn, {
            icon: I.trash, iconOnly: true, danger: true,
            onClick: () => setConfirm({
              label: `${t("del")} ${g.name}?`,
              run: async () => { const r = await call("removeGroup", { id: g.id }); if (r.ok) { await loadGroups(); await loadStatus(); } else notify(r.error?.message ?? "error"); },
            }),
          }))));

      /* ---------------------------------------------------------- keys */
      const keysTab = h("div", { className: "mh-card" },
        h("div", { className: "mh-row" },
          h(Pill, { dot: status?.authRequired ? "on" : "warn" }, status?.authRequired ? t("authOn") : t("authOff")),
          h(Btn, {
            icon: status?.authRequired ? I.unlock : I.lock,
            disabled: busy,
            onClick: async () => {
              setBusy(true);
              const r = await call("setAuth", { locked: !status?.authRequired });
              setBusy(false);
              if (r.ok) await loadStatus(); else notify(r.error?.message ?? "error");
            },
          }, status?.authRequired ? t("authOff") : t("authOn")),
          h("span", { className: "mh-spacer" }),
          h(Btn, { icon: I.plus, primary: true, onClick: () => { setDialogError(null); setKeyLabel(""); setCreatedKey(null); setKeyDialog(true); } }, t("newKey"))),
        (status?.keys ?? []).length === 0 ? h("div", { className: "mh-muted", style: { padding: 12, textAlign: "center" } }, t("empty")) : null,
        (status?.keys ?? []).map((k) => h("div", { className: "mh-row", key: k.id },
          h("span", { style: { color: "var(--dsw-alias-label-tertiary)" } }, I.key()),
          h("code", { className: "mh-mono" }, k.masked ?? k.id),
          k.label ? h("span", { className: "mh-muted" }, k.label) : null,
          h("span", { className: "mh-spacer" }),
          h(Btn, {
            icon: I.trash, iconOnly: true, danger: true,
            onClick: () => setConfirm({
              label: `${t("del")} ${k.masked ?? k.id}?`,
              run: async () => { const r = await call("revokeKey", { id: k.id }); if (r.ok) await loadStatus(); else notify(r.error?.message ?? "error"); },
            }),
          }))));

      /**
       * The display name behind the alias being edited: what the auto-name rule
       * reads. The model's own display name when it has one, else its id, so the
       * wand and the placeholder always agree.
       */
      const aliasModelName = (() => {
        if (!aliasDialog) return "";
        const target = aliasDialog.target;
        const info = groupModels.find((m) => m.id === target) ?? status?.models?.find((m) => m.id === target);
        return info?.name && info.name !== target ? info.name : target;
      })();

      /* ------------------------------------------------------- dialogs */
      const pickerOptions = useMemo(() => {
        if (!groupDialog) return [];
        const composite = groupDialog.kind === "composite";
        return groupModels.filter((m) => composite ? m.selectable === "composite-member" : m.selectable === "model");
      }, [groupDialog, groupModels]);

      const submitGroup = async () => {
        if (!groupDialog) return;
        setBusy(true); setDialogError(null);
        const payload = groupDialog.mode === "create"
          ? { name: groupDialog.name, models: groupDialog.models, kind: groupDialog.kind, strategy: groupDialog.strategy, retry429: groupDialog.retry429 }
          : { id: groupDialog.id, name: groupDialog.name, models: groupDialog.models, strategy: groupDialog.strategy, retry429: groupDialog.retry429, enabled: groupDialog.enabled };
        const r = await call(groupDialog.mode === "create" ? "createGroup" : "updateGroup", payload);
        setBusy(false);
        if (!r.ok) { setDialogError(r.error?.message ?? "error"); return; }
        setGroupDialog(null);
        await loadGroups(); await loadStatus();
      };
      const submitAlias = async () => {
        if (!aliasDialog) return;
        setBusy(true); setDialogError(null);
        const r = await call("setAlias", { alias: aliasDialog.alias, target: aliasDialog.target });
        setBusy(false);
        if (!r.ok) { setDialogError(r.error?.message ?? "error"); return; }
        setAliasDialog(null);
        // A colliding name does not stay an alias: it becomes a group holding
        // every model that claimed it. Both lists therefore have to be
        // reloaded, or the save looks like it did nothing.
        await Promise.all([loadStatus(), loadGroups()]);
        const merged = r.value?.merged === true;
        notify(t(merged ? "mergedToGroup" : "aliasSaved"));
      };
      const submitKey = async () => {
        setBusy(true); setDialogError(null);
        const r = await call("createKey", { label: keyLabel });
        setBusy(false);
        if (!r.ok) { setDialogError(r.error?.message ?? "error"); return; }
        setCreatedKey(r.value);
        await loadStatus();
      };

      const dialogs = h(Fragment, null,
        groupDialog ? h(Dialog, {
          title: groupDialog.mode === "create" ? t("newGroup") : t("editGroup"),
          onClose: () => setGroupDialog(null),
          footer: [
            h(Btn, { key: "c", onClick: () => setGroupDialog(null), disabled: busy }, t("cancel")),
            h(Btn, { key: "s", primary: true, onClick: submitGroup, disabled: busy || !groupDialog.name || groupDialog.models.length === 0 }, t("save")),
          ],
        },
          h("div", { className: "mh-field" },
            h("label", null, t("name")),
            h("input", { className: "mh-input", value: groupDialog.name, autoFocus: true, onChange: (e) => setGroupDialog((d) => ({ ...d, name: e.target.value })) })),
          h("div", { className: "mh-field" },
            h("label", null, t("strategy")),
            h("div", { style: { display: "flex", gap: 8 } },
              h("span", { className: "mh-seg" },
                ["sequential", "round-robin", "random"].map((s) => h("button", {
                  key: s, "aria-pressed": groupDialog.strategy === s,
                  onClick: () => setGroupDialog((d) => ({ ...d, strategy: s })),
                }, t(s)))),
              h("select", {
                className: "mh-input", value: String(groupDialog.retry429),
                onChange: (e) => setGroupDialog((d) => ({ ...d, retry429: Number(e.target.value) })),
              }, [0, 1, 2, 3].map((n) => h("option", { key: n, value: String(n) }, `${t("retry429")} ×${n}`))))),
          h("div", { className: "mh-field" },
            h("label", null, t("members")),
            h("div", { className: "mh-mp-list" },
              groupDialog.models.length === 0 ? h("div", { className: "mh-muted", style: { padding: 8, textAlign: "center", fontSize: 12 } }, t("empty")) : null,
              groupDialog.models.map((m, i) => {
                const info = groupModels.find((x) => x.id === m);
                const memberGroups = groups.filter((g) => (g.models ?? []).includes(m));
                const memberGroupNames = new Set(memberGroups.map((g) => g.name));
                const myAliases = aliases.filter((a) => a.target === m && !memberGroupNames.has(a.alias));
                const rowStopped = isStopped(m);
                return h("div", { className: "mh-mp-row" + (rowStopped ? " is-off" : ""), key: m + i },
                  h("span", { className: "mh-mp-idx" }, i + 1),
                  h("span", { style: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 } },
                    h("span", { className: "mh-name" + (rowStopped ? " is-off" : ""), style: { fontSize: 12, display: "flex", alignItems: "center", gap: 6 } },
                      info?.name && info.name !== m ? info.name : m,
                      h(Sched, { stopped: rowStopped, t })),
                    info?.name && info.name !== m ? h("span", { className: "mh-mono", style: { fontSize: 10, color: "var(--dsw-alias-label-tertiary)" } }, m) : null,
                    myAliases.length > 0 ? h("span", { className: "mh-chips" }, myAliases.map((a) => h("span", { key: a.alias, className: "mh-chip", style: { fontSize: 10, padding: "1px 6px" } }, a.alias))) : null),
                  h("span", { style: { display: "flex", gap: 2, flexShrink: 0 } },
                    h(Btn, {
                      icon: rowStopped ? I.unlock : I.lock, iconOnly: true,
                      title: rowStopped ? t("resume") : t("stop"),
                      onClick: () => toggleModel(m, !rowStopped),
                    }),
                    i > 0 ? h(Btn, { icon: I.up, iconOnly: true, onClick: () => setGroupDialog((d) => { const a = [...d.models]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return { ...d, models: a }; }) }) : null,
                    i < groupDialog.models.length - 1 ? h(Btn, { icon: I.down, iconOnly: true, onClick: () => setGroupDialog((d) => { const a = [...d.models]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; return { ...d, models: a }; }) }) : null,
                    h(Btn, { icon: I.x, iconOnly: true, onClick: () => setGroupDialog((d) => ({ ...d, models: d.models.filter((_, j) => j !== i) })) })));
              })),
            h(ModelPicker, {
              options: pickerOptions, aliases, t, selected: groupDialog.models,
              onPick: (id) => setGroupDialog((d) => ({
                ...d,
                models: d.models.includes(id) ? d.models.filter((x) => x !== id) : [...d.models, id],
              })),
            })),
          dialogError ? h("div", { className: "mh-error" }, dialogError) : null) : null,

        aliasDialog ? h(Dialog, {
          title: t("newAlias"),
          onClose: () => setAliasDialog(null),
          footer: [
            h(Btn, { key: "c", onClick: () => setAliasDialog(null), disabled: busy }, t("cancel")),
            h(Btn, { key: "s", primary: true, onClick: submitAlias, disabled: busy || !aliasDialog.alias || !aliasDialog.target }, t("save")),
          ],
        },
          h("div", { className: "mh-field" },
            h("label", null, t("name")),
            h("div", { className: "mh-input-wrap" },
              h("input", {
                className: "mh-input", value: aliasDialog.alias, autoFocus: true,
                // The placeholder shows what the wand would produce, so an
                // empty field already answers "what name would I get?".
                placeholder: autoAliasOf(aliasModelName) || t("name"),
                onChange: (e) => setAliasDialog((d) => ({ ...d, alias: e.target.value })),
              }),
              h("button", {
                type: "button", className: "mh-input-suffix", title: t("autoGen"),
                "aria-label": t("autoGen"),
                onClick: () => {
                  const derived = autoAliasOf(aliasModelName);
                  if (derived) setAliasDialog((d) => ({ ...d, alias: derived }));
                },
              }, I.wand()))),
          h("div", { className: "mh-field" },
            h("label", null, t("target")),
            h("code", { className: "mh-mono" }, aliasDialog.target)),
          dialogError ? h("div", { className: "mh-error" }, dialogError) : null) : null,

        keyDialog ? h(Dialog, {
          title: t("newKey"),
          onClose: () => { setKeyDialog(false); setCreatedKey(null); },
          footer: createdKey
            ? [h(Btn, { key: "d", primary: true, onClick: () => { setKeyDialog(false); setCreatedKey(null); } }, "OK")]
            : [
              h(Btn, { key: "c", onClick: () => setKeyDialog(false), disabled: busy }, t("cancel")),
              h(Btn, { key: "s", primary: true, onClick: submitKey, disabled: busy }, t("add")),
            ],
        },
          createdKey
            ? h("div", { className: "mh-reveal" },
              h("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, I.key(), h("strong", null, t("keyOnce"))),
              h("code", { className: "mh-mono" }, createdKey.key),
              h("div", { style: { display: "flex", justifyContent: "flex-end" } }, h(CopyBtn, { text: createdKey.key, t, copied, onCopied })))
            : h("div", { className: "mh-field" },
              h("label", null, t("keyLabel")),
              h("input", { className: "mh-input", value: keyLabel, autoFocus: true, onChange: (e) => setKeyLabel(e.target.value) })),
          dialogError ? h("div", { className: "mh-error" }, dialogError) : null) : null,

        confirm ? h(Dialog, {
          title: confirm.label,
          onClose: () => setConfirm(null),
          footer: [
            h(Btn, { key: "c", onClick: () => setConfirm(null) }, t("cancel")),
            h(Btn, { key: "d", danger: true, onClick: async () => { const c = confirm; setConfirm(null); await c.run(); } }, t("del")),
          ],
        }) : null);

      /* --------------------------------------------------------- shell */
      const tabs = [
        ["overview", I.grid], ["models", I.server], ["groups", I.layers], ["keys", I.key],
      ];
      return h("div", { [STYLE_ATTR]: "", role: "region", "aria-label": t("nav") },
        h("div", { className: "mh-page" },
          h("div", { className: "mh-head" },
            h("div", { className: "mh-title" }, I.gateway(18), t("nav")),
            h("span", { className: "mh-spacer" }),
            lan ? h(Pill, { dot: lan.listening ? "on" : "bad" }, `${lan.host === "0.0.0.0" ? t("lan") : lan.host}:${lan.port}`) : null,
            h(Pill, { dot: status?.authRequired ? "on" : "warn" }, status?.authRequired ? t("authOn") : t("authOff")),
            h(Btn, { icon: I.refresh, iconOnly: true, onClick: refreshAll, title: t("apply") })),
          h("div", { className: "mh-tabs", role: "tablist" },
            tabs.map(([id, ic]) => h("button", {
              key: id, className: "mh-tab", role: "tab", "aria-selected": tab === id,
              onClick: () => setTab(id),
            }, ic(), t(id)))),
          error && status === null ? h("div", { className: "mh-error" }, error) : null,
          status === null ? h("div", { className: "mh-muted" }, t("loading")) : null,
          status !== null && tab === "overview" ? overviewTab : null,
          status !== null && tab === "models" ? modelsTab : null,
          tab === "groups" ? groupsTab : null,
          status !== null && tab === "keys" ? keysTab : null),
        dialogs,
        toast ? h("div", { className: "mh-toast" }, I.check(), toast) : null);
    }

    function GatewayIcon() {
      return h("span", { style: { display: "inline-flex" } }, I.gateway(16));
    }

    /* -------------------------------------------------------- plugin */
    const inject = ["slots", "locale", "connection"];
    const name = NS;
    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement("style");
        style.setAttribute(STYLE_ATTR, "");
        style.textContent = CSS;
        document.head.appendChild(style);
        return () => style.remove();
      }, "dsh-one-gateway: styles");
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-one-gateway: dictionaries");
      const t = ctx.locale.bind(NS);
      ctx.slots.inject("main", () =>
        ctx.slots.register({ name: "main", key: PANEL_ID, locale: NS }, GatewayPage));
      ctx.slots.inject("sidebar.panellist", () =>
        ctx.slots.register({ name: "sidebar.panellist", id: PANEL_ID, order: 60, label: () => t("nav"), locale: NS }, GatewayIcon));
    }
    exports.apply = apply;
    exports.inject = inject;
    exports.name = name;
    return module.exports;
  },
});
