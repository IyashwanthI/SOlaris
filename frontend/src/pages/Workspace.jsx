import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bug,
  Loader2,
  Route,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import {
  FALLBACK_INCOMING,
  FALLBACK_SAMPLES,
  UNSEEN_BUG,
  fetchIncoming,
  search as apiSearch,
} from "../api.js";
import { useApp } from "../context/AppContext.jsx";
import MatchCard from "../components/MatchCard.jsx";
import CopilotPanel from "../components/CopilotPanel.jsx";

const MODES = [
  { key: "hybrid", label: "Hybrid RRF" },
  { key: "bm25", label: "BM25 Keyword" },
  { key: "semantic", label: "Semantic Vector" },
];

function Skeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="border border-slate-200 rounded-xl p-4">
          <div className="skeleton h-4 w-32 rounded mb-3" />
          <div className="skeleton h-4 w-full rounded mb-2" />
          <div className="skeleton h-3 w-3/4 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function Workspace() {
  const { setLatencyMs, showToast } = useApp();

  const [incoming, setIncoming] = useState(FALLBACK_INCOMING);
  const [samples, setSamples] = useState(FALLBACK_SAMPLES);
  const [queueSource, setQueueSource] = useState("fallback");

  const [form, setForm] = useState({
    ticket_id: "",
    subject: "",
    category: "",
    description: "",
    tags: [],
  });
  const [mode, setMode] = useState("hybrid");

  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState(null); // { matches, latency_ms, below_threshold, recommended_route }
  const [reply, setReply] = useState("");

  const formRef = useRef(form);
  formRef.current = form;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    fetchIncoming().then((d) => {
      setIncoming(d.incoming_tickets);
      setSamples(d.sample_historical_tickets);
      setQueueSource(d.source);
    });
  }, []);

  async function runSearch(override) {
    const f = override || formRef.current;
    if (!f.subject && !f.description) {
      showToast("Enter a subject or description first.", "error");
      return;
    }
    setSearching(true);
    setResult(null);
    try {
      const data = await apiSearch({ ...f, search_mode: modeRef.current });
      setResult(data);
      setLatencyMs(data.latency_ms);
    } catch (err) {
      showToast(`Search failed: ${err.message}`, "error");
    } finally {
      setSearching(false);
    }
  }

  function loadPreset(t) {
    const next = {
      ticket_id: t.ticket_id || "",
      subject: t.subject || "",
      category: t.category || "",
      description: t.description || "",
      tags: t.tags || [],
    };
    setForm(next);
    runSearch(next);
  }

  function changeMode(m) {
    setMode(m);
    modeRef.current = m;
    if (form.subject || form.description) runSearch();
  }

  const activeTicket = {
    ticket_id: form.ticket_id || null,
    subject: form.subject,
    description: form.description,
    category: form.category,
    tags: form.tags,
  };

  const matches = result?.matches || [];
  const below = result?.below_threshold;
  const route = result?.recommended_route;

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* LEFT 60% */}
      <section className="lg:col-span-3 space-y-5">
        {/* Scenario pills */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Quick-Load Scenario
            </div>
            <span className="text-[10px] text-slate-400">
              queue: {queueSource}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {incoming.map((t) => (
              <button
                key={t.ticket_id}
                onClick={() => loadPreset(t)}
                className="text-sm px-3 py-1.5 rounded-full bg-slate-100 hover:bg-teal hover:text-white border border-slate-200 transition"
              >
                <span className="font-semibold">{t.ticket_id}</span> ·{" "}
                {t.subject.slice(0, 34)}
              </button>
            ))}
            {samples.map((t) => (
              <button
                key={t.ticket_id}
                onClick={() => loadPreset(t)}
                className="text-sm px-3 py-1.5 rounded-full bg-slate-100 hover:bg-navy hover:text-white border border-slate-200 transition"
              >
                <span className="font-semibold">{t.ticket_id}</span> ·{" "}
                {t.subject.slice(0, 34)}
              </button>
            ))}
            <button
              onClick={() => loadPreset(UNSEEN_BUG)}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 font-semibold transition"
            >
              <Bug className="w-3.5 h-3.5" /> Unseen Bug Test
            </button>
          </div>
        </div>

        {/* Search mode toggle */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Search Mode
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => changeMode(m.key)}
                className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition ${
                  mode === m.key
                    ? "bg-teal text-white shadow-sm"
                    : "text-slate-600 hover:text-navy"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Active ticket form */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-navy">
              Active Ticket
            </h2>
            <input
              value={form.ticket_id}
              onChange={(e) => setForm({ ...form, ticket_id: e.target.value })}
              placeholder="Ticket ID"
              className="text-xs font-bold text-teal bg-teal/10 border border-teal/30 rounded-full px-3 py-1 w-28 text-center focus:outline-none focus:ring-2 focus:ring-teal/40"
            />
          </div>

          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Subject
          </label>
          <input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            placeholder="Short summary of the issue"
            className="w-full mb-3 px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal/40"
          />

          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Category
          </label>
          <input
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="e.g. auth, billing, sync"
            className="w-full mb-3 px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal/40"
          />

          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Description
          </label>
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Full description of the customer's problem"
            className="w-full mb-4 px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal/40"
          />

          <button
            onClick={() => runSearch()}
            disabled={searching}
            className="w-full bg-teal hover:bg-tealdark text-white font-semibold py-2.5 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {searching ? (
              <Loader2 className="w-4 h-4 spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Find Similar Resolutions
          </button>
        </div>

        {/* Customer reply composer */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-navy">
              Customer Reply
            </h2>
            <span className="text-xs text-slate-400">draft</span>
          </div>
          <textarea
            rows={6}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Compose or insert a reply to the customer…"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal/40"
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => {
                setReply("");
                showToast("Reply cleared", "info");
              }}
              className="flex items-center gap-1.5 border border-slate-300 text-slate-600 font-semibold px-4 py-2 rounded-lg hover:bg-slate-50 transition"
            >
              <Trash2 className="w-4 h-4" /> Clear
            </button>
            <button
              onClick={() => {
                if (!reply.trim()) {
                  showToast("Nothing to send — reply is empty.", "error");
                  return;
                }
                showToast("Reply sent to customer", "success");
              }}
              className="flex items-center gap-1.5 bg-navy hover:bg-navydark text-white font-semibold px-5 py-2 rounded-lg transition"
            >
              <Send className="w-4 h-4" /> Send Reply
            </button>
          </div>
        </div>
      </section>

      {/* RIGHT 40% */}
      <aside className="lg:col-span-2 space-y-5">
        {/* Routing banner */}
        {route && (
          <div className="fade-in bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-navy/5 flex items-center justify-center shrink-0">
              <Route className="w-5 h-5 text-navy" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    route.badge === "ESCALATE"
                      ? "bg-amber-100 text-amber-700"
                      : route.badge === "AUTO-ASSIST"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {route.badge}
                </span>
                <span className="text-sm font-semibold text-navy">
                  {route.queue}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{route.reason}</p>
            </div>
          </div>
        )}

        {/* Matches */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-navy mb-4">
            Top Similar Resolved Tickets
          </h2>

          {searching ? (
            <Skeleton />
          ) : !result ? (
            <div className="text-sm text-slate-400 py-8 text-center">
              Run a search to surface the top 4 verified resolutions.
            </div>
          ) : below || matches.length === 0 ? (
            <div className="fade-in border border-amber-300 bg-amber-50 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <div className="font-bold mb-1">Confidence gate triggered</div>
                No verified past match found (below 55% confidence floor).
                Investigate manually or escalate to Tier-2.
              </div>
            </div>
          ) : (
            matches.map((m) => <MatchCard key={m.ticket_id} match={m} />)
          )}
        </div>

        {/* Copilot */}
        <CopilotPanel
          activeTicket={activeTicket}
          matches={below ? [] : matches}
          onInsertReply={(text) => setReply(text)}
        />
      </aside>
    </div>
  );
}
