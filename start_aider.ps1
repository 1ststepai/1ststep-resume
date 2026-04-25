# Models ordered from highest daily limit (1000 RPD) to lowest (100 RPD)
$models = @(
    "gemini/gemini-2.5-flash-lite", 
    "gemini/gemini-2.0-flash",
    "gemini/gemini-2.5-flash",
    "gemini/gemini-1.5-flash"
)

$currentIdx = 0

while ($true) {
    $model = $models[$currentIdx]
    Write-Host "`n🚀 [CURRENT BATTERY] $model" -ForegroundColor Cyan
    
    try {
        # Using --exit to ensure the script regains control if Aider stops
        aider --browser --model $model --map-tokens 0 --exit
    }
    catch {
        Write-Host "`n⚠️ Model session interrupted." -ForegroundColor Yellow
    }

    Write-Host "`n[R] Next Model (Use if Rate Limited) | [Q] Quit" -ForegroundColor White
    $choice = Read-Host "Action?"

    if ($choice -eq "q" -or $choice -eq "Q") {
        break
    } else {
        # Rotate to the next "battery" in the pack
        $currentIdx = ($currentIdx + 1) % $models.Count
        Write-Host "🔄 Swapping to next available model..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
    }
}