import { useState } from "react";
import { Loader2, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { useApp } from "../context/AppContext.jsx";

export default function Login() {
  const { login, registerAgent, authAlert } = useApp();
  const [tab, setTab] = useState("signin"); // "signin" | "register"
  const [form, setForm] = useState({ email: "", full_name: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (tab === "signin") {
        await login(form.email, form.password);
      } else {
        if (!form.full_name.trim()) throw new Error("Full name is required.");
        await registerAgent(form.email, form.full_name, form.password);
      }
      // On success the app re-renders into the authed shell automatically.
    } catch (err) {
      setError(err.detail || err.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  function quickFill(role) {
    setTab("signin");
    setError(null);
    setForm({
      email: role === "admin" ? "admin@solari.io" : "agent@solari.io",
      full_name: "",
      password: role === "admin" ? "admin123" : "agent123",
    });
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-teal flex items-center justify-center font-extrabold text-white text-lg">
            S
          </div>
          <div className="leading-tight text-center">
            <div className="font-extrabold text-navy text-xl tracking-tight">
              Solari Analytics
            </div>
            <div className="text-xs text-slate-500">Support Agent-Assist</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          {/* Tabs */}
          <div className="grid grid-cols-2">
            {[
              { key: "signin", label: "Sign In", Icon: LogIn },
              {
                key: "register",
                label: "Register Agent Account",
                Icon: UserPlus,
              },
            ].map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => {
                  setTab(key);
                  setError(null);
                }}
                className={`flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition ${
                  tab === key
                    ? "bg-navy text-white"
                    : "bg-slate-50 text-slate-500 hover:text-navy"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="p-6">
            {authAlert && (
              <div className="mb-4 text-sm bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2">
                {authAlert}
              </div>
            )}
            {error && (
              <div className="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {tab === "register" && (
              <div className="mb-3">
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Full Name
                </label>
                <input
                  value={form.full_name}
                  onChange={set("full_name")}
                  placeholder="Jane Doe"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal/40"
                />
              </div>
            )}

            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Work Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={set("email")}
                placeholder="you@solari.io"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal/40"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Password
              </label>
              <input
                type="password"
                value={form.password}
                onChange={set("password")}
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal/40"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-teal hover:bg-tealdark text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 spin" />
              ) : tab === "signin" ? (
                <LogIn className="w-4 h-4" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              {tab === "signin" ? "Sign In" : "Create Agent Account"}
            </button>

            {tab === "signin" && (
              <div className="mt-5">
                <div className="text-[11px] uppercase tracking-wide text-slate-400 text-center mb-2">
                  Quick Fill Demo Credentials
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => quickFill("admin")}
                    className="flex items-center justify-center gap-1.5 text-xs font-semibold border border-slate-300 rounded-lg py-2 hover:bg-slate-50 transition"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-teal" />
                    Fill Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => quickFill("agent")}
                    className="flex items-center justify-center gap-1.5 text-xs font-semibold border border-slate-300 rounded-lg py-2 hover:bg-slate-50 transition"
                  >
                    <LogIn className="w-3.5 h-3.5 text-slate-500" />
                    Fill Agent
                  </button>
                </div>
                <div className="text-[11px] text-slate-400 text-center mt-2">
                  admin@solari.io · agent@solari.io
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
