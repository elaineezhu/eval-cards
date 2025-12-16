#!/usr/bin/env node

/**
 * Migration script to convert old checkbox-based evaluations to new benchmark-first format
 * 
 * Usage: node scripts/migrate-to-benchmarks.mjs
 */

import fs from 'fs/promises'
import path from 'path'

// Mapping of old categories to new categories
const CATEGORY_MAPPING = {
  'language-communication': 'language-communication',
  'problem-solving': 'reasoning',
  'creativity-innovation': 'creativity',
  'learning-memory': 'knowledge',
  'perception-vision': 'vision',
  'social-intelligence': 'social-intelligence',
  'harmful-content': 'toxicity',
  'bias-fairness': 'bias-fairness',
  'information-integrity': 'truthfulness',
  'security-robustness': 'robustness',
}

// Map old benchmark names to standardized ones
const BENCHMARK_MAPPING = {
  'MMLU, HellaSwag, ARC-Challenge, WinoGrande': 'MMLU',
  'TruthfulQA': 'TruthfulQA',
  'BBH': 'BBH',
}

async function migrateEvaluation(oldData) {
  const evaluations = []
  
  // Process each category
  for (const [categoryId, categoryData] of Object.entries(oldData.categoryEvaluations || {})) {
    const benchmarkSources = categoryData.benchmarkSources || {}
    
    // Process each benchmark question
    for (const [questionId, sources] of Object.entries(benchmarkSources)) {
      for (const source of sources) {
        if (!source.benchmarkName) continue
        
        const evaluation = {
          schema_version: '0.1',
          evaluation_id: `${oldData.id}_${categoryId}_${questionId}_${source.id}`,
          retrieved_timestamp: String(Date.now() / 1000),
          
          source_data: {
            dataset_name: source.benchmarkName || 'Unknown',
            samples_number: 0, // Unknown from old format
            dataset_version: source.version || 'unknown',
          },
          
          source_metadata: {
            source_name: oldData.evaluator || 'Unknown',
            source_type: source.sourceType === 'external' ? 'evaluation_run' : 'model_card',
            source_organization_name: oldData.provider || 'Unknown',
            source_organization_url: oldData.url || '',
            evaluator_relationship: source.sourceType === 'external' ? 'third_party' : 'first_party',
            source_url: source.url || '',
          },
          
          model_info: {
            name: oldData.systemName,
            id: oldData.id,
            developer: oldData.provider,
            model_version: oldData.version || oldData.modelTag,
            modalities: {
              input: oldData.inputModalities || ['text'],
              output: oldData.outputModalities || ['text'],
            },
          },
          
          evaluation_results: [
            {
              evaluation_name: `${source.benchmarkName} - ${source.metrics || 'accuracy'}`,
              evaluation_timestamp: String(Date.now() / 1000),
              metric_config: {
                evaluation_description: source.metrics || 'Accuracy',
                lower_is_better: false,
                score_type: 'continuous',
                min_score: 0.0,
                max_score: 1.0,
              },
              score_details: {
                score: parseScore(source.score),
                details: {},
              },
              detailed_evaluation_results_url: source.url,
              generation_config: {
                generation_args: {},
                additional_details: source.taskVariants || '',
              },
            },
          ],
        }
        
        evaluations.push(evaluation)
      }
    }
  }
  
  return evaluations
}

function parseScore(scoreString) {
  if (!scoreString) return 0
  
  // Extract first number from string like "87.4% MMLU"
  const match = scoreString.match(/(\d+\.?\d*)/)
  if (!match) return 0
  
  const value = parseFloat(match[1])
  
  // If it looks like a percentage, convert to 0-1
  if (value > 1 && value <= 100) {
    return value / 100
  }
  
  return value
}

async function main() {
  const oldEvalsDir = './public/evaluations'
  const newBenchmarksDir = './public/benchmarks'
  
  try {
    // Create benchmarks directory if it doesn't exist
    await fs.mkdir(newBenchmarksDir, { recursive: true })
    
    // Read all old evaluation files
    const files = await fs.readdir(oldEvalsDir)
    const jsonFiles = files.filter(f => f.endsWith('.json'))
    
    console.log(`Found ${jsonFiles.length} evaluation files to migrate`)
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(oldEvalsDir, file)
        const content = await fs.readFile(filePath, 'utf-8')
        const oldData = JSON.parse(content)
        
        console.log(`\nMigrating ${file}...`)
        console.log(`  System: ${oldData.systemName}`)
        
        const evaluations = await migrateEvaluation(oldData)
        
        console.log(`  Generated ${evaluations.length} benchmark evaluations`)
        
        // Write each evaluation as a separate file, or combine them
        // For now, we'll write the first one as a sample
        if (evaluations.length > 0) {
          const outputFile = path.join(newBenchmarksDir, file)
          await fs.writeFile(
            outputFile,
            JSON.stringify(evaluations[0], null, 2)
          )
          console.log(`  Wrote to ${outputFile}`)
        }
      } catch (error) {
        console.error(`  Error migrating ${file}:`, error.message)
      }
    }
    
    console.log('\nMigration complete!')
    console.log('\nNote: This is a basic migration. You should:')
    console.log('1. Review generated files for accuracy')
    console.log('2. Add missing metadata (sample counts, confidence intervals)')
    console.log('3. Verify score conversions')
    console.log('4. Add detailed sample results if available')
    
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

main()
