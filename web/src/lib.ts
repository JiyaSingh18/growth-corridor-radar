import type { PillarKey, ScenarioResult } from './types'

export const PILLARS: { key: PillarKey; label: string; hint: string; synthetic?: boolean; proxy?: boolean }[] = [
  { key: 'forecast', label: 'ML forecast', hint: 'Gradient-boosting P50 5-yr CAGR (trained on a synthetic target)', synthetic: true },
  { key: 'catalyst', label: 'New-infra catalyst', hint: 'Proximity × timing of airports, sea links, expressways, ports' },
  { key: 'infrastructure', label: 'Existing infrastructure', hint: 'OpenStreetMap amenities, major-road km, rail, schools & hospitals' },
  { key: 'demand', label: 'Tourism demand', hint: 'Published footfall growth (Ayodhya, Mathura, Goa) or proxy' },
  { key: 'activity', label: 'Night-lights growth', hint: 'Economic activity proxy (VIIRS-style, documented estimate)', proxy: true },
  { key: 'affordability', label: 'Affordability headroom', hint: 'Inverse of indicative land price (synthetic)', synthetic: true },
]
export const DEFAULT_WEIGHTS: Record<PillarKey, number> = { forecast: 35, catalyst: 25, infrastructure: 12, demand: 12, activity: 8, affordability: 8 }

export function composite(r: ScenarioResult, w: Record<PillarKey, number>) {
  let s = 0, t = 0
  for (const p of PILLARS) { s += (w[p.key] ?? 0) * r.pillars[p.key]; t += w[p.key] ?? 0 }
  return t > 0 ? s / t : 0
}
export const fiveYr = (cagr: number) => (Math.pow(1 + cagr / 100, 5) - 1) * 100

// magma-like ramp
const RAMP: [number, number, number][] = [[24, 15, 61], [80, 18, 123], [182, 54, 121], [251, 136, 97], [252, 210, 120], [254, 250, 200]]
export function ramp(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(x)), f = x - i
  const a = RAMP[i], b = RAMP[i + 1]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}
export const rgb = (c: number[]) => `rgb(${c.map(Math.round).join(',')})`
export const fmtPct = (v: number, d = 1) => `${v >= 0 ? '' : '−'}${Math.abs(v).toFixed(d)}%`
