import { CheckCircle2, Info, XCircle } from "lucide-react";
import { useApp } from "../context/AppContext.jsx";

const VARIANTS = {
  info: { bg: "bg-navy", Icon: Info },
  success: { bg: "bg-teal", Icon: CheckCircle2 },
  error: { bg: "bg-rose-600", Icon: XCircle },
};

export default function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  const { bg, Icon } = VARIANTS[toast.variant] || VARIANTS.info;

  return (
    <div className="fixed bottom-6 right-6 z-50 fade-in">
      <div
        className={`${bg} text-white px-5 py-3 rounded-lg shadow-xl flex items-center gap-2.5 max-w-sm`}
      >
        <Icon className="w-5 h-5 shrink-0" />
        <span className="text-sm font-medium">{toast.message}</span>
      </div>
    </div>
  );
}
