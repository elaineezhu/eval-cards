const fs = require('fs');
const path = require('path');

const BENCHMARKS_DIR = path.join(__dirname, '..', 'public', 'benchmarks');

const MODEL_TIERS = {
    'openai-gpt-4o.json': { tier: 1, name: 'GPT-4o' },
    'anthropic-claude-3-5-sonnet.json': { tier: 1, name: 'Claude 3.5 Sonnet' },
    'meta-llama-3-70b.json': { tier: 2, name: 'Llama 3 70B' },
    'mistral-mistral-large.json': { tier: 2, name: 'Mistral Large' },
    'alibaba-qwen-2-72b.json': { tier: 2, name: 'Qwen 2 72B' },
    'google-gemma-2-27b.json': { tier: 3, name: 'Gemma 2 27B' }
};

// Base scores for tiers (0.0 - 1.0)
const TIER_BASE_SCORES = {
    1: 0.88,
    2: 0.78,
    3: 0.65
};

// Probability of having a specific "niche" benchmark (fake ones)
const TIER_AVAILABILITY = {
    1: 0.95, // High tier has almost everything
    2: 0.70,
    3: 0.40
};

const FAKE_CATEGORIES = [
    'Calibration', 'Adversarial', 'Memorization', 'Fairness', 
    'Leakage/Contamination', 'Privacy', 'Interpretability', 
    'Efficiency', 'Retrainability', 'Meta-Learning'
];

function getRandomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateTieredScore(tier) {
    const base = TIER_BASE_SCORES[tier];
    // Variation: +/- 0.10, clamped to 0.1-0.99
    let score = base + (Math.random() * 0.2 - 0.1);
    return Math.max(0.1, Math.min(0.99, score));
}

function main() {
    const files = fs.readdirSync(BENCHMARKS_DIR);
    const startDate = new Date('2024-08-01');
    const endDate = new Date('2024-12-15');

    for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const filePath = path.join(BENCHMARKS_DIR, file);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const modelConfig = MODEL_TIERS[file] || { tier: 2 }; // Default to tier 2
        
        console.log(`Refining ${file} (Tier ${modelConfig.tier})...`);

        // Update top-level timestamp
        const fileDate = getRandomDate(startDate, endDate);
        content.retrieved_timestamp = fileDate.toISOString();

        // Filter and update results
        content.evaluation_results = content.evaluation_results.filter(result => {
            const category = result.factsheet?.functional_props || '';
            const isFakeCategory = FAKE_CATEGORIES.some(c => category.includes(c));
            
            // Decide availability for fake categories
            if (isFakeCategory) {
                if (Math.random() > TIER_AVAILABILITY[modelConfig.tier]) {
                    return false; // Remove this benchmark
                }
            }
            return true;
        }).map(result => {
            const category = result.factsheet?.functional_props || '';
            const isFakeCategory = FAKE_CATEGORIES.some(c => category.includes(c));

            // Update timestamp
            // Some variation in date per benchmark
            const evalDate = getRandomDate(new Date(fileDate.getTime() - 30*24*60*60*1000), fileDate);
            result.evaluation_timestamp = evalDate.toISOString();

            // Update score if it's a fake category
            if (isFakeCategory) {
                const newScore = generateTieredScore(modelConfig.tier);
                result.score_details.score = newScore;
                if (result.score_details.details) {
                    Object.keys(result.score_details.details).forEach(k => {
                        result.score_details.details[k] = newScore;
                    });
                }
            }

            return result;
        });
        
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
    }
    
    console.log("Done refining data.");
}

main();
