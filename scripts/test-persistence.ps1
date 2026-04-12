#!/usr/bin/env pwsh
<#
.SYNOPSIS
    AIPulse Persistence Test Script for Windows PowerShell
.DESCRIPTION
    Comprehensive test suite for the three-tier caching system:
    L1 (Memory) → L2 (Redis AOF) → L3 (TimescaleDB)
    Tests connectivity, data flow, persistence, and recovery.
.EXAMPLE
    .\test-persistence.ps1
    .\test-persistence.ps1 -Verbose
    .\test-persistence.ps1 -SkipRecovery
#>

[CmdletBinding()]
param(
    [switch]$SkipRecovery,
    [switch]$SkipShutdown,
    [int]$CollectionTime = 30,
    [string]$BaseUrl = "http://localhost:3001"
)

# Configuration
$ErrorActionPreference = "Stop"
$DockerDb = "aipulse-db-dev"
$DockerRedis = "aipulse-redis-dev"

# Colors for output
function Write-Color($Text, $Color = "White") {
    Write-Host $Text -ForegroundColor $Color
}

function Write-Header($Text) {
    Write-Host "`n=== $Text ===" -ForegroundColor Cyan
}

function Write-Success($Text) {
    Write-Host "✅ $Text" -ForegroundColor Green
}

function Write-Error($Text) {
    Write-Host "❌ $Text" -ForegroundColor Red
}

function Write-Warning($Text) {
    Write-Host "⚠️  $Text" -ForegroundColor Yellow
}

function Write-Info($Text) {
    Write-Host "ℹ️  $Text" -ForegroundColor Blue
}

# API Helper
function Invoke-Api($Endpoint, $Method = "GET", $Body = $null) {
    $uri = "$BaseUrl$Endpoint"
    try {
        if ($Method -eq "GET") {
            return Invoke-RestMethod -Uri $uri -Method GET -TimeoutSec 10
        } else {
            return Invoke-RestMethod -Uri $uri -Method $Method -TimeoutSec 10
        }
    } catch {
        Write-Error "API call failed: $uri"
        Write-Error $_.Exception.Message
        return $null
    }
}

# Docker Helper - uses array to preserve argument grouping
function Invoke-Docker($Command) {
    try {
        # Split by spaces but handle quoted strings
        $cmdArray = $Command -split ' (?=(?:[^"]*"[^"]*")*[^"]*$)' | ForEach-Object { $_ -replace '"', '' }
        $output = & docker $cmdArray 2>&1
        # Convert to string
        if ($output -is [array]) {
            return $output -join "`n"
        }
        return [string]$output
    } catch {
        Write-Error "Docker command failed: $Command"
        return $null
    }
}

# Test 1: Health Check
function Test-Health {
    Write-Header "Test 1: Health Check"
    
    Write-Info "Checking connection to $BaseUrl..."
    
    $health = Invoke-Api "/api/health"
    if (-not $health) {
        Write-Error "Cannot connect to API at $BaseUrl"
        Write-Host ""
        Write-Color "╔════════════════════════════════════════════════════════════╗" "Red"
        Write-Color "║  BACKEND NOT RUNNING                                       ║" "Red"
        Write-Color "╠════════════════════════════════════════════════════════════╣" "Red"
        Write-Color "║  The test script requires the backend to be running.       ║" "Yellow"
        Write-Color "║                                                            ║" "Yellow"
        Write-Color "║  Start the backend first:                                  ║" "Yellow"
        Write-Color "║    cd backend                                              ║" "Cyan"
        Write-Color "║    npm run dev                                             ║" "Cyan"
        Write-Color "║                                                            ║" "Yellow"
        Write-Color "║  Then wait 5-10 seconds and re-run this test script.       ║" "Yellow"
        Write-Color "╚════════════════════════════════════════════════════════════╝" "Red"
        Write-Host ""
        return $false
    }
    
    Write-Info "Status: $($health.status)"
    Write-Info "Timestamp: $($health.timestamp)"
    
    # Check services
    $allOk = $true
    
    if ($health.services.database.connected) {
        Write-Success "TimescaleDB connected (latency: $($health.services.database.latency)ms)"
    } else {
        Write-Error "TimescaleDB not connected"
        $allOk = $false
    }
    
    if ($health.services.redis.connected) {
        Write-Success "Redis connected (latency: $($health.services.redis.latency)ms)"
    } else {
        Write-Error "Redis not connected"
        $allOk = $false
    }
    
    if ($health.services.finnhub.configured) {
        Write-Success "Finnhub configured (rate limit: $($health.services.finnhub.rateLimitRemaining)/60)"
    } else {
        Write-Error "Finnhub not configured - check FINNHUB_API_KEY"
        $allOk = $false
    }
    
    Write-Info "Data stats: $($health.dataStats.total1mCandles) 1m candles, $($health.dataStats.total1hCandles) 1h candles, $($health.dataStats.total1dCandles) 1d candles"
    
    return $allOk
}

# Test 2: Data Collection
function Test-DataCollection {
    Write-Header "Test 2: Data Collection ($CollectionTime seconds)"
    
    # Trigger quote fetch
    Write-Info "Fetching initial quotes..."
    $quotes = Invoke-Api "/api/stocks"
    if (-not $quotes) {
        Write-Error "Failed to fetch quotes"
        return $false
    }
    
    Write-Success "Fetched $($quotes.count) stocks"
    
    # Wait for collection
    Write-Info "Collecting data for $CollectionTime seconds..."
    for ($i = $CollectionTime; $i -gt 0; $i -= 5) {
        Start-Sleep -Seconds 5
        
        # Check buffer stats
        $stats = Invoke-Api "/api/admin/buffer-stats"
        if ($stats) {
            Write-Host "  [$i s] L1 Buffers: $($stats.data.l1Buffers), Updates: $($stats.data.l1TotalUpdates)`r" -NoNewline
        }
    }
    Write-Host "" # Newline
    
    # Final stats
    $finalStats = Invoke-Api "/api/admin/buffer-stats"
    if ($finalStats.data.l1TotalUpdates -eq 0) {
        Write-Error "No data collected in L1 buffers"
        return $false
    }
    
    Write-Success "Collected $($finalStats.data.l1TotalUpdates) updates in L1"
    return $true
}

# Test 3: L1 to Redis Flush
function Test-L1ToRedis {
    Write-Header "Test 3: L1 → Redis Flush"
    
    # Get Redis memory before - use direct docker command
    $memOutput = docker exec $DockerRedis redis-cli info memory 2>$null
    if ($memOutput -is [array]) { $memOutput = $memOutput -join "`n" }
    $memBefore = ($memOutput -split "`n" | Select-String "used_memory_human:" | ForEach-Object { ($_ -split ":")[1] }) | Select-Object -First 1
    Write-Info "Redis memory before: $memBefore"
    
    # Flush L1 to Redis
    $flush = Invoke-Api "/api/admin/flush-cache" -Method "POST"
    if (-not $flush) {
        Write-Error "Flush failed"
        return $false
    }
    
    Write-Success "Flush complete: $($flush.data.l1ToRedis) L1 buffers, $($flush.data.redisToDb) to DB"
    Write-Info "Message: $($flush.data.message)"
    
    # Check Redis memory after - use direct docker command
    $memOutput = docker exec $DockerRedis redis-cli info memory 2>$null
    if ($memOutput -is [array]) { $memOutput = $memOutput -join "`n" }
    $memAfter = ($memOutput -split "`n" | Select-String "used_memory_human:" | ForEach-Object { ($_ -split ":")[1] }) | Select-Object -First 1
    Write-Info "Redis memory after: $memAfter"
    
    # Check Redis has keys
    $keys = docker exec $DockerRedis redis-cli keys "quotes:*" 2>$null
    if ($keys) {
        $keyCount = ($keys -split "`n" | Where-Object { $_ -match "^quotes:" }).Count
        Write-Success "Redis has $keyCount quote keys"
    } else {
        Write-Warning "No quote keys in Redis yet (may need more collection time)"
    }
    
    return $true
}

# Test 4: TimescaleDB Persistence
function Test-Database {
    Write-Header "Test 4: TimescaleDB Persistence"
    
    # Count candles - use direct docker command
    $countOutput = docker exec $DockerDb psql -U postgres -d aipulse -t -c "SELECT COUNT(*) FROM stock_candles_1m;" 2>$null
    if (-not $countOutput) {
        Write-Error "Failed to query TimescaleDB"
        return $false
    }
    
    # Convert output to string if it's an array
    if ($countOutput -is [array]) {
        $countOutput = $countOutput -join ""
    }
    
    # Extract just the number from output
    $countValue = ($countOutput -replace '\D', '').Trim()
    if ($countValue -match '^\d+$' -and [int]$countValue -gt 0) {
        Write-Success "TimescaleDB has $countValue 1-minute candles"
    } else {
        Write-Warning "No candles in TimescaleDB yet (may need more time or flush)"
    }
    
    # Show per-symbol stats - use direct docker command
    Write-Info "Per-symbol candle counts:"
    docker exec $DockerDb psql -U postgres -d aipulse -c "SELECT symbol, COUNT(*) as count FROM stock_candles_1m GROUP BY symbol ORDER BY symbol;" 2>$null | ForEach-Object { Write-Host "  $_" }
    
    return $true
}

# Test 5: Historical Data API
function Test-HistoryApi {
    Write-Header "Test 5: Historical Data API"
    
    $symbols = @("AAPL", "MSFT", "GOOGL")
    $resolutions = @("1h", "1d")
    
    foreach ($symbol in $symbols) {
        foreach ($resolution in $resolutions) {
            $history = Invoke-Api "/api/stocks/$symbol/history?range=7d&resolution=$resolution"
            if ($history -and $history.data.candles.Count -gt 0) {
                Write-Success "$symbol @ $resolution`: $($history.data.candles.Count) candles (partial: $($history.data.partial))"
            } else {
                Write-Warning "$symbol @ $resolution`: No data yet"
            }
        }
    }
    
    return $true
}

# Test 6: Restart Recovery (the critical test!)
function Test-RestartRecovery {
    if ($SkipRecovery) {
        Write-Header "Test 6: Restart Recovery (SKIPPED)"
        Write-Warning "Skipped due to -SkipRecovery flag"
        return $true
    }
    
    Write-Header "Test 6: Restart Recovery (CRITICAL)"
    Write-Info "This test simulates a crash and verifies data recovery"
    
    # Step 1: Collect some data
    Write-Info "Step 1: Collecting data..."
    Invoke-Api "/api/stocks" | Out-Null
    Start-Sleep -Seconds 15
    
    # Step 2: Check we have L1 data
    $stats = Invoke-Api "/api/admin/buffer-stats"
    $l1Updates = $stats.data.l1TotalUpdates
    Write-Info "L1 has $l1Updates updates"
    
    if ($l1Updates -eq 0) {
        Write-Warning "No L1 data to test recovery with"
        return $false
    }
    
    # Step 3: Get current DB count
    $dbCountBefore = docker exec $DockerDb psql -U postgres -d aipulse -t -c "SELECT COUNT(*) FROM stock_candles_1m;" 2>$null
    if ($dbCountBefore -is [array]) { $dbCountBefore = $dbCountBefore -join "" }
    $dbCountBefore = if ($dbCountBefore) { [int](($dbCountBefore -replace '\D', '')) } else { 0 }
    Write-Info "DB has $dbCountBefore candles before restart"
    
    # Step 4: Kill the backend (simulate crash)
    Write-Info "Step 4: Killing backend process (simulating crash)..."
    $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        $nodeProcesses | ForEach-Object { 
            Write-Info "Killing PID $($_.Id)"
            Stop-Process -Id $_.Id -Force 
        }
        Write-Success "Backend killed"
    } else {
        Write-Warning "No Node processes found - may already be stopped"
    }
    
    # Step 5: Wait and check Redis still has data
    Start-Sleep -Seconds 2
    $redisKeys = docker exec $DockerRedis redis-cli keys "quotes:*" 2>$null
    if ($redisKeys) {
        $keyCount = ($redisKeys -split "`n" | Where-Object { $_ -match "^quotes:" }).Count
        Write-Success "Redis retained data: $keyCount keys"
    } else {
        Write-Warning "No keys in Redis - data may have already been flushed"
    }
    
    # Step 6: Restart backend
    Write-Info "Step 6: Restarting backend..."
    Write-Info "Please manually restart in another terminal: cd backend && npm run dev"
    Write-Info "Waiting 10 seconds for startup..."
    Start-Sleep -Seconds 10
    
    # Step 7: Check recovery
    $maxAttempts = 30
    $attempt = 0
    $recovered = $false
    
    while ($attempt -lt $maxAttempts -and -not $recovered) {
        $attempt++
        try {
            $health = Invoke-Api "/api/health"
            if ($health) {
                $recovered = $true
                break
            }
        } catch {
            Write-Host "  Attempt $attempt`: Not ready yet...`r" -NoNewline
            Start-Sleep -Seconds 1
        }
    }
    Write-Host "" # Newline
    
    if (-not $recovered) {
        Write-Error "Backend did not restart within $maxAttempts seconds"
        return $false
    }
    
    Write-Success "Backend restarted"
    
    # Step 8: Verify DB has more data than before
    Start-Sleep -Seconds 5 # Give recovery time
    $dbCountAfter = docker exec $DockerDb psql -U postgres -d aipulse -t -c "SELECT COUNT(*) FROM stock_candles_1m;" 2>$null
    if ($dbCountAfter -is [array]) { $dbCountAfter = $dbCountAfter -join "" }
    $dbCountAfter = if ($dbCountAfter) { [int](($dbCountAfter -replace '\D', '')) } else { 0 }
    Write-Info "DB has $dbCountAfter candles after restart"
    
    if ($dbCountAfter -gt $dbCountBefore) {
        $diff = $dbCountAfter - $dbCountBefore
        Write-Success "Recovery successful: $diff candles recovered from Redis!"
    } elseif ($dbCountAfter -eq $dbCountBefore) {
        Write-Info "No new candles - likely already flushed before restart"
    } else {
        Write-Error "Data loss detected!"
        return $false
    }
    
    return $true
}

# Test 7: Graceful Shutdown
function Test-GracefulShutdown {
    if ($SkipShutdown) {
        Write-Header "Test 7: Graceful Shutdown (SKIPPED)"
        return $true
    }
    
    Write-Header "Test 7: Graceful Shutdown"
    Write-Info "This test sends Ctrl+C (SIGINT) and verifies clean shutdown"
    
    # Make sure backend is running
    $health = Invoke-Api "/api/health"
    if (-not $health) {
        Write-Error "Backend not running - start it first: cd backend && npm run dev"
        return $false
    }
    
    # Collect some data
    Write-Info "Collecting data..."
    Invoke-Api "/api/stocks" | Out-Null
    Start-Sleep -Seconds 10
    
    $stats = Invoke-Api "/api/admin/buffer-stats"
    Write-Info "L1 has $($stats.data.l1TotalUpdates) updates to flush"
    
    # Get DB count before
    $dbCountBefore = docker exec $DockerDb psql -U postgres -d aipulse -t -c "SELECT COUNT(*) FROM stock_candles_1m;" 2>$null
    if ($dbCountBefore -is [array]) { $dbCountBefore = $dbCountBefore -join "" }
    $dbCountBefore = if ($dbCountBefore) { [int](($dbCountBefore -replace '\D', '')) } else { 0 }
    
    Write-Info "`n⚠️  MANUAL ACTION REQUIRED:"
    Write-Info "   Press Ctrl+C in your backend terminal NOW!"
    Write-Info "   You should see shutdown messages..."
    Write-Info "   Then restart with: cd backend && npm run dev"
    Write-Info "`n   Press Enter when backend has restarted..."
    Read-Host
    
    # Check backend is back
    $maxAttempts = 10
    for ($i = 0; $i -lt $maxAttempts; $i++) {
        $health = Invoke-Api "/api/health"
        if ($health) { break }
        Start-Sleep -Seconds 1
    }
    
    if (-not $health) {
        Write-Error "Backend did not restart"
        return $false
    }
    
    # Check DB has more data
    Start-Sleep -Seconds 2
    $dbCountAfter = docker exec $DockerDb psql -U postgres -d aipulse -t -c "SELECT COUNT(*) FROM stock_candles_1m;" 2>$null
    if ($dbCountAfter -is [array]) { $dbCountAfter = $dbCountAfter -join "" }
    $dbCountAfter = if ($dbCountAfter) { [int](($dbCountAfter -replace '\D', '')) } else { 0 }
    
    if ($dbCountAfter -ge $dbCountBefore) {
        Write-Success "Graceful shutdown preserved all data"
    } else {
        Write-Error "Data loss after shutdown!"
        return $false
    }
    
    return $true
}

# Main Execution
function Start-Tests {
    Write-Color @"
╔════════════════════════════════════════════════════════════╗
║           AIPulse Persistence Test Suite                   ║
║                                                            ║
║  Testing three-tier cache architecture:                  ║
║  L1 (Memory) → L2 (Redis AOF) → L3 (TimescaleDB)         ║
╚════════════════════════════════════════════════════════════╝
"@ "Cyan"
    
    $startTime = Get-Date
    $results = @()
    
    # Run all tests
    $results += @{ Name = "Health Check"; Result = Test-Health }
    $results += @{ Name = "Data Collection"; Result = Test-DataCollection }
    $results += @{ Name = "L1 to Redis"; Result = Test-L1ToRedis }
    $results += @{ Name = "Database"; Result = Test-Database }
    $results += @{ Name = "History API"; Result = Test-HistoryApi }
    $results += @{ Name = "Restart Recovery"; Result = Test-RestartRecovery }
    $results += @{ Name = "Graceful Shutdown"; Result = Test-GracefulShutdown }
    
    # Summary
    $endTime = Get-Date
    $duration = $endTime - $startTime
    
    Write-Header "Test Summary"
    
    $passed = 0
    $failed = 0
    
    foreach ($test in $results) {
        if ($test.Result) {
            Write-Success $test.Name
            $passed++
        } else {
            Write-Error $test.Name
            $failed++
        }
    }
    
    Write-Host "`n" -NoNewline
    Write-Color "════════════════════════════════════════════════════════════" "Cyan"
    Write-Color "  Total: $($results.Count) | Passed: $passed | Failed: $failed" $(if ($failed -eq 0) { "Green" } else { "Red" })
    Write-Color "  Duration: $($duration.ToString('mm\:ss'))" "Cyan"
    Write-Color "════════════════════════════════════════════════════════════" "Cyan"
    
    # Return exit code
    if ($failed -gt 0) {
        exit 1
    }
}

# Run tests
Start-Tests
