import type { ReactNode } from 'react'

export function Badge({ children, tone = 'slate', title }: { children: ReactNode; tone?: 'slate' | 'cyan' | 'amber' | 'emerald' | 'rose' | 'violet'; title?: string }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-500/10 text-slate-300 ring-slate-400/20',
    cyan: 'bg-cyan-400/10 text-cyan-300 ring-cyan-400/25',
    amber: 'bg-amber-400/10 text-amber-300 ring-amber-400/25',
    emerald: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25',
    rose: 'bg-rose-400/10 text-rose-300 ring-rose-400/25',
    violet: 'bg-violet-400/10 text-violet-300 ring-violet-400/25',
  }
  return <span title={title} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide ring-1 ring-inset whitespace-nowrap ${tones[tone]}`}>{children}</span>
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <div className="flex items-center justify-between mb-2.5"><h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{children}</h3>{right}</div>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-white/[0.07] bg-white/[0.025] ${className}`}>{children}</div>
}

export function ScoreRing({ value, size = 64, stroke = 6 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="-rotate-90">
      <defs><linearGradient id="ringg" x1="0" x2="1"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#f59e0b" /></linearGradient></defs>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(148,163,184,.15)" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke="url(#ringg)" strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} style={{ transition: 'stroke-dashoffset .7s cubic-bezier(.2,.8,.2,1)' }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="rotate-90 origin-center fill-white font-semibold" style={{ fontSize: size * 0.3 }}>{Math.round(value)}</text>
    </svg>
  )
}

/** P10–P90 range bar with a P50 marker, on a fixed 0..max axis */
export function RangeBar({ p10, p50, p90, max = 200, color = '#22d3ee' }: { p10: number; p50: number; p90: number; max?: number; color?: string }) {
  const pos = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`
  return (
    <div className="relative h-2 rounded-full bg-white/[0.06]">
      <div className="absolute inset-y-0 rounded-full transition-all duration-700" style={{ left: pos(p10), width: `calc(${pos(p90)} - ${pos(p10)})`, background: `linear-gradient(90deg, ${color}55, ${color})` }} />
      <div className="absolute -top-1 h-4 w-[3px] rounded bg-white shadow-[0_0_8px_rgba(255,255,255,.8)] transition-all duration-700" style={{ left: `calc(${pos(p50)} - 1.5px)` }} />
    </div>
  )
}

export function Bar({ value, max = 100, color = 'from-cyan-400 to-cyan-300' }: { value: number; max?: number; color?: string }) {
  return <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden"><div className={`h-full rounded-full bg-gradient-to-r ${color} transition-[width] duration-500 ease-out`} style={{ width: `${Math.max(2, (value / max) * 100)}%` }} /></div>
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-white/[0.06] ${className}`} />
}
