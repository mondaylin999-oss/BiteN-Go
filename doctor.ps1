# ===========================================================================
#  doctor.ps1 — checks the whole project and writes doctor-report.txt
#
#  Double-click doctor.bat instead of running this by hand.
#
#  What it does, in order:
#    1. reports Node / npm / PostgreSQL versions
#    2. installs dependencies in backend/ and frontend/ (safe to re-run)
#    3. type-checks both, then does a REAL production build of the frontend —
#       this is the step that catches the kind of bug that shows a blank white
#       page in the browser (a missing package, a bad import, a typo in a name)
#    4. if the backend is already running on port 8000, logs in as each role
#       and calls the main endpoints, reporting the status of each
#
#  Everything it prints also goes into doctor-report.txt next to this file.
#  Send that file to Claude and it can see exactly what failed.
# ===========================================================================

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$report = Join-Path $root "doctor-report.txt"
"BiteN Go — doctor report"                       | Out-File $report -Encoding utf8
"Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File $report -Append -Encoding utf8
"Folder:    $root"                               | Out-File $report -Append -Encoding utf8

function Section($title) {
  $line = "`n" + ("=" * 74) + "`n  $title`n" + ("=" * 74)
  Write-Host $line -ForegroundColor Cyan
  $line | Out-File $report -Append -Encoding utf8
}

function Say($text) {
  Write-Host $text
  $text | Out-File $report -Append -Encoding utf8
}

# Runs a command, shows its output live, and copies it into the report.
function Run($label, $exe, $argline, $workdir) {
  Say "`n--- $label"
  Push-Location $workdir
  try {
    $output = & cmd /c "$exe $argline 2>&1"
    $code = $LASTEXITCODE
    $text = ($output | Out-String).TrimEnd()
    if ($text) { Write-Host $text; $text | Out-File $report -Append -Encoding utf8 }
    if ($code -eq 0) { Say "RESULT: ok" } else { Say "RESULT: FAILED (exit $code)" }
    return $code
  } catch {
    Say "RESULT: FAILED — $($_.Exception.Message)"
    return 1
  } finally {
    Pop-Location
  }
}

# ---------------------------------------------------------------------------
Section "1. Versions"
# ---------------------------------------------------------------------------
Say "node   : $(try { (& node -v) } catch { 'NOT FOUND — install Node.js LTS from nodejs.org' })"
Say "npm    : $(try { (& cmd /c 'npm -v') } catch { 'NOT FOUND' })"
$psql = Get-Command psql -ErrorAction SilentlyContinue
if ($psql) { Say "psql   : $(& psql --version)" } else { Say "psql   : not on PATH (fine — pgAdmin4 does not need it)" }

# ---------------------------------------------------------------------------
Section "2. Backend dependencies and type check"
# ---------------------------------------------------------------------------
$backendInstall = Run "npm install (backend)" "npm" "install --no-audit --no-fund" "$root\backend"
$backendCheck   = Run "npm run check (backend TypeScript)" "npm" "run check" "$root\backend"

# ---------------------------------------------------------------------------
Section "3. Frontend dependencies, type check and real build"
# ---------------------------------------------------------------------------
$frontendInstall = Run "npm install (frontend)" "npm" "install --no-audit --no-fund" "$root\frontend"

# Are the map packages actually there? Missing ones are the usual reason the
# ferry map says it could not load.
foreach ($pkg in @("leaflet", "leaflet-routing-machine", "react", "wouter", "lucide-react")) {
  $path = Join-Path $root "frontend\node_modules\$pkg\package.json"
  if (Test-Path $path) {
    $version = (Get-Content $path -Raw | ConvertFrom-Json).version
    Say "package $pkg : $version"
  } else {
    Say "package $pkg : MISSING — run npm install in the frontend folder"
  }
}

$frontendCheck = Run "npm run check (frontend TypeScript)" "npm" "run check" "$root\frontend"
$frontendBuild = Run "npm run build (real Vite build — catches blank-page bugs)" "npm" "run build" "$root\frontend"

# ---------------------------------------------------------------------------
Section "4. Is the backend answering?"
# ---------------------------------------------------------------------------
$api = "http://127.0.0.1:8000"
$health = $null
try {
  $health = Invoke-RestMethod -Uri "$api/health" -TimeoutSec 4
  Say "GET /health : ok"
  Say ($health | ConvertTo-Json -Depth 6)
} catch {
  Say "GET /health : NO ANSWER on $api"
  Say "The backend is not running. Open a terminal, run:  cd backend && npm run dev"
  Say "then run this doctor again to include the API checks."
}

if ($health) {
  # -------------------------------------------------------------------------
  Section "5. Logging in as each role and calling the main endpoints"
  # -------------------------------------------------------------------------
  function Login($username, $password) {
    try {
      $body = @{ username = $username; password = $password } | ConvertTo-Json
      $res = Invoke-RestMethod -Uri "$api/auth/login" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 8
      Say "login $username : ok (role $($res.user.role))"
      return $res.token
    } catch {
      Say "login $username : FAILED — $($_.Exception.Message)"
      Say "   If this says 'Invalid username or password', run:  cd backend && npm run seed"
      return $null
    }
  }

  function Probe($label, $token, $path) {
    try {
      $headers = @{ Authorization = "Bearer $token" }
      $res = Invoke-RestMethod -Uri "$api$path" -Headers $headers -TimeoutSec 8
      $count = if ($res -is [array]) { "$($res.Count) row(s)" } else { "ok" }
      Say ("{0,-34} {1,-44} {2}" -f $label, $path, $count)
      return $res
    } catch {
      Say ("{0,-34} {1,-44} FAILED — {2}" -f $label, $path, $_.Exception.Message)
      return $null
    }
  }

  $admin = Login "admin" "biten123"
  if ($admin) {
    Probe "admin · people"        $admin "/cashflow/participants"
    Probe "admin · money"         $admin "/cashflow/overview"
    Probe "admin · history"       $admin "/cashflow/history"
    Probe "admin · ferry buses"   $admin "/transport/vehicles"
    Probe "admin · routes"        $admin "/transport/routes"
    Probe "admin · trips"         $admin "/transport/trips"
    Probe "admin · maintenance"   $admin "/transport/maintenance"
    Probe "admin · orders"        $admin "/canteen/orders"
  }

  $agent = Login "agent01" "biten123"
  if ($agent) {
    Probe "agent · own menu"      $agent "/canteen/menu"
    Probe "agent · kitchen board" $agent "/canteen/kds"
    Probe "agent · float"         $agent "/cashflow/overview"
  }

  $driver = Login "driver01" "biten123"
  if ($driver) {
    Probe "driver · dashboard"    $driver "/transport/driver/dashboard"
    Probe "driver · profile"      $driver "/transport/driver/profile"
    $routes = Probe "driver · routes" $driver "/transport/routes"
    if ($routes) {
      # The map needs published nodes. Report how many each route has, because
      # "no route line published yet" on the student map is almost always this.
      foreach ($row in @($routes)) {
        $nodes = @($row.mapNodes).Count
        Say ("   route '{0}' — {1} map node(s){2}" -f $row.route.name, $nodes, $(if ($nodes -lt 2) { "  <-- the map cannot draw a line with fewer than 2" } else { "" }))
      }
    }
  }

  $student = Login "student01" "biten123"
  if ($student) {
    Probe "student · menu"        $student "/canteen/menu"
    Probe "student · window"      $student "/canteen/window"
    Probe "student · wallet"      $student "/cashflow/wallet"
    Probe "student · my orders"   $student "/canteen/orders"
    Probe "student · departures"  $student "/transport/trips"
    Probe "student · my seats"    $student "/transport/bookings"
  }
}

# ---------------------------------------------------------------------------
Section "Summary"
# ---------------------------------------------------------------------------
function Verdict($label, $code) {
  if ($null -eq $code) { Say ("{0,-40} skipped" -f $label) }
  elseif ($code -eq 0) { Say ("{0,-40} ok" -f $label) }
  else                 { Say ("{0,-40} FAILED — see the section above" -f $label) }
}
Verdict "backend  npm install" $backendInstall
Verdict "backend  type check"  $backendCheck
Verdict "frontend npm install" $frontendInstall
Verdict "frontend type check"  $frontendCheck
Verdict "frontend build"       $frontendBuild
if ($health) { Say ("{0,-40} answering" -f "backend API") } else { Say ("{0,-40} not running" -f "backend API") }

Say "`nFull report written to: $report"
Say "Send that file to Claude and it can see every error above."
Write-Host "`nPress Enter to close." -ForegroundColor Yellow
Read-Host | Out-Null
