# Jalankan Mint Tracker. Klik kanan file ini -> "Run with PowerShell",
# atau dari terminal:  powershell -ExecutionPolicy Bypass -File .\start.ps1
#
# Skrip ini menyalakan PostgreSQL kalau belum hidup, lalu menjalankan server.

$ErrorActionPreference = "Stop"
$root  = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = "C:\Users\acer\tools"
$pgBin = "$tools\pgsql\bin"
$pgData = "$tools\pgdata"
$node  = "$tools\node\node.exe"

foreach ($p in @($node, "$pgBin\pg_ctl.exe", "$pgData\postgresql.conf")) {
  if (-not (Test-Path $p)) { Write-Host "Tidak ketemu: $p" -ForegroundColor Red; pause; exit 1 }
}

# --- PostgreSQL ---
$pgUp = (Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -WarningAction SilentlyContinue).TcpTestSucceeded
if ($pgUp) {
  Write-Host "PostgreSQL sudah jalan." -ForegroundColor DarkGray
} else {
  Write-Host "Menyalakan PostgreSQL..." -ForegroundColor Cyan
  # dijalankan terpisah supaya handle output-nya tidak menahan skrip ini
  Start-Process -FilePath "$pgBin\pg_ctl.exe" `
    -ArgumentList @("-D", "`"$pgData`"", "-l", "`"$tools\pg.log`"", "start") `
    -WindowStyle Hidden -Wait
  Start-Sleep -Seconds 3
  if (-not (Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -WarningAction SilentlyContinue).TcpTestSucceeded) {
    Write-Host "PostgreSQL gagal nyala. Cek $tools\pg.log" -ForegroundColor Red
    pause; exit 1
  }
}

# --- server ---
if ((Test-NetConnection -ComputerName 127.0.0.1 -Port 5173 -WarningAction SilentlyContinue).TcpTestSucceeded) {
  Write-Host "Server sudah jalan di http://127.0.0.1:5173" -ForegroundColor Green
  Start-Process "http://127.0.0.1:5173"
  exit 0
}

Write-Host "Menjalankan Mint Tracker..." -ForegroundColor Cyan
Set-Location $root
Start-Process "http://127.0.0.1:5173"
& $node "server\server.js"
