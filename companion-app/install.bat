@echo off
set "DIR=%~dp0"
set "MANIFEST=%DIR%host-manifest.json"

echo Registrando o Aster Companion App no Chrome...

:: Cria a chave no registro para o Chrome
REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.aster.downloader" /ve /t REG_SZ /d "%MANIFEST%" /f

echo.
echo Registro concluido com sucesso!
pause
