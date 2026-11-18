import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import { X, Plus } from 'lucide-react'
import type { CorridorData } from './types'
import { PILLARS, fiveYr, fmtPct } from './lib'
import { Badge, Card, RangeBar, SectionLabel } from './ui'

const COLORS = ['#22d3ee', '#f59e0b', '#a78bfa']

interface Props { data: CorridorData; scenario: string; scores: Record<string, number>; ranked: string[]; compare: string[]; toggleCompare: (id: string) => void; openOnMap: (id: string) => void }

export default function CompareView({ data, scenario, scores, ranked, compare, toggleCompare, openOnMap }: Props) {
  const res = data.scenario_results[scenario]
  const byId = Object.fromEntries(data.corridors.map(c => [c.id, c]))
  const chosen = compare.map(id => byId[id])
  const radar = PILLARS.map(p => ({ pillar: p.label, ...Object.fromEntries(compare.map(id => [id, Math.round(res[id].pillars[p.key])])) }))
  const rows: [string, (id: string) => string][] = [
    ['Radar score', id => scores[id].toFixed(0)],
    ['Rank', id => `#${ranked.indexOf(id) + 1}`],
    ['P50 growth / yr', id => fmtPct(res[id].p50)],
    ['5-yr range (P10–P90)', id => `${fmtPct(fiveYr(res[id].p10), 0)}–${fmtPct(fiveYr(res[id].p90), 0)}`],
    ['Nearest catalyst', id => `${byId[id].nearby_infra[0].name.split(' – ')[0].split(' (')[0].replace(' Multimodal Corridor', ' corridor').replace(' widening', '')} · ${byId[id].nearby_infra[0].km.toFixed(0)} km`],
    ['Top positive driver', id => byId[id].shap.find(s => s.value > 0)?.label ?? '—'],
    ['Top drag', id => byId[id].shap.find(s => s.value < 0)?.label ?? '—'],
    ['OSM amenities (20 km)', id => byId[id].osm.poi.toLocaleString('en-IN')],
    ['Tourism growth used', id => `${fmtPct(byId[id].tourism.growth_used * 100, 0)} (${byId[id].tourism.kind})`],
    ['Indicative price (synthetic)', id => `₹${byId[id].land_price_synthetic.toLocaleString('en-IN')}/sq ft`],
  ]
  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-2xl font-semibold tracking-tight text-white">Compare corridors</h1><p className="mt-1 text-sm text-slate-400">Pick up to three markets. Uses the current scenario and weights.</p></div>
          <div className="flex flex-wrap gap-1.5 max-w-xl">
            {ranked.map(id => { const on = compare.includes(id); const i = compare.indexOf(id); return (
              <button key={id} onClick={() => toggleCompare(id)} disabled={!on && compare.length >= 3}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 transition-all active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed ${on ? 'text-white' : 'text-slate-300 ring-white/10 hover:bg-white/5'}`}
                style={on ? { background: COLORS[i] + '22', boxShadow: `inset 0 0 0 1px ${COLORS[i]}88` } : undefined}>
                {on ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}{byId[id].name.split(' (')[0]}
              </button>) })}
          </div>
        </div>

        {chosen.length === 0 ? (
          <Card className="p-12 text-center text-slate-400 text-sm">Select corridors above to compare them side by side.</Card>
        ) : (<>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${chosen.length}, minmax(0, 1fr))` }}>
            {chosen.map((c, i) => (
              <Card key={c.id} className="p-5 transition-colors hover:border-white/15">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} /><h3 className="truncate font-semibold text-white">{c.name}</h3></div><p className="mt-0.5 text-xs text-slate-400">{c.state}</p></div>
                  <span className="text-2xl font-semibold tabular-nums text-white">{scores[c.id].toFixed(0)}</span>
                </div>
                <div className="mt-5 text-[11px] text-slate-400">5-yr appreciation · P50 <span className="text-white font-medium">{fmtPct(fiveYr(res[c.id].p50), 0)}</span></div>
                <div className="mt-2.5"><RangeBar p10={fiveYr(res[c.id].p10)} p50={fiveYr(res[c.id].p50)} p90={fiveYr(res[c.id].p90)} max={250} color={COLORS[i]} /></div>
                <div className="mt-4 flex items-center justify-between">{c.hoabl ? <Badge tone="violet">HoABL market</Badge> : <span />}<button onClick={() => openOnMap(c.id)} className="text-xs text-cyan-300 hover:text-cyan-200 transition-colors">Open on map →</button></div>
              </Card>))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <Card className="p-5">
              <SectionLabel>Pillar profile</SectionLabel>
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radar} outerRadius="72%">
                    <PolarGrid stroke="rgba(148,163,184,.18)" />
                    <PolarAngleAxis dataKey="pillar" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    {compare.map((id, i) => <Radar key={id} name={byId[id].name} dataKey={id} stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.18} strokeWidth={2} isAnimationActive animationDuration={500} />)}
                    <Tooltip contentStyle={{ background: 'rgba(10,15,30,.95)', border: '1px solid rgba(148,163,184,.2)', borderRadius: 10, fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-5 overflow-x-auto">
              <SectionLabel>Side by side</SectionLabel>
              <table className="w-full text-xs">
                <tbody>
                  {rows.map(([k, f]) => (
                    <tr key={k} className="border-b border-white/[0.05] last:border-0">
                      <td className="py-2.5 pr-3 text-slate-400 whitespace-nowrap align-top">{k}</td>
                      {compare.map((id, i) => <td key={id} className="py-2.5 px-2 text-slate-100 tabular-nums align-top"><span className="inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle" style={{ background: COLORS[i] }} />{f(id)}</td>)}
                    </tr>))}
                </tbody>
              </table>
            </Card>
          </div>
        </>)}
      </div>
    </div>
  )
}
