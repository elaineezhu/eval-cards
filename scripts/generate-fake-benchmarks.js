const fs = require('fs');
const path = require('path');

const BENCHMARKS_DIR = path.join(__dirname, '..', 'public', 'benchmarks');

const MISSING_CATEGORIES = [
    {
        category: 'Calibration',
        benchmarks: [
            {
                name: 'Confidence Calibration Suite',
                description: 'Measures how well the model\'s predicted probabilities align with empirical frequencies.',
                metric: 'Expected Calibration Error (ECE)'
            }
        ]
    },
    {
        category: 'Adversarial',
        benchmarks: [
            {
                name: 'AdvGLUE',
                description: 'Adversarial GLUE benchmark for robustness against adversarial attacks.',
                metric: 'Robust Accuracy'
            },
            {
                name: 'JailbreakBench',
                description: 'Evaluates resistance to jailbreak attempts.',
                metric: 'Attack Success Rate'
            }
        ]
    },
    {
        category: 'Memorization',
        benchmarks: [
            {
                name: 'The Pile Extraction',
                description: 'Measures the rate of verbatim memorization from training data.',
                metric: 'Extraction Rate'
            },
            {
                name: 'Copyright Probe',
                description: 'Tests for reproduction of copyrighted material.',
                metric: 'Reproduction Score'
            }
        ]
    },
    {
        category: 'Fairness',
        benchmarks: [
            {
                name: 'BBQ (Bias Benchmark for QA)',
                description: 'Assesses bias in Question Answering models across multiple social dimensions.',
                metric: 'Bias Score'
            },
            {
                name: 'CrowS-Pairs',
                description: 'Crowdsourced Stereotype Pairs benchmark.',
                metric: 'Stereotype Score'
            }
        ]
    },
    {
        category: 'Leakage/Contamination',
        benchmarks: [
            {
                name: 'Contamination Detector',
                description: 'Detects if test set data was present in the training set.',
                metric: 'Contamination Score'
            }
        ]
    },
    {
        category: 'Privacy',
        benchmarks: [
            {
                name: 'PII Detection',
                description: 'Evaluates the model\'s tendency to leak Personally Identifiable Information.',
                metric: 'Leakage Rate'
            }
        ]
    },
    {
        category: 'Interpretability',
        benchmarks: [
            {
                name: 'Explainability Harness',
                description: 'Measures the quality and faithfulness of model explanations.',
                metric: 'Faithfulness Score'
            }
        ]
    },
    {
        category: 'Efficiency',
        benchmarks: [
            {
                name: 'LLMPerf',
                description: 'Benchmarks inference latency and throughput.',
                metric: 'Tokens/sec'
            }
        ]
    },
    {
        category: 'Retrainability',
        benchmarks: [
            {
                name: 'CL-Benchmark',
                description: 'Continual Learning benchmark to measure forgetting.',
                metric: 'Forgetting Rate'
            }
        ]
    },
    {
        category: 'Meta-Learning',
        benchmarks: [
            {
                name: 'Meta-Dataset',
                description: 'Evaluates few-shot learning capabilities across diverse domains.',
                metric: 'Few-shot Accuracy'
            }
        ]
    }
];

function generateScore() {
    return 0.4 + Math.random() * 0.55;
}

function main() {
    const files = fs.readdirSync(BENCHMARKS_DIR);
    
    for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const filePath = path.join(BENCHMARKS_DIR, file);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        console.log(`Adding fake benchmarks to ${file}...`);
        
        const existingNames = new Set(content.evaluation_results.map(r => r.evaluation_name));
        
        for (const cat of MISSING_CATEGORIES) {
            for (const bench of cat.benchmarks) {
                if (existingNames.has(bench.name)) continue;
                
                const score = generateScore();
                
                content.evaluation_results.push({
                    evaluation_name: bench.name,
                    metric_config: {
                        evaluation_description: bench.description,
                        lower_is_better: false,
                        score_type: "continuous",
                        min_score: 0,
                        max_score: 1,
                        unit: bench.metric.toLowerCase().includes('rate') ? 'rate' : 'score'
                    },
                    score_details: {
                        score: score,
                        details: {
                            subtask_a: score,
                            subtask_b: score
                        }
                    },
                    factsheet: {
                        purpose: "Research; Development",
                        principles_tested: cat.category,
                        functional_props: cat.category, // This is key for the UI to pick it up
                        input_modality: "Text",
                        output_modality: "Text",
                        input_source: "Synthetic",
                        output_source: "Automatic",
                        size: "Medium",
                        splits: "Test",
                        design: "Fixed",
                        judge: "Automatic",
                        protocol: "Standard",
                        model_access: "Outputs",
                        has_heldout: false,
                        alignment_validation: "None",
                        baseline_models: "None",
                        robustness_measures: "None",
                        known_limitations: "Synthetic data",
                        benchmarks_list: bench.name
                    }
                });
            }
        }
        
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
    }
    
    console.log("Done adding fake benchmarks.");
}

main();
