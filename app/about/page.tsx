"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Sun, Moon } from "lucide-react"
import { useTheme } from "next-themes"

export default function AboutPage() {
  const { theme, setTheme } = useTheme()
  
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <Link href="/">
            <Button variant="ghost">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="h-9 w-9 p-0"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
        <h1 className="text-4xl font-bold mb-2">About AI Evaluation Dashboard</h1>
        <p className="text-xl text-muted-foreground">
          A comprehensive platform for documenting and sharing AI system evaluations
        </p>
      </div>

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
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                <div>
                  <h4 className="font-semibold">Standardize AI Evaluation Reporting</h4>
                  <p className="text-sm text-muted-foreground">
                    Provide a consistent framework for documenting AI system capabilities and limitations across different models and platforms.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                <div>
                  <h4 className="font-semibold">Facilitate Transparency</h4>
                  <p className="text-sm text-muted-foreground">
                    Enable AI developers and researchers to share detailed evaluation results in an accessible, standardized format.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0"></div>
                <div>
                  <h4 className="font-semibold">Enable Comparative Analysis</h4>
                  <p className="text-sm text-muted-foreground">
                    Support side-by-side comparison of AI systems across multiple dimensions including capabilities and risks.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 flex-shrink-0"></div>
                <div>
                  <h4 className="font-semibold">Support Research and Policy</h4>
                  <p className="text-sm text-muted-foreground">
                    Consolidate evaluation data to inform AI research directions and policy development.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                <div>
                  <h4 className="font-semibold">Promote Responsible AI Development</h4>
                  <p className="text-sm text-muted-foreground">
                    Encourage comprehensive risk assessment and responsible deployment practices through structured evaluation.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

    {/* EvalEval link removed from page body per request; footer includes external link instead */}

        <Card>
          <CardHeader>
            <CardTitle>Standards and Frameworks</CardTitle>
            <CardDescription>
              Built on established international standards for AI evaluation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="destructive">Risk Assessment</Badge>
                </div>
                <h4 className="font-semibold mb-2">NIST AI 600-1</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Risk categories are derived from the NIST AI Risk Management Framework (AI RMF 1.0), providing a comprehensive approach to identifying and managing AI-related risks.
                </p>
                <Link href="https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf" target="_blank">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="mr-2 h-3 w-3" />
                    Learn More
                  </Button>
                </Link>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="default">Capabilities</Badge>
                </div>
                <h4 className="font-semibold mb-2">OECD AI Classification</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Capability categories are based on the OECD AI Classification Framework, ensuring alignment with international standards for AI system categorization.
                </p>
                <Link href="https://www.oecd.org/en/publications/introducing-the-oecd-ai-capability-indicators_be745f04-en/full-report/component-4.html#chapter-d1e230-f85c23a209" target="_blank">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="mr-2 h-3 w-3" />
                    Learn More
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>For Contributors</CardTitle>
            <CardDescription>
              How to contribute to the evaluation framework
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2">Schema-Driven Architecture</h4>
              <p className="text-sm text-muted-foreground mb-3">
                All evaluation categories, form fields, and data structures are centrally managed in the <code className="bg-background px-1 py-0.5 rounded">schema/</code> folder. This is the primary location for making structural changes to the evaluation framework.
              </p>
              <div className="space-y-2 text-sm">
                <div><code className="bg-background px-2 py-1 rounded">schema/evaluation-schema.json</code> - Evaluation categories and types</div>
                <div><code className="bg-background px-2 py-1 rounded">schema/output-schema.json</code> - Complete data structure</div>
                <div><code className="bg-background px-2 py-1 rounded">schema/system-info-schema.json</code> - Form field options</div>
                <div><code className="bg-background px-2 py-1 rounded">schema/category-details.json</code> - Detailed descriptions</div>
              </div>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2">Adding Evaluations</h4>
              <p className="text-sm text-muted-foreground">
                Evaluation data files are stored in <code className="bg-background px-1 py-0.5 rounded">public/evaluations/</code> as JSON files. Each file represents a complete evaluation of an AI system and must conform to the schema.
              </p>
            </div>
            <Link href="https://huggingface.co/spaces/evaleval/general-eval-card/tree/main/schema" target="_blank">
              <Button className="w-full flex items-center justify-center gap-2">
                <img src="https://huggingface.co/front/assets/huggingface_logo.svg" alt="Hugging Face" className="h-4 w-4" />
                View on Hugging Face
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* <Card>
          <CardHeader>
            <CardTitle>Technical Implementation</CardTitle>
            <CardDescription>
              Built with modern web technologies for performance and accessibility
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="text-center p-3 border rounded-lg">
                <h4 className="font-semibold">Next.js 14</h4>
                <p className="text-xs text-muted-foreground">React framework with SSR</p>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <h4 className="font-semibold">TypeScript</h4>
                <p className="text-xs text-muted-foreground">Type-safe development</p>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <h4 className="font-semibold">Tailwind CSS</h4>
                <p className="text-xs text-muted-foreground">Utility-first styling</p>
              </div>
            </div>
          </CardContent>
        </Card> */}
      </div>

      <Separator className="my-8" />

      <div className="text-center text-sm text-muted-foreground">
        <p className="mt-2">AI Evaluation Dashboard is an open-source project dedicated to advancing responsible AI development — built with ❤️ by the EvalEval Coalition.</p>
        <p className="mt-2 flex items-center justify-center gap-3">
          <img src="https://evalevalai.com/assets/img/logo-square.png" alt="EvalEval" className="h-8 w-8 rounded" />
          <span>Learn more about EvalEval: <Link href="https://evalevalai.com/" target="_blank">evalevalai.com</Link></span>
        </p>
      </div>
    </div>
  )
}
