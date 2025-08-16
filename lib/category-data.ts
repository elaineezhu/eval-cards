export const CATEGORY_DESCRIPTIONS = {
  "language-communication": {
    name: "Language & Communication",
    description:
      "Evaluates the system's ability to understand, generate, and engage in natural language communication across various contexts, languages, and communication styles.",
    type: "capability" as const,
  },
  "social-intelligence": {
    name: "Social Intelligence & Interaction",
    description:
      "Assesses the system's capacity to understand social contexts, interpret human emotions and intentions, and engage appropriately in social interactions.",
    type: "capability" as const,
  },
  "problem-solving": {
    name: "Problem Solving",
    description:
      "Measures the system's ability to analyze complex problems, develop solutions, and apply reasoning across various domains and contexts.",
    type: "capability" as const,
  },
  "creativity-innovation": {
    name: "Creativity & Innovation",
    description:
      "Evaluates the system's capacity for creative thinking, generating novel ideas, and producing original content across different creative domains.",
    type: "capability" as const,
  },
  "learning-memory": {
    name: "Learning & Memory",
    description:
      "Assesses the system's ability to acquire new knowledge, retain information, and adapt behavior based on experience and feedback.",
    type: "capability" as const,
  },
  "perception-vision": {
    name: "Perception & Vision",
    description:
      "Measures the system's capability to process, interpret, and understand visual information, images, and spatial relationships.",
    type: "capability" as const,
  },
  "physical-manipulation": {
    name: "Physical Manipulation & Motor Skills",
    description:
      "Evaluates the system's ability to control physical actuators, manipulate objects, and perform motor tasks in physical environments.",
    type: "capability" as const,
  },
  metacognition: {
    name: "Metacognition & Self-Awareness",
    description:
      "Assesses the system's ability to understand its own capabilities, limitations, and reasoning processes, including self-reflection and meta-learning.",
    type: "capability" as const,
  },
  "robotic-intelligence": {
    name: "Robotic Intelligence & Autonomy",
    description:
      "Measures autonomous decision-making, navigation, and task execution in physical environments with minimal human intervention.",
    type: "capability" as const,
  },
  "harmful-content": {
    name: "Harmful Content Generation",
    description:
      "Evaluates risks related to generating harmful, offensive, illegal, or inappropriate content that could cause psychological, social, or physical harm.",
    type: "risk" as const,
  },
  "information-integrity": {
    name: "Information Integrity & Misinformation",
    description:
      "Assesses risks of generating false, misleading, or manipulated information that could undermine trust in information systems and decision-making.",
    type: "risk" as const,
  },
  "privacy-data": {
    name: "Privacy & Data Protection",
    description:
      "Evaluates risks to personal privacy, data security, and unauthorized access to or misuse of sensitive personal information.",
    type: "risk" as const,
  },
  "bias-fairness": {
    name: "Bias & Fairness",
    description:
      "Assesses risks of discriminatory outcomes, unfair treatment of different groups, and perpetuation of societal biases and inequalities.",
    type: "risk" as const,
  },
  "security-robustness": {
    name: "Security & Robustness",
    description:
      "Evaluates vulnerabilities to adversarial attacks, system manipulation, and failure modes that could compromise system integrity and reliability.",
    type: "risk" as const,
  },
  "dangerous-capabilities": {
    name: "Dangerous Capabilities & Misuse",
    description:
      "Assesses risks from capabilities that could be misused for harmful purposes, including dual-use applications and potential for weaponization.",
    type: "risk" as const,
  },
  "human-ai-interaction": {
    name: "Human-AI Interaction Risks",
    description:
      "Evaluates risks arising from human-AI interaction patterns, including over-reliance, manipulation, and degradation of human skills and autonomy.",
    type: "risk" as const,
  },
  "environmental-impact": {
    name: "Environmental & Resource Impact",
    description:
      "Evaluates environmental costs of AI development and deployment, including energy consumption, carbon footprint, and resource utilization.",
    type: "risk" as const,
  },
  "economic-displacement": {
    name: "Economic & Labor Displacement",
    description:
      "Evaluates potential economic disruption, job displacement, and impacts on labor markets and economic inequality from AI deployment.",
    type: "risk" as const,
  },
  "governance-accountability": {
    name: "Governance & Accountability",
    description:
      "Assesses risks related to lack of oversight, unclear responsibility structures, and insufficient governance mechanisms for AI systems.",
    type: "risk" as const,
  },
  "value-chain": {
    name: "Value Chain & Supply Chain Risks",
    description:
      "Evaluates risks throughout the AI development and deployment pipeline, including data sourcing, model training, and third-party dependencies.",
    type: "risk" as const,
  },
}

export const SOURCE_TYPES = {
  internal: {
    label: "Internal",
    description:
      "Evaluations conducted by the organization developing or deploying the AI system using internal resources, teams, and methodologies.",
  },
  external: {
    label: "External",
    description:
      "Independent evaluations conducted by third-party organizations, academic institutions, or external auditors without direct involvement from the developing organization.",
  },
  cooperative: {
    label: "Cooperative",
    description:
      "Collaborative evaluations involving multiple stakeholders, including the developing organization, external experts, affected communities, and regulatory bodies working together.",
  },
} as const

export const BENCHMARK_QUESTIONS = [
  {
    id: "A1",
    text: "Has the system been run on recognized, category-specific benchmarks?",
    tooltip:
      "Expect: Benchmark/dataset names & versions, task variants, metric definitions, who ran them (internal/external).",
    customFields: [],
  },
  {
    id: "A2",
    text: "Does the system meet pre-set quantitative thresholds for acceptable performance under applicable regulations?",
    tooltip:
      "Expect: Numeric scores vs. regulatory/compliance thresholds (e.g., hiring fairness, medical accuracy), source of regulatory requirements, compliance determination.",
    customFields: ["thresholds", "regulatorySource", "complianceStatus"],
  },
  {
    id: "A3",
    text: "How does performance compare to baselines, SOTA, previous versions, and other comparable systems?",
    tooltip:
      "Expect: Side-by-side comparisons with SOTA models, previous versions, and similar systems under matched conditions, significance tests or confidence intervals for deltas.",
    customFields: ["comparativeScores", "comparisonTargets", "significance"],
  },
  {
    id: "A4",
    text: "How does the system perform under adversarial inputs, extreme loads, distribution shift?",
    tooltip: "Expect: Test types (attack/shift/load), rates of failure/degradation, robustness metrics.",
    customFields: ["testTypes", "failureRates", "robustnessMetrics"],
  },
  {
    id: "A5",
    text: "Is performance measured in the wild with automated monitors?",
    tooltip: "Expect: Live metrics tracked (e.g., error rates, drift, latency), sampling cadence, alert thresholds.",
    customFields: ["liveMetrics", "samplingCadence", "alertThresholds"],
  },
  {
    id: "A6",
    text: "Have you quantified train–test overlap or leakage risks that could inflate results?",
    tooltip:
      "Expect: Procedure (e.g., n-gram/fuzzy overlap, URL hashing), contamination rate estimates, mitigations taken.",
    customFields: ["procedure", "contaminationRate", "mitigations"],
  },
]

export const PROCESS_QUESTIONS = [
  {
    id: "B1",
    text: "What capability/risk claims is this category evaluating and why it's applicable?",
    tooltip: "Expect: Clear scope, success/failure definitions, hypotheses the evaluation is testing.",
    customFields: ["scope", "successFailureDefinitions", "hypotheses"],
  },
  {
    id: "B2",
    text: "Can others reproduce the results?",
    tooltip:
      "Expect: Public or access-controlled release of code/configs, prompts, seeds, decoding settings, dataset IDs/versions, hardware notes; if not shareable, documented proxies.",
    customFields: ["replicationPackage", "accessLevel", "proxies"],
  },
  {
    id: "B3",
    text: "Have domain experts/affected users reviewed interpretations of results?",
    tooltip: "Expect: Who reviewed, what feedback changed, unresolved disagreements and rationale.",
    customFields: ["reviewers", "feedbackChanges", "disagreements"],
  },
  {
    id: "B4",
    text: "Do figures communicate results without distortion and with uncertainty/context?",
    tooltip:
      "Expect: Uncertainty shown (CI/SE, multi-seed variance), full/consistent axes, sample sizes, like-for-like comparisons, raw tables available, disclosure of selection criteria.",
    customFields: ["uncertaintyDisclosure", "axesConsistency", "sampleSizes", "selectionCriteria"],
  },
  {
    id: "B5",
    text: "Standards & Compliance Alignment - Are evaluation practices aligned with relevant organizational, industry, or regulatory standards?",
    tooltip:
      "Expect: References to applicable standards/regulations, mapping of evaluation practices to those standards, any gaps or exemptions noted, and plan to address misalignment.",
    customFields: ["standardsReferenced", "alignmentSummary"],
  },
  {
    id: "B6",
    text: "Is there a process to re-run/adapt evals as models, data, or risks change, including mitigation and retest procedures?",
    tooltip:
      "Expect: Triggers (model updates, drift, incidents), versioned eval specs, scheduled re-assessment cadence, audit trail of changes, mitigation protocols when issues are found, and systematic retest procedures after fixes.",
    customFields: ["triggers", "versionedSpecs", "auditTrail", "mitigationProtocols", "retestProcedures"],
  },
]

export const ADDITIONAL_ASPECTS_SECTION = {
  id: "C",
  title: "Additional Evaluation Aspects",
  description:
    "Document any other evaluation aspects for this category that may not have been captured by the structured questions above. This section will not be scored but will be visible in the final documentation.",
}

export const CATEGORY_DETAILED_GUIDANCE = {
  "language-communication": `Key Benchmarks to Look For:
General: MMLU, HellaSwag, ARC, WinoGrande
Reading Comprehension: SQuAD, QuAC, CoQA
Language Generation: BLEU, ROUGE, BERTScore
Multilingual: XTREME, XGLUE, mBERT evaluation
Reasoning: GSM8K, BBH (BIG-Bench Hard)
Instruction Following: Alpaca Eval, MT-Bench

Evaluation Focus:
• Semantic understanding across languages
• Text generation quality and coherence
• Reasoning and logical inference
• Context retention in long conversations
• Factual accuracy and knowledge recall

Common Risk Areas:
• Hallucination and misinformation generation
• Bias in language generation
• Inconsistent performance across languages`,

  "social-intelligence": `Key Benchmarks to Look For:
Theory of Mind: ToMi, FaINoM, SOTOPIA
Emotional Intelligence: EmoBench, EQBench
Social Reasoning: Social IQa, CommonsenseQA
Dialogue: PersonaChat, BlendedSkillTalk
Psychology: Psychometrics Benchmark for LLMs

Evaluation Focus:
• Understanding social cues and context
• Appropriate emotional responses
• Maintaining consistent personality
• Theory of mind reasoning
• Cultural sensitivity and awareness

Common Risk Areas:
• Inappropriate anthropomorphization
• Cultural bias and insensitivity
• Lack of emotional regulation
• Manipulation potential`,

  "problem-solving": `Key Benchmarks to Look For:
Mathematical: GSM8K, MATH, FrontierMath, AIME
Logical Reasoning: LogiQA, ReClor, FOLIO
Programming: HumanEval, MBPP, SWE-bench
Scientific: SciQ, ScienceQA
Multi-step: StrategyQA, DROP, QuALITY

Evaluation Focus:
• Multi-step reasoning capability
• Mathematical and logical problem solving
• Code generation and debugging
• Scientific and analytical thinking
• Planning and strategy development

Common Risk Areas:
• Reasoning errors in complex problems
• Inconsistent problem-solving approaches
• Inability to show work or explain reasoning`,

  "creativity-innovation": `Key Benchmarks to Look For:
Creative Writing: CREAM, Creative Story Generation
Visual Creativity: FIQ (Figural Interpretation Quest)
Alternative Uses: AUT (Alternative Uses Task)
Artistic Generation: Aesthetic and originality scoring
Innovation: Novel solution generation tasks

Evaluation Focus:
• Originality and novelty of outputs
• Artistic and creative quality
• Ability to combine concepts innovatively
• Divergent thinking capabilities
• Value and usefulness of creative outputs

Common Risk Areas:
• Copyright and IP infringement
• Lack of genuine creativity vs. recombination
• Inappropriate or harmful creative content`,

  "learning-memory": `Key Benchmarks to Look For:
Few-shot Learning: Omniglot, miniImageNet, Meta-Dataset
Transfer Learning: VTAB, BigTransfer
In-context Learning: ICL benchmarks across domains
Knowledge Retention: Long-term memory tests
Continual Learning: CORe50, Split-CIFAR

Evaluation Focus:
• Few-shot and zero-shot learning ability
• Knowledge transfer across domains
• Memory retention and recall
• Adaptation to new tasks
• Learning efficiency and speed

Common Risk Areas:
• Catastrophic forgetting
• Overfitting to limited examples
• Inability to generalize learned concepts`,

  "perception-vision": `Key Benchmarks to Look For:
Object Recognition: ImageNet, COCO, Open Images
Scene Understanding: ADE20K, Cityscapes
Robustness: ImageNet-C, ImageNet-A
Multimodal: VQA, CLIP benchmarks
3D Understanding: NYU Depth, KITTI

Evaluation Focus:
• Object detection and classification
• Scene understanding and segmentation
• Robustness to visual variations
• Integration with language understanding
• Real-world deployment performance

Common Risk Areas:
• Adversarial vulnerability
• Bias in image recognition
• Poor performance on edge cases`,

  "physical-manipulation": `Key Benchmarks to Look For:
Grasping: YCB Object Set, Functional Grasping
Manipulation: RoboCAS, FMB (Functional Manipulation)
Assembly: NIST Assembly Task Boards
Navigation: Habitat, AI2-THOR challenges
Dexterity: Dexterous manipulation benchmarks

Evaluation Focus:
• Grasping and manipulation accuracy
• Adaptability to object variations
• Force control and delicate handling
• Spatial reasoning and planning
• Real-world deployment robustness

Common Risk Areas:
• Safety in human environments
• Damage to objects or environment
• Inconsistent performance across conditions`,

  metacognition: `Key Benchmarks to Look For:
Confidence Calibration: Calibration metrics, ECE
Uncertainty Quantification: UQ benchmarks
Self-Assessment: Metacognitive accuracy tests
Know-Unknown: Known Unknowns benchmarks
Error Detection: Self-correction capabilities

Evaluation Focus:
• Confidence calibration accuracy
• Uncertainty expression and quantification
• Self-monitoring and error detection
• Knowledge boundary awareness
• Adaptive reasoning based on confidence

Common Risk Areas:
• Overconfidence in incorrect responses
• Poor uncertainty quantification
• Inability to recognize knowledge limits`,

  "robotic-intelligence": `Key Benchmarks to Look For:
Integrated Tasks: RoboCup, DARPA challenges
Navigation: Habitat challenges, real-world navigation
Manipulation: Integrated pick-and-place scenarios
Human-Robot Interaction: HRI benchmarks
Autonomy: Long-horizon task completion

Evaluation Focus:
• Integrated sensorimotor capabilities
• Autonomous decision-making
• Adaptability to dynamic environments
• Human-robot collaboration
• Long-term task execution

Common Risk Areas:
• Safety in unstructured environments
• Unpredictable autonomous behavior
• Failure to handle edge cases`,

  "harmful-content": `Key Evaluations to Look For:
Safety Benchmarks: AIR-Bench, MLCommons AI Safety
Red Teaming: Anthropic Constitutional AI, HarmBench
Content Filtering: Jigsaw Toxic Comments, HASOC
Adversarial: Jailbreaking attempts, prompt injection
Regulatory: NIST AI RMF compliance

Evaluation Focus:
• Refusal to generate harmful content
• Robustness against adversarial prompts
• Content filtering effectiveness
• Detection of subtle harmful content
• Consistency across different prompt styles

Critical Risk Areas:
• Violence and self-harm content
• Hate speech and discrimination
• Illegal activity instructions
• NSFW and inappropriate content`,

  "information-integrity": `Key Evaluations to Look For:
Factuality: TruthfulQA, FEVER, HaluEval
Hallucination Detection: SelfCheckGPT, FActScore
Misinformation: LIAR dataset, fake news detection
Citation Accuracy: Citation verification benchmarks
Source Attribution: Provenance tracking tests

Evaluation Focus:
• Factual accuracy of generated content
• Hallucination rate and detection
• Proper source attribution
• Misinformation resistance
• Consistency across related queries

Critical Risk Areas:
• Medical misinformation
• Political disinformation
• False historical claims
• Fabricated citations`,

  "privacy-data": `Key Evaluations to Look For:
Membership Inference: MIA benchmarks, CopyMark
Data Extraction: Training data extraction tests
PII Detection: Personal information leakage tests
Anonymization: De-identification benchmarks
GDPR Compliance: Right to be forgotten tests

Evaluation Focus:
• Training data memorization
• PII leakage prevention
• Membership inference resistance
• Data anonymization effectiveness
• Compliance with privacy regulations

Critical Risk Areas:
• Personal information exposure
• Training data memorization
• Inference of sensitive attributes
• Non-consensual data use`,

  "bias-fairness": `Key Evaluations to Look For:
Bias Benchmarks: Winogender, CrowS-Pairs, BOLD
Fairness Metrics: AI Fairness 360, Fairlearn
Demographic Bias: Representation across groups
Intersectional: Multi-dimensional bias analysis
Allocative Fairness: Resource distribution equity

Evaluation Focus:
• Demographic representation fairness
• Performance equity across groups
• Intersectional bias analysis
• Harmful stereotype perpetuation
• Allocative fairness in decisions

Critical Risk Areas:
• Employment discrimination
• Healthcare disparities
• Educational bias
• Criminal justice bias`,

  "security-robustness": `Key Evaluations to Look For:
Adversarial Robustness: AdvBench, RobustBench
Prompt Injection: AgentDojo, prompt injection tests
Model Extraction: Model theft resistance
Backdoor Detection: Trojaned model detection
OWASP LLM Top 10: Security vulnerability assessment

Evaluation Focus:
• Adversarial attack resistance
• Prompt injection robustness
• Model extraction protection
• Backdoor and trojan detection
• Input validation effectiveness

Critical Risk Areas:
• Prompt injection attacks
• Model theft and extraction
• Adversarial examples
• Supply chain attacks`,

  "dangerous-capabilities": `Key Evaluations to Look For:
CBRN Assessment: WMD information evaluation
Dual-Use: Misuse potential analysis
Cyber Capabilities: Offensive cyber evaluation
Weapons Information: Dangerous instruction filtering
Government Protocols: AISI, NIST evaluation standards

Evaluation Focus:
• CBRN information filtering
• Dual-use technology assessment
• Offensive capability evaluation
• Dangerous instruction refusal
• Misuse potential quantification

Critical Risk Areas:
• Chemical/biological weapons info
• Cyber attack capabilities
• Physical harm instructions
• Illegal activity facilitation`,

  "human-ai-interaction": `Key Evaluations to Look For:
Trust Calibration: Trust-LLM, reliance calibration metrics
Manipulation Detection: Emotional manipulation detection benchmarks
Anthropomorphism: Human-likeness perception studies
Safety in Dialogue: HAX, RealToxicityPrompts
User Guidance: Task adherence and guidance clarity tests

Evaluation Focus:
• Preventing over-reliance on AI
• Avoiding deceptive or manipulative responses
• Maintaining transparency about capabilities and limitations
• Providing safe, non-coercive interactions
• Ensuring user agency and decision-making control

Critical Risk Areas:
• Emotional manipulation
• Excessive trust leading to poor decisions
• Misrepresentation of capabilities
• Encouraging harmful behaviors`,

  "environmental-impact": `Key Evaluations to Look For:
Energy Usage: Carbon footprint estimation tools
Sustainability Metrics: Green AI benchmarks
Model Efficiency: Inference cost evaluations
Hardware Utilization: Resource optimization tests
Lifecycle Assessment: Full training-to-deployment impact analysis

Evaluation Focus:
• Measuring carbon footprint and energy use
• Optimizing for efficiency without performance loss
• Assessing environmental trade-offs
• Promoting sustainable deployment strategies

Critical Risk Areas:
• High carbon emissions from training
• Excessive energy use in inference
• Lack of transparency in environmental reporting`,

  "economic-displacement": `Key Evaluations to Look For:
Job Impact Studies: Task automation potential assessments
Market Disruption: Industry-specific displacement projections
Economic Modeling: Macro and microeconomic simulations
Skill Shift Analysis: Required workforce retraining benchmarks
Societal Impact: Equitable distribution of economic benefits

Evaluation Focus:
• Predicting job displacement risks
• Identifying emerging job opportunities
• Understanding shifts in skill demand
• Balancing automation benefits with societal costs

Critical Risk Areas:
• Large-scale unemployment
• Wage suppression
• Economic inequality`,

  "governance-accountability": `Key Evaluations to Look For:
Transparency: Model card completeness, datasheet reporting
Auditability: Traceability of decisions
Oversight Mechanisms: Compliance with governance frameworks
Responsibility Assignment: Clear chain of accountability
Standards Compliance: ISO, IEEE AI standards adherence

Evaluation Focus:
• Establishing clear accountability
• Ensuring decision traceability
• Meeting compliance and ethical guidelines
• Maintaining transparency across lifecycle

Critical Risk Areas:
• Lack of oversight
• Unclear responsibility in failures
• Insufficient transparency`,

  "value-chain": `Key Evaluations to Look For:
Provenance Tracking: Dataset and component origin verification
Third-Party Risk Assessment: Vendor dependency evaluations
Supply Chain Security: Software and hardware integrity checks
Integration Testing: Risk assessment in system integration
Traceability: End-to-end component documentation

Evaluation Focus:
• Managing third-party dependencies
• Verifying component provenance
• Securing the supply chain
• Mitigating integration risks

Critical Risk Areas:
• Compromised third-party components
• Data provenance issues
• Vendor lock-in and dependency risks`,
}

export const CATEGORIES = Object.entries(CATEGORY_DESCRIPTIONS).map(([id, data]) => ({
  id,
  ...data,
  detailedGuidance: CATEGORY_DETAILED_GUIDANCE[id as keyof typeof CATEGORY_DETAILED_GUIDANCE] || "",
}))

// Centralized hint mappings and recommended placeholders used by the UI.
export const CATEGORY_HINTS: Record<string, { benchmark: string; process: string }> = {
  "language-communication": {
    benchmark:
      "Hint: mention benchmarks for language understanding/generation, prompt settings, multilingual splits, and whether factuality checks were performed.",
    process:
      "Hint: note consulted linguists or annotators, dataset provenance concerns, and any applicable content/regulatory considerations.",
  },
  "social-intelligence": {
    benchmark: "Hint: mention emotion/social reasoning benchmarks used, annotator protocols, and demographic coverage.",
    process: "Hint: list consulted domain experts (psychologists, sociologists), user study details, and consent/ethics notes.",
  },
  "problem-solving": {
    benchmark: "Hint: list math/programming/reasoning benchmarks, scoring rules, and seed/temperature settings.",
    process: "Hint: note expert reviewers, validation of solutions, and how ambiguous answers were adjudicated.",
  },
  "creativity-innovation": {
    benchmark: "Hint: mention creative evaluation setups, human rating protocols, and diversity of prompts/tasks.",
    process: "Hint: note creative experts or juries consulted, copyright/IP checks, and content filtering policies.",
  },
  "learning-memory": {
    benchmark: "Hint: indicate few-shot/transfer benchmarks, replay/continual learning setups, and sample sizes.",
    process: "Hint: describe retention tests, dataset refresh cadence, and any contamination checks performed.",
  },
  "perception-vision": {
    benchmark: "Hint: list vision datasets, augmentation/robustness tests, and evaluation resolutions/settings.",
    process: "Hint: note labelling protocols, demographic coverage of imagery, and reviewer/ethical considerations.",
  },
  "physical-manipulation": {
    benchmark: "Hint: mention robotics tasks, real/sim evaluation conditions, and safety/collision metrics.",
    process: "Hint: include safety review notes, field test observers, and incident mitigation procedures.",
  },
  "metacognition": {
    benchmark: "Hint: report calibration metrics, uncertainty quantification methods, and multi-seed variance.",
    process: "Hint: list reviewers who evaluated uncertainty reporting and any user-facing confidence disclosures.",
  },
  "robotic-intelligence": {
    benchmark: "Hint: note integrated task suites, sim-to-real gaps, and hardware/configuration details.",
    process: "Hint: document safety reviews, human-in-the-loop safeguards, and autonomy limits.",
  },
  "harmful-content": {
    benchmark: "Hint: describe toxicity/harm benchmarks, prompt hardening, and red-team scenarios used.",
    process: "Hint: list safety reviewers, incident response plans, and content moderation policies referenced.",
  },
  "information-integrity": {
    benchmark: "Hint: mention fact-checking datasets, prompt calibrations, and hallucination detection metrics.",
    process: "Hint: note expert fact-checkers consulted, provenance practices, and external audit reports.",
  },
  "privacy-data": {
    benchmark: "Hint: include privacy tests, membership inference/MI defenses, and redaction results.",
    process: "Hint: list privacy officers consulted, data handling policies, and any regulatory mappings (e.g., GDPR).",
  },
  "bias-fairness": {
    benchmark: "Hint: indicate fairness metrics, subgroup breakdowns, and statistical significance of gaps.",
    process: "Hint: document which stakeholder groups and domain experts were engaged and mitigation steps taken.",
  },
  "security-robustness": {
    benchmark: "Hint: report adversarial tests, perturbation strengths, and failure rates under attack.",
    process: "Hint: include red-team summaries, security reviewers, and incident response procedures.",
  },
  "dangerous-capabilities": {
    benchmark: "Hint: describe tests for dual-use behaviors and misuse scenarios evaluated.",
    process: "Hint: note external safety reviews, legal counsel input, and controls/mitigations in place.",
  },
  "human-ai-interaction": {
    benchmark: "Hint: list usability/UX tasks, user study protocols, and measures of over-reliance or deception.",
    process: "Hint: capture which user groups were involved, consent procedures, and human factors reviewers.",
  },
  "environmental-impact": {
    benchmark: "Hint: report energy/perf tradeoff tests, FLOPs/throughput, and measured carbon estimates.",
    process: "Hint: include sustainability reviewers, lifecycle assessment notes, and mitigation plans.",
  },
  "economic-displacement": {
    benchmark: "Hint: mention labor-impact scenarios evaluated and economic modeling assumptions used.",
    process: "Hint: document stakeholder consultations, affected worker groups engaged, and mitigation strategies.",
  },
  "governance-accountability": {
    benchmark: "Hint: N/A for benchmarking; focus on process evidence instead.",
    process: "Hint: cite governance frameworks used, responsible owners, and escalation/audit trails.",
  },
  "value-chain": {
    benchmark: "Hint: include supply-chain dependency tests, third-party component assessments if applicable.",
    process: "Hint: note vendor audits, data sourcing reviews, and contractual safeguards.",
  },
}

export const CATEGORY_QUESTION_HINTS: Record<
  string,
  Record<string, { benchmark?: string; process?: string }>
> = {
  "language-communication": {
    A1: { benchmark: "List exact language benchmarks, dataset versions, prompt templates, split (train/val/test), and evaluation conditions." },
    A2: { benchmark: "State numeric thresholds and which regulatory or domain thresholds apply (e.g., accuracy, FPR/FNR targets)." },
    A3: { benchmark: "Provide side-by-side comparisons vs. baselines/SOTA, significance tests, and matched prompt/hyperparams." },
    A4: { benchmark: "Describe adversarial or distribution-shift tests (prompt perturbations, paraphrase attacks) and failure rates." },
    A5: { benchmark: "Explain live monitoring metrics (latency, error rate, hallucination rate), sampling cadence, and alert rules." },
    A6: { benchmark: "Document overlap checks (n‑gram, URL hashing), contamination rates, and mitigation steps taken." },
    B1: { process: "Define scope, claims being evaluated, success criteria (e.g., BLEU/F1 cutoffs), and evaluation hypotheses." },
    B2: { process: "List reproducibility artifacts (code, prompts, seeds), availability level, and proxies if materials are restricted." },
    B3: { process: "Name reviewers (linguists, annotators), review protocol, and how feedback was incorporated or adjudicated." },
    B4: { process: "Show how figures present uncertainty (CI, SE), axes choices, sample sizes, and raw tables for transparency." },
    B5: { process: "Reference any applicable standards (e.g., ISO, domain regs), mapping to practices, and noted gaps." },
    B6: { process: "Describe re-eval triggers (model updates, drift), versioned specs, audit trails, and retest procedures." },
  },

  "social-intelligence": {
    A1: { benchmark: "Cite emotion/social reasoning datasets, demographic breakdowns, and versioned splits used." },
    A2: { benchmark: "Specify thresholds for social safety metrics or fairness targets and how they were derived." },
    A3: { benchmark: "Compare against human baselines and prior models; include inter-rater agreement for subjective tasks." },
    A4: { benchmark: "Report robustness to adversarial roleplays, toxic prompts, or context manipulation and failure patterns." },
    A5: { benchmark: "Document in-field monitoring of social interactions, escalations, and rates of inappropriate responses." },
    A6: { benchmark: "Show contamination checks for dialogue datasets and steps to remove sensitive or toxic examples." },
    B1: { process: "Explain the claim scope (e.g., empathy, intent detection) and how applicability was determined." },
    B2: { process: "Provide reproduction artifacts or explain why dialogue data/prompts cannot be shared and offer proxies." },
    B3: { process: "List domain experts (psychologists, sociologists), study protocols, consent, and key feedback items." },
    B4: { process: "Ensure visualizations include uncertainty in subjective ratings and avoid misleading aggregations." },
    B5: { process: "Map evaluation to relevant ethical or safety standards and note any compliance gaps." },
    B6: { process: "Describe monitoring cadence for social harms, incident playbooks, and retest triggers after fixes." },
  },

  "problem-solving": {
    A1: { benchmark: "List math/reasoning/code benchmarks used (GSM8K, MATH, HumanEval) and configuration details." },
    A2: { benchmark: "State numeric performance thresholds (e.g., pass rates) and how they map to acceptance criteria." },
    A3: { benchmark: "Provide baselines, previous-version comparisons, and statistical tests for score deltas." },
    A4: { benchmark: "Describe stress tests (noisy inputs, truncated context) and observed degradation rates." },
    A5: { benchmark: "Note any online monitoring of problem-solving failures and metrics for automated quality checks." },
    A6: { benchmark: "Document train/test overlap with known solution sources and contamination mitigation steps." },
    B1: { process: "Clarify which problem-solving claims are evaluated and define success/failure concretely." },
    B2: { process: "Provide replication packages (notebooks, seeds) or explain access restrictions and proxies." },
    B3: { process: "Record expert reviewers (domain experts, graders), rubric instructions, and adjudication rules." },
    B4: { process: "Include uncertainty (multi-seed variance), example failures, and full result tables for transparency." },
    B5: { process: "Note alignment with domain standards (education, clinical) and list any exemptions or gaps." },
    B6: { process: "Describe scheduled re-evals after model updates and procedures for retesting failing cases." },
  },

  // (other category question hints omitted for brevity - full set can be expanded later)
}

export const RECOMMENDED_BENCHMARKS: Record<string, string> = {
  "language-communication": "e.g., MMLU, BBH, SuperGLUE",
  "social-intelligence": "e.g., SocialIQA, EmoBench, PersonaChat (human-eval)",
  "problem-solving": "e.g., GSM8K, MATH, HumanEval",
  "creativity-innovation": "e.g., human preference studies, CREAM (human-eval)",
  "learning-memory": "e.g., few-shot transfer suites, continual-learning benchmarks",
  "perception-vision": "e.g., ImageNet, COCO, VQA",
  "physical-manipulation": "e.g., RoboSuite, YCB benchmarks, real/sim task suites",
  "metacognition": "e.g., calibration datasets (ECE), uncertainty benchmarks",
  "robotic-intelligence": "e.g., Habitat, AI2-THOR, DARPA challenge tasks",
  "harmful-content": "e.g., toxicity/harm benchmarks like ToxicBERT evals, red-team suites",
  "information-integrity": "e.g., FEVER, fact-checking datasets, hallucination benchmarks",
  "privacy-data": "e.g., membership-inference tests, MI challenge datasets",
  "bias-fairness": "e.g., fairness benchmark suites (subgroup metrics), demographic breakdown tests",
  "security-robustness": "e.g., adversarial robustness suites, attack-replay benchmarks",
  "dangerous-capabilities": "e.g., dual-use/red-team evaluation suites (internal or published)",
  "human-ai-interaction": "e.g., user-study protocols, SUS, human preference tests",
  "environmental-impact": "e.g., FLOPs/energy measurement reports, carbon accounting tests",
  "economic-displacement": "e.g., scenario/projection models, labor-impact analyses",
  "governance-accountability": "e.g., audit logs, governance checklists (process evidence)",
  "value-chain": "e.g., third-party audit reports, supply-chain assessments",
}

export const RECOMMENDED_METRICS: Record<string, string> = {
  "language-communication": "e.g., accuracy, F1, BLEU, ROUGE, BERTScore",
  "social-intelligence": "e.g., human rating scores, agreement rates, F1 for intent detection",
  "problem-solving": "e.g., exact-match, pass@k, accuracy, solution correctness percentage",
  "creativity-innovation": "e.g., human preference %, novelty/diversity scores",
  "learning-memory": "e.g., few-shot accuracy, retention rate, forgetting metric",
  "perception-vision": "e.g., mAP, IoU, top-1/top-5 accuracy",
  "physical-manipulation": "e.g., success rate, collision rate, completion time",
  "metacognition": "e.g., ECE, calibration error, confidence-accuracy correlation",
  "robotic-intelligence": "e.g., task success rate, path efficiency, failure modes count",
  "harmful-content": "e.g., toxicity rate, harmful-response rate, false negative rate for filters",
  "information-integrity": "e.g., precision/recall of fact-checking, citation accuracy",
  "privacy-data": "e.g., membership inference advantage, reconstruction error rates",
  "bias-fairness": "e.g., subgroup parity gaps, disparate impact ratios, statistical significance",
  "security-robustness": "e.g., attack success rate, robustness delta under perturbation",
  "dangerous-capabilities": "e.g., misuse rate under red-team prompts, severity counts",
  "human-ai-interaction": "e.g., SUS, task completion rate, user satisfaction scores",
  "environmental-impact": "e.g., energy per inference, carbon per training run",
  "economic-displacement": "e.g., projected job impact metrics, economic sensitivity metrics",
  "governance-accountability": "e.g., audit coverage %, policy alignment scoring",
  "value-chain": "e.g., vendor risk scores, dependency vulnerability counts",
}

export const defaultHints = {
  benchmark: "Hint: include relevant benchmark settings, scoring rules, and notable limitations.",
  process: "Hint: mention reviewers consulted, applicable standards/regulations, and scope limitations.",
}

export function getFieldPlaceholder(categoryId: string, questionId: string, field: "benchmarkName" | "metrics") {
  if (field === "benchmarkName") return RECOMMENDED_BENCHMARKS[categoryId] || "e.g., MMLU, HellaSwag, GSM8K"
  return RECOMMENDED_METRICS[categoryId] || "e.g., accuracy, F1, BLEU, perplexity"
}

export function getHint(categoryId: string, questionId: string, section: "benchmark" | "process") {
  const catQ = CATEGORY_QUESTION_HINTS[categoryId]
  const qHints = catQ ? catQ[questionId] : undefined
  if (qHints && qHints[section]) return qHints[section]
  if (CATEGORY_HINTS[categoryId] && CATEGORY_HINTS[categoryId][section]) return CATEGORY_HINTS[categoryId][section]
  return defaultHints[section]
}
