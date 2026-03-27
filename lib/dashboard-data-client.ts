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
