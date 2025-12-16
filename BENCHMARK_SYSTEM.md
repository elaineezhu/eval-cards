# Benchmark-First Evaluation System

This system has been redesigned to use a **benchmark-first** approach based on the [evalevalai.com](https://evalevalai.com/projects/every-eval-ever/) schema, moving away from the previous checkbox-based evaluation method.

## Key Changes

### 1. Schema Structure

The new system uses standardized benchmark evaluation data with the following structure:

```typescript
{
  schema_version: string
  evaluation_id: string
  retrieved_timestamp: string
  
  source_data: {
    dataset_name: string
    hf_repo?: string
    samples_number: number
    // ...
  }
  
  source_metadata: {
    source_name: string
    source_type: 'evaluation_run' | 'model_card' | 'paper' | 'leaderboard'
    evaluator_relationship: 'first_party' | 'second_party' | 'third_party'
    // ...
  }
  
  model_info: {
    name: string
    id: string
    developer: string
    // ...
  }
  
  evaluation_results: [{
    evaluation_name: string
    metric_config: {
      evaluation_description: string
      score_type: 'continuous' | 'discrete' | 'binary'
      min_score: number
      max_score: number
    }
    score_details: {
      score: number
      confidence_interval?: {...}
    }
    generation_config?: {...}
  }]
}
```

### 2. New Components

#### **BenchmarkEvaluationCard** (`components/benchmark-evaluation-card.tsx`)
Displays a model's evaluation summary with:
- Model name and developer
- Number of benchmarks and evaluations
- Top scores across benchmarks
- Capability and risk category counts

#### **BenchmarkDetail** (`components/benchmark-detail.tsx`)
Detailed view showing:
- All evaluation results grouped by dataset
- Tabbed views for capabilities vs risks
- Score details with confidence intervals
- Generation configs and source links

### 3. New Pages

#### **`/benchmarks`** (`app/benchmarks/page.tsx`)
Main listing page with:
- Filter by evaluation type (capability/risk)
- Filter by specific category
- Sort by date, name, or benchmark count
- Grid view of evaluation cards

#### **`/benchmark/[id]`** (`app/benchmark/[id]/page.tsx`)
Detail page for individual model evaluations with comprehensive results

### 4. Data Processing

#### **Type Definitions** (`lib/benchmark-schema.ts`)
- Full TypeScript types for the evaluation schema
- Category classification (capabilities vs risks)
- Helper functions for inference

#### **Processing Utilities** (`lib/eval-processing.ts`)
- Load and validate evaluation data
- Group evaluations by model
- Create display-friendly summaries
- Format scores and dates

## Category Mapping

The system automatically infers categories from benchmark names:

### Capabilities
- **knowledge**: MMLU, ARC, HellaSwag, WinoGrande
- **math**: GSM8K, MATH, Minerva
- **code**: HumanEval, MBPP
- **vision**: VQA, image benchmarks
- **reasoning**: BBH (Big-Bench Hard)

### Risks
- **bias-fairness**: BBQ, bias benchmarks
- **toxicity**: RealToxicityPrompts
- **truthfulness**: TruthfulQA
- **robustness**: Adversarial benchmarks

## Data Format

Place evaluation JSON files in `/public/benchmarks/` following the schema structure. The system will:
1. Load all evaluation files
2. Group by model ID
3. Create aggregated summaries
4. Display in cards and detail views

## Sample Data

Three sample evaluations are included:
- **Kimi K2 Instruct**: MMLU-Pro with chain-of-thought
- **GPT-4 Turbo**: MMLU 5-shot accuracy
- **Claude 3 Sonnet**: HellaSwag 10-shot accuracy

## Benefits Over Checkbox System

1. **Standardized Data**: Uses established benchmark datasets
2. **Reproducible**: Includes all evaluation metadata
3. **Quantitative**: Shows actual scores with confidence intervals
4. **Traceable**: Links to source evaluations and detailed results
5. **Comparative**: Easy to compare models on same benchmarks
6. **Transparent**: Shows who ran the evaluation and when

## Migration Path

To migrate existing evaluations:
1. Extract benchmark results from old format
2. Map to new schema structure
3. Add source metadata
4. Include generation configs if available
5. Place in `/public/benchmarks/`

The old evaluation format and pages remain intact for reference.
