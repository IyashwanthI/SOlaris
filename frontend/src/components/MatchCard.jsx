import { useState } from "react";
import { ChevronDown, ChevronUp, ThumbsDown, ThumbsUp } from "lucide-react";
import { sendFeedback } from "../api.js";
import { useApp } from "../context/AppContext.jsx";

export default function MatchCard({ match }) {
  const { setStats, showToast } = useApp();
  const [expanded, setExpanded] = useState(match.rank === 1);
  const [voted, setVoted] = useState(null);

  const high = match.confidence_tier === "HIGH";

  async function vote(v) {
    try {
      const s = await sendFeedback(match.ticket_id, v);
      setStats(s);
      setVoted(v);
      showToast(v === "up" ? "Marked helpful" : "Marked unhelpful", "success");
    } catch (err) {
      showToast(`Feedback failed: ${err.message}`, "error");
    }
  }

  return (
    <div className="fade-in border border-slate-200 rounded-xl p-4 mb-3 bg-white hover:border-teal/50 transition">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-slate-400">
            #{match.rank}
          </span>
          <span className="font-bold text-navy">{match.ticket_id}</span>
          <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            {match.category}
          </span>
        </div>
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
            high
              ? "bg-emerald-100 text-emerald-700"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {match.confidence_tier} · {match.confidence_pct}%
        </span>
      </div>

      <button
        onClick={() => setExpanded((e) => !e)}
        className="mt-1.5 w-full text-left flex items-start justify-between gap-2 group"
      >
        <span className="font-semibold text-sm text-slate-800 group-hover:text-navy">
          {match.subject}
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        )}
      </button>

      {expanded && (
        <div className="mt-2 fade-in">
          <p className="text-sm text-slate-500">{match.resolution_notes}</p>
          {Array.isArray(match.tags) && match.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {match.tags.map((t) => (
                <span
                  key={t}
                  className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => vote("up")}
          className={`flex items-center gap-1 text-sm px-2.5 py-1 rounded-md border transition ${
            voted === "up"
              ? "bg-emerald-50 border-emerald-300 text-emerald-700"
              : "border-slate-200 hover:bg-emerald-50 hover:border-emerald-300"
          }`}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => vote("down")}
          className={`flex items-center gap-1 text-sm px-2.5 py-1 rounded-md border transition ${
            voted === "down"
              ? "bg-rose-50 border-rose-300 text-rose-700"
              : "border-slate-200 hover:bg-rose-50 hover:border-rose-300"
          }`}
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
        <span className="text-[11px] text-slate-400 ml-auto">
          rrf {match.rrf_score} · cos {Number(match.cosine_sim).toFixed(3)}
        </span>
      </div>
    </div>
  );
}
