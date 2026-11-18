import { useEffect, useMemo, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { FlyToInterpolator, type PickingInfo } from '@deck.gl/core'
import { H3HexagonLayer } from '@deck.gl/geo-layers'
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { Map as MapLibre } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Corridor, Infra } from './types'
import { ramp } from './lib'

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
export const INDIA_VIEW = { longitude: 77.0, latitude: 22.0, zoom: 5.0, pitch: 45, bearing: -6 }

type View = typeof INDIA_VIEW & { transitionDuration?: number; transitionInterpolator?: FlyToInterpolator }
export interface HexRow { h: string; c: string; v: number; local: number }

interface Props {
  corridors: Corridor[]; infra: Infra[]; hexes: HexRow[]; scores: Record<string, number>
  selected: string | null; onSelect: (id: string | null) => void; predYear: number
}

export default function MapView({ corridors, infra, hexes, scores, selected, onSelect, predYear }: Props) {
  const [view, setView] = useState<View>({ ...INDIA_VIEW })
  const [mapReady, setMapReady] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMapReady(true), 5000); return () => clearTimeout(t) }, [])
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024)
  useEffect(() => { const f = () => setCompact(window.innerWidth < 1024); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])

  useEffect(() => {
    const c = corridors.find(x => x.id === selected)
    const interp = new FlyToInterpolator({ speed: 1.4 })
    if (c) setView({ longitude: c.lon + (compact ? 0 : 0.12), latitude: c.lat - 0.1, zoom: 9.3, pitch: 58, bearing: -24, transitionDuration: 2200, transitionInterpolator: interp })
    else setView({ ...INDIA_VIEW, zoom: compact ? 4.2 : INDIA_VIEW.zoom, transitionDuration: 1800, transitionInterpolator: interp })
  }, [selected, corridors, compact])

  const zoomedIn = view.zoom > 7
  const maxScore = Math.max(1, ...Object.values(scores))

  // declutter: when zoomed out, drop labels that sit within ~1.6° of a higher-scoring corridor
  const labelled = useMemo(() => {
    if (zoomedIn) return corridors
    const sorted = [...corridors].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0))
    const keep: Corridor[] = []
    for (const c of sorted) if (c.id === selected || keep.every(k => Math.hypot(k.lat - c.lat, k.lon - c.lon) > 1.6)) keep.push(c)
    return keep
  }, [corridors, scores, zoomedIn, selected])

  const layers = useMemo(() => [
    new H3HexagonLayer<HexRow>({
      id: 'hex', data: hexes, getHexagon: d => d.h, extruded: true, coverage: 0.88, pickable: true, autoHighlight: true,
      highlightColor: [34, 211, 238, 220], material: { ambient: 0.55, diffuse: 0.6, shininess: 40, specularColor: [80, 80, 80] },
      getFillColor: d => { const t = d.v / 100; const [r, g, b] = ramp(t); return [r, g, b, selected && d.c !== selected ? 70 : 235] },
      getElevation: d => Math.pow(d.v / 100, 2.2) * 100,
      elevationScale: zoomedIn ? 150 : 320,
      updateTriggers: { getFillColor: [selected], getElevation: [hexes] },
      transitions: { getElevation: { duration: 650 }, getFillColor: { duration: 450 }, elevationScale: { duration: 900 } },
    }),
    new ScatterplotLayer<Infra>({
      id: 'infra', data: infra, getPosition: d => [d.lon, d.lat], pickable: true, stroked: true, filled: true,
      radiusUnits: 'pixels', getRadius: zoomedIn ? 7 : 4, lineWidthUnits: 'pixels', getLineWidth: 2,
      getFillColor: d => d.open > predYear ? [245, 158, 11, 90] : [34, 211, 238, 90],
      getLineColor: d => d.open > predYear ? [245, 158, 11, 255] : [34, 211, 238, 255],
      updateTriggers: { getRadius: [zoomedIn] },
    }),
    new ScatterplotLayer<Corridor>({
      id: 'halo', data: corridors, getPosition: d => [d.lon, d.lat], radiusUnits: 'pixels', pickable: true, visible: !zoomedIn,
      getRadius: d => 10 + 22 * (scores[d.id] ?? 0) / maxScore, stroked: true, filled: true, lineWidthUnits: 'pixels', getLineWidth: 1.5,
      getFillColor: d => { const [r, g, b] = ramp((scores[d.id] ?? 0) / 100); return [r, g, b, d.id === selected ? 120 : 45] },
      getLineColor: d => { const [r, g, b] = ramp((scores[d.id] ?? 0) / 100); return [r, g, b, 200] },
      updateTriggers: { getRadius: [scores], getFillColor: [scores, selected], getLineColor: [scores] },
      transitions: { getRadius: { duration: 500 } },
    }),
    new TextLayer<Corridor>({
      id: 'labels', data: labelled, getPosition: d => [d.lon, d.lat, zoomedIn ? 16000 : 0], getText: d => d.name.split(' (')[0],
      getSize: zoomedIn ? 15 : 12, getColor: d => d.id === selected || !selected ? [241, 245, 249, 255] : [148, 163, 184, 200],
      getPixelOffset: [0, zoomedIn ? -18 : -26], fontFamily: 'Inter, sans-serif', fontWeight: 600, characterSet: 'auto',
      outlineWidth: 3, outlineColor: [7, 11, 22, 255], fontSettings: { sdf: true }, billboard: true,
      updateTriggers: { getColor: [selected], getSize: [zoomedIn], getPixelOffset: [zoomedIn], getPosition: [zoomedIn] },
    }),
  ], [hexes, infra, corridors, labelled, scores, selected, zoomedIn, maxScore, predYear])

  const tooltip = (info: PickingInfo) => {
    const o = info.object as HexRow | Infra | Corridor | undefined
    if (!o) return null
    const box = 'background:rgba(10,15,30,.92);border:1px solid rgba(148,163,184,.2);border-radius:10px;padding:8px 10px;font:12px Inter,sans-serif;color:#e2e8f0;box-shadow:0 10px 30px rgba(0,0,0,.4)'
    if ('h' in o) {
      const c = corridors.find(x => x.id === o.c)
      return { html: `<div style="${box}"><div style="color:#94a3b8;font-size:10px;letter-spacing:.06em;text-transform:uppercase">${c?.name ?? ''} · H3 cell</div><div style="margin-top:3px"><b>${o.v.toFixed(0)}</b> radar score · model P50 <b>${o.local.toFixed(1)}%</b>/yr</div></div>`, style: { background: 'none', border: 'none', padding: '0' } }
    }
    if ('announced' in o) return { html: `<div style="${box}"><div style="color:${o.open > predYear ? '#fbbf24' : '#22d3ee'};font-size:10px;letter-spacing:.06em;text-transform:uppercase">${o.kind} · ${o.open > predYear ? 'planned ' + o.open : 'open since ' + o.open}</div><div style="margin-top:3px;font-weight:600">${o.name}</div></div>`, style: { background: 'none', border: 'none', padding: '0' } }
    return { html: `<div style="${box}"><b>${o.name}</b> · score ${Math.round(scores[o.id] ?? 0)}<div style="color:#94a3b8;font-size:11px">Click to open fact sheet</div></div>`, style: { background: 'none', border: 'none', padding: '0' } }
  }

  return (
    <div className="absolute inset-0">
      <DeckGL viewState={view} controller={{ dragRotate: true, touchRotate: true }} layers={layers} getTooltip={tooltip}
        onViewStateChange={({ viewState }) => setView(viewState as View)}
        onClick={info => { const o = info.object as { id?: string; c?: string } | undefined; if (info.layer?.id === 'halo' && o?.id) onSelect(o.id); else if (info.layer?.id === 'hex' && o?.c) onSelect(o.c) }}
        getCursor={({ isHovering, isDragging }) => isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'}>
        <MapLibre mapStyle={STYLE} onLoad={() => setMapReady(true)} attributionControl={{ compact: true }} />
      </DeckGL>
      <div className={`pointer-events-none absolute inset-0 bg-[#070b16] transition-opacity duration-1000 ${mapReady ? 'opacity-0' : 'opacity-100'}`}>
        <div className="absolute inset-0 flex items-center justify-center"><div className="h-24 w-24 rounded-full border border-cyan-400/30 animate-ping" /></div>
      </div>
    </div>
  )
}
