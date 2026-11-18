import { useState } from 'react'
import { RotateCcw, SlidersHorizontal, ChevronDown, Sparkles, X } from 'lucide-react'
import type { CorridorData, PillarKey } from './types'
import { PILLARS, DEFAULT_WEIGHTS, fiveYr, ramp, rgb } from './lib'
import { Badge, SectionLabel } from './ui'
import FactSheet from './FactSheet'

interface Props {
  data: CorridorData; scenario: string; setScenario: (s: string) => void
  weights: Record<PillarKey, number>; setWeights: (w: Record<PillarKey, number>) => void
  scores: Record<string, number>; ranked: string[]; selected: string | null; setSelected: (s: string | null) => void
  compare: string[]; toggleCompare: (id: string) => void
}

const PRESETS: { name: string; w: Record<PillarKey, number> }[] = [
  { name: 'Balanced', w: DEFAULT_WEIGHTS },
  { name: 'Infra-led', w: { forecast: 15, catalyst: 50, infrastructure: 20, demand: 5, activity: 5, affordability: 5 } },
  { name: 'Tourism-led', w: { forecast: 15, catalyst: 10, infrastructure: 5, demand: 55, activity: 10, affordability: 5 } },
  { name: 'Value hunter', w: { forecast: 25, catalyst: 20, infrastructure: 5, demand: 5, activity: 10, affordability: 35 } },
]

export default function RadarView({ data, scenario, setScenario, weights, setWeights, scores, ranked, selected, setSelected, compare, toggleCompare }: Props) {
  const [controlsOpen, setControlsOpen] = useState(true)
  const res = data.scenario_results[scenario]
  const base = data.scenario_results.baseline
  const byId = Object.fromEntries(data.corridors.map(c => [c.id, c]))
  const sel = selected ? byId[selected] : null
  const ROW = 52
  const activePreset = PRESETS.find(p => PILLARS.every(k => p.w[k.key] === weights[k.key]))?.name

  return (
    <>
      {/* Controls */}
      <aside className="glass pointer-events-auto absolute left-4 top-4 z-10 w-[300px] max-h-[calc(100%-7rem)] rounded-2xl shadow-2xl flex flex-col overflow-hidden max-lg:static max-lg:w-auto max-lg:m-3 max-lg:max-h-none">
        <button onClick={() => setControlsOpen(o => !o)} className="flex shrink-0 items-center justify-between px-4 py-3 text-left" aria-expanded={controlsOpen}>
          <span className="flex items-center gap-2 text-sm font-medium text-white"><SlidersHorizontal className="h-4 w-4 text-cyan-300" /> Scenario & weights</span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${controlsOpen ? '' : '-rotate-90'}`} />
        </button>
        {controlsOpen && (
            <div className="min-h-0 flex-1 overflow-y-auto scroll-thin px-4 pb-4 space-y-5 animate-[fadein_.25s_ease-out]">
              <div>
                <SectionLabel>What if…</SectionLabel>
                <div className="space-y-1">
                  {data.scenarios.map(s => (
                    <button key={s.id} data-testid={`scenario-${s.id}`} onClick={() => setScenario(s.id)} title={s.desc}
                      className={`w-full rounded-lg px-3 py-2 text-left transition-all active:scale-[.99] ${scenario === s.id ? 'bg-cyan-400/10 ring-1 ring-cyan-400/40' : 'hover:bg-white/[0.04] ring-1 ring-transparent'}`}>
                      <div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${scenario === s.id ? 'bg-cyan-300 shadow-[0_0_8px_#22d3ee]' : 'bg-slate-600'}`} /><span className={`text-[12.5px] ${scenario === s.id ? 'text-white font-medium' : 'text-slate-300'}`}>{s.name}</span></div>
                      {scenario === s.id && <p className="mt-1 pl-3.5 text-[11px] leading-snug text-slate-400">{s.desc}</p>}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel right={<button onClick={() => setWeights(DEFAULT_WEIGHTS)} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors"><RotateCcw className="h-3 w-3" />Reset</button>}>Weights</SectionLabel>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {PRESETS.map(p => <button key={p.name} onClick={() => setWeights(p.w)} className={`rounded-md px-2 py-1 text-[11px] ring-1 transition-colors ${activePreset === p.name ? 'bg-white/10 text-white ring-white/20' : 'text-slate-400 ring-white/[0.07] hover:text-white hover:bg-white/5'}`}>{p.name}</button>)}
                </div>
                <div className="space-y-3">
                  {PILLARS.map(p => (
                    <label key={p.key} className="block" title={p.hint}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-300 flex items-center gap-1.5">{p.label}{(p.synthetic || p.proxy) && <span className="text-[9px] text-amber-300/90">{p.synthetic ? 'SYN' : 'PROXY'}</span>}</span>
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">{weights[p.key]}</span>
                      </div>
                      <input type="range" min={0} max={60} value={weights[p.key]} onChange={e => setWeights({ ...weights, [p.key]: Number(e.target.value) })} className="w-full h-1 cursor-pointer" aria-label={`${p.label} weight`} />
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-[10.5px] leading-relaxed text-slate-500 border-t border-white/[0.06] pt-3"><span className="text-amber-300/90">SYN</span> = model trained on a synthetic, calibrated price target · <span className="text-amber-300/90">PROXY</span> = documented estimate. See Methodology.</p>
            </div>
        )}
      </aside>

      {/* Ranking / fact sheet */}
      <aside className="glass pointer-events-auto absolute right-4 top-4 bottom-4 z-10 w-[380px] rounded-2xl shadow-2xl overflow-hidden max-lg:static max-lg:w-auto max-lg:m-3 max-lg:h-[640px]">
        {sel ? (
          <FactSheet key={sel.id} c={sel} r={res[sel.id]} base={base[sel.id]} score={scores[sel.id]} rank={ranked.indexOf(sel.id) + 1} total={ranked.length}
            weights={weights} predYear={data.pred_year} onBack={() => setSelected(null)} inCompare={compare.includes(sel.id)} onToggleCompare={() => toggleCompare(sel.id)} />
        ) : (
          <div className="flex h-full flex-col">
            <div className="px-5 pt-4 pb-3 border-b border-white/[0.06]">
              <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-white flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-300" />Corridor ranking</h2><Badge tone="cyan">{data.pred_year}–{data.pred_year + 5}</Badge></div>
              <p className="mt-1 text-[11.5px] text-slate-400">Live composite of six pillars. Click a corridor to fly in.</p>
              {scenario !== 'baseline' && <div className="mt-2 flex items-center justify-between rounded-lg bg-amber-400/10 px-2.5 py-1.5 text-[11px] text-amber-200 ring-1 ring-amber-400/25"><span className="truncate">Scenario: {data.scenarios.find(s => s.id === scenario)?.name}</span><button onClick={() => setScenario('baseline')} aria-label="Clear scenario"><X className="h-3.5 w-3.5" /></button></div>}
            </div>
            <div className="relative flex-1 overflow-y-auto scroll-thin">
              <div className="relative" style={{ height: ranked.length * ROW + 8 }}>
                {data.corridors.map(c => {
                  const i = ranked.indexOf(c.id); const s = scores[c.id]; const r = res[c.id]; const d = r.p50 - base[c.id].p50
                  return (
                    <button key={c.id} data-testid={`rank-${c.id}`} onClick={() => setSelected(c.id)} style={{ transform: `translateY(${i * ROW + 4}px)`, height: ROW - 4 }}
                      className="group absolute left-2 right-2 flex items-center gap-3 rounded-xl px-3 text-left transition-[transform,background-color] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] hover:bg-white/[0.05]">
                      <span className="w-5 text-[11px] font-mono text-slate-500 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                      <span className="h-8 w-1 rounded-full" style={{ background: rgb(ramp(s / 100)) }} />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5"><span className="truncate text-[13px] font-medium text-slate-100 group-hover:text-white">{c.name}</span>{c.hoabl && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" title="HoABL market" />}</span>
                        <span className="block text-[11px] text-slate-400 tabular-nums">P50 +{fiveYr(r.p50).toFixed(0)}% in 5 yrs{Math.abs(d) > 0.05 && <span className={d > 0 ? 'text-emerald-300' : 'text-rose-300'}> · {d > 0 ? '▲' : '▼'}{Math.abs(d).toFixed(1)}pp</span>}</span>
                      </span>
                      <span className="text-right"><span className="block text-[15px] font-semibold text-white tabular-nums">{s.toFixed(0)}</span><span className="block h-1 w-12 rounded-full bg-white/[0.06] overflow-hidden"><span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${s}%`, background: rgb(ramp(s / 100)) }} /></span></span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="px-5 py-2.5 border-t border-white/[0.06] text-[10.5px] text-slate-500 flex items-center gap-3"><span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" />HoABL market</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full ring-2 ring-cyan-400" />Open infra</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full ring-2 ring-amber-400" />Planned</span></div>
          </div>
        )}
      </aside>

      {/* Legend */}
      <div className="glass pointer-events-auto absolute bottom-4 left-4 z-10 rounded-xl px-3.5 py-2.5 max-lg:hidden">
        <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400 mb-1.5">Radar score · H3 cells (~5 km²)</div>
        <div className="h-2 w-48 rounded-full" style={{ background: `linear-gradient(90deg, ${[0, .2, .4, .6, .8, 1].map(t => rgb(ramp(t))).join(',')})` }} />
        <div className="mt-1 flex justify-between text-[10px] text-slate-500 tabular-nums"><span>0</span><span>50</span><span>100</span></div>
      </div>
    </>
  )
}
