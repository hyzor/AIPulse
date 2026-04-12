#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Backfill historical stock data from Finnhub API to TimescaleDB
.DESCRIPTION
    Fetches 7-day (1h) and 30-day (1d) historical data for all tracked symbols
    and stores it in TimescaleDB for immediate chart visualization.
    
    Rate limit safe: Uses max 24 API calls (40% of free tier 60/min limit)
.EXAMPLE
    .\backfill-data.ps1
#>

$ErrorActionPreference = "Stop"

# Configuration
$API_URL = "http://localhost:3001"
$DockerDb = "aipulse-db-dev"

# Symbols to backfill
$symbols = @("NVDA", "AMD", "AVGO", "MRVL", "TSM", "ASML", "ARM", "PLTR", "MSFT", "GOOGL", "AMZN", "TSLA")

# Colors
$Green = "`e[32m"
$Yellow = "`e[33m"
$Blue = "`e[34m"
$Red = "`e[31m"
$Reset = "`e[0m"

function Write-Color($Text, $Color) {
    Write-Host "$Color$Text$Reset"
}

function Invoke-Api($Endpoint) {
    try {
        $response = Invoke-RestMethod -Uri "$API_URL$Endpoint" -TimeoutSec 30
        return $response
    } catch {
        Write-Color "  ❌ API Error: $_" $Red
        return $null
    }
}

function Get-DbCount($symbol, $table = "stock_candles_1m") {
    $count = docker exec $DockerDb psql -U postgres -d aipulse -t -c "SELECT COUNT(*) FROM $table WHERE symbol = '$symbol';" 2>$null
    if ($count -is [array]) { $count = $count -join "" }
    return [int](($count -replace '\D', ''))
}

# Check if backend is running
Write-Color "🔍 Checking backend connection..." $Blue
$health = Invoke-Api "/api/health"
if (-not $health) {
    Write-Color "❌ Backend not running! Start it first: cd backend && npm run dev" $Red
    exit 1
}

$callsRemaining = $health.services.finnhub.rateLimitRemaining
Write-Color "✅ Backend connected ($callsRemaining API calls remaining)" $Green

# Check rate limit
if ($callsRemaining -lt 30) {
    Write-Color "⚠️  Warning: Only $callsRemaining API calls remaining. Wait a few minutes and try again." $Yellow
    exit 1
}

Write-Host ""
Write-Color "📊 Backfill Plan:" $Blue
Write-Host "  • Symbols: $($symbols.Count) stocks"
Write-Host "  • 7-day (1h resolution): $($symbols.Count) API calls"
Write-Host "  • 30-day (1d resolution): $($symbols.Count) API calls"
Write-Host "  • Total API calls: $($symbols.Count * 2) (max 40% of free tier)"
Write-Host "  • Estimated time: ~30 seconds"
Write-Host ""

$confirm = Read-Host "Continue? (y/n)"
if ($confirm -ne 'y') {
    Write-Color "Cancelled." $Yellow
    exit 0
}

Write-Host ""
Write-Color "🚀 Starting backfill..." $Blue
Write-Host ""

$success = 0
$failed = 0
$startTime = Get-Date

# Backfill 7-day data (1h resolution)
Write-Color "⏳ Fetching 7-day history (1h resolution)..." $Blue
foreach ($symbol in $symbols) {
    Write-Host "  Fetching $symbol..." -NoNewline
    
    $result = Invoke-Api "/api/stocks/$symbol/history?range=7d&resolution=1h"
    
    if ($result -and $result.success) {
        $candles = $result.data.candles.Count
        Write-Color " ✓ ($candles candles)" $Green
        $success++
    } else {
        Write-Color " ✗" $Red
        $failed++
    }
    
    # Small delay to be nice to the API
    Start-Sleep -Milliseconds 100
}

Write-Host ""

# Backfill 30-day data (1d resolution)
Write-Color "⏳ Fetching 30-day history (1d resolution)..." $Blue
foreach ($symbol in $symbols) {
    Write-Host "  Fetching $symbol..." -NoNewline
    
    $result = Invoke-Api "/api/stocks/$symbol/history?range=30d&resolution=1d"
    
    if ($result -and $result.success) {
        $candles = $result.data.candles.Count
        Write-Color " ✓ ($candles candles)" $Green
        $success++
    } else {
        Write-Color " ✗" $Red
        $failed++
    }
    
    # Small delay to be nice to the API
    Start-Sleep -Milliseconds 100
}

$endTime = Get-Date
$duration = ($endTime - $startTime).TotalSeconds

Write-Host ""
Write-Color "✅ Backfill Complete!" $Green
Write-Host ""
Write-Host "  Duration: $([math]::Round($duration, 1)) seconds"
Write-Host "  Successful: $success"
Write-Host "  Failed: $failed"
Write-Host ""

# Show final counts
Write-Color "📈 Data Summary:" $Blue
Write-Host ""
$totalCandles = 0
foreach ($symbol in $symbols) {
    $count = Get-DbCount $symbol "stock_candles_1m"
    $totalCandles += $count
    $status = if ($count -gt 0) { "✓" } else { "○" }
    Write-Host "  $status $symbol`: $count candles"
}

Write-Host ""
Write-Color "🎉 Total: $totalCandles candles stored in TimescaleDB" $Green
Write-Host ""
Write-Color "💡 Refresh your browser to see the charts!" $Blue
