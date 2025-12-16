# Fake Data Realism Improvements

## Summary of Changes

The fake benchmark data in `public/benchmarks/` has been significantly improved for realism. Below are the key changes made:

## 1. Model-Appropriate Benchmarks

### Before
- All models (including text-only ones like Llama 3 70B) had vision benchmarks like ImageNet, COCO, etc.
- This was unrealistic as not all models support vision capabilities

### After
- **Vision-capable models** (GPT-4o, Claude 3.5 Sonnet): Retain both text and vision benchmarks
- **Text-only models** (Llama 3, Gemma 2, Mistral, Qwen): Only text-based benchmarks
- Removed 20+ inappropriate vision benchmarks from text-only models

## 2. Varied Subtask Scores

### Before
```json
"score_details": {
  "score": 0.8139729122234507,
  "details": {
    "subtask_a": 0.8139729122234507,  // Identical!
    "subtask_b": 0.8139729122234507   // Identical!
  }
}
```

### After
```json
"score_details": {
  "score": 0.8139729122234507,
  "details": {
    "subtask_a": 0.8800539952602863,  // Realistic variation
    "subtask_b": 0.880101341330493    // Different scores
  }
}
```

Subtask scores now vary naturally around the overall score with realistic variance (±8%).

## 3. Realistic Sample Data

### Before
- Generic templates: "Test input question 0 for GPT-4o..."
- All samples had identical 0.85 scores
- Only 5 samples per model
- No realistic question/answer content

### After
- **10 diverse samples** per model with:
  - Real questions: "What is the capital of France?", "Write a Python function to reverse a string"
  - Realistic ground truth answers
  - Varied model responses (different phrasings of correct answers)
  - Natural score distribution (0.60 - 0.95)
  - Mix of question types: QA, reasoning, coding

Example:
```json
{
  "sample_id": "sample_0",
  "input": "Write a Python function to reverse a string",
  "ground_truth": "def reverse_string(s):\n    return s[::-1]",
  "response": "def reverse_string(text):\n    return ''.join(reversed(text))",
  "score": 0.75
}
```

## 4. Model-Specific Score Adjustments

Scores now reflect realistic performance differences between models:
- **GPT-4o**: 1.0x (baseline, top tier)
- **Claude 3.5 Sonnet**: 0.98x (very close, slightly behind)
- **Mistral Large**: 0.88x (strong performer)
- **Llama 3 70B**: 0.85x (good but not best)
- **Qwen 2 72B**: 0.83x (solid performance)
- **Gemma 2 27B**: 0.80x (smaller model)

Special adjustments:
- Claude gets +5% on coding benchmarks (known strength)
- Claude gets +2% on fairness/safety benchmarks

## 5. Realistic Metadata

### Before
- "Demo Benchmark Suite"
- "General Eval Card Demo"
- "Demo Evaluation Suite"

### After
- "Multi-Domain Benchmark Collection"
- "OpenAI Research" (for GPT-4o)
- "Anthropic Research" (for Claude)
- "Meta Research" (for Llama)
- Model-specific evaluation suite names

## 6. Timestamp Variation

Evaluation timestamps now have realistic variation in hours, minutes, and seconds instead of appearing artificially synchronized.

## Results

### Benchmark Counts by Model
- **GPT-4o**: 53 benchmarks (text + vision)
- **Claude 3.5 Sonnet**: 52 benchmarks (text + vision)
- **Llama 3 70B**: 23 benchmarks (text only) ✓
- **Mistral Large**: 22 benchmarks (text only) ✓
- **Qwen 2 72B**: 22 benchmarks (text only) ✓
- **Gemma 2 27B**: 17 benchmarks (text only) ✓

### Sample Quality
- 10 realistic samples per model (up from 5)
- Natural score distribution (0.60-0.95)
- Diverse question types and realistic responses
- Proper ground truth and model response variations

## How to Regenerate

If you need to regenerate or further improve the data:

```bash
node scripts/improve-fake-data-realism.js
```

The script is idempotent and can be run multiple times safely.
