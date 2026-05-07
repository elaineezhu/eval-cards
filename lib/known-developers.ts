// Canonical-name helpers for model developers. Lives in a neutral module
// (no `server-only`) so client components can call `isOfficialDeveloper`.

export const KNOWN_DEVELOPER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  google: "Google",
  anthropic: "Anthropic",
  meta: "Meta",
  microsoft: "Microsoft",
  mistralai: "Mistral AI",
  deepseek: "DeepSeek",
  "deepseek-ai": "DeepSeek",
  cohere: "Cohere",
  nvidia: "NVIDIA",
  alibaba: "Alibaba",
  amazon: "Amazon",
  apple: "Apple",
  ibm: "IBM",
  xai: "xAI",
  "x-ai": "xAI",
}

// Canonical names treated as "official" model-developer organisations.
// Seeded from KNOWN_DEVELOPER_NAMES values; extend with org names that
// arrive already-canonical from the backend registry (no case fix needed).
export const OFFICIAL_DEVELOPER_NAMES: Set<string> = new Set([
  ...Object.values(KNOWN_DEVELOPER_NAMES),
  "Allen Institute for AI",
])

export function normalizeDeveloperName(name: string): string {
  const key = name.trim().toLowerCase()
  if (KNOWN_DEVELOPER_NAMES[key]) return KNOWN_DEVELOPER_NAMES[key]
  // Title-case if the name is all-lowercase and not a compound like "01-ai"
  if (name === name.toLowerCase() && /^[a-z]/.test(name)) {
    return name.charAt(0).toUpperCase() + name.slice(1)
  }
  return name
}

export function isOfficialDeveloper(name: string): boolean {
  return OFFICIAL_DEVELOPER_NAMES.has(normalizeDeveloperName(name))
}
