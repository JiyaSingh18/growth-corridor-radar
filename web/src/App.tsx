import { useCallback, useEffect, useMemo, useState } from 'react'
import { Radar as RadarIcon, GitCompareArrows, BookOpen } from 'lucide-react'
import type { CorridorData, HexData, ModelData, PillarKey } from './types'
import { composite, DEFAULT_WEIGHTS } from './lib'
import MapView, { type HexRow } from './MapView'
import RadarView from './RadarView'
import CompareView from './CompareView'
import MethodologyView from './MethodologyView'
import { Badge, Skeleton } from './ui'

type Tab = 'radar' | 'compare' | 'methodology'
const TABS: { id: Tab; label: string; icon: typeof RadarIcon }[] = [
  { id: 'radar', label: 'Radar', icon: RadarIcon }, { id: 'compare', label: 'Compare', icon: GitCompareArrows }, { id: 'methodology', label: 'Methodology', icon: BookOpen },
]
const readTab = (): Tab => { const h = window.location.hash.replace('#/', '').replace('#', ''); return (TABS.some(t => t.id === h) ? h : 'radar') as Tab }

export default function App() {
  const [data, setData] = useState<CorridorData | null>(null)
  const [hexData, setHexData] = useState<HexData | null>(null)
  const [model, setModel] = useState<ModelData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>(readTab)
  const [scenario, setScenario] = useState('baseline')
  const [weights, setWeights] = useState<Record<PillarKey, number>>(DEFAULT_WEIGHTS)
  const [selected, setSelected] = useState<string | null>(null)
  const [compare, setCompare] = useState<string[]>([])

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    const get = (f: string) => fetch(`${base}data/${f}`).then(r => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.json() })
    Promise.all([get('corridors.json'), get('hexes.json'), get('model.json')])
      .then(([c, h, m]) => { setData(c); setHexData(h); setModel(m); setCompare(c.corridors.filter((x: { hoabl: boolean }) => x.hoabl).slice(0, 3).map((x: { id: string }) => x.id)) })
      .catch(e => setError(String(e)))
  }, [])
  useEffect(() => { const f = () => setTab(readTab()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f) }, [])
  const go = useCallback((t: Tab) => { window.location.hash = `/${t}`; setTab(t) }, [])

  const scores = useMemo(() => {
    if (!data) return {} as Record<string, number>
    const res = data.scenario_results[scenario]
    return Object.fromEntries(data.corridors.map(c => [c.id, composite(res[c.id], weights)]))
  }, [data, scenario, weights])
  const ranked = useMemo(() => Object.keys(scores).sort((a, b) => scores[b] - scores[a]), [scores])

  const hexes: HexRow[] = useMemo(() => {
    if (!hexData || !data) return []
    const col = hexData.columns.indexOf(`p50_${scenario}`)
    const mm: Record<string, [number, number]> = {}
    for (const r of hexData.rows) { const c = r[1] as string, v = r[col] as number; const m = mm[c] ?? [Infinity, -Infinity]; mm[c] = [Math.min(m[0], v), Math.max(m[1], v)] }
    return hexData.rows.map(r => {
      const c = r[1] as string, v = r[col] as number, [lo, hi] = mm[c]
      const local = hi > lo ? (v - lo) / (hi - lo) : 0.5
      return { h: r[0] as string, c, v: (scores[c] ?? 0) * (0.45 + 0.55 * local), local: v }
    })
  }, [hexData, data, scenario, scores])

  const toggleCompare = (id: string) => setCompare(c => c.includes(id) ? c.filter(x => x !== id) : c.length >= 3 ? [...c.slice(1), id] : [...c, id])

  return (
    <div className="flex h-full flex-col">
      <header className="relative z-20 flex h-14 shrink-0 items-center gap-4 border-b border-white/[0.06] bg-[#070b16]/90 px-4 backdrop-blur-xl">
        <a href="#/radar" onClick={() => setSelected(null)} className="flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} className="h-7 w-7" alt="" />
          <span className="text-[15px] font-semibold tracking-tight text-white">Growth Corridor <span className="bg-gradient-to-r from-cyan-300 to-amber-300 bg-clip-text text-transparent">Radar</span></span>
        </a>
        <nav className="ml-2 flex items-center gap-0.5 rounded-lg bg-white/[0.04] p-0.5 ring-1 ring-white/[0.06]">
          {TABS.map(t => (
            <button key={t.id} onClick={() => go(t.id)} className={`relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] transition-all ${tab === t.id ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
              <t.icon className="h-3.5 w-3.5" /><span className="max-sm:hidden">{t.label}</span>{t.id === 'compare' && compare.length > 0 && <span className="ml-0.5 rounded bg-cyan-400/20 px-1 text-[10px] text-cyan-200 tabular-nums">{compare.length}</span>}
            </button>))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="max-md:hidden"><Badge tone="amber" title="Price/appreciation history used to train the model is synthetic. Infra, OSM and tourism inputs are real.">Synthetic price target · real signals</Badge></span>
          <a href="https://github.com/JiyaSingh18/growth-corridor-radar" target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white transition-colors" aria-label="GitHub repository"><svg viewBox="0 0 16 16" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg></a>
        </div>
      </header>

      <main className="relative flex-1 min-h-0">
        {error ? (
          <div className="grid h-full place-items-center text-sm text-rose-300">Could not load data ({error}). Please refresh.</div>
        ) : !data || !model || !hexData ? (
          <div className="relative h-full">
            <div className="absolute inset-0 grid place-items-center"><div className="relative h-28 w-28"><div className="absolute inset-0 rounded-full border border-cyan-400/20" /><div className="absolute inset-4 rounded-full border border-cyan-400/15" /><div className="absolute inset-0 rounded-full animate-spin [animation-duration:2s] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(34,211,238,.35)_60deg,transparent_61deg)]" /></div><p className="absolute mt-44 text-xs tracking-wide text-slate-500">Loading corridors…</p></div>
            <div className="absolute left-4 top-4 w-[300px] space-y-3 max-lg:hidden"><Skeleton className="h-10" /><Skeleton className="h-64" /></div>
            <div className="absolute right-4 top-4 w-[380px] space-y-2 max-lg:hidden">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
          </div>
        ) : (<>
          <div className={`absolute inset-0 overflow-y-auto lg:overflow-hidden ${tab === 'radar' ? '' : 'invisible pointer-events-none'}`} aria-hidden={tab !== 'radar'}>
            <div className="relative h-full max-lg:h-[58vh]">
              <MapView corridors={data.corridors} infra={data.infra} hexes={hexes} scores={scores} selected={selected} onSelect={setSelected} predYear={data.pred_year} />
            </div>
            <div className="pointer-events-none lg:absolute lg:inset-0">
              <RadarView data={data} scenario={scenario} setScenario={setScenario} weights={weights} setWeights={setWeights} scores={scores} ranked={ranked}
                selected={selected} setSelected={setSelected} compare={compare} toggleCompare={toggleCompare} />
            </div>
          </div>
          {tab === 'compare' && <div className="absolute inset-0 bg-[#070b16] animate-[fadein_.3s_ease-out]"><CompareView data={data} scenario={scenario} scores={scores} ranked={ranked} compare={compare} toggleCompare={toggleCompare} openOnMap={id => { setSelected(id); go('radar') }} /></div>}
          {tab === 'methodology' && <div className="absolute inset-0 bg-[#070b16] animate-[fadein_.3s_ease-out]"><MethodologyView data={data} model={model} /></div>}
        </>)}
      </main>
    </div>
  )
}
