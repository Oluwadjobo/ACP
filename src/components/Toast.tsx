import { type ReactNode } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastProps {
  type: ToastType;
  message: string;
}

const config: Record<ToastType, { icon: typeof CheckCircle2; color: string; bg: string }> = {
  success: { icon: CheckCircle2, color: "text-accent-600", bg: "bg-accent-50 border-accent-200" },
  error: { icon: XCircle, color: "text-error-600", bg: "bg-error-50 border-error-200" },
  warning: { icon: AlertTriangle, color: "text-warning-600", bg: "bg-warning-50 border-warning-200" },
  info: { icon: Info, color: "text-primary-600", bg: "bg-primary-50 border-primary-200" },
};

export function Toast({ type, message }: ToastProps) {
  const { icon: Icon, color, bg } = config[type];
  return (
    <div className={`fixed top-4 left-1/2 z-[60] -translate-x-1/2 animate-slide-up`}>
      <div className={`flex items-center gap-3 rounded-xl border ${bg} px-5 py-3 shadow-lg max-w-sm`}>
        <Icon size={20} className={color} />
        <p className="text-sm font-medium text-gray-800">{message}</p>
      </div>
    </div>
  );
}

export function toastContainer(toasts: { id: number; type: ToastType; message: string }[]) {
  return (
    <div className="fixed top-4 left-1/2 z-[60] -translate-x-1/2 flex flex-col gap-2">
      {toasts.map((t) => (
        <Toast key={t.id} type={t.type} message={t.message} />
      ))}
    </div>
  );
}
