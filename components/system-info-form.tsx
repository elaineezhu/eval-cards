"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { SystemInfo } from "@/components/ai-evaluation-dashboard"

interface SystemInfoFormProps {
  onSubmit: (data: SystemInfo) => void
  initialData: SystemInfo | null
}

const SYSTEM_TYPES = [
  "Text-to-Text (e.g., chatbots, language models)",
  "Text-to-Image (e.g., image generation)",
  "Image-to-Text (e.g., image captioning, OCR)",
  "Image-to-Image (e.g., image editing, style transfer)",
  "Audio/Speech (e.g., speech recognition, text-to-speech)",
  "Video (e.g., video generation, analysis)",
  "Multimodal",
  "Robotic/Embodied AI",
  "Other",
]

const DEPLOYMENT_CONTEXTS = [
  "Research/Academic",
  "Internal/Enterprise Use",
  "Public/Consumer-Facing",
  "High-Risk Applications",
  "Other",
]

export function SystemInfoForm({ onSubmit, initialData }: SystemInfoFormProps) {
  const [formData, setFormData] = useState<SystemInfo>({
    name: initialData?.name || "",
    url: initialData?.url || "",
    provider: initialData?.provider || "",
    systemTypes: initialData?.systemTypes || [],
  deploymentContexts: initialData?.deploymentContexts || [],
  modality: initialData?.modality || "text",
  modelTag: (initialData as any)?.modelTag || "",
  knowledgeCutoff: (initialData as any)?.knowledgeCutoff || "",
  modelType: (initialData as any)?.modelType || "na",
  inputModalities: (initialData as any)?.inputModalities || [],
  outputModalities: (initialData as any)?.outputModalities || [],
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  const handleSystemTypeChange = (type: string, checked: boolean) => {
    setFormData((prev: SystemInfo) => ({
      ...prev,
      systemTypes: checked ? [...prev.systemTypes, type] : prev.systemTypes.filter((t) => t !== type),
    }))
  }

  const handleDeploymentContextChange = (context: string, checked: boolean) => {
    setFormData((prev: SystemInfo) => ({
      ...prev,
      deploymentContexts: checked
        ? [...prev.deploymentContexts, context]
        : prev.deploymentContexts.filter((c) => c !== context),
    }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading">System Information</CardTitle>
        <CardDescription>Provide basic information about the AI system you want to evaluate</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">AI System Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., GPT-4, Claude, Custom Model"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">AI System URL</Label>
              <Input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
                placeholder="https://example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="modelTag">Model Tag / Version</Label>
              <Input
                id="modelTag"
                value={formData.modelTag}
                onChange={(e) => setFormData((prev) => ({ ...prev, modelTag: e.target.value }))}
                placeholder="e.g., gpt-4-1-2025-04-14"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="knowledgeCutoff">Knowledge Cutoff Date</Label>
              <Input
                id="knowledgeCutoff"
                value={formData.knowledgeCutoff}
                onChange={(e) => setFormData((prev) => ({ ...prev, knowledgeCutoff: e.target.value }))}
                placeholder="YYYY-MM-DD"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider">Provider/Organization *</Label>
            <Input
              id="provider"
              value={formData.provider}
              onChange={(e) => setFormData((prev) => ({ ...prev, provider: e.target.value }))}
              placeholder="e.g., OpenAI, Anthropic, Internal Team"
              required
            />
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium">Model Type</Label>
              <div className="mt-3">
                <RadioGroup value={formData.modelType} onValueChange={(val) => setFormData((prev) => ({ ...prev, modelType: val as any }))}>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="foundational" id="mt-foundational" />
                      <Label htmlFor="mt-foundational" className="text-sm">Foundational Model</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="fine-tuned" id="mt-finetuned" />
                      <Label htmlFor="mt-finetuned" className="text-sm">Fine-tuned Model</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="na" id="mt-na" />
                      <Label htmlFor="mt-na" className="text-sm">Doesn't apply</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div>
              <Label className="text-base font-medium">Input modalities (select all that apply) *</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {['Text','Image','Audio','Video','Tabular','Robotics/Action','Other'].map((m) => (
                  <div key={m} className="flex items-center gap-2">
                    <Checkbox
                      id={`in-${m}`}
                      checked={(formData.inputModalities || []).includes(m)}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          inputModalities: checked
                            ? [...(prev.inputModalities || []), m]
                            : (prev.inputModalities || []).filter((x) => x !== m),
                        }))
                      }
                    />
                    <Label htmlFor={`in-${m}`} className="text-sm">
                      {m}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-base font-medium">Output modalities (select all that apply) *</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {['Text','Image','Audio','Video','Tabular','Robotics/Action','Other'].map((m) => (
                  <div key={m} className="flex items-center gap-2">
                    <Checkbox
                      id={`out-${m}`}
                      checked={(formData.outputModalities || []).includes(m)}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          outputModalities: checked
                            ? [...(prev.outputModalities || []), m]
                            : (prev.outputModalities || []).filter((x) => x !== m),
                        }))
                      }
                    />
                    <Label htmlFor={`out-${m}`} className="text-sm">
                      {m}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-base font-medium">Deployment Context (select all that apply) *</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {DEPLOYMENT_CONTEXTS.map((context) => (
                  <div key={context} className="flex items-center space-x-2">
                    <Checkbox
                      id={`context-${context}`}
                      checked={formData.deploymentContexts.includes(context)}
                      onCheckedChange={(checked) => handleDeploymentContextChange(context, checked as boolean)}
                    />
                    <Label htmlFor={`context-${context}`} className="text-sm font-normal">
                      {context}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          

          <Button
            type="submit"
            className="w-full"
            disabled={
              !formData.name ||
              !formData.provider ||
              (formData.inputModalities || []).length === 0 ||
              (formData.outputModalities || []).length === 0 ||
              formData.deploymentContexts.length === 0
            }
          >
            Continue to Category Selection
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
