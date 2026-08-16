@echo off
set "DIR=%~dp0"
set "MANIFEST=%DIR%dist\host-manifest.json"
set "BIN_DIR=%DIR%bin"

echo ==============================================
echo   Instalador do Aster Companion App
echo ==============================================
echo.

echo [1/3] Verificando dependencias de video...
if not exist "%BIN_DIR%\ffmpeg.exe" (
    echo O FFmpeg nao foi encontrado. Baixando automaticamente ^(pode demorar alguns minutos^)...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' -OutFile '%DIR%ffmpeg.zip'"
    echo Extraindo arquivos...
    powershell -Command "Expand-Archive -Path '%DIR%ffmpeg.zip' -DestinationPath '%DIR%ffmpeg_ext' -Force"
    move /y "%DIR%ffmpeg_ext\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe" "%BIN_DIR%\" >nul
    move /y "%DIR%ffmpeg_ext\ffmpeg-master-latest-win64-gpl\bin\ffprobe.exe" "%BIN_DIR%\" >nul
    rmdir /s /q "%DIR%ffmpeg_ext"
    del "%DIR%ffmpeg.zip"
    echo FFmpeg instalado com sucesso!
) else (
    echo FFmpeg ja esta instalado!
)

)

echo.
echo [2/3] Verificando Runtime JavaScript (Node.js)...
if not exist "%BIN_DIR%\node.exe" (
    echo O Node.js nao foi encontrado. Baixando executavel portatil...
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v18.20.4/win-x64/node.exe' -OutFile '%BIN_DIR%\node.exe'"
    echo Node.js instalado com sucesso!
) else (
    echo Node.js ja esta instalado!
)

echo.
echo [3/3] Registrando o aplicativo no Google Chrome...
:: Cria a chave no registro para o Chrome
REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.aster.downloader" /ve /t REG_SZ /d "%MANIFEST%" /f
REG ADD "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.aster.downloader" /ve /t REG_SZ /d "%MANIFEST%" /f
REG ADD "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.aster.downloader" /ve /t REG_SZ /d "%MANIFEST%" /f
REG ADD "HKCU\Software\Chromium\NativeMessagingHosts\com.aster.downloader" /ve /t REG_SZ /d "%MANIFEST%" /f
REG ADD "HKCU\Software\Opera Software\NativeMessagingHosts\com.aster.downloader" /ve /t REG_SZ /d "%MANIFEST%" /f

echo.
echo ==============================================
echo Instalacao concluida com sucesso!
echo ==============================================
