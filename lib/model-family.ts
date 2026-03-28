import type { ModelInfo } from "@/lib/benchmark-schema"

interface ParsedModelIdentity {
  namespace: string
  rawHandle: string
  normalizedHandle: string
  familySlug: string
  familyId: string
  familyName: string
  variantKey: string
  variantLabel: string
  variantDisplayName: string
  versionDate?: string
  versionQualifier?: string
}

const TOKEN_CASE_MAP: Record<string, string> = {
  ai: "AI",
  coder: "Coder",
  command: "Command",
  chat: "Chat",
  claude: "Claude",
  gemini: "Gemini",
  gemma: "Gemma",
  gpt: "GPT",
  haiku: "Haiku",
  instruct: "Instruct",
  instant: "Instant",
  llama: "Llama",
  max: "Max",
  mini: "Mini",
  mistral: "Mistral",
  opus: "Opus",
  phi: "Phi",
  plus: "Plus",
  preview: "Preview",
  pro: "Pro",
  qwen: "Qwen",
  reasoning: "Reasoning",
  sonnet: "Sonnet",
  thinking: "Thinking",
  turbo: "Turbo",
  yi: "Yi",
}

function stripNamespace(value: string, namespace: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return trimmed
  }

  const lowerTrimmed = trimmed.toLowerCase()
  const namespacePrefix = `${namespace.toLowerCase()}/`

  if (lowerTrimmed.startsWith(namespacePrefix)) {
    return trimmed.slice(namespacePrefix.length)
  }

  return trimmed
}

function getNamespace(modelInfo: ModelInfo) {
  const idParts = modelInfo.id.split("/")
  if (idParts.length > 1 && idParts[0]) {
    return idParts[0].trim().toLowerCase()
  }

  return (modelInfo.developer ?? "unknown").trim().toLowerCase().replace(/\s+/g, "-")
}

function getRawHandle(modelInfo: ModelInfo, namespace: string) {
  const idParts = modelInfo.id.split("/")
  const idHandle = idParts[idParts.length - 1]?.trim()
  if (idHandle) {
    return idHandle
  }

  const strippedName = stripNamespace(modelInfo.name, namespace)
  return strippedName || modelInfo.name.trim()
}

function normalizeHandle(rawHandle: string) {
  return rawHandle
    .trim()
    .toLowerCase()
    .replace(/[_\s/]+/g, "-")
    .replace(/(\d)-(?=\d(?:-|$))/g, "$1.")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function formatVersionDate(dateToken: string) {
  if (!/^(?:19|20)\d{6}$/.test(dateToken)) {
    return dateToken
  }

  return `${dateToken.slice(0, 4)}-${dateToken.slice(4, 6)}-${dateToken.slice(6, 8)}`
}

function titleCaseToken(token: string) {
  if (!token) {
    return token
  }

  const knownCase = TOKEN_CASE_MAP[token]
  if (knownCase) {
    return knownCase
  }

  if (/^\d+(\.\d+)?$/.test(token)) {
    return token
  }

  if (/^\d+(\.\d+)?[bkmt]$/i.test(token)) {
    return `${token.slice(0, -1)}${token.slice(-1).toUpperCase()}`
  }

  if (/^v\d/i.test(token)) {
    return `v${token.slice(1)}`
  }

  return token.charAt(0).toUpperCase() + token.slice(1)
}

function humanizeHandle(handle: string) {
  return handle
    .split("-")
    .filter(Boolean)
    .map((token) => {
      if (/^(?:19|20)\d{6}$/.test(token)) {
        return formatVersionDate(token)
      }

      return titleCaseToken(token)
    })
    .join(" ")
}

function splitVersionParts(normalizedHandle: string) {
  const match = normalizedHandle.match(/^(.*?)-((?:19|20)\d{6})(?:-(.+))?$/)

  if (!match) {
    return {
      familySlug: normalizedHandle,
      variantKey: "base",
      variantLabel: "Current",
      versionDate: undefined,
      versionQualifier: undefined,
    }
  }

  const [, baseSlug, dateToken, qualifier] = match
  const qualifierLabel = qualifier ? humanizeHandle(qualifier) : null
  const formattedDate = formatVersionDate(dateToken)

  return {
    familySlug: baseSlug,
    variantKey: qualifier ? `${dateToken}-${qualifier}` : dateToken,
    variantLabel: qualifierLabel ? `${formattedDate} · ${qualifierLabel}` : formattedDate,
    versionDate: formattedDate,
    versionQualifier: qualifierLabel ?? undefined,
  }
}

export function getCanonicalModelIdentity(modelInfo: ModelInfo): ParsedModelIdentity {
  const namespace = getNamespace(modelInfo)
  const rawHandle = getRawHandle(modelInfo, namespace)
  const normalizedHandle = normalizeHandle(rawHandle)
  const versionParts = splitVersionParts(normalizedHandle)
  const familyName = humanizeHandle(versionParts.familySlug)
  const familyId = `${namespace}/${versionParts.familySlug}`
  const variantDisplayName =
    versionParts.variantKey === "base"
      ? familyName
      : `${familyName} (${versionParts.variantLabel})`

  return {
    namespace,
    rawHandle,
    normalizedHandle,
    familySlug: versionParts.familySlug,
    familyId,
    familyName,
    variantKey: versionParts.variantKey,
    variantLabel: versionParts.variantLabel,
    variantDisplayName,
    versionDate: versionParts.versionDate,
    versionQualifier: versionParts.versionQualifier,
  }
}

export function normalizeModelInfo(modelInfo: ModelInfo): ModelInfo {
  const identity = getCanonicalModelIdentity(modelInfo)
  const additionalArchitecture =
    typeof modelInfo.additional_details?.architecture === "string"
      ? modelInfo.additional_details.architecture
      : undefined
  const rawParamsBillions = modelInfo.additional_details?.params_billions
  const parsedParamsBillions =
    typeof rawParamsBillions === "number"
      ? rawParamsBillions
      : typeof rawParamsBillions === "string"
        ? Number.parseFloat(rawParamsBillions)
        : null

  return {
    ...modelInfo,
    id: modelInfo.id.trim(),
    name: identity.variantDisplayName,
    architecture: modelInfo.architecture ?? additionalArchitecture,
    parameter_count:
      modelInfo.parameter_count ??
      (Number.isFinite(parsedParamsBillions ?? NaN) ? `${parsedParamsBillions}B` : undefined),
    model_version:
      modelInfo.model_version ??
      (identity.variantKey === "base" ? undefined : identity.variantLabel),
  }
}

export function getModelFamilyRouteId(model: ModelInfo | string) {
  const familyId =
    typeof model === "string" ? model.trim() : getCanonicalModelIdentity(model).familyId

  return familyId.replace(/\//g, "__")
}
