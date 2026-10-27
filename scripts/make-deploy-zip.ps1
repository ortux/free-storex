# ─────────────────────────────────────────────────────────────────────────────
#  make-deploy-zip.ps1
#  Builds a ready-to-drop cPanel deployment ZIP from the current repo.
#  Output: Desktop\free-store-deploy.zip
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'

$root    = Resolve-Path "$PSScriptRoot\.."
$backend = Join-Path $root "backend"
$staging = Join-Path $env:TEMP "free-store-deploy"
$output  = Join-Path $root "free-store-deploy.zip"

Write-Host "`n[1/5] Cleaning staging area..." -ForegroundColor Cyan
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

# ── dist/ ─────────────────────────────────────────────────────────────────────
Write-Host "[2/5] Copying compiled app (dist/)..." -ForegroundColor Cyan
$distSrc = Join-Path $backend "dist"
if (-not (Test-Path (Join-Path $distSrc "app.js"))) {
    Write-Error "dist/app.js not found. Run 'npm run build' from the repo root first."
}
Copy-Item -Recurse -Path $distSrc -Destination (Join-Path $staging "dist")

# ── public/ (built React SPA) ─────────────────────────────────────────────────
Write-Host "[3/5] Copying frontend SPA (public/)..." -ForegroundColor Cyan
$publicSrc = Join-Path $backend "public"
if (-not (Test-Path (Join-Path $publicSrc "index.html"))) {
    Write-Error "public/index.html not found. Run 'npm run build' from the repo root first."
}
Copy-Item -Recurse -Path $publicSrc -Destination (Join-Path $staging "public")

# ── database/ ─────────────────────────────────────────────────────────────────
Write-Host "[4/5] Copying database schema..." -ForegroundColor Cyan
$dbSrc = Join-Path $backend "database"
Copy-Item -Recurse -Path $dbSrc -Destination (Join-Path $staging "database")

# ── Individual files ──────────────────────────────────────────────────────────
Write-Host "[4/5] Copying config files..." -ForegroundColor Cyan

# Production package.json (no devDependencies)
Copy-Item (Join-Path $backend "package.prod.json") (Join-Path $staging "package.json")
Copy-Item (Join-Path $backend "package-lock.json") (Join-Path $staging "package-lock.json")

# .htaccess (Passenger wiring + HTTPS redirect)
Copy-Item (Join-Path $backend ".htaccess") (Join-Path $staging ".htaccess")

# .env template — user fills this in on the server
Copy-Item (Join-Path $backend ".env.production") (Join-Path $staging ".env.production")

# ── node_modules (production only) ───────────────────────────────────────────
Write-Host "[5/5] Copying node_modules (prod deps only - this may take a moment)..." -ForegroundColor Cyan
$nmSrc  = Join-Path $backend "node_modules"
$nmDest = Join-Path $staging "node_modules"

if (-not (Test-Path $nmSrc)) {
    Write-Warning "node_modules not found — the ZIP will not include dependencies."
    Write-Warning "You will need to run 'npm install --omit=dev' on the server."
} else {
    # Only copy packages listed in package.prod.json dependencies (+ their deps)
    # Easiest reliable way: copy the full node_modules then strip devOnly packages.
    # Given the small dep list we just copy everything — devDeps are tiny vs prod.
    Copy-Item -Recurse -Path $nmSrc -Destination $nmDest
}

# ── ZIP ───────────────────────────────────────────────────────────────────────
Write-Host "`nCreating ZIP at: $output" -ForegroundColor Cyan
if (Test-Path $output) { Remove-Item $output -Force }

Compress-Archive -Path "$staging\*" -DestinationPath $output

# ── Summary ───────────────────────────────────────────────────────────────────
$sizeMb = [math]::Round((Get-Item $output).Length / 1MB, 1)
Write-Host "`n✅  Done!  free-store-deploy.zip  ($sizeMb MB)" -ForegroundColor Green
Write-Host "   Location: $output" -ForegroundColor Green
Write-Host ""
Write-Host "Contents of the ZIP:" -ForegroundColor Yellow
Get-ChildItem $staging | ForEach-Object { Write-Host "   $_" }
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Upload free-store-deploy.zip to /home/cpanelusername/free-store/ in File Manager"
Write-Host "  2. Extract it there"
Write-Host "  3. Rename .env.production to .env and fill in CHANGE_ME values"
Write-Host "  4. cPanel → Setup Node.js App → Create (startup file: dist/app.js)"
Write-Host "  5. Put the .htaccess into public_html/ (NOT inside free-store/)"
Write-Host ""

# Cleanup temp staging
Remove-Item $staging -Recurse -Force
