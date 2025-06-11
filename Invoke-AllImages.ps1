# Invoke-AllImages.ps1
Param()

# --- Konfigurácia ---
$Bucket   = 'medusa-majolika-s3'
$Function = 'medusaMajolikaImages'
$Region   = 'eu-north-1'

# --- Získaj všetky .jpg/.png kľúče pod prefixom products/ ---
$keys = aws s3api list-objects-v2 `
  --bucket $Bucket `
  --prefix 'products/' `
  --query "Contents[?ends_with(Key, '.jpg') || ends_with(Key, '.png')].Key" `
  --output json | ConvertFrom-Json

if (-not $keys -or $keys.Count -eq 0) {
  Write-Host "⚠️  Žiadne .jpg/.png súbory v products/" -ForegroundColor Yellow
  exit 1
}

# --- Pre každý kľúč zavolaj Lambda ---
foreach ($key in $keys) {
  Write-Host "🛠  Invoking Lambda pre: $key"

  # Vytvoríme payload.json v TEMP priečinku
  $tmpFile = Join-Path $env:TEMP 'payload.json'
  $payloadObj = @{
    Records = @(
      @{
        s3 = @{
          bucket = @{ name = $Bucket }
          object = @{ key  = $key }
        }
      }
    )
  }
  $payloadObj | ConvertTo-Json -Compress | Out-File -Encoding ascii $tmpFile

  # Zavoláme Lambda s file://payload.json
  aws lambda invoke `
    --function-name $Function `
    --region $Region `
    --cli-binary-format raw-in-base64-out `
    --payload file://$tmpFile `
    response.json | Out-Null
}

Write-Host "✅  Hotovo! Skontroluj CloudWatch Logs a S3://$Bucket/products/optimized/ pre WebP súbory." -ForegroundColor Green
