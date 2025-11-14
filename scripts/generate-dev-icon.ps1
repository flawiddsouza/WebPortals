# Generate dev icon by replacing red/orange colors with blue
# This script creates a blue variant of the mushroom icon for the dev build

$iconPath = "resources/icon.png"
$devIconPath = "resources/icon-dev.png"

# Replace lighter red/orange cap color with dodgerblue
# Replace darker red shading with darker blue
magick $iconPath `
  -fuzz 20% -fill "rgb(30,144,255)" -opaque "rgb(255,130,100)" `
  -fuzz 20% -fill "rgb(15,90,200)" -opaque "rgb(220,80,60)" `
  $devIconPath

Write-Host "Dev icon generated: $devIconPath"
