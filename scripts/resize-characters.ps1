Add-Type -AssemblyName System.Drawing

$files = @(
  @{ src = "C:\Users\admin\Desktop\ClaudeProjects\learntok-lesson\public\characters\nibs.png"; name = "nibs" },
  @{ src = "C:\Users\admin\Desktop\ClaudeProjects\learntok-lesson\public\characters\angel.png"; name = "angel" }
)

foreach ($f in $files) {
  $img = [System.Drawing.Image]::FromFile($f.src)
  Write-Host "$($f.name) original: $($img.Width)x$($img.Height), $([math]::Round((Get-Item $f.src).Length / 1KB, 1))KB"

  # Target: 256 on the longer edge, preserve aspect ratio
  $maxDim = 256
  $w = $img.Width
  $h = $img.Height
  if ($w -ge $h) {
    $newW = $maxDim
    $newH = [int]($h * $maxDim / $w)
  } else {
    $newH = $maxDim
    $newW = [int]($w * $maxDim / $h)
  }

  $bmp = New-Object System.Drawing.Bitmap($newW, $newH)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($img, 0, 0, $newW, $newH)

  $img.Dispose()
  $g.Dispose()

  $bmp.Save($f.src, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()

  Write-Host "$($f.name) resized:  $newWx$newH, $([math]::Round((Get-Item $f.src).Length / 1KB, 1))KB"
}
