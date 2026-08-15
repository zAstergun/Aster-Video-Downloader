Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\User\Desktop\Aster - Video Downloader\assets\icon.png"
$largeOut = "C:\Users\User\Desktop\Aster - Video Downloader\assets\wizard-large.bmp"
$smallOut = "C:\Users\User\Desktop\Aster - Video Downloader\assets\wizard-small.bmp"

$srcImage = [System.Drawing.Image]::FromFile($srcPath)

# Large image (164x314)
$bmpLarge = New-Object System.Drawing.Bitmap(164, 314)
$gLarge = [System.Drawing.Graphics]::FromImage($bmpLarge)
$gLarge.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 18, 18, 22))
$gLarge.FillRectangle($brush, 0, 0, 164, 314)
$gLarge.DrawImage($srcImage, 32, 107, 100, 100)
$bmpLarge.Save($largeOut, [System.Drawing.Imaging.ImageFormat]::Bmp)
$gLarge.Dispose()
$bmpLarge.Dispose()

# Small image (55x55)
$bmpSmall = New-Object System.Drawing.Bitmap(55, 55)
$gSmall = [System.Drawing.Graphics]::FromImage($bmpSmall)
$gSmall.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gSmall.FillRectangle($brush, 0, 0, 55, 55)
$gSmall.DrawImage($srcImage, 5, 5, 45, 45)
$bmpSmall.Save($smallOut, [System.Drawing.Imaging.ImageFormat]::Bmp)
$gSmall.Dispose()
$bmpSmall.Dispose()

$brush.Dispose()
$srcImage.Dispose()
