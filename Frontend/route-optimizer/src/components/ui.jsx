/** Small shared UI primitives used across the planner, fleet, orders and settings screens. */
import { TbLoader2, TbX } from "react-icons/tb";

export function Card({ title, subtitle, actions, children, className = "" }) {
  return (
    <div className={`bg-white rounded-xl border border-emerald-100 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-emerald-50">
          <div>
            {title && <h3 className="font-semibold text-emerald-900">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Button({
  children, onClick, type = "button", variant = "primary", size = "md",
  disabled = false, loading = false, icon, className = "", title,
}) {
  const variants = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300",
    secondary: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200",
    ghost: "text-gray-600 hover:bg-gray-100",
    danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300",
    outline: "border border-gray-300 text-gray-700 hover:bg-gray-50",
  };
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-5 py-2.5 text-base" };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors
                  disabled:cursor-not-allowed disabled:opacity-70 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? <TbLoader2 className="animate-spin" size={16} /> : icon}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="block text-xs font-medium text-gray-700 mb-1">{label}</span>}
      {children}
      {hint && !error && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
      {error && <span className="block text-[11px] text-rose-600 mt-1">{error}</span>}
    </label>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white " +
  "focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 " +
  "disabled:bg-gray-100 disabled:text-gray-500";

export function TextInput({ value, onChange, className = "", ...props }) {
  return (
    <input
      {...props}
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
      className={`${inputClass} ${className}`}
    />
  );
}

export function NumberInput({ value, onChange, className = "", ...props }) {
  return (
    <input
      {...props}
      type="number"
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value === "" ? "" : Number(e.target.value))}
      className={`${inputClass} ${className}`}
    />
  );
}

export function Select({ value, onChange, children, className = "", ...props }) {
  return (
    <select
      {...props}
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
      className={`${inputClass} ${className}`}
    >
      {children}
    </select>
  );
}

export function Toggle({ label, description, checked, onChange, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors
                    focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2
                    disabled:opacity-50 ${checked ? "bg-emerald-600" : "bg-gray-300"}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                      ${checked ? "translate-x-6" : "translate-x-1"}`}
        />
      </button>
    </div>
  );
}

export function Chip({ children, tone = "emerald", className = "" }) {
  const tones = {
    emerald: "bg-emerald-100 text-emerald-800",
    blue: "bg-blue-100 text-blue-800",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-800",
    slate: "bg-slate-100 text-slate-700",
    violet: "bg-violet-100 text-violet-800",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium
                      ${tones[tone] || tones.slate} ${className}`}>
      {children}
    </span>
  );
}

export function StatTile({ icon, label, value, hint, tone = "emerald" }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone] || tones.slate}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</span>
        {icon}
      </div>
      <div className="text-xl font-bold mt-1 text-gray-900">{value}</div>
      {hint && <div className="text-[11px] mt-0.5 opacity-80">{hint}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      {icon && <div className="text-emerald-300 mb-3">{icon}</div>}
      <h3 className="text-base font-semibold text-emerald-900">{title}</h3>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
      <TbLoader2 className="animate-spin" size={18} /> {label}
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer, width = "max-w-lg" }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${width} max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-emerald-900">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100" aria-label="Close">
            <TbX size={20} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Table({ columns, rows, empty = "No records", renderRow }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-emerald-50/70 text-emerald-900">
            {columns.map((column) => (
              <th key={column} className="p-3 text-left font-semibold whitespace-nowrap">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-6 text-center text-gray-400">{empty}</td>
            </tr>
          ) : (
            rows.map(renderRow)
          )}
        </tbody>
      </table>
    </div>
  );
}
