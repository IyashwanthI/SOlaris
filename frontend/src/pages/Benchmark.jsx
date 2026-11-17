import { useState } from "react";
import {
  CheckCircle2,
  Loader2,
  PlayCircle,
  Target,
  XCircle,
} from "lucide-react";
import { runBenchmark, search } from "../api.js";
import { useApp } from "../context/AppContext.jsx";

// Golden evaluation set used as a client-side fallback when the backend does
// not expose /api/benchmark. Mirrors the expected response shape.
const GOLDEN_CASES = [
  {
    ticket: "NT-1",
    query: "password reset email never arrives",
    expected: "T-1001",
  },
  { ticket: "NT-2", query: "revenue chart renders blank", expected: "T-1201" },
  { ticket: "NT-3", query: "charged twice this month", expected: "T-1303" },
  {
    ticket: "NT-101",
    query: "CSV export missing last week",
    expected: "T-1401",
  },
  { ticket: "T-1002", query: "Okta SSO blank page", expected: "T-1505" },
  { ticket: "NT-UNSEEN", query: "quantum WebGL shader crash", expected: null },
];

function normalize(raw) {
  // Accept either a rich backend payload or the fallback summary shape.
  const cases = (raw?.cases || raw?.results || []).map((c) => ({
    ticket: c.ticket || c.test_ticket || c.ticket_id,
    expected: c.expected ?? c.expected_match ?? null,
    retrieved: c.retrieved ?? c.top_retrieved ?? c.top_match ?? null,
    confidence_pct: c.confidence_pct ?? c.confidence ?? null,
    pass: typeof c.pass === "boolean" ? c.pass : c.status === "PASS",
  }));
  const total = raw?.total_cases ?? cases.length;
  const passed = cases.filter((c) => c.pass).length;
  const recall =
    raw?.recall_at_4 ?? (total ? Math.round((passed / total) * 1000) / 10 : 0);
  const guardrail =
    raw?.guardrail_pass_rate ??
    (() => {
      const guard = cases.filter((c) => c.expected === null);
      if (!guard.length) return 100;
      const ok = guard.filter((c) => !c.retrieved || c.pass).length;
      return Math.round((ok / guard.length) * 1000) / 10;
    })();
  return { cases, total, recall, guardrail };
}

export default function Benchmark() {
  const { showToast } = useApp();
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState(null);
  const [fromFallback, setFromFallback] = useState(false);

  async function localFallback() {
    // Run the golden set through the live /api/search so results are real.
    const cases = [];
    for (const g of GOLDEN_CASES) {
      try {
        const r = await search({
          ticket_id: g.ticket,
          subject: g.query,
          description: g.query,
        });
        const top = r.matches[0];
        const retrieved = top?.ticket_id || null;
        const confidence_pct = top?.confidence_pct ?? 0;
        const pass =
          g.expected === null
            ? r.below_threshold || !retrieved
            : retrieved === g.expected;
        cases.push({
          ticket: g.ticket,
          expected: g.expected,
          retrieved,
          confidence_pct,
          pass,
        });
      } catch {
        cases.push({
          ticket: g.ticket,
          expected: g.expected,
          retrieved: null,
          confidence_pct: 0,
          pass: false,
        });
      }
    }
    return normalize({ cases });
  }

  async function run() {
    setRunning(true);
    setSummary(null);
    try {
      const { data, available } = await runBenchmark();
      if (available && data) {
        setSummary(normalize(data));
        setFromFallback(false);
      } else {
        showToast(
          "Backend /api/benchmark unavailable — running golden set live.",
          "info",
        );
        setSummary(await localFallback());
        setFromFallback(true);
      }
    } catch (err) {
      showToast(`Benchmark failed: ${err.message}`, "error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-navy">
            Retrieval &amp; Guardrail Evaluation Suite
          </h1>
          <p className="text-sm text-slate-500">
            Runs the golden test set against live retrieval and checks the &lt;
            55% confidence guardrail.
            {fromFallback && (
              <span className="text-amber-600"> (client-side golden run)</span>
            )}
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="flex items-center gap-2 bg-teal hover:bg-tealdark text-white font-semibold px-5 py-2.5 rounded-lg transition disabled:opacity-60"
        >
          {running ? (
            <Loader2 className="w-4 h-4 spin" />
          ) : (
            <PlayCircle className="w-4 h-4" />
          )}
          Run Golden Evaluation Suite
        </button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 fade-in">
            <KpiCard
              label="Recall@4"
              value={`${summary.recall}%`}
              Icon={Target}
              tone="teal"
            />
            <KpiCard
              label="Guardrail Pass Rate"
              value={`${summary.guardrail}%`}
              Icon={CheckCircle2}
              tone="emerald"
            />
            <KpiCard
              label="Total Test Cases"
              value={summary.total}
              Icon={PlayCircle}
              tone="navy"
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden fade-in">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Test Ticket</th>
                  <th className="text-left px-4 py-3">Expected Match</th>
                  <th className="text-left px-4 py-3">Top Retrieved</th>
                  <th className="text-left px-4 py-3">Confidence</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.cases.map((c) => (
                  <tr key={c.ticket} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-navy">
                      {c.ticket}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.expected || (
                        <span className="text-amber-600">∅ (guardrail)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.retrieved || (
                        <span className="text-slate-400">no match</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.confidence_pct != null ? `${c.confidence_pct}%` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {c.pass ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                          <XCircle className="w-3.5 h-3.5" /> FAIL
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!summary && !running && (
        <div className="text-sm text-slate-400 py-16 text-center border border-dashed border-slate-300 rounded-xl">
          Click “Run Golden Evaluation Suite” to score retrieval accuracy and
          guardrail behavior.
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, Icon, tone }) {
  const tones = {
    teal: "bg-teal/10 text-teal",
    emerald: "bg-emerald-100 text-emerald-700",
    navy: "bg-navy/5 text-navy",
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
      <div
        className={`w-11 h-11 rounded-lg flex items-center justify-center ${tones[tone]}`}
      >
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <div className="text-2xl font-extrabold text-navy">{value}</div>
        <div className="text-xs text-slate-500 uppercase tracking-wide">
          {label}
        </div>
      </div>
    </div>
  );
}
