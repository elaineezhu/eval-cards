/**
 * Downloads the HF dataset snapshot to local cache during build.
 * This avoids hitting HF rate limits at runtime and during cache refresh.
 *
 * Phase 1: Clone the dataset snapshot once via Git
 * Phase 2: Copy index files (model-cards, eval-list, developers, benchmark-metadata, peer-ranks)
 * Phase 3: Copy detail directories (developers/*.json, evals/*.json, models/*.json)
 *
 * Run with:  node scripts/cache-hf-data.mjs
 */

import { execFile } from "child_process"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { promisify } from "util"

const root = path.resolve(new URL(import.meta.url).pathname, "..", "..")
const cacheDir = path.join(root, ".cache", "hf-data")
const publicDir = path.join(root, "public")
const HF_DATASET_REPO = "https://huggingface.co/datasets/evaleval/card_backend"
const HF_RESOLVE_BASE = `${HF_DATASET_REPO}/resolve/main`
const execFileAsync = promisify(execFile)

const CACHE_ROOT_FILES = [
  "model-cards.json",
  "eval-list.json",
  "developers.json",
  "benchmark-metadata.json",
  "eval-hierarchy.json",
]

const CACHE_DIRECTORIES = ["developers", "evals", "models"]

async function runGit(args, cwd) {
  await execFileAsync("git", args, {
    cwd,
    maxBuffer: 1024 * 1024 * 32,
  })
}

async function cloneDatasetSnapshot(targetDir) {
  await runGit(["clone", "--depth", "1", "--single-branch", HF_DATASET_REPO, targetDir], root)
}

async function ensureCleanDirectory(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true })
  await fs.mkdir(dirPath, { recursive: true })
}

async function copyFile(sourcePath, destinationPath) {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true })
  await fs.copyFile(sourcePath, destinationPath)
  const stat = await fs.stat(destinationPath)
  return stat.size
}

function isGitLfsPointer(contents) {
  return contents.startsWith("version https://git-lfs.github.com/spec/v1\n")
}

async function writeRemoteFile(relativePath, destinationPath) {
  const response = await fetch(`${HF_RESOLVE_BASE}/${relativePath}`)
  if (!response.ok) {
    throw new Error(`Failed to download ${relativePath}: ${response.status} ${response.statusText}`)
  }

  const body = await response.text()
  await fs.mkdir(path.dirname(destinationPath), { recursive: true })
  await fs.writeFile(destinationPath, body)
  return Buffer.byteLength(body)
}

async function copySnapshotFile(snapshotRoot, relativePath, destinationPath) {
  const sourcePath = path.join(snapshotRoot, relativePath)
  const contents = await fs.readFile(sourcePath, "utf8")

  if (isGitLfsPointer(contents)) {
    const size = await writeRemoteFile(relativePath, destinationPath)
    return { size, source: "remote" }
  }

  const size = await copyFile(sourcePath, destinationPath)
  return { size, source: "snapshot" }
}

async function copySnapshotDirectory(snapshotRoot, relativeDir, destinationDir) {
  const sourceDir = path.join(snapshotRoot, relativeDir)
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })

  let fileCount = 0
  let remoteCount = 0

  for (const entry of entries) {
    const nestedRelativePath = path.posix.join(relativeDir, entry.name)
    const destinationPath = path.join(destinationDir, entry.name)

    if (entry.isDirectory()) {
      await ensureCleanDirectory(destinationPath)
      const nested = await copySnapshotDirectory(snapshotRoot, nestedRelativePath, destinationPath)
      fileCount += nested.fileCount
      remoteCount += nested.remoteCount
      continue
    }

    const result = await copySnapshotFile(snapshotRoot, nestedRelativePath, destinationPath)
    fileCount += 1
    remoteCount += result.source === "remote" ? 1 : 0
  }

  return { fileCount, remoteCount }
}

async function countFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  let count = 0

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      count += await countFiles(fullPath)
      continue
    }

    count += 1
  }

  return count
}

async function main() {
  console.log("Caching HF dataset snapshot for build...\n")

  await fs.mkdir(cacheDir, { recursive: true })
  await fs.mkdir(publicDir, { recursive: true })

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "card-backend-"))

  try {
    // ── Phase 1: Clone snapshot ───────────────────────────────────────────
    console.log("Phase 1: Clone dataset snapshot")
    await cloneDatasetSnapshot(tempDir)
    console.log(`  ✓ cloned ${HF_DATASET_REPO}`)

    // ── Phase 2: Root files ───────────────────────────────────────────────
    console.log("\nPhase 2: Copy index files")
    for (const fileName of CACHE_ROOT_FILES) {
      const destinationPath = path.join(cacheDir, fileName)
      const result = await copySnapshotFile(tempDir, fileName, destinationPath)
      const suffix = result.source === "remote" ? ", resolved from LFS" : ""
      console.log(`  ✓ ${fileName} (${(result.size / 1024).toFixed(0)} KB${suffix})`)
    }

    const peerRanksResult = await copySnapshotFile(
      tempDir,
      "peer-ranks.json",
      path.join(publicDir, "peer-ranks.json")
    )
    const peerRanksSuffix = peerRanksResult.source === "remote" ? ", resolved from LFS" : ""
    console.log(`  ✓ peer-ranks.json (${(peerRanksResult.size / 1024).toFixed(0)} KB${peerRanksSuffix})`)

    // ── Phase 3: Detail directories ─────────────────────────────────────
    console.log("\nPhase 3: Copy detail directories")
    for (const directoryName of CACHE_DIRECTORIES) {
      const destinationPath = path.join(cacheDir, directoryName)
      await ensureCleanDirectory(destinationPath)
      const result = await copySnapshotDirectory(tempDir, directoryName, destinationPath)
      const remoteSuffix = result.remoteCount > 0 ? `, ${result.remoteCount} resolved from LFS` : ""
      console.log(`  ✓ ${directoryName}/ (${result.fileCount} files${remoteSuffix})`)
    }

    console.log("\nDone.")
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
