# Sparkles AI Setup Script

Write-Host "--- Sparkles AI: Activating Environment ---" -ForegroundColor Cyan

# 1. Install Backend Dependencies
Write-Host "[1/2] Installing backend dependencies..." -ForegroundColor Yellow
Set-Location backend
npm install
Set-Location ..

# 2. Check for .env file
if (-not (Test-Path "backend/.env")) {
    Write-Host "[!] backend/.env not found. Creating from example..." -ForegroundColor Red
    Copy-Item "backend/.env.example" "backend/.env"
    Write-Host "[!] ACTION REQUIRED: Please fill in your GEMINI_API_KEY in backend/.env" -ForegroundColor Magenta
} else {
    Write-Host "[2/2] backend/.env already exists." -ForegroundColor Green
}

Write-Host "`n--- Setup Complete! ---" -ForegroundColor Cyan
Write-Host "To start the backend, run: cd backend; npm start"
Write-Host "To load the extension, go to chrome://extensions and 'Load unpacked' the 'extension' folder."
