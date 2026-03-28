import type { BenchmarkEvaluationCardData } from "@/components/benchmark-evaluation-card"
import type {
  BenchmarkEvalListItem,
  BenchmarkEvalSummary,
  ModelEvaluationSummary,
} from "@/lib/eval-processing"

export interface DashboardDataResponse {
  models: BenchmarkEvaluationCardData[]
  evals: BenchmarkEvalListItem[]
}

export interface EvalListResponse {
  evals: BenchmarkEvalListItem[]
  totalModels: number
}

export interface DeveloperListItem {
  developer: string
  route_id: string
  model_count: number
  benchmark_count: number
  evaluation_count: number
  popular_evals: Array<{
    benchmark: string
    model_count: number
  }>
}

export interface DeveloperSummaryResponse {
  developer: string
  route_id: string
  model_count: number
  benchmark_count: number
  evaluation_count: number
  popular_evals: Array<{
    benchmark: string
    model_count: number
  }>
  models: BenchmarkEvaluationCardData[]
}

async function fetchJson<T>(input: string): Promise<T> {
  const response = await fetch(input)

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function fetchDashboardData() {
  return fetchJson<DashboardDataResponse>("/api/data")
}

export function fetchModelCards() {
  return fetchJson<BenchmarkEvaluationCardData[]>("/api/model-cards")
}

export function fetchEvalList() {
  return fetchJson<EvalListResponse>("/api/eval-list")
}

export function fetchModelSummary(modelId: string) {
  return fetchJson<ModelEvaluationSummary>(
    `/api/model-summary?id=${encodeURIComponent(modelId)}`
  )
}

export function fetchEvalSummary(evalId: string) {
  return fetchJson<BenchmarkEvalSummary>(
    `/api/eval-summary?id=${encodeURIComponent(evalId)}`
  )
}

export function fetchDevelopers() {
  return fetchJson<DeveloperListItem[]>("/api/developers")
}

export function fetchDeveloperSummary(developerId: string) {
  return fetchJson<DeveloperSummaryResponse>(
    `/api/developer-summary?id=${encodeURIComponent(developerId)}`
  )
}
