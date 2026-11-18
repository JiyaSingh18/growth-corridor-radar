export type PillarKey = 'forecast' | 'catalyst' | 'infrastructure' | 'demand' | 'activity' | 'affordability'
export interface ScenarioResult { p10: number; p50: number; p90: number; catalyst: number; tourism_growth: number; years_to_open: number; nearest_catalyst_km: number; pillars: Record<PillarKey, number> }
export interface ShapItem { feature: string; label: string; value: number; feature_value: number }
export interface Corridor {
  id: string; name: string; state: string; lat: number; lon: number; hoabl: boolean
  osm: { poi: number; road_km: number; road_km_by_class: Record<string, number>; rail_stations: number; social: number; tourism_poi: number; fetched_utc: string; osm_base?: string }
  ntl_growth_proxy: number; land_price_synthetic: number
  tourism: { kind: 'published' | 'proxy'; latest: [string, number] | null; unit?: string; src?: string; growth_used: number }
  nearby_infra: { id: string; name: string; km: number; open: number; kind: string }[]
  shap: ShapItem[]; shap_base: number
}
export interface Infra { id: string; name: string; lat: number; lon: number; kind: string; announced: number; open: number; weight: number; src: string }
export interface Scenario { id: string; name: string; desc: string }
export interface CorridorData { generated: string; pred_year: number; horizon_years: number; corridors: Corridor[]; scenarios: Scenario[]; scenario_results: Record<string, Record<string, ScenarioResult>>; infra: Infra[] }
export interface HexData { columns: string[]; rows: (string | number)[][] }
export interface ModelData {
  metrics: { cv: string; gbm: { r2: number; mae: number; rmse: number }; ridge_baseline: { r2: number; mae: number; rmse: number }; gbm_only: { r2: number; mae: number; rmse: number }; model: string; interval_coverage_p10_p90: number; interval_coverage_raw_quantile: number; cqr_widening_pp: number; per_corridor_mae: { corridor: string; mae: number }[]; n_rows: number; n_cells: number; vintages: number[]; target_mean: number; target_std: number; params: Record<string, number> }
  global_importance: { feature: string; label: string; mean_abs_shap: number }[]
  dependence: { feature: string; label: string; points: { x: number; y: number }[] }
  features: { id: string; label: string }[]
  calibration: { oof_vs_true: { t: number; p: number }[] }
}
