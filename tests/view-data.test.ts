import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"

import { DuckDBConnection } from "@duckdb/node-api"
import { describe, expect, it, vi } from "vitest"

import collectionContextFixture from "./fixtures/collection_context.json"

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

async function copyParquet(connection: DuckDBConnection, sql: string, outputPath: string) {
  await connection.run(`COPY (${sql}) TO ${sqlString(outputPath)} (FORMAT parquet)`)
}

async function writeSyntheticStageJSnapshot(
  snapshotDir: string,
  options: {
    includeMergedView?: boolean
    includeCollections?: boolean
    includeTrajectories?: boolean
    includeCollectionContext?: boolean
  } = {},
) {
  // includeMergedView=false emulates a pre-merged-view snapshot: no
  // merged_evals_view.parquet and no metric_id_effective /
  // scale_conversion / score_canonical columns on eval_results_view.
  // includeCollections=false (the default) emulates a pre-collections
  // snapshot: no collection_id / protocol_condition columns and no
  // collections.json sidecar. includeTrajectories controls the optional
  // collection_trajectories.parquet independently, and
  // includeCollectionContext (default false — every snapshot before the
  // scaffold-context bake) the collection_context.json sidecar.
  const {
    includeMergedView = true,
    includeCollections = false,
    includeTrajectories = includeCollections,
    includeCollectionContext = false,
  } = options
  await mkdir(snapshotDir, { recursive: true })
  const connection = await DuckDBConnection.create()

  await copyParquet(
    connection,
    `
      SELECT
        TIMESTAMP '2026-05-03 00:00:00' AS snapshot_id,
        'openai/gpt-5' AS model_key,
        'openai/gpt-5' AS model_id,
        'openai/gpt-5' AS id,
        'openai%2Fgpt-5' AS route_id,
        'openai%2Fgpt-5' AS model_route_id,
        'openai/gpt-5' AS model_group_id,
        'GPT 5' AS model_name,
        'GPT 5' AS canonical_model_name,
        'GPT 5' AS model_family_name,
        'OpenAI' AS developer,
        DATE '2026-01-01' AS release_date,
        'https://example.test/model' AS model_url,
        'transformer' AS architecture,
        '100B' AS params,
        100.0 AS params_billions,
        ['text']::VARCHAR[] AS input_modalities,
        ['text']::VARCHAR[] AS output_modalities,
        'engine' AS inference_engine,
        'platform' AS inference_platform,
        1::BIGINT AS evaluations_count,
        1::BIGINT AS benchmarks_count,
        1::INTEGER AS variant_count,
        1::BIGINT AS evaluator_count,
        ['OpenAI']::VARCHAR[] AS evaluator_names,
        ['OpenAI']::VARCHAR[] AS verified_evaluator_names,
        1::INTEGER AS source_type_count,
        ['documentation']::VARCHAR[] AS source_types,
        0::BIGINT AS third_party_eval_count,
        0.0 AS independent_verification_ratio,
        1::BIGINT AS evidence_count,
        0::INTEGER AS missing_generation_config_count,
        TIMESTAMP '2026-05-03 00:00:00' AS latest_timestamp,
        'OpenAI' AS latest_source_name,
        ['MMLU']::VARCHAR[] AS benchmark_names,
        ['applied_reasoning']::VARCHAR[] AS derived_tags,
        '{"applied_reasoning":1}'::JSON AS tag_stats,
        'complete' AS reproducibility_status,
        struct_pack(results_total := 1, has_reproducibility_gap_count := 0, populated_ratio_avg := 1.0) AS reproducibility_summary,
        struct_pack(
          total_results := 1,
          total_groups := 1,
          multi_source_groups := 0,
          first_party_only_groups := 1,
          source_type_distribution := struct_pack(first_party := 1, third_party := 0, collaborative := 0, unspecified := 0)
        ) AS provenance_summary,
        struct_pack(
          total_groups := 1,
          groups_with_variant_check := 0,
          groups_with_cross_party_check := 0,
          variant_divergent_count := 0,
          cross_party_divergent_count := 0
        ) AS comparability_summary,
        [struct_pack(name := 'openai-evals', version := '1.0', fork := NULL::VARCHAR)] AS eval_libraries,
        struct_pack(count := 1, min := 0.8, max := 0.8, average := 0.8) AS score_summary,
        [struct_pack(benchmark := 'MMLU', benchmarkKey := 'mmlu', score := 0.8, metric := 'accuracy')] AS top_scores,
        ['https://example.test/source']::VARCHAR[] AS source_urls,
        []::VARCHAR[] AS detail_urls,
        [struct_pack(
          variant_id := 'default',
          variant_key := 'default',
          variant_label := 'Default',
          variant_display_name := 'GPT 5',
          raw_model_ids := ['openai/gpt-5']::VARCHAR[],
          family_id := 'openai/gpt-5',
          family_name := 'GPT 5',
          version_date := NULL::VARCHAR,
          version_qualifier := NULL::VARCHAR,
          total_evaluations := 1,
          last_updated := TIMESTAMP '2026-05-03 00:00:00',
          tags_covered := ['applied_reasoning']::VARCHAR[]
        )] AS variants,
        ['openai/gpt-5', 'openai/GPT-5-Folded-2025-08-07']::VARCHAR[] AS raw_model_ids
    `,
    path.join(snapshotDir, "models_view.parquet")
  )

  await connection.run(
    `
      CREATE OR REPLACE TABLE evals_fixture AS
      SELECT
        TIMESTAMP '2026-05-03 00:00:00' AS snapshot_id,
        'mmlu' AS evaluation_id,
        'mmlu' AS benchmark_id,
        'accuracy' AS primary_metric_id,
        'MMLU' AS evaluation_name,
        'MMLU' AS canonical_display_name,
        'mmlu' AS composite_benchmark_key,
        'MMLU' AS composite_benchmark_name,
        'mmlu' AS composite_slug,
        'MMLU' AS composite_display_name,
        'mmlu' AS family_id,
        'MMLU' AS family_display_name,
        false AS is_slice,
        NULL AS parent_benchmark_id,
        '["applied_reasoning"]' AS derived_tags,
        struct_pack(
          evaluation_description := 'Accuracy on MMLU',
          lower_is_better := false,
          score_type := 'continuous',
          min_score := 0.0,
          max_score := 1.0,
          unit := 'proportion'
        ) AS metric_config,
        1::BIGINT AS models_count,
        ['OpenAI']::VARCHAR[] AS evaluator_names,
        ['OpenAI']::VARCHAR[] AS verified_evaluator_names,
        ['documentation']::VARCHAR[] AS source_types,
        'OpenAI' AS latest_source_name,
        0.0 AS third_party_ratio,
        0::INTEGER AS missing_generation_config_count,
        struct_pack(name := 'GPT 5', score := 0.8) AS best_model,
        struct_pack(name := 'GPT 5', score := 0.8) AS worst_model,
        0.8 AS avg_score,
        0.8 AS avg_score_norm,
        0.8 AS top_score,
        false AS has_card,
        NULL AS benchmark_card,
        false AS is_aggregated,
        [] AS aggregate_sources,
        false AS is_summary_score,
        []::VARCHAR[] AS constituent_evaluation_ids,
        struct_pack(domains := ['knowledge']::VARCHAR[], languages := ['en']::VARCHAR[], tasks := ['qa']::VARCHAR[]) AS tags,
        struct_pack(
          dataset_name := 'MMLU',
          source_type := 'documentation',
          hf_repo := NULL::VARCHAR,
          hf_split := NULL::VARCHAR,
          samples_number := 10,
          url := ['https://example.test/mmlu']::VARCHAR[],
          dataset_url := 'https://example.test/mmlu',
          dataset_version := 'v1'
        ) AS source_data,
        struct_pack(results_total := 1, has_reproducibility_gap_count := 0, populated_ratio_avg := 1.0) AS reproducibility_summary,
        struct_pack(
          total_results := 1,
          total_groups := 1,
          multi_source_groups := 0,
          first_party_only_groups := 1,
          source_type_distribution := struct_pack(first_party := 1, third_party := 0, collaborative := 0, unspecified := 0)
        ) AS provenance_summary,
        struct_pack(
          total_groups := 1,
          groups_with_variant_check := 0,
          groups_with_cross_party_check := 0,
          variant_divergent_count := 0,
          cross_party_divergent_count := 0
        ) AS comparability_summary,
        struct_pack(available := false, url_count := 0::BIGINT, sample_urls := []::VARCHAR[], models_with_loaded_instances := 0) AS instance_data,
        1::INTEGER AS metrics_count,
        ['Accuracy']::VARCHAR[] AS metric_names,
        [struct_pack(
          column_key := 'root:accuracy',
          metric_summary_id := 'mmlu%3Aaccuracy',
          metric_id := 'accuracy',
          metric_name := 'accuracy',
          display_name := 'Accuracy',
          canonical_display_name := 'Accuracy',
          lower_is_better := false,
          unit := 'proportion',
          scope := 'root',
          subtask_key := NULL::VARCHAR,
          subtask_name := NULL::VARCHAR
        )] AS leaderboard_metrics,
        [] AS leaderboard_rows,
        [struct_pack(
          metric_summary_id := 'mmlu%3Aaccuracy',
          metric_name := 'accuracy',
          display_name := 'Accuracy',
          canonical_display_name := 'Accuracy',
          metric_key := 'accuracy',
          lower_is_better := false,
          models_count := 1,
          top_score := 0.8,
          unit := 'proportion'
        )] AS root_metrics,
        [] AS subtasks,
        0::INTEGER AS subtasks_count
    `
  )
  if (includeCollections) {
    // Synthetic protocol-varied study page (curated collection).
    await connection.run(
      `INSERT INTO evals_fixture
       SELECT * REPLACE (
         'study%2Fbench' AS evaluation_id,
         'bench-x' AS benchmark_id,
         'Study Bench' AS evaluation_name,
         'Study Bench' AS canonical_display_name,
         'aisi-study' AS composite_benchmark_key,
         'AISI Study' AS composite_benchmark_name,
         'aisi-study' AS composite_slug,
         'AISI Study' AS composite_display_name,
         'bench-x' AS family_id,
         'Study Bench' AS family_display_name
       )
       FROM evals_fixture WHERE evaluation_id = 'mmlu'`
    )
  }
  await copyParquet(
    connection,
    "SELECT * FROM evals_fixture",
    path.join(snapshotDir, "evals_view.parquet")
  )

  await connection.run(
    `
      CREATE OR REPLACE TABLE eval_results_fixture AS
      SELECT
        TIMESTAMP '2026-05-03 00:00:00' AS snapshot_id,
        'mmlu' AS evaluation_id,
        'mmlu%3Aaccuracy' AS metric_summary_id,
        'mmlu' AS benchmark_id,
        'accuracy' AS metric_id,
        'openai' AS composite_slug,
        'OpenAI' AS composite_display_name,
        'mmlu' AS family_id,
        'MMLU' AS family_display_name,
        false AS is_slice,
        NULL::VARCHAR AS parent_benchmark_id,
        'accuracy' AS metric_id_effective,
        'none' AS scale_conversion,
        0.8::DOUBLE AS score_canonical,
        'openai/gpt-5' AS model_key,
        'openai/gpt-5' AS model_id,
        'openai%2Fgpt-5' AS model_route_id,
        struct_pack(
          name := 'GPT 5',
          id := 'openai/gpt-5',
          developer := 'OpenAI',
          inference_platform := 'platform',
          inference_engine := 'engine',
          model_version := NULL::VARCHAR,
          architecture := 'transformer',
          parameter_count := '100B',
          release_date := '2026-01-01',
          model_url := 'https://example.test/model',
          modalities := struct_pack(input := ['text']::VARCHAR[], output := ['text']::VARCHAR[])
        ) AS model_info,
        'Accuracy' AS metric_display_name,
        'proportion' AS metric_unit,
        false AS lower_is_better,
        '["applied_reasoning"]' AS derived_tags,
        0.8::DOUBLE AS score,
        struct_pack(
          score := 0.8,
          standard_error := 0.01,
          sample_size := 10,
          confidence_interval := struct_pack(lower := 0.7, upper := 0.9, confidence_level := 0.95)
        ) AS score_details,
        1::INTEGER AS fact_row_count,
        1::INTEGER AS position,
        1::INTEGER AS total,
        1.0 AS percentile,
        TIMESTAMP '2026-05-03 00:00:00' AS evaluation_timestamp,
        struct_pack(
          temperature := 0.2,
          top_p := 0.95,
          max_tokens := 512,
          stop_sequences := ['<END>']::VARCHAR[]
        ) AS generation_config,
        struct_pack(
          source_name := 'OpenAI report',
          source_type := 'documentation',
          source_organization_name := 'OpenAI',
          source_organization_url := 'https://example.test',
          evaluator_relationship := 'first_party',
          source_url := 'https://example.test/report',
          publication_date := DATE '2026-05-03'
        ) AS source_metadata,
        struct_pack(
          dataset_name := 'MMLU',
          source_type := 'documentation',
          hf_repo := NULL::VARCHAR,
          hf_split := NULL::VARCHAR,
          samples_number := 10,
          url := ['https://example.test/mmlu']::VARCHAR[],
          dataset_url := 'https://example.test/mmlu',
          dataset_version := 'v1'
        ) AS source_data,
        'https://example.test/record.json' AS source_record_url,
        'https://example.test/eee-record.json' AS eee_record_url,
        struct_pack(name := 'openai-evals', version := '1.0', fork := NULL::VARCHAR) AS eval_library,
        ['first_party']::VARCHAR[] AS evaluator_relationships,
        true AS has_first_party,
        false AS has_third_party,
        'self' AS coverage_cell,
        ['OpenAI']::VARCHAR[] AS reporting_orgs,
        map(['OpenAI'], [0.8]) AS scores_by_organization,
        false AS is_summary_score,
        NULL::VARCHAR AS summary_score_for,
        [] AS aggregate_components,
        false AS has_reproducibility_gap,
        1.0 AS completeness_score,
        false AS is_multi_source,
        true AS first_party_only,
        false AS has_variant_divergence,
        false AS has_cross_party_divergence,
        NULL AS evalcards_annotations,
        NULL::VARCHAR AS instance_file_path,
        NULL::VARCHAR AS instance_file_format,
        0::INTEGER AS instance_rows,
        true AS is_verified_evaluator,
        'plain-src' AS collection_id,
        NULL::VARCHAR AS protocol_condition
    `
  )

  // Extra observation rows for the merged-benchmark accessor: an echo
  // pair (byte-identical Llama 4 rows from two sources), a div100
  // percent-scale row, a second metric (f1), and a slice-grain row.
  // All derive from the base row via SELECT * REPLACE so the fixture
  // schema stays defined in one place.
  const llamaModelInfo = `struct_pack(
    name := 'Llama 4',
    id := 'meta/llama-4',
    developer := 'Meta',
    inference_platform := 'platform',
    inference_engine := 'engine',
    model_version := NULL::VARCHAR,
    architecture := 'transformer',
    parameter_count := '400B',
    release_date := '2026-02-01',
    model_url := 'https://example.test/llama',
    modalities := struct_pack(input := ['text']::VARCHAR[], output := ['text']::VARCHAR[])
  )`
  const grokModelInfo = `struct_pack(
    name := 'Grok 5',
    id := 'xai/grok-5',
    developer := 'xAI',
    inference_platform := 'platform',
    inference_engine := 'engine',
    model_version := NULL::VARCHAR,
    architecture := 'transformer',
    parameter_count := '300B',
    release_date := '2026-03-01',
    model_url := 'https://example.test/grok',
    modalities := struct_pack(input := ['text']::VARCHAR[], output := ['text']::VARCHAR[])
  )`
  const insertVariant = (replacements: string) =>
    connection.run(
      `INSERT INTO eval_results_fixture
       SELECT * REPLACE (${replacements})
       FROM eval_results_fixture WHERE evaluation_id = 'mmlu'`
    )
  // Echo pair: same model, same score, two different sources.
  for (const source of ["src-a", "src-b"]) {
    await insertVariant(`
      '${source}%2Fmmlu' AS evaluation_id,
      '${source}' AS composite_slug,
      'Source ${source === "src-a" ? "A" : "B"}' AS composite_display_name,
      'meta/llama-4' AS model_key,
      'meta/llama-4' AS model_id,
      'meta%2Fllama-4' AS model_route_id,
      ${llamaModelInfo} AS model_info,
      0.9 AS score,
      0.9 AS score_canonical
    `)
  }
  // Percent-scale publication, converted per-row (85 -> 0.85).
  await insertVariant(`
    'src-a%2Fmmlu' AS evaluation_id,
    'src-a' AS composite_slug,
    'Source A' AS composite_display_name,
    'xai/grok-5' AS model_key,
    'xai/grok-5' AS model_id,
    'xai%2Fgrok-5' AS model_route_id,
    ${grokModelInfo} AS model_info,
    85.0 AS score,
    0.85 AS score_canonical,
    'div100' AS scale_conversion
  `)
  // Secondary metric reported by one source only.
  await insertVariant(`
    'src-a%2Fmmlu' AS evaluation_id,
    'src-a' AS composite_slug,
    'Source A' AS composite_display_name,
    'mmlu%3Af1' AS metric_summary_id,
    'f1' AS metric_id,
    'f1' AS metric_id_effective,
    'F1' AS metric_display_name,
    'meta/llama-4' AS model_key,
    'meta/llama-4' AS model_id,
    'meta%2Fllama-4' AS model_route_id,
    ${llamaModelInfo} AS model_info,
    0.7 AS score,
    0.7 AS score_canonical
  `)
  // Slice-grain observation for the slice-only benchmark mt-bench.
  // Uses a non-gpt-5 model so getModelSummaryById fixtures stay stable.
  await insertVariant(`
    'src-c%2Fmt-bench-turn1' AS evaluation_id,
    'mt-bench-turn1' AS benchmark_id,
    'src-c' AS composite_slug,
    'Source C' AS composite_display_name,
    true AS is_slice,
    'mt-bench' AS parent_benchmark_id,
    'mt-bench-turn1%3Ascore' AS metric_summary_id,
    'score' AS metric_id,
    'score' AS metric_id_effective,
    'Score' AS metric_display_name,
    'meta/llama-4' AS model_key,
    'meta/llama-4' AS model_id,
    'meta%2Fllama-4' AS model_route_id,
    ${llamaModelInfo} AS model_info,
    8.1 AS score,
    8.1 AS score_canonical,
    'no_bounds' AS scale_conversion
  `)

  if (includeCollections) {
    // Study rows: one model across two clean budgets plus an assisted
    // run (the R1 compute-view shape).
    const studyCondition = (feedback: string, tokenLimit: number) =>
      `{"feedback":"${feedback}","token_limit":${tokenLimit}}`
    const studyVariants: Array<[number, string]> = [
      [0.4, studyCondition("none", 2000000)],
      [0.5, studyCondition("none", 5000000)],
      [0.7, studyCondition("answer_feedback", 5000000)],
    ]
    for (const [score, condition] of studyVariants) {
      await insertVariant(`
        'study%2Fbench' AS evaluation_id,
        'bench-x' AS benchmark_id,
        'bench-x%3Aaccuracy' AS metric_summary_id,
        'aisi-study' AS composite_slug,
        'AISI Study' AS composite_display_name,
        'uk-study' AS collection_id,
        '${condition}' AS protocol_condition,
        ${score} AS score,
        ${score} AS score_canonical,
        struct_pack(
          score := ${score},
          standard_error := 0.01,
          sample_size := 9,
          confidence_interval := struct_pack(lower := 0.7, upper := 0.9, confidence_level := 0.95)
        ) AS score_details
      `)
    }
  }

  const evalResultsExcludes = [
    ...(includeMergedView ? [] : ["metric_id_effective", "scale_conversion", "score_canonical"]),
    ...(includeCollections ? [] : ["collection_id", "protocol_condition"]),
  ]
  await copyParquet(
    connection,
    evalResultsExcludes.length === 0
      ? "SELECT * FROM eval_results_fixture"
      : `SELECT * EXCLUDE (${evalResultsExcludes.join(", ")}) FROM eval_results_fixture`,
    path.join(snapshotDir, "eval_results_view.parquet")
  )

  if (includeCollections) {
    await writeFile(
      path.join(snapshotDir, "collections.json"),
      JSON.stringify({
        "plain-src": { curated: false, display_name: "Plain source", kind: "unknown" },
        "uk-study": {
          curated: true,
          display_name: "Synthetic Inference Study",
          kind: "paper_study",
          url: "https://example.test/paper",
          has_trajectories: true,
          outcome_type: { benchraw: "binary" },
          protocol_axes: [
            { key: "feedback", type: "categorical", values: ["none", "answer_feedback"] },
            { key: "token_limit", type: "int", unit: "tokens" },
          ],
        },
      })
    )
  }

  if (includeCollectionContext) {
    // Hand-authored sidecar (tests/fixtures/collection_context.json); its
    // uk-study / bench-x entry is sized for this synthetic snapshot.
    await writeFile(
      path.join(snapshotDir, "collection_context.json"),
      JSON.stringify(collectionContextFixture),
    )
  }

  if (includeTrajectories) {
    // Trajectory extract for the study benchmark. benchmark_id is NULL on
    // purpose — the accessor must join on coalesce(benchmark_id,
    // benchmark_key). The model id is a dated raw id that resolves to the
    // canonical model via models_view.raw_model_ids membership.
    const trajectoryRow = (
      condition: string,
      taskId: string,
      isCorrect: string,
      totalTokens: number,
      stopReason: string,
    ) => `
      SELECT
        'uk-study' AS collection_id,
        'benchraw' AS benchmark_raw,
        'openai/gpt-5' AS model_raw,
        '${taskId}' AS task_id,
        '${condition}' AS protocol_condition,
        ${isCorrect} AS is_correct,
        ${totalTokens}::BIGINT AS total_tokens,
        '${stopReason}' AS stop_reason,
        'openai/gpt-5-2026-01-01' AS model_id,
        NULL::VARCHAR AS benchmark_id,
        'openai/gpt-5-2026-01-01' AS model_key,
        'bench-x' AS benchmark_key
    `
    const assisted = `{"feedback":"answer_feedback","token_limit":5000000}`
    const clean = `{"feedback":"none","token_limit":5000000}`
    await copyParquet(
      connection,
      [
        // Oracle-feedback condition: two solve events (t1 twice — the later cheap
        // correct tool_calls attempt must NOT lower the solve step),
        // one correct-but-censored task, two failures.
        trajectoryRow(assisted, "t1", "true", 1000, "completed_on_successful_submit"),
        trajectoryRow(assisted, "t1", "true", 500, "tool_calls"),
        trajectoryRow(assisted, "t2", "true", 4000, "completed_on_successful_submit"),
        trajectoryRow(assisted, "t3", "true", 9000, "tool_calls"),
        trajectoryRow(assisted, "t4", "false", 2500000, "repetition_guard"),
        trajectoryRow(assisted, "t5", "false", 1800000, "token_limit"),
        // No-feedback condition: mixed outcomes incl. a NULL outcome.
        trajectoryRow(clean, "t1", "true", 3000, "tool_calls"),
        trajectoryRow(clean, "t2", "false", 2000, "repetition_guard"),
        trajectoryRow(clean, "t3", "NULL::BOOLEAN", 1000, "token_limit"),
        trajectoryRow(clean, "t4", "true", 1500, "tool_calls"),
        trajectoryRow(clean, "t5", "false", 800, "tool_calls"),
      ].join(" UNION ALL "),
      path.join(snapshotDir, "collection_trajectories.parquet")
    )
  }

  if (includeMergedView) {
    await copyParquet(
      connection,
      `
        SELECT
          TIMESTAMP '2026-05-03 00:00:00' AS snapshot_id,
          'mmlu' AS evaluation_id,
          'mmlu' AS benchmark_id,
          'MMLU' AS display_name,
          'mmlu' AS family_id,
          'MMLU' AS family_display_name,
          'benchmark' AS grain,
          'accuracy' AS preferred_metric_id,
          'Accuracy' AS preferred_metric_display_name,
          true AS preferred_from_registry,
          false AS lower_is_better,
          3::INTEGER AS sources_count,
          4::INTEGER AS all_sources_count,
          4::INTEGER AS results_count,
          3::INTEGER AS models_count,
          struct_pack(
            model_name := 'Llama 4',
            model_key := 'meta/llama-4',
            score := 0.9,
            score_canonical := 0.9,
            composite_slug := 'src-a',
            evaluation_id := 'src-a%2Fmmlu'
          ) AS best_result,
          [
            struct_pack(evaluation_id := 'src-a%2Fmmlu'::VARCHAR, composite_slug := 'src-a', composite_display_name := 'Source A', models_count := 2::INTEGER, results_count := 3::INTEGER, reports_preferred := true, slice_only := false),
            struct_pack(evaluation_id := 'src-b%2Fmmlu'::VARCHAR, composite_slug := 'src-b', composite_display_name := 'Source B', models_count := 1::INTEGER, results_count := 1::INTEGER, reports_preferred := true, slice_only := false),
            struct_pack(evaluation_id := 'mmlu'::VARCHAR, composite_slug := 'openai', composite_display_name := 'OpenAI', models_count := 1::INTEGER, results_count := 1::INTEGER, reports_preferred := true, slice_only := false),
            struct_pack(evaluation_id := NULL::VARCHAR, composite_slug := 'src-d', composite_display_name := 'Source D', models_count := 1::INTEGER, results_count := 2::INTEGER, reports_preferred := false, slice_only := true)
          ] AS aggregate_sources,
          [
            struct_pack(metric_id := 'accuracy', display_name := 'Accuracy', results_count := 4::INTEGER, models_count := 3::INTEGER, sources_count := 3::INTEGER, lower_is_better := false),
            struct_pack(metric_id := 'f1', display_name := 'F1', results_count := 1::INTEGER, models_count := 1::INTEGER, sources_count := 1::INTEGER, lower_is_better := false)
          ] AS metrics,
          CAST(NULL AS STRUCT(slice_id VARCHAR, display_name VARCHAR)[]) AS slices
        UNION ALL
        SELECT
          TIMESTAMP '2026-05-03 00:00:00' AS snapshot_id,
          'mt-bench' AS evaluation_id,
          'mt-bench' AS benchmark_id,
          'MT-Bench' AS display_name,
          NULL::VARCHAR AS family_id,
          NULL::VARCHAR AS family_display_name,
          'slice' AS grain,
          'score' AS preferred_metric_id,
          'Score' AS preferred_metric_display_name,
          false AS preferred_from_registry,
          false AS lower_is_better,
          1::INTEGER AS sources_count,
          1::INTEGER AS all_sources_count,
          1::INTEGER AS results_count,
          1::INTEGER AS models_count,
          struct_pack(
            model_name := 'Llama 4',
            model_key := 'meta/llama-4',
            score := 8.1,
            score_canonical := 8.1,
            composite_slug := 'src-c',
            evaluation_id := NULL::VARCHAR
          ) AS best_result,
          [
            struct_pack(evaluation_id := NULL::VARCHAR, composite_slug := 'src-c', composite_display_name := 'Source C', models_count := 1::INTEGER, results_count := 1::INTEGER, reports_preferred := true, slice_only := true)
          ] AS aggregate_sources,
          [
            struct_pack(metric_id := 'score', display_name := 'Score', results_count := 1::INTEGER, models_count := 1::INTEGER, sources_count := 1::INTEGER, lower_is_better := false)
          ] AS metrics,
          [
            struct_pack(slice_id := 'mt-bench-turn1', display_name := 'Turn 1'),
            struct_pack(slice_id := 'mt-bench-turn2', display_name := 'Turn 2')
          ] AS slices
      `,
      path.join(snapshotDir, "merged_evals_view.parquet")
    )
  }

  await writeFile(
    path.join(snapshotDir, "manifest.json"),
    JSON.stringify({
      generated_at: "2026-05-03T00:00:00Z",
      config_version: 2,
      skipped_configs: [],
      model_count: 1,
      eval_count: 1,
      metric_eval_count: 1,
      source_config_count: 1,
      skipped_config_count: 0,
      summary_artifacts: {
        corpus_aggregates: "headline.json",
        eval_hierarchy: "hierarchy.json",
      },
    })
  )

  const reproducibilityBlock = {
    total_triples: 1,
    triples_with_reproducibility_gap: 0,
    reproducibility_gap_rate: 0,
    agentic_triples: 0,
    per_field_missingness: {
      temperature: {
        missing_count: 0,
        missing_rate: 0,
        denominator: "all_triples",
        denominator_count: 1,
      },
    },
  }
  const completenessBlock = {
    total_triples: 1,
    completeness_avg: 0.75,
    completeness_min: 0.75,
    completeness_max: 0.75,
  }
  const provenanceBlock = {
    total_triples: 1,
    multi_source_triples: 0,
    first_party_only_triples: 1,
    source_type_distribution: {
      first_party: 1,
      third_party: 0,
      collaborative: 0,
      unspecified: 0,
    },
  }
  const comparabilityBlock = {
    total_triples: 1,
    variant_divergent_count: 0,
    cross_party_divergent_count: 0,
    groups_with_variant_check: 1,
    groups_with_cross_party_check: 0,
  }
  await writeFile(
    path.join(snapshotDir, "headline.json"),
    JSON.stringify({
      generated_at: "2026-05-03T00:00:00Z",
      signal_version: "1.0",
      stratification_dimensions: ["category"],
      reproducibility: {
        overall: reproducibilityBlock,
        by_category: { Reasoning: reproducibilityBlock },
      },
      completeness: {
        overall: completenessBlock,
        by_category: { Reasoning: completenessBlock },
      },
      provenance: {
        overall: provenanceBlock,
        by_category: { Reasoning: provenanceBlock },
      },
      comparability: {
        overall: comparabilityBlock,
        by_category: { Reasoning: comparabilityBlock },
      },
      developers: [
        {
          developer: "OpenAI",
          route_id: "OpenAI",
          model_count: 1,
          benchmark_count: 1,
          evaluation_count: 1,
          popular_evals: [{ benchmark: "MMLU", model_count: 1 }],
        },
      ],
    })
  )

  await writeFile(
    path.join(snapshotDir, "hierarchy.json"),
    JSON.stringify({
      stats: {
        family_count: 1,
        composite_count: 0,
        standalone_benchmark_count: 1,
        single_benchmark_count: 1,
        slice_count: 0,
        metric_count: 1,
        metric_rows_scanned: 1,
      },
      families: [],
    })
  )
}

describe("Stage J view-layer backend", () => {
  it("reads a pinned snapshot through the v2 accessors", async () => {
    const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "eval-card-stage-j-"))
    const previousBackend = process.env.DATA_BACKEND
    const previousSnapshotUrl = process.env.SNAPSHOT_URL

    try {
      await writeSyntheticStageJSnapshot(snapshotDir)
      process.env.DATA_BACKEND = "v2"
      process.env.SNAPSHOT_URL = `file://${snapshotDir}`

      const dataBackend = await import("../lib/data-backend")
      const hfData = await import("../lib/hf-data")

      const [models, evalListData, modelSummary, evalSummary, developers, developerSummary, manifest, hierarchy, aggregates] =
        await Promise.all([
          dataBackend.getModelCardsLite(),
          dataBackend.getEvalListLiteData(),
          dataBackend.getModelSummaryById("openai%2Fgpt-5"),
          dataBackend.getEvalSummaryById("mmlu"),
          dataBackend.getDeveloperList(),
          dataBackend.getDeveloperSummaryById("OpenAI"),
          dataBackend.getBackendManifestData(),
          dataBackend.getEvalHierarchyData(),
          hfData.fetchCorpusAggregates(),
        ])

      expect(models[0]).toMatchObject({
        route_id: "openai%2Fgpt-5",
        model_name: "GPT 5",
        evaluations_count: 1,
      })
      expect(evalListData).toMatchObject({
        totalModels: 1,
        evals: [{ evaluation_id: "mmlu", evaluation_name: "MMLU", models_count: 1 }],
      })
      expect(modelSummary?.evaluations_by_tag.applied_reasoning).toHaveLength(1)
      expect(modelSummary?.evaluations_by_tag.applied_reasoning[0]?.generation_config).toMatchObject({
        temperature: 0.2,
        top_p: 0.95,
        max_tokens: 512,
        stop_sequences: ["<END>"],
      })
      expect(evalSummary?.model_results[0]).toMatchObject({
        model_route_id: "openai%2Fgpt-5",
        score: 0.8,
        result: { metric_summary_id: "mmlu%3Aaccuracy", is_verified_evaluator: true },
      })
      expect(evalSummary?.model_results[0]?.result.generation_config).toMatchObject({
        temperature: 0.2,
        top_p: 0.95,
        max_tokens: 512,
        stop_sequences: ["<END>"],
      })
      expect(developers[0]).toMatchObject({ developer: "OpenAI", route_id: "OpenAI" })
      expect(developerSummary?.models).toHaveLength(1)
      expect(manifest.model_count).toBe(1)
      expect(hierarchy.stats?.metric_rows_scanned).toBe(1)
      expect(aggregates?.completeness.overall).toMatchObject({
        total_triples: 1,
        completeness_avg: 0.75,
      })
      expect(aggregates?.provenance.overall).toMatchObject({
        total_triples: 1,
        first_party_only_triples: 1,
      })
      expect(aggregates?.comparability.overall).toMatchObject({
        groups_with_variant_check: 1,
        variant_divergent_count: 0,
      })
      expect(aggregates?.comparability.by_category.Reasoning).toBeDefined()
    } finally {
      if (previousBackend == null) {
        delete process.env.DATA_BACKEND
      } else {
        process.env.DATA_BACKEND = previousBackend
      }
      if (previousSnapshotUrl == null) {
        delete process.env.SNAPSHOT_URL
      } else {
        process.env.SNAPSHOT_URL = previousSnapshotUrl
      }
      await rm(snapshotDir, { recursive: true, force: true })
    }
  })
})

// Each test points the (module-cached) DuckDB connection at its own
// snapshot dir, so reset modules before importing the backend.
async function withSnapshot(
  options: {
    includeMergedView?: boolean
    includeCollections?: boolean
    includeTrajectories?: boolean
    includeCollectionContext?: boolean
  },
  run: (dataBackend: typeof import("../lib/data-backend")) => Promise<void>,
) {
  const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "eval-card-merged-"))
  const previousBackend = process.env.DATA_BACKEND
  const previousSnapshotUrl = process.env.SNAPSHOT_URL

  try {
    await writeSyntheticStageJSnapshot(snapshotDir, options)
    vi.resetModules()
    process.env.DATA_BACKEND = "v2"
    process.env.SNAPSHOT_URL = `file://${snapshotDir}`
    const dataBackend = await import("../lib/data-backend")
    await run(dataBackend)
  } finally {
    if (previousBackend == null) {
      delete process.env.DATA_BACKEND
    } else {
      process.env.DATA_BACKEND = previousBackend
    }
    if (previousSnapshotUrl == null) {
      delete process.env.SNAPSHOT_URL
    } else {
      process.env.SNAPSHOT_URL = previousSnapshotUrl
    }
    await rm(snapshotDir, { recursive: true, force: true })
  }
}

describe("merged benchmark accessor (merged-benchmark-view F1)", () => {
  it("returns the merged row with echo rows intact, sorted by score_canonical", async () => {
    await withSnapshot({}, async (dataBackend) => {
      const merged = await dataBackend.getMergedBenchmarkSummary("mmlu")
      expect(merged).toMatchObject({
        merged: true,
        evaluation_id: "mmlu",
        benchmark_id: "mmlu",
        display_name: "MMLU",
        grain: "benchmark",
        preferred_metric_id: "accuracy",
        preferred_from_registry: true,
        selected_metric_id: "accuracy",
        sources_count: 3,
        all_sources_count: 4,
        models_count: 3,
      })
      expect(merged!.metrics.map((m) => m.metric_id)).toEqual(["accuracy", "f1"])
      expect(merged!.best_result).toMatchObject({
        model_name: "Llama 4",
        score_canonical: 0.9,
        composite_slug: "src-a",
      })

      // Observation grain, canonical-score order, echoes NOT deduped:
      // two byte-identical Llama 4 rows from different sources survive.
      expect(merged!.results.map((r) => r.score_canonical)).toEqual([0.9, 0.9, 0.85, 0.8])
      const echoes = merged!.results.filter((r) => r.model_info.name === "Llama 4")
      expect(echoes).toHaveLength(2)
      expect(new Set(echoes.map((r) => r.composite_slug))).toEqual(new Set(["src-a", "src-b"]))

      // Per-row scale conversion surfaces (85 raw -> 0.85 canonical).
      const grok = merged!.results.find((r) => r.model_info.name === "Grok 5")
      expect(grok).toMatchObject({
        score: 85,
        score_canonical: 0.85,
        scale_conversion: "div100",
        composite_slug: "src-a",
      })
    })
  })

  it("narrows results when a non-default metric is selected", async () => {
    await withSnapshot({}, async (dataBackend) => {
      const f1 = await dataBackend.getMergedBenchmarkSummary("mmlu", "f1")
      expect(f1).toMatchObject({ selected_metric_id: "f1", preferred_metric_id: "accuracy" })
      expect(f1!.results).toHaveLength(1)
      expect(f1!.results[0]).toMatchObject({
        score: 0.7,
        composite_slug: "src-a",
      })

      // Unknown metric ids fall back to the page default.
      const unknown = await dataBackend.getMergedBenchmarkSummary("mmlu", "does-not-exist")
      expect(unknown!.selected_metric_id).toBe("accuracy")
      expect(unknown!.results).toHaveLength(4)
    })
  })

  it("serves slice-grain pages from the first slice by default", async () => {
    await withSnapshot({}, async (dataBackend) => {
      const sliceGrain = await dataBackend.getMergedBenchmarkSummary("mt-bench")
      expect(sliceGrain).toMatchObject({
        grain: "slice",
        selected_slice_id: "mt-bench-turn1",
      })
      expect(sliceGrain!.slices?.map((s) => s.slice_id)).toEqual([
        "mt-bench-turn1",
        "mt-bench-turn2",
      ])
      expect(sliceGrain!.results).toHaveLength(1)
      expect(sliceGrain!.results[0]).toMatchObject({
        composite_slug: "src-c",
        score: 8.1,
        scale_conversion: "no_bounds",
      })
    })
  })

  it("tolerates snapshots without merged_evals_view: connects, accessor returns null", async () => {
    await withSnapshot({ includeMergedView: false }, async (dataBackend) => {
      // The connection still initialises and existing accessors work.
      const evalSummary = await dataBackend.getEvalSummaryById("mmlu")
      expect(evalSummary?.model_results).toHaveLength(1)

      const merged = await dataBackend.getMergedBenchmarkSummary("mmlu")
      expect(merged).toBeNull()
    })
  })
})

describe("collection surfaces (collection-benchmark-page spec)", () => {
  it("attaches the curated collection + compute axis on the study page only", async () => {
    await withSnapshot({ includeCollections: true }, async (dataBackend) => {
      const study = await dataBackend.getEvalSummaryById("study%2Fbench")
      expect(study?.collection).toMatchObject({
        collection_id: "uk-study",
        display_name: "Synthetic Inference Study",
        curated: true,
        has_trajectories: true,
        outcome_type: undefined,
        compute_axis: { key: "token_limit", label: "token budget (limit)" },
      })
      // Protocol fields flow through onto the study rows.
      expect(study?.model_results.some((r) => r.protocol_condition != null)).toBe(true)

      // Ordinary pages carry a collection_id too (every submission
      // channel has one) but their entry is uncurated → no attachment.
      const plain = await dataBackend.getEvalSummaryById("mmlu")
      expect(plain?.collection).toBeUndefined()
    })
  })

  it("attaches source_options with the merged target when a merged page exists", async () => {
    await withSnapshot({}, async (dataBackend) => {
      const summary = await dataBackend.getEvalSummaryById("mmlu")
      expect(summary?.source_options).toMatchObject({ merged_evaluation_id: "mmlu" })
      expect(
        summary?.source_options?.sources.map((s) => s.evaluation_id),
      ).toContain("mmlu")
    })
  })

  it("omits source_options for single-source benchmarks with no merged page", async () => {
    await withSnapshot({ includeMergedView: false }, async (dataBackend) => {
      const summary = await dataBackend.getEvalSummaryById("mmlu")
      // One sibling and no merged page → never render a switcher that
      // could navigate to a nonexistent merged page.
      expect(summary?.source_options).toBeUndefined()
    })
  })

  it("keeps pre-collections snapshots byte-compatible: no attachment, no trajectories", async () => {
    await withSnapshot({}, async (dataBackend) => {
      const summary = await dataBackend.getEvalSummaryById("mmlu")
      expect(summary?.collection).toBeUndefined()
      expect(await dataBackend.getEvalTrajectories("mmlu")).toBeNull()
    })
  })

  it("serves shaped trajectory panels through the full resolution chain", async () => {
    await withSnapshot({ includeCollections: true }, async (dataBackend) => {
      const payload = await dataBackend.getEvalTrajectories("study%2Fbench")
      expect(payload).not.toBeNull()
      expect(payload).toMatchObject({
        evaluation_id: "study%2Fbench",
        benchmark_id: "bench-x",
        collection_id: "uk-study",
        outcome_type: "binary",
        task_count: 5,
      })
      // Canonical model identity via raw_model_ids membership (dated
      // trajectory id → the page's canonical model_key).
      expect(payload!.models).toEqual([
        {
          key: "openai/gpt-5",
          label: "GPT 5",
          releaseDate: expect.stringContaining("2026-01-01"),
          unmatched: false,
        },
      ])
      expect(payload!.conditions).toEqual(["none", "answer_feedback"])

      // R2a: solve events only (the cheap correct tool_calls attempt on
      // t1 never lowers the step; t3 is correct-but-censored).
      const curve = payload!.tokens_to_success?.curves[0]
      expect(curve).toMatchObject({
        modelKey: "openai/gpt-5",
        attemptedTasks: 5,
        solvedTasks: 2,
        censoredTasks: 3,
        censorTokens: 2500000,
      })
      expect(curve?.steps).toEqual([
        { tokens: 1000, rate: 0.2 },
        { tokens: 4000, rate: 0.4 },
      ])

      // R2b: bins are SHARED across condition panels and pooled across
      // both conditions for the difficulty axis, so t3 (unscored under
      // no feedback, scored under oracle) still gets a bin — all five
      // tasks bin, hardest (t5: both conditions failed) first.
      const nonePanel = payload!.reliability.find((p) => p.condition === "none")
      const oraclePanel = payload!.reliability.find((p) => p.condition === "answer_feedback")
      expect(nonePanel?.bins.reduce((acc, b) => acc + b.taskCount, 0)).toBe(5)
      expect(nonePanel?.bins[0].taskIds).toEqual(["t5"])
      expect(oraclePanel?.bins).toEqual(nonePanel?.bins)

      // R2c: the termination partition sums to the run count, the
      // correct-submission row is withheld outside oracle feedback, and
      // the separate outcome line excludes the NULL outcome from its
      // denominator (4 scored of 5 runs, 2 correct) — never counted
      // incorrect.
      const noneTermination = payload!.termination.find((t) => t.condition === "none")
      expect(noneTermination).toMatchObject({
        runCount: 5,
        endedOnCorrectSubmission: null,
        repetitionGuard: { n: 1, denominator: 5 },
        budgetExhausted: { n: 1, denominator: 5 },
        otherEndings: { n: 3, denominator: 5 },
        reachedCorrectAnswer: { n: 2, denominator: 4 },
      })
      const oracleTermination = payload!.termination.find(
        (t) => t.condition === "answer_feedback",
      )
      expect(oracleTermination?.endedOnCorrectSubmission).toEqual({ n: 2, denominator: 6 })
    })
  })

  it("attaches the scaffold-context payload from the collection_context sidecar", async () => {
    await withSnapshot(
      { includeCollections: true, includeCollectionContext: true },
      async (dataBackend) => {
        const study = await dataBackend.getEvalSummaryById("study%2Fbench")
        const context = study?.collection?.context
        expect(context).not.toBeNull()
        expect(context).toMatchObject({
          harvestedAt: "2026-05-03T00:00:00Z",
          officialTaskCount: 10,
          contextSourceDisplay: "Agg Board, Synthetic Board",
          contextSources: [
            { id: "agg-board", display_name: "Agg Board" },
            { id: "synthetic-board", display_name: "Synthetic Board" },
          ],
          modelsWithoutContext: ["Llama 4"],
          modelsWithoutAssisted: [],
          collectionLabel: "Synthetic Inference Study",
          hiddenTotal: 0,
        })
        expect(context!.models).toHaveLength(1)
        expect(context!.models[0]).toMatchObject({
          key: "openai/gpt-5",
          displayName: "GPT 5",
          score: 0.4,
          scoreSe: 0.045,
          nTasks: 9,
          attemptsMin: 2,
          attemptsMax: 4,
          hiddenCount: 0,
          // The sidecar shows the 2M no-feedback condition; the page's
          // best-scoring no-feedback row is the 5M one at 0.5.
          conditionDiffersFromBestScoring: true,
          assisted: {
            score: 0.55,
            scoreSe: 0.05,
            nTasks: 9,
            protocolCondition: '{"feedback":"answer_feedback","token_limit":2000000}',
          },
        })
        expect(context!.models[0].points.map((p) => p.scaffold)).toEqual([
          "Codex CLI",
          null,
          "OpenHands",
          "Terminus 2",
        ])
        expect(context!.models[0].points[1]).toMatchObject({
          scaffold: null,
          source: "Agg Board",
          score: 0.47,
          scoreSe: null,
        })

        // Ordinary pages never reach the builder at all — no attachment.
        expect((await dataBackend.getEvalSummaryById("mmlu"))?.collection).toBeUndefined()
      },
    )
  })

  it("leaves the context null when the snapshot carries no collection_context sidecar", async () => {
    await withSnapshot({ includeCollections: true }, async (dataBackend) => {
      const study = await dataBackend.getEvalSummaryById("study%2Fbench")
      // The collection attachment is unaffected; only the Context view is
      // absent, so the page renders exactly as it did before the feature.
      expect(study?.collection?.collection_id).toBe("uk-study")
      expect(study?.collection?.compute_axis).toMatchObject({ key: "token_limit" })
      expect(study?.collection?.context).toBeNull()
    })
  })

  it("is a no-op on pre-collections snapshots even when the sidecar is present", async () => {
    await withSnapshot({ includeCollectionContext: true }, async (dataBackend) => {
      const summary = await dataBackend.getEvalSummaryById("mmlu")
      expect(summary?.collection).toBeUndefined()
    })
  })

  it("returns clean absence when the trajectory table is missing", async () => {
    await withSnapshot(
      { includeCollections: true, includeTrajectories: false },
      async (dataBackend) => {
        // The attachment (sidecar-driven) still works; the panels don't.
        const study = await dataBackend.getEvalSummaryById("study%2Fbench")
        expect(study?.collection?.collection_id).toBe("uk-study")
        expect(await dataBackend.getEvalTrajectories("study%2Fbench")).toBeNull()
      },
    )
  })
})


describe("folded model id resolution (preflight bug A)", () => {
  // The browser page path re-encodes the decoded Next.js path param before
  // fetching, so `getModelSummaryById` receives the id still percent-ENCODED.
  // `route_id` is stored encoded, so the primary lookup is fine; the
  // `raw_model_ids` fallback is not, because those store plain spellings.
  // Matching the encoded form there 404'd every fold the baked redirect map
  // did not already cover (239 of 2,392 folded URLs on the live snapshot).
  const FOLDED = "openai/GPT-5-Folded-2025-08-07"

  it("resolves a folded raw id sent in the ENCODED form the page path produces", async () => {
    await withSnapshot({}, async (dataBackend) => {
      const summary = await dataBackend.getModelSummaryById(encodeURIComponent(FOLDED))
      expect(summary).not.toBeNull()
      expect(summary?.model_info?.id).toBe("openai/gpt-5")
    })
  })

  it("still resolves the plain and case-shifted forms, and the canonical route id", async () => {
    await withSnapshot({}, async (dataBackend) => {
      // Plain id: what a direct API caller sends (worked before the fix).
      expect(await dataBackend.getModelSummaryById(FOLDED)).not.toBeNull()
      // raw_model_ids preserve HF casing, so the match stays case-insensitive
      // in the decoded domain too.
      expect(
        await dataBackend.getModelSummaryById(encodeURIComponent(FOLDED.toLowerCase())),
      ).not.toBeNull()
      // The primary encoded route_id lookup is untouched.
      expect(await dataBackend.getModelSummaryById("openai%2Fgpt-5")).not.toBeNull()
    })
  })

  it("still returns null for an id no row and no raw_model_ids entry backs", async () => {
    await withSnapshot({}, async (dataBackend) => {
      expect(await dataBackend.getModelSummaryById("openai%2Fnot-a-model")).toBeNull()
    })
  })
})
