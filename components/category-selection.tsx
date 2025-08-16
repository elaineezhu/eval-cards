"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Brain, Shield, HelpCircle } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface Category {
  id: string
  name: string
  type: "capability" | "risk"
  description: string
}

interface CategorySelectionProps {
  categories: Category[]
  selectedCategories: string[]
  onSelectionChange: (categories: string[], excludedReasons: Record<string, string>) => void
}

export function CategorySelection({ categories, selectedCategories, onSelectionChange }: CategorySelectionProps) {
  const allCategoryIds = categories.map((c) => c.id)
  const [localSelection, setLocalSelection] = useState<string[]>(
    selectedCategories && selectedCategories.length > 0 ? selectedCategories : allCategoryIds,
  )
  const [localReasons, setLocalReasons] = useState<Record<string, string>>({})

  const capabilityCategories = categories.filter((c) => c.type === "capability")
  const riskCategories = categories.filter((c) => c.type === "risk")

  const handleCategoryToggle = (categoryId: string, checked: boolean) => {
    setLocalSelection((prev) => {
      if (checked) {
        // if re-selecting, remove any existing reason
        setLocalReasons((r) => {
          const copy = { ...r }
          delete copy[categoryId]
          return copy
        })
        return [...prev, categoryId]
      }
  // when unselecting, initialize an empty reason entry to make it required
  setLocalReasons((r) => ({ ...r, [categoryId]: r[categoryId] || "" }))
  return prev.filter((id) => id !== categoryId)
    })
  }

  const handleSelectAll = (type: "capability" | "risk") => {
    const categoryIds = categories.filter((c) => c.type === type).map((c) => c.id)
    const allSelected = categoryIds.every((id) => localSelection.includes(id))

    if (allSelected) {
      // deselect these categories and initialize empty reasons for them
      setLocalSelection((prev) => {
        const next = prev.filter((id) => !categoryIds.includes(id))
        setLocalReasons((r) => {
          const copy = { ...r }
          categoryIds.forEach((id) => {
            if (!(id in copy)) copy[id] = ""
          })
          return copy
        })
        return next
      })
    } else {
      setLocalSelection((prev) => {
        // when selecting these, remove any reasons for them
        setLocalReasons((r) => {
          const copy = { ...r }
          categoryIds.forEach((id) => delete copy[id])
          return copy
        })
        return [...new Set([...prev, ...categoryIds])]
      })
    }
  }

  const handleContinue = () => {
  onSelectionChange(localSelection, localReasons)
  }

  return (
    <TooltipProvider>
      <div className="h-full min-h-0 flex flex-col">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading">Category Applicability Assessment</CardTitle>
            <CardDescription>
              Select which categories are applicable to your AI system. Only complete the detailed evaluation for
              categories marked as applicable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Selected Categories:</span>
                <Badge variant="secondary">{localSelection.length}/20</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex-1 overflow-auto space-y-6 py-4 pr-2 min-h-0">
          {/* Capability Categories */}
          <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-accent" />
                <CardTitle className="font-heading">Capability Categories</CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleSelectAll("capability")}>
                {capabilityCategories.every((c) => localSelection.includes(c.id)) ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <CardDescription>Core functional capabilities and performance areas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {capabilityCategories.map((category) => (
                <div key={category.id} className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id={category.id}
                      checked={localSelection.includes(category.id)}
                      onCheckedChange={(checked) => handleCategoryToggle(category.id, checked as boolean)}
                    />
                    <label htmlFor={category.id} className="text-sm font-medium cursor-pointer flex-1">
                      {category.name}
                    </label>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <p>{category.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* If unchecked, require a reason */}
                  {!localSelection.includes(category.id) && (
                    <div className="mt-3">
                      <div className="ml-0 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <Label className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Reason for excluding this category *</Label>
                        <Textarea
                          placeholder="Brief reason why this category is not applicable"
                          value={localReasons[category.id] || ""}
                          onChange={(e) => setLocalReasons((prev) => ({ ...prev, [category.id]: e.target.value }))}
                          rows={2}
                          className="mt-2 border-yellow-300 dark:border-yellow-700"
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
          </Card>

          {/* Risk Categories */}
          <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-destructive" />
                <CardTitle className="font-heading">Risk Categories</CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleSelectAll("risk")}>
                {riskCategories.every((c) => localSelection.includes(c.id)) ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <CardDescription>Potential risks, safety concerns, and ethical considerations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {riskCategories.map((category) => (
                <div key={category.id} className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id={category.id}
                      checked={localSelection.includes(category.id)}
                      onCheckedChange={(checked) => handleCategoryToggle(category.id, checked as boolean)}
                    />
                    <label htmlFor={category.id} className="text-sm font-medium cursor-pointer flex-1">
                      {category.name}
                    </label>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <p>{category.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {!localSelection.includes(category.id) && (
                    <div className="mt-3">
                      <div className="ml-0 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <Label className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Reason for excluding this category *</Label>
                        <Textarea
                          placeholder="Brief reason why this category is not applicable"
                          value={localReasons[category.id] || ""}
                          onChange={(e) => setLocalReasons((prev) => ({ ...prev, [category.id]: e.target.value }))}
                          rows={2}
                          className="mt-2 border-yellow-300 dark:border-yellow-700"
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
          </Card>
        </div>
        <div className="flex justify-center py-4">
          <div className="flex flex-col items-center w-full">
            {Object.keys(localReasons).some((id) => !localSelection.includes(id) && !(localReasons[id] || "")) && (
              <p className="text-sm text-destructive mb-2">Please provide reasons for all excluded categories.</p>
            )}
            <Button
              onClick={handleContinue}
              disabled={
                localSelection.length === 0 ||
                Object.keys(localReasons).some((id) => !localSelection.includes(id) && !(localReasons[id] || ""))
              }
              size="lg"
            >
              Continue to Evaluation ({localSelection.length} categories selected)
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
