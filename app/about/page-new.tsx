"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <PageHeader 
        title="About AI Evaluation Dashboard"
        description="A comprehensive platform for documenting and sharing AI system evaluations with transparency and rigor."
      />

      <div className="container mx-auto px-4 sm:px-6 py-6 max-w-4xl">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Project Goals</CardTitle>
              <CardDescription>
                Our mission is to advance responsible AI development through transparent evaluation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium">Comprehensive Evaluation Framework</h4>
                    <p className="text-sm text-muted-foreground">
                      Support structured evaluation across 20+ categories covering capabilities and risks
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium">Transparency & Accountability</h4>
                    <p className="text-sm text-muted-foreground">
                      Promote open documentation of AI system capabilities, limitations, and risks
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium">Industry Standards</h4>
                    <p className="text-sm text-muted-foreground">
                      Facilitate adoption of consistent evaluation practices across organizations
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Key Features</CardTitle>
              <CardDescription>
                Tools and capabilities that support comprehensive AI evaluation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Badge variant="secondary" className="mb-2">Evaluation</Badge>
                  <ul className="space-y-1 text-sm">
                    <li>• Structured evaluation forms</li>
                    <li>• Multi-modal system support</li>
                    <li>• Evidence-based assessments</li>
                    <li>• Category-specific questions</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <Badge variant="secondary" className="mb-2">Analytics</Badge>
                  <ul className="space-y-1 text-sm">
                    <li>• Completeness tracking</li>
                    <li>• Performance benchmarking</li>
                    <li>• Risk area identification</li>
                    <li>• Comparative analysis</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <Badge variant="secondary" className="mb-2">Documentation</Badge>
                  <ul className="space-y-1 text-sm">
                    <li>• Standardized reporting</li>
                    <li>• Evidence management</li>
                    <li>• Version tracking</li>
                    <li>• Export capabilities</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <Badge variant="secondary" className="mb-2">Collaboration</Badge>
                  <ul className="space-y-1 text-sm">
                    <li>• Team evaluation workflows</li>
                    <li>• Review processes</li>
                    <li>• Stakeholder engagement</li>
                    <li>• Public transparency</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evaluation Categories</CardTitle>
              <CardDescription>
                Comprehensive coverage across capabilities and risk areas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <h4 className="font-medium mb-3 text-primary">Capability Areas</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Language Communication</Badge>
                    <Badge variant="outline">Problem Solving</Badge>
                    <Badge variant="outline">Creativity Innovation</Badge>
                    <Badge variant="outline">Learning Memory</Badge>
                    <Badge variant="outline">Social Intelligence</Badge>
                    <Badge variant="outline">Perception Vision</Badge>
                    <Badge variant="outline">Physical Manipulation</Badge>
                    <Badge variant="outline">Metacognition</Badge>
                    <Badge variant="outline">Robotic Intelligence</Badge>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-3 text-destructive">Risk Areas</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Harmful Content</Badge>
                    <Badge variant="outline">Information Integrity</Badge>
                    <Badge variant="outline">Privacy Data</Badge>
                    <Badge variant="outline">Bias Fairness</Badge>
                    <Badge variant="outline">Security Robustness</Badge>
                    <Badge variant="outline">Dangerous Capabilities</Badge>
                    <Badge variant="outline">Human AI Interaction</Badge>
                    <Badge variant="outline">Environmental Impact</Badge>
                    <Badge variant="outline">Economic Displacement</Badge>
                    <Badge variant="outline">Governance Accountability</Badge>
                    <Badge variant="outline">Value Chain</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
              <CardDescription>
                Begin evaluating AI systems with our structured approach
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="text-center p-4 border rounded-lg">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-2 text-sm font-bold">
                    1
                  </div>
                  <h4 className="font-medium mb-1">Create Evaluation</h4>
                  <p className="text-xs text-muted-foreground">Start a new evaluation for your AI system</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-2 text-sm font-bold">
                    2
                  </div>
                  <h4 className="font-medium mb-1">Complete Assessment</h4>
                  <p className="text-xs text-muted-foreground">Answer questions across relevant categories</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-2 text-sm font-bold">
                    3
                  </div>
                  <h4 className="font-medium mb-1">Review & Share</h4>
                  <p className="text-xs text-muted-foreground">Analyze results and share with stakeholders</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator />

          <div className="text-center space-y-4">
            <h3 className="text-lg font-semibold">Ready to get started?</h3>
            <p className="text-muted-foreground">
              Create your first evaluation card and begin documenting your AI system's capabilities and risks.
            </p>
            <Link href="/">
              <Button size="lg" className="gap-2">
                Start Evaluating
                <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
