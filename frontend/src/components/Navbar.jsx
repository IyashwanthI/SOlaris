import { NavLink } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Gauge,
  LogOut,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useApp } from "../context/AppContext.jsx";

export default function Navbar() {
  const { user, isAdmin, latencyMs, stats, logout } = useApp();
  const total = stats.up + stats.down;

  const tabs = [
    { to: "/workspace", label: "Agent Workspace", Icon: Sparkles, show: true },
    { to: "/benchmark", label: "Eval Benchmark", Icon: BarChart3, show: true },
    { to: "/admin", label: "Admin Console", Icon: ShieldCheck, show: isAdmin },
  ].filter((t) => t.show);

  return (
    <header className="bg-navy text-white shadow-lg sticky top-0 z-30">
      <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal flex items-center justify-center font-extrabold">
              S
            </div>
            <div className="leading-tight">
              <div className="font-extrabold tracking-tight">
                Solari Analytics
              </div>
              <div className="text-[11px] text-slate-300 -mt-0.5">
                Agent-Assist &amp; Resolution Intelligence
              </div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {tabs.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-slate-300 hover:text-white hover:bg-white/5"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden xl:inline-flex items-center gap-1.5 bg-navydark/60 border border-white/10 text-slate-200 text-xs font-medium px-3 py-1.5 rounded-full">
            <Gauge className="w-3.5 h-3.5 text-teal" />
            {latencyMs != null ? `${latencyMs} ms` : "retrieval idle"}
          </span>

          <span className="hidden xl:inline-flex items-center gap-1.5 bg-teal/15 border border-teal/40 text-teal-50 text-xs font-semibold px-3 py-1.5 rounded-full">
            <Activity className="w-3.5 h-3.5" />
            {stats.precision_pct}% Helpful ({stats.up}/{total})
          </span>

          {/* User identity + role badge */}
          <div className="flex items-center gap-2 pl-2 border-l border-white/10">
            <div className="text-right leading-tight hidden sm:block">
              <div className="text-sm font-semibold">{user?.full_name}</div>
              <div className="text-[11px] text-slate-400">{user?.email}</div>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isAdmin
                  ? "bg-purple-500/20 text-purple-200 border border-purple-400/40"
                  : "bg-slate-500/20 text-slate-200 border border-slate-400/30"
              }`}
            >
              {isAdmin ? "ADMIN" : "AGENT"}
            </span>
            <button
              onClick={() => logout()}
              title="Logout"
              className="flex items-center gap-1.5 text-sm bg-navydark hover:bg-black/30 border border-white/15 rounded-lg px-3 py-2 transition"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
