import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The MCP Apps view: one self-contained HTML document the host renders in a
 * sandboxed iframe. It shows whichever screen the tool result describes
 * (`structuredContent.view`) and calls tools back through the host for
 * navigation and votes. The ext-apps bridge is inlined (no CDN), exposed as
 * `globalThis.McpApps` because an inline script can't `import` from itself.
 */

let cached: string | null = null;

function bridgeScript() {
  const file = path.join(process.cwd(), "node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js");
  const source = readFileSync(file, "utf8");
  const exportAt = source.lastIndexOf("export{");
  const names = source
    .slice(exportAt + "export{".length, source.indexOf("}", exportAt))
    .split(",")
    .map((pair) => {
      const [local, exported = local] = pair.split(" as ").map((s) => s.trim());
      return `${JSON.stringify(exported)}:${local}`;
    });
  return `${source.slice(0, exportAt)}globalThis.McpApps={${names.join(",")}};`;
}

const STYLES = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 12px;
  font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  font-size: var(--font-text-sm-size, 14px);
  color: var(--color-text-primary, #18181b);
  background: var(--color-background-primary, transparent);
}
h1 { font-size: var(--font-heading-sm-size, 17px); margin: 0; font-weight: var(--font-weight-semibold, 600); }
h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-text-secondary, #71717a); margin: 16px 0 6px; font-weight: 600; }
.muted { color: var(--color-text-secondary, #71717a); font-size: 12px; }
.row { display: flex; align-items: center; gap: 8px; }
.between { justify-content: space-between; }
.wrap { flex-wrap: wrap; }
.card {
  border: 1px solid var(--color-border-primary, rgba(127,127,127,.25));
  border-radius: var(--border-radius-md, 8px); padding: 10px 12px;
  background: var(--color-background-secondary, transparent);
}
.list { display: flex; flex-direction: column; gap: 6px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; }
button.card { text-align: left; cursor: pointer; font: inherit; color: inherit; width: 100%; }
button.card:hover { border-color: var(--color-border-info, #6366f1); }
.title { font-weight: var(--font-weight-medium, 500); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.btn {
  font: inherit; font-size: 13px; cursor: pointer; padding: 6px 12px;
  border-radius: var(--border-radius-sm, 6px);
  border: 1px solid var(--color-border-primary, rgba(127,127,127,.35));
  background: var(--color-background-primary, transparent); color: inherit;
}
.btn:disabled { opacity: .5; cursor: default; }
.btn.primary { background: var(--color-background-inverse, #18181b); color: var(--color-text-inverse, #fff); border-color: transparent; }
.btn.danger { color: var(--color-text-danger, #dc2626); }
.link { background: none; border: 0; padding: 0; font: inherit; font-size: 12px; color: var(--color-text-info, #4f46e5); cursor: pointer; }
.pill { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px; white-space: nowrap; }
.fmt { font-family: var(--font-mono, ui-monospace, monospace); font-size: 10px; text-transform: uppercase; padding: 1px 5px; border-radius: 4px; border: 1px solid; white-space: nowrap; }
.fmt-sql { color: #7c3aed; border-color: #7c3aed55; background: #7c3aed14; }
.fmt-markdown { color: #2563eb; border-color: #2563eb55; background: #2563eb14; }
.fmt-json { color: #ea580c; border-color: #ea580c55; background: #ea580c14; }
.fmt-text { color: var(--color-text-secondary, #71717a); border-color: currentColor; }
.s-open, .review { background: #f59e0b26; color: #b45309; }
.s-accepted { background: #10b98126; color: #047857; }
.s-rejected { background: #ef444426; color: #b91c1c; }
.s-needs_rebase { background: #0ea5e926; color: #0369a1; }
.s-closed { background: #71717a26; color: #52525b; }
@media (prefers-color-scheme: dark) {
  .s-open, .review { color: #fcd34d; } .s-accepted { color: #6ee7b7; } .s-rejected { color: #fca5a5; }
  .s-needs_rebase { color: #7dd3fc; } .s-closed { color: #a1a1aa; }
  .fmt-sql { color: #c4b5fd; } .fmt-markdown { color: #93c5fd; } .fmt-json { color: #fdba74; }
}
[data-theme="dark"] .s-open, [data-theme="dark"] .review { color: #fcd34d; }
pre {
  margin: 0; padding: 10px; overflow: auto; max-height: 360px; white-space: pre;
  font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; line-height: 1.5;
  border-radius: var(--border-radius-sm, 6px); background: var(--color-background-tertiary, rgba(127,127,127,.08));
}
.add { background: #10b9811f; color: #047857; display: block; }
.del { background: #ef44441f; color: #b91c1c; display: block; }
.hunk { color: var(--color-text-secondary, #71717a); display: block; }
@media (prefers-color-scheme: dark) { .add { color: #6ee7b7; } .del { color: #fca5a5; } }
textarea { width: 100%; font: inherit; padding: 8px; border-radius: 6px; border: 1px solid var(--color-border-primary, rgba(127,127,127,.35)); background: transparent; color: inherit; min-height: 60px; }
.summary { white-space: pre-wrap; line-height: 1.5; }
.error { color: var(--color-text-danger, #dc2626); }
`;

const SCRIPT = `
const { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } = globalThis.McpApps;
const app = new App({ name: "Intermediary", version: "1.0.0" });
const root = document.getElementById("root");

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const STATUS = { open: "In review", accepted: "Accepted", rejected: "Rejected", needs_rebase: "Needs rebase", closed: "Closed" };
const status = (s) => h("span", { class: "pill s-" + s }, STATUS[s] || s);
const fmt = (f) => h("span", { class: "fmt fmt-" + f }, f);
const ago = (iso) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now"; const m = Math.round(s / 60); if (m < 60) return m + "m ago";
  const hr = Math.round(m / 60); return hr < 24 ? hr + "h ago" : Math.round(hr / 24) + "d ago";
};
const openApp = (url) => h("button", { class: "link", onclick: () => app.openLink({ url }).catch(() => {}) }, "Open in Intermediary ↗");

function show(...nodes) { root.replaceChildren(...nodes); }
function loading(text) { show(h("p", { class: "muted" }, text || "Loading…")); }

async function call(name, args, loadingText) {
  loading(loadingText);
  try {
    const res = await app.callServerTool({ name, arguments: args });
    handle(res);
    return res;
  } catch (e) {
    show(h("p", { class: "error" }, String(e && e.message || e)));
  }
}

function handle(res) {
  if (!res) return;
  const data = res.structuredContent;
  if (res.isError || !data) {
    const text = (res.content || []).map((c) => c.text || "").join("\\n");
    show(h("p", { class: res.isError ? "error" : "" }, text || "Nothing to show."));
    return;
  }
  if (data.view === "workspace") renderWorkspace(data);
  else if (data.view === "proposal") renderProposal(data);
  else if (data.view === "artifact") renderArtifact(data);
}

function renderWorkspace(d) {
  const waiting = d.proposals.filter((p) => p.needsMyVote);
  const others = d.proposals.filter((p) => !p.needsMyVote);
  const proposalRow = (p) => h("button", { class: "card row between", onclick: () => call("review_proposal", { proposal_id: p.id }) },
    h("div", { style: "min-width:0" },
      h("div", { class: "title" }, p.artifactTitle),
      h("div", { class: "muted title" }, p.author + " · " + ago(p.updatedAt) + (p.summary ? " · " + p.summary : ""))),
    h("div", { class: "row" },
      p.status === "open" ? h("span", { class: "muted" }, p.approvals + "/" + p.needed) : null,
      status(p.status)));
  show(
    h("div", { class: "row between wrap" },
      h("div", null, h("h1", null, d.workspace.name), h("div", { class: "muted" }, d.members.map((m) => m.isMe ? m.name + " (you)" : m.name).join(" · "))),
      openApp(d.appUrl)),
    waiting.length ? [h("h2", null, "Waiting on your vote"), h("div", { class: "list" }, waiting.map(proposalRow))] : null,
    others.length ? [h("h2", null, "In flight"), h("div", { class: "list" }, others.map(proposalRow))] : null,
    h("h2", null, "Artifacts"),
    d.artifacts.length
      ? h("div", { class: "grid" }, d.artifacts.map((a) =>
          h("button", { class: "card", onclick: () => call("get_artifact", { artifact_id: a.id }) },
            h("div", { class: "row between" }, h("span", { class: "title" }, a.title),
              h("span", { class: "row" }, a.needsMyReview ? h("span", { class: "pill review" }, "Needs your review") : null, fmt(a.format))),
            h("div", { class: "muted" }, "Updated " + ago(a.updatedAt)))))
      : h("p", { class: "muted" }, "Nothing published yet."));
}

function diffView(diff) {
  const lines = diff.split("\\n").filter((l) => !l.startsWith("===") && !l.startsWith("Index:") && !l.startsWith("---") && !l.startsWith("+++"));
  return h("pre", null, lines.map((l) =>
    h("span", { class: l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : l.startsWith("@@") ? "hunk" : "" }, l + "\\n")));
}

function renderProposal(d) {
  const p = d.proposal;
  const canVote = !p.isAuthor && p.status === "open";
  let comment;
  const vote = async (v) => {
    const text = comment ? comment.value.trim() : "";
    if (v === "reject" && !text) { comment.focus(); comment.placeholder = "Say why you're rejecting (required)"; return; }
    const res = await call("cast_review", { proposal_id: p.id, vote: v, comment: text }, v === "approve" ? "Approving…" : "Rejecting…");
    if (res && !res.isError) {
      app.updateModelContext({ content: [{ type: "text", text: "The user " + (v === "approve" ? "approved" : "rejected") + " the proposal to " + p.artifactTitle + " from the review view." }] }).catch(() => {});
    }
  };
  show(
    h("div", { class: "row between wrap" },
      h("div", null,
        h("div", { class: "row" }, h("h1", null, p.artifactTitle), fmt(p.format), status(p.status)),
        h("div", { class: "muted" }, "Proposed by " + p.author + " · revision " + p.revision + " · " + ago(p.updatedAt))),
      h("div", { class: "row" },
        h("button", { class: "link", onclick: () => call("show_workspace", { workspace_id: d.workspaceId }) }, "← Workspace"),
        openApp(d.appUrl))),
    h("h2", null, "Summary"), h("div", { class: "summary" }, p.summary),
    h("h2", null, "Changes"), diffView(p.diff),
    h("h2", null, "Votes"),
    h("div", { class: "list" }, p.reviewers.length ? p.reviewers.map((r) =>
      h("div", { class: "row between" }, h("span", null, r.name),
        h("span", { class: "muted" }, r.vote ? (r.vote === "approve" ? "✓ approved" : "✕ rejected") + (r.comment ? " — " + r.comment : "") : "waiting"))) : h("span", { class: "muted" }, "No other members.")),
    canVote ? h("div", { class: "card", style: "margin-top:12px" },
      h("div", { style: "margin-bottom:8px" }, p.myVote ? "You voted " + p.myVote + ". You can change your vote." : "Your vote"),
      (comment = h("textarea", { placeholder: "Comment (required to reject)" })),
      h("div", { class: "row", style: "margin-top:8px" },
        h("button", { class: "btn primary", onclick: () => vote("approve") }, "Approve"),
        h("button", { class: "btn danger", onclick: () => vote("reject") }, "Reject"))) : null,
    p.isAuthor ? h("p", { class: "muted" }, "You wrote this proposal; your teammates review it.") : null);
}

function renderArtifact(d) {
  const a = d.artifact;
  show(
    h("div", { class: "row between wrap" },
      h("div", null,
        h("div", { class: "row" }, h("h1", null, a.title), fmt(a.format)),
        h("div", { class: "muted" }, (a.isCurrent ? "Official" : "Older official") + " v" + a.version + " by " + a.author + " · " + ago(a.createdAt))),
      h("div", { class: "row" },
        h("button", { class: "link", onclick: () => call("show_workspace", { workspace_id: a.workspaceId }) }, "← Workspace"),
        openApp(d.appUrl))),
    a.summary ? [h("h2", null, "Summary"), h("div", { class: "summary" }, a.summary)] : null,
    h("h2", null, "Content"), h("pre", null, a.content));
}

function applyContext(ctx) {
  if (!ctx) return;
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles && ctx.styles.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles && ctx.styles.css && ctx.styles.css.fonts) applyHostFonts(ctx.styles.css.fonts);
}

app.ontoolinput = () => loading();
app.ontoolresult = (res) => handle(res);
app.ontoolcancelled = () => show(h("p", { class: "muted" }, "Cancelled."));
app.onhostcontextchanged = (ctx) => applyContext(ctx);
loading();
app.connect().then(() => applyContext(app.getHostContext())).catch((e) => show(h("p", { class: "error" }, "Couldn't connect to the host: " + e)));
`;

export function viewHtml() {
  if (cached) return cached;
  // "</script" inside the inlined source would end the tag early.
  const bridge = bridgeScript().replace(/<\/script/gi, "<\\/script");
  cached = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Intermediary</title>
<style>${STYLES}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${bridge}</script>
<script type="module">${SCRIPT}</script>
</body>
</html>`;
  return cached;
}
