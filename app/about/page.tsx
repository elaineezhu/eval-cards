"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ExternalLink, BarChart3, FileJson, Search, Layout, FileText, Database, Users, ArrowRight } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { PageHeader } from "@/components/page-header"
import { EVALUATION_CATEGORIES } from "@/lib/benchmark-schema"

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <PageHeader 
        title="About"
        description="Building a shared infrastructure for informative, transparent, and comparable AI evaluations."
      />

      <div className="container mx-auto px-4 sm:px-6 py-6 max-w-4xl">
        <div className="grid gap-8">
          
          {/* Overview Section */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">Overview</h2>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <p className="text-muted-foreground leading-relaxed">
                  Evaluations are the backbone of progress in AI, yet the ways they are documented and shared have not kept pace with the field’s growth. 
                  Today, evaluations are produced by a growing mix of first- and third-party actors, using diverse methods, formats, and assumptions. 
                  As a result, it is increasingly difficult to understand what evaluations exist, how they are conducted, or what they ultimately tell us about an AI model or system.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  We envision a world in which AI evaluations are informative, transparent, and comparable by default. 
                  In this world, developers, researchers, policymakers, and downstream users can quickly understand how an AI system has been evaluated.
                </p>
                
                <div className="mt-6 bg-muted/30 p-6 rounded-lg border">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Layout className="h-5 w-5 text-primary" />
                    The Eval Cards Proposal
                  </h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <div className="font-medium text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-500" />
                        Design Information
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Documenting what an evaluation measures and how its results should be interpreted, covering task definition and validity considerations.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="font-medium text-sm flex items-center gap-2">
                        <Database className="h-4 w-4 text-green-500" />
                        EEE Schema
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The "Every Eval Ever" standardized reporting schema for inference- and execution-level details (temperature, tokens, etc.).
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="font-medium text-sm flex items-center gap-2">
                        <Layout className="h-4 w-4 text-purple-500" />
                        Central Platform
                      </div>
                      <p className="text-xs text-muted-foreground">
                        A shared repository linking design info with run data, allowing exploration by model or evaluation.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Motivation & Why Eval Cards */}
          <div className="grid md:grid-cols-2 gap-6">
            <section className="space-y-4">
              <h2 className="text-xl font-bold tracking-tight">Motivation</h2>
              <Card className="h-full">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Evaluations come in a variety of forms and formats depending on the organization conducting them. 
                    Today, the lack of standardization across evaluation design information and evaluation run metadata limits the impact of evaluations because they are not readily comparable or available.
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-4">
                    Moreover, they remain scattered across numerous repos, sites, tables, and papers, making it difficult to grasp what evaluations of a given AI system have been conducted.
                  </p>
                </CardContent>
              </Card>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold tracking-tight">Why Eval Cards?</h2>
              <Card className="h-full">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Just as model cards have catalyzed common documentation practices for AI systems, Eval Cards aim to establish a norm for structured reporting of AI evaluations themselves.
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-4">
                    By standardizing how evaluation design information and run-level metadata are reported, Eval Cards make apples-to-apples comparison possible and reduce duplicated infrastructure work for evaluation research.
                  </p>
                </CardContent>
              </Card>
            </section>
          </div>

          {/* Current State */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">Current State</h2>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <p className="text-muted-foreground">
                  Eval Cards are actively under development by the EvalEval coalition. We have completed the following milestones:
                </p>
                <div className="grid gap-3 sm:grid-cols-2 mt-4">
                  <div className="flex items-start gap-3 p-3 bg-secondary/20 rounded-lg">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                    <span className="text-sm">Developed a draft version of the EEE schema</span>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-secondary/20 rounded-lg">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                    <span className="text-sm">Designed a GUI mockup for the central platform</span>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-secondary/20 rounded-lg">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                    <span className="text-sm">Designed in-platform explanatory tooltips for design details</span>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-secondary/20 rounded-lg">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                    <span className="text-sm">Integrated with Eval Factsheets repository</span>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 rounded-md text-sm flex items-center gap-3">
                  <InfoIcon className="h-5 w-5 flex-shrink-0" />
                  We are currently soliciting community feedback on all components through mid-January 2026.
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Next Steps */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">Next Steps</h2>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-4 mb-4">
                  <Badge className="text-base px-4 py-1">Release: February 2026</Badge>
                </div>
                <p className="text-muted-foreground">
                  In the lead-up to this release, we are:
                </p>
                <ul className="space-y-3 text-sm text-muted-foreground list-disc pl-5">
                  <li>
                    Actively engaging with model developers, independent evaluation organizations, and research groups to solicit feedback and encourage early adoption.
                  </li>
                  <li>
                    Continuing to develop the Eval Cards platform as a central, publicly accessible repository where evaluations can be submitted, discovered, and compared.
                  </li>
                </ul>
                <p className="text-sm text-muted-foreground mt-4">
                  Following the initial release, we will maintain and evolve the Eval Cards format in consultation with the research and practitioner communities.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Coalition */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">The EvalEval Coalition</h2>
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-6 flex flex-col sm:flex-row items-center gap-6">
                <div className="p-4 bg-background rounded-full border shadow-sm">
                  <Users className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2 text-center sm:text-left">
                  <h3 className="font-semibold text-lg">A Global Research Community</h3>
                  <p className="text-muted-foreground">
                    We are a community of 400+ researchers and practitioners developing rigorous AI evaluation methods and the infrastructure needed to deploy them at scale for real-world impact.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          <Separator />

          <div className="text-center space-y-4">
            <h3 className="text-lg font-semibold">Get Involved</h3>
            <p className="text-muted-foreground">
              Groups interested in collaborating with us on Eval Cards are invited to submit an expression of interest.
            </p>
            <div className="flex justify-center gap-4">
              <Button variant="outline" className="gap-2">
                Contact Us
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Link href="/">
                <Button className="gap-2">
                  Explore the Platform
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}
