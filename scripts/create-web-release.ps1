param(
  [string]$Version = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $repoRoot

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = (Get-Date -Format "yyyyMMdd-HHmm")
}

$artifactDir = Join-Path $repoRoot "artifacts"
$stagingDir = Join-Path $repoRoot ".release\DatChat-web-$Version"
$distDir = Join-Path $repoRoot "packages\client\dist"
$zipPath = Join-Path $artifactDir "DatChat-web-$Version.zip"

if (-not $SkipBuild) {
  npm run build --workspace client
}

if (-not (Test-Path $distDir)) {
  throw "Build output missing: $distDir"
}

if (Test-Path $stagingDir) {
  Remove-Item -Recurse -Force $stagingDir
}
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null

Copy-Item -Path "$distDir\*" -Destination $stagingDir -Recurse -Force

$runInstructions = @"
DatChat Web Test Build ($Version)

Run locally:
1. Install Node.js 20+.
2. Open terminal in this folder.
3. Run one of:
   - npx serve .
   - python -m http.server 4173
4. Open browser at:
   - http://localhost:3000 (serve)
   - http://localhost:4173 (python)

Notes:
- This build is static frontend only.
- It uses the Supabase URL/key baked at build time.
"@

Set-Content -Path (Join-Path $stagingDir "RUN_ME_FIRST.txt") -Value $runInstructions -NoNewline

if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

Compress-Archive -Path "$stagingDir\*" -DestinationPath $zipPath -CompressionLevel Optimal

Write-Output "Created release package: $zipPath"
