import { useState } from "react";
import {
  ClipboardList,
  FileText,
  Loader2,
  MessageSquareText,
  SplitSquareHorizontal,
} from "lucide-react";
import { copilot } from "../api.js";
import { useApp } from "../context/AppContext.jsx";

const ACTIONS = [
  { key: "summarize", label: "Summarize Fixes", Icon: FileText },
  { key: "draft_reply", label: "Draft Reply", Icon: MessageSquareText },
  {
    key: "classify_fix",
    label: "Config vs. Bug?",
    Icon: SplitSquareHorizontal,
  },
  { key: "checklist", label: "Checklist", Icon: ClipboardList },
];

const REPLY_MODIFIERS = [
  { key: "shorter", label: "🗜️ Make Shorter" },
  { key: "bullets", label: "📋 Step-by-Step Bullets" },
  { key: "apology", label: "🤝 Empathetic Tone" },
];

/** Render minimal inline markup: **bold** and [T-XXXX] chips. */
function renderInline(text) {
  const parts = [];
  const regex = /(\*\*.+?\*\*|\[T-\d+\])/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      parts.push(<b key={i++}>{token.slice(2, -2)}</b>);
    } else {
      parts.push(
        <span
          key={i++}
          className="text-[11px] font-semibold bg-teal/10 text-teal px-1.5 py-0.5 rounded"
        >
          {token.slice(1, -1)}
        </span>,
      );
    }
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function Checklist({ output }) {
  const lines = output.split("\n");
  const [checked, setChecked] = useState({});
  let any = false;

  const rendered = lines.map((raw, idx) => {
    const line = raw.replace(/\s+$/, "");
    const m = line.match(/^\s*-\s*\[\s*\]\s*(.*)$/);
    if (m) {
      any = true;
      return (
        <label key={idx} className="flex items-start gap-2 text-sm py-0.5">
          <input
            type="checkbox"
            checked={!!checked[idx]}
            onChange={() => setChecked((c) => ({ ...c, [idx]: !c[idx] }))}
            className="mt-1 w-4 h-4 accent-teal-600"
          />
          <span className={checked[idx] ? "line-through text-slate-400" : ""}>
            {renderInline(m[1])}
          </span>
        </label>
      );
    }
    if (line.trim()) {
      return (
        <div key={idx} className="text-sm text-slate-600 py-0.5">
          {renderInline(line)}
        </div>
      );
    }
    return null;
  });

  return (
    <div className="space-y-0.5">{any ? rendered : renderInline(output)}</div>
  );
}

export default function CopilotPanel({ activeTicket, matches, onInsertReply }) {
  const { showToast } = useApp();
  const [loading, setLoading] = useState(null);
  const [modifying, setModifying] = useState(null); // active modifier key
  const [result, setResult] = useState(null); // { action, output, latency_ms }

  const disabled = !matches || matches.length === 0;

  async function run(action) {
    if (disabled) return;
    setLoading(action);
    setResult(null);
    try {
      const data = await copilot(activeTicket, matches, action);
      setResult(data);
    } catch (err) {
      showToast(`Co-pilot failed: ${err.message}`, "error");
    } finally {
      setLoading(null);
    }
  }

  async function runModifier(modifier) {
    if (disabled || modifying) return;
    setModifying(modifier);
    try {
      const data = await copilot(
        activeTicket,
        matches,
        "draft_reply",
        modifier,
      );
      setResult(data);
    } catch (err) {
      showToast(`Co-pilot failed: ${err.message}`, "error");
    } finally {
      setModifying(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-sm font-bold uppercase tracking-wide text-navy">
          Guided Co-pilot
        </h2>
        <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
          gemini-3.1-flash-lite
        </span>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        Grounded strictly in the matched tickets above.
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        {ACTIONS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => run(key)}
            disabled={disabled || loading !== null}
            className="flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-lg border border-slate-300 text-navy bg-white transition enabled:hover:bg-teal enabled:hover:text-white enabled:hover:border-teal disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {loading === key ? (
              <Loader2 className="w-4 h-4 spin" />
            ) : (
              <Icon className="w-4 h-4" />
            )}
            {label}
          </button>
        ))}
      </div>

      {disabled && (
        <p className="text-xs text-amber-600 mt-3">
          Run a search with results first — the co-pilot requires grounded
          context.
        </p>
      )}

      {result && (
        <div className="mt-4 fade-in">
          <div className="text-xs text-slate-400 mb-2">
            {result.action} · {result.latency_ms} ms
          </div>
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
            {result.action === "checklist" ? (
              <Checklist output={result.output} />
            ) : result.action === "draft_reply" ? (
              <>
                <div
                  className={`text-sm text-slate-700 whitespace-pre-wrap transition-opacity ${
                    modifying ? "opacity-40" : "opacity-100"
                  }`}
                >
                  {result.output}
                </div>

                {/* One-click tone & follow-up modifier chips */}
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-200">
                  {REPLY_MODIFIERS.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => runModifier(m.key)}
                      disabled={modifying !== null}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-slate-300 bg-white text-navy transition enabled:hover:bg-navy enabled:hover:text-white enabled:hover:border-navy disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {modifying === m.key && (
                        <Loader2 className="w-3.5 h-3.5 spin" />
                      )}
                      {m.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    onInsertReply?.(result.output);
                    showToast("Reply inserted into composer", "success");
                  }}
                  disabled={modifying !== null}
                  className="mt-3 bg-teal hover:bg-tealdark text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60"
                >
                  Insert into Customer Reply
                </button>
              </>
            ) : (
              <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {result.output.split("\n").map((ln, i) => (
                  <div key={i}>{renderInline(ln)}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
