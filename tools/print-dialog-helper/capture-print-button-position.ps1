Add-Type -AssemblyName System.Windows.Forms

$seconds = 8
Write-Host "Cursor position capture will run in $seconds seconds."
Write-Host "Open one print dialog and move the mouse to the center of its Print button."

for ($remaining = $seconds; $remaining -gt 0; $remaining--) {
  Write-Host "$remaining..."
  Start-Sleep -Seconds 1
}

$position = [System.Windows.Forms.Cursor]::Position
Write-Host ""
Write-Host "Captured position:"
Write-Host "X = $($position.X)"
Write-Host "Y = $($position.Y)"
Write-Host ""
Write-Host "Enter these X and Y values in the Web print helper settings."
