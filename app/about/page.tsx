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
              
              <Separator className="my-6" />
              
              <div className="space-y-4">
                <h4 className="font-medium text-foreground">Taxonomy Sources</h4>
                <p className="text-sm text-muted-foreground">
                  Our evaluation framework builds upon established research and industry standards:
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-start gap-3 p-3 border rounded-lg">
                    <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <h5 className="font-medium text-sm">OECD AI Capability Indicators</h5>
                      <p className="text-xs text-muted-foreground mb-2">
                        OECD framework for AI capabilities assessment and evaluation
                      </p>
                      <Link 
                        href="https://www.oecd.org/en/publications/introducing-the-oecd-ai-capability-indicators_be745f04-en.html" 
                        target="_blank"
                        className="text-xs text-primary hover:underline"
                      >
                        oecd.org/ai-capability-indicators
                      </Link>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 border rounded-lg">
                    <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <h5 className="font-medium text-sm">NIST AI Risk Management Framework</h5>
                      <p className="text-xs text-muted-foreground mb-2">
                        NIST framework for identifying and managing AI risks
                      </p>
                      <Link 
                        href="https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf" 
                        target="_blank"
                        className="text-xs text-primary hover:underline"
                      >
                        nvlpubs.nist.gov/NIST.AI.600-1.pdf
                      </Link>
                    </div>
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

          <Card>
            <CardHeader>
              <CardTitle>Contributions & Open Data</CardTitle>
              <CardDescription>
                Explore our open-source evaluation framework and example datasets
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Evaluation Schema</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Access our complete evaluation framework including category definitions, question sets, and validation schemas.
                    </p>
                    <Link 
                      href="https://huggingface.co/spaces/evaleval/general-eval-card/tree/main/schema" 
                      target="_blank" 
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      View on Hugging Face
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <div className="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v10a2 2 0 01-2 2H10a2 2 0 01-2-2V5z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Example Evaluations</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Explore completed evaluation examples from leading AI systems to understand the evaluation process.
                    </p>
                    <Link 
                      href="https://huggingface.co/spaces/evaleval/general-eval-card/tree/main/public/evaluations" 
                      target="_blank" 
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      View on Hugging Face
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
              
              <div className="bg-muted/50 p-4 rounded-lg">
                <h5 className="font-medium mb-2 text-sm">Contribute to the Framework</h5>
                <p className="text-xs text-muted-foreground">
                  Our evaluation framework is open for community contributions. Use these schemas and examples to create your own evaluations, 
                  or contribute improvements to help advance AI transparency and accountability standards.
                </p>
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
