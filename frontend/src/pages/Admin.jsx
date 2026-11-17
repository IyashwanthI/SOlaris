import { useCallback, useEffect, useState } from "react";
import {
  Database,
  Loader2,
  ShieldPlus,
  UserX,
  Users,
  Layers,
} from "lucide-react";
import {
  ApiError,
  adminGaps,
  adminUsers,
  approveGap,
  kickUser,
  promoteUser,
} from "../api.js";
import { useApp } from "../context/AppContext.jsx";

/* ------------------------------------------------------------------ */
/* Knowledge-Gap Review                                                */
/* ------------------------------------------------------------------ */

function GapRow({ gap, onApprove }) {
  const [form, setForm] = useState({
    category: gap.category || "",
    tags: (gap.tags || []).join(", "),
    resolution_notes: gap.resolution_notes || "",
  });
  const [busy, setBusy] = useState(false);
  const pct = Math.round((gap.top_confidence ?? 0) * 100);

  return (
    <div className="border border-slate-200 rounded-xl p-5 bg-white">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <span className="font-bold text-navy">{gap.ticket_id}</span>
          <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
            {pct}% top match · below floor
          </span>
        </div>
        <span className="text-[11px] text-slate-400">gap {gap.gap_id}</span>
      </div>
      <div className="font-semibold text-sm text-slate-800">{gap.subject}</div>
      <p className="text-sm text-slate-500 mt-1 mb-4">{gap.description}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Category
          </label>
          <input
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="e.g. integration"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal/40"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Tags (comma-separated)
          </label>
          <input
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="snowflake, oauth, sync"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal/40"
          />
        </div>
      </div>
      <div className="mt-3">
        <label className="block text-xs font-semibold text-slate-500 mb-1">
          Approved Resolution Notes
        </label>
        <textarea
          rows={3}
          value={form.resolution_notes}
          onChange={(e) =>
            setForm({ ...form, resolution_notes: e.target.value })
          }
          placeholder="Document the verified fix so it can be indexed into the knowledge base…"
          className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal/40"
        />
      </div>

      <div className="flex justify-end mt-3">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onApprove(gap.gap_id, {
              category: form.category,
              resolution_notes: form.resolution_notes,
              tags: form.tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            });
            setBusy(false);
          }}
          className="flex items-center gap-2 font-semibold px-5 py-2 rounded-lg bg-teal hover:bg-tealdark text-white transition disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 spin" />
          ) : (
            <Database className="w-4 h-4" />
          )}
          Approve &amp; Index into Knowledge Base
        </button>
      </div>
    </div>
  );
}

function GapQueue() {
  const { showToast } = useApp();
  const [gaps, setGaps] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { gaps: g } = await adminGaps();
      setGaps(g);
    } catch (err) {
      if (
        !(err instanceof ApiError && (err.status === 401 || err.status === 403))
      ) {
        showToast(`Failed to load gaps: ${err.message}`, "error");
      }
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function onApprove(gapId, body) {
    try {
      await approveGap(gapId, body);
      showToast("Approved and indexed into the knowledge base", "success");
      setGaps((g) => g.filter((x) => x.gap_id !== gapId));
    } catch (err) {
      showToast(`Approve failed: ${err.message}`, "error");
    }
  }

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 spin text-teal" />
      </div>
    );

  if (gaps.length === 0)
    return (
      <div className="text-sm text-slate-400 py-16 text-center">
        No open knowledge gaps. The knowledge base is fully covered.
      </div>
    );

  return (
    <div className="space-y-4">
      {gaps.map((g) => (
        <GapRow key={g.gap_id} gap={g} onApprove={onApprove} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Team & Access Management                                            */
/* ------------------------------------------------------------------ */

function TeamManagement() {
  const { user, showToast } = useApp();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await adminUsers());
    } catch (err) {
      if (
        !(err instanceof ApiError && (err.status === 401 || err.status === 403))
      ) {
        showToast(`Failed to load team: ${err.message}`, "error");
      }
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function promote(u) {
    setActingId(u.id);
    try {
      await promoteUser(u.id);
      showToast(`${u.full_name} is now an Admin`, "success");
      await load();
    } catch (err) {
      showToast(`Promote failed: ${err.message}`, "error");
    } finally {
      setActingId(null);
    }
  }

  async function kick(u) {
    if (
      !window.confirm(
        `Revoke access for ${u.full_name} (${u.email})? They will be logged out immediately.`,
      )
    )
      return;
    setActingId(u.id);
    try {
      await kickUser(u.id);
      showToast(`${u.full_name}'s access revoked`, "success");
      await load();
    } catch (err) {
      showToast(`Kick failed: ${err.message}`, "error");
    } finally {
      setActingId(null);
    }
  }

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 spin text-teal" />
      </div>
    );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-3">Name</th>
            <th className="text-left px-4 py-3">Email</th>
            <th className="text-left px-4 py-3">Role</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-right px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {users.map((u) => {
            const isSelf = u.id === user?.id;
            const active = u.is_active === 1;
            const isAgent = u.role === "agent";
            return (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold text-navy">
                  {u.full_name}
                  {isSelf && (
                    <span className="text-slate-400 font-normal"> (You)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      u.role === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {u.role === "admin" ? "Admin" : "Agent"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {active ? "Active" : "Revoked"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {active && isAgent && !isSelf ? (
                      <>
                        <button
                          onClick={() => promote(u)}
                          disabled={actingId === u.id}
                          className="flex items-center gap-1 text-xs font-semibold border border-teal/40 text-teal px-2.5 py-1.5 rounded-md hover:bg-teal hover:text-white transition disabled:opacity-50"
                        >
                          <ShieldPlus className="w-3.5 h-3.5" /> Make Admin
                        </button>
                        <button
                          onClick={() => kick(u)}
                          disabled={actingId === u.id}
                          className="flex items-center gap-1 text-xs font-semibold border border-rose-300 text-rose-600 px-2.5 py-1.5 rounded-md hover:bg-rose-600 hover:text-white transition disabled:opacity-50"
                        >
                          <UserX className="w-3.5 h-3.5" /> Kick Agent
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Admin Console shell                                                 */
/* ------------------------------------------------------------------ */

export default function Admin() {
  const [section, setSection] = useState("gaps"); // "gaps" | "team"

  const tabs = [
    { key: "gaps", label: "Knowledge-Gap Review", Icon: Layers },
    { key: "team", label: "Team & Access Management", Icon: Users },
  ];

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy">Admin Console</h1>
        <p className="text-sm text-slate-500">
          Review low-confidence knowledge gaps and manage team access.
        </p>
      </div>

      <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50">
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition ${
              section === key
                ? "bg-teal text-white shadow-sm"
                : "text-slate-600 hover:text-navy"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {section === "gaps" ? <GapQueue /> : <TeamManagement />}
    </div>
  );
}
