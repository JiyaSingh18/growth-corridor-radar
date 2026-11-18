import { ArrowLeft, Plus, Check, Plane, Waypoints, Ship, TrainFront, Landmark, Building2, Info } from 'lucide-react'
import type { Corridor, ScenarioResult, PillarKey } from './types'
import { PILLARS, fiveYr, fmtPct } from './lib'
import { Badge, Bar, Card, RangeBar, ScoreRing, SectionLabel } from './ui'

const KIND_ICON: Record<string, typeof Plane> = { airport: Plane, expressway: Waypoints, highway: Waypoints, 'sea-link': Waypoints, port: Ship, rail: TrainFront, landmark: Landmark, sez: Building2 }

interface Props { c: Corridor; r: ScenarioResult; base: ScenarioResult; score: number; rank: number; total: number; weights: Record<PillarKey, number>; predYear: number
  onBack: () => void; inCompare: boolean; onToggleCompare: () => void }

export default function FactSheet({ c, r, base, score, rank, total, predYear, onBack, inCompare, onToggleCompare }: Props) {
  const maxAbs = Math.max(...c.shap.map(s => Math.abs(s.value)), 0.01)
  const delta = r.p50 - base.p50
  return (
    <div className="flex h-full flex-col animate-[fadein_.35s_ease-out]">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.06]">
        <button data-testid="back" onClick={onBack} className="group inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"><ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> All corridors</button>
        <button onClick={onToggleCompare} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ring-1 transition-all active:scale-95 ${inCompare ? 'bg-cyan-400/15 text-cyan-200 ring-cyan-400/40' : 'text-slate-300 ring-white/10 hover:bg-white/5'}`}>
          {inCompare ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />} {inCompare ? 'In compare' : 'Compare'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 space-y-5">
        <div className="flex items-center gap-4">
          <ScoreRing value={score} size={68} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap"><h2 className="text-lg font-semibold text-white leading-tight">{c.name}</h2>{c.hoabl && <Badge tone="violet" title="HoABL has an active project in this market">HoABL market</Badge>}</div>
            <p className="text-xs text-slate-400 mt-0.5">{c.state} · Rank <span className="text-slate-200 font-medium">#{rank}</span> of {total}</p>
          </div>
        </div>

        <Card className="p-4">
          <SectionLabel right={<Badge tone="amber" title="The model was trained on a synthetic, calibrated target. Treat as illustrative.">Synthetic-trained</Badge>}>5-yr appreciation · {predYear}–{String(predYear + 5).slice(2)}</SectionLabel>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight text-white tabular-nums">{fmtPct(fiveYr(r.p50), 0)}</span>
            <span className="text-xs text-slate-400">P50 · {fmtPct(r.p50)} / yr</span>
            {Math.abs(delta) > 0.05 && <span className={`ml-auto text-xs font-medium tabular-nums ${delta > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)} pp vs baseline</span>}
          </div>
          <div className="mt-4"><RangeBar p10={fiveYr(r.p10)} p50={fiveYr(r.p50)} p90={fiveYr(r.p90)} max={250} /></div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-400 tabular-nums"><span>P10 {fmtPct(fiveYr(r.p10), 0)}</span><span>80% interval</span><span>P90 {fmtPct(fiveYr(r.p90), 0)}</span></div>
        </Card>

        <div>
          <SectionLabel>Score breakdown</SectionLabel>
          <div className="space-y-2.5">
            {PILLARS.map(p => (
              <div key={p.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                <span className="text-xs text-slate-300 flex items-center gap-1.5">{p.label}{p.synthetic && <span className="text-[9px] text-amber-300/90">SYN</span>}{p.proxy && <span className="text-[9px] text-amber-300/90">PROXY</span>}</span>
                <span className="text-xs tabular-nums text-slate-400">{Math.round(r.pillars[p.key])}</span>
                <div className="col-span-2"><Bar value={r.pillars[p.key]} /></div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionLabel right={<span className="text-[10px] text-slate-500" title="Mean SHAP contribution over the corridor's H3 cells, in percentage points of annual growth, relative to the model's average prediction.">SHAP · pp/yr</span>}>Why the model says so</SectionLabel>
          <div className="space-y-1.5">
            {c.shap.slice(0, 7).map(s => (
              <div key={s.feature} className="grid grid-cols-[minmax(0,1fr)_92px_46px] items-center gap-2 text-xs">
                <span className="truncate text-slate-300" title={s.label}>{s.label}</span>
                <div className="relative h-3.5">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/15" />
                  <div className={`absolute top-0.5 bottom-0.5 rounded-sm transition-all duration-500 ${s.value >= 0 ? 'bg-emerald-400/80' : 'bg-rose-400/80'}`}
                    style={s.value >= 0 ? { left: '50%', width: `${(s.value / maxAbs) * 50}%` } : { right: '50%', width: `${(-s.value / maxAbs) * 50}%` }} />
                </div>
                <span className={`text-right tabular-nums ${s.value >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{s.value >= 0 ? '+' : '−'}{Math.abs(s.value).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Average prediction {c.shap_base.toFixed(1)}%/yr; bars push this corridor up or down.</p>
        </div>

        <div>
          <SectionLabel>Nearest catalysts</SectionLabel>
          <div className="space-y-1.5">
            {c.nearby_infra.map(i => { const Icon = KIND_ICON[i.kind] ?? Waypoints; const planned = i.open > predYear; return (
              <div key={i.id} className="flex items-center gap-3 rounded-lg px-2.5 py-2 bg-white/[0.025] ring-1 ring-white/[0.05]">
                <Icon className={`h-4 w-4 shrink-0 ${planned ? 'text-amber-300' : 'text-cyan-300'}`} />
                <span className="flex-1 min-w-0 truncate text-xs text-slate-200" title={i.name}>{i.name}</span>
                <span className="text-[11px] tabular-nums text-slate-400">{i.km.toFixed(0)} km</span>
                <Badge tone={planned ? 'amber' : 'cyan'}>{planned ? `Planned ${i.open}` : `Open ${i.open}`}</Badge>
              </div>) })}
          </div>
        </div>

        <div>
          <SectionLabel>Evidence</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['OSM amenities & shops', c.osm.poi.toLocaleString('en-IN'), 'real'],
              ['Major-road km (20 km)', Math.round(c.osm.road_km).toLocaleString('en-IN'), 'real'],
              ['Rail stations', String(c.osm.rail_stations), 'real'],
              ['Schools & hospitals', String(c.osm.social), 'real'],
              ['Tourism growth used', fmtPct(c.tourism.growth_used * 100, 0) + '/yr', c.tourism.kind === 'published' ? 'real' : 'proxy'],
              ['Night-lights growth', fmtPct(c.ntl_growth_proxy * 100, 0), 'proxy'],
              ['Indicative land price', `₹${c.land_price_synthetic.toLocaleString('en-IN')}/sq ft`, 'synthetic'],
              ['Catalyst index', r.catalyst.toFixed(2), 'real'],
            ].map(([k, v, kind]) => (
              <div key={k} className={`rounded-lg p-2.5 ring-1 ring-white/[0.05] ${kind === 'synthetic' ? 'synthetic' : 'bg-white/[0.025]'}`}>
                <div className="text-[10.5px] text-slate-400 flex items-center justify-between gap-1">{k}{kind !== 'real' && <span className="text-[9px] uppercase text-amber-300/90">{kind}</span>}</div>
                <div className="mt-0.5 text-sm font-medium text-slate-100 tabular-nums">{v}</div>
              </div>
            ))}
          </div>
          {c.tourism.kind === 'published' && c.tourism.latest && <p className="mt-2 text-[11px] leading-relaxed text-slate-500 flex gap-1.5"><Info className="h-3.5 w-3.5 shrink-0 mt-px" />Footfall {c.tourism.latest[0]}: {c.tourism.latest[1]} {c.tourism.unit}. Source: {c.tourism.src?.split(' (')[0]}.</p>}
        </div>
      </div>
    </div>
  )
}
