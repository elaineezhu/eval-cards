import schema from '@/schema/evaluation-schema.json'
import categoryDetails from '@/schema/category-details.json'
import formHints from '@/schema/form-hints.json'
import systemInfoSchema from '@/schema/system-info-schema.json'

export type Category = {
  id: string
  name: string
  description: string
  type: 'capability' | 'risk'
  detailedGuidance?: string
}

export type Question = {
  id: string
  text: string
  tooltip?: string
  hint?: string
  customFields?: string[]
}

const raw = schema as {
  version: string
  categories: Array<{ id: string; name: string; type: 'capability' | 'risk' }>
  benchmarkQuestions: Question[]
  processQuestions: Question[]
}

// Merge in descriptions from category details
const data = {
  version: raw.version,
  categories: raw.categories.map((c) => ({ 
    ...c, 
    description: (categoryDetails.categories as any)[c.id]?.description || '',
    detailedGuidance: (categoryDetails.categories as any)[c.id]?.detailedGuidance || '' 
  })) as Category[],
  benchmarkQuestions: raw.benchmarkQuestions,
  processQuestions: raw.processQuestions,
}

export function getAllCategories() {
  return data.categories
}

export function getCategoryById(id: string) {
  return data.categories.find((c) => c.id === id)
}

export function getBenchmarkQuestions() {
  return data.benchmarkQuestions
}

export function getProcessQuestions() {
  return data.processQuestions
}

// Export form utilities from schema
export const SOURCE_TYPES = formHints.sourceTypes
export const ADDITIONAL_ASPECTS_SECTION = formHints.additionalAspectsSection

// Form hint utilities from schema
export function getFieldPlaceholder(categoryId: string, field: "benchmarkName" | "metrics") {
  if (field === "benchmarkName") return (formHints.recommendedBenchmarks as any)[categoryId] || "e.g., MMLU, HellaSwag, GSM8K"
  return (formHints.recommendedMetrics as any)[categoryId] || "e.g., accuracy, F1, BLEU, perplexity"
}

export function getHint(categoryId: string, questionId: string, section: "benchmark" | "process") {
  const catQ = (formHints.categoryQuestionHints as any)[categoryId]
  const qHints = catQ ? catQ[questionId] : undefined
  if (qHints && qHints[section]) return qHints[section]
  if ((formHints.categoryHints as any)[categoryId] && (formHints.categoryHints as any)[categoryId][section]) return (formHints.categoryHints as any)[categoryId][section]
  return (formHints.defaultHints as any)[section]
}

export function getSystemInfoFormOptions() {
  return systemInfoSchema.formOptions
}

export function getSystemInfoSchema() {
  return systemInfoSchema.systemInfo
}

export default data
