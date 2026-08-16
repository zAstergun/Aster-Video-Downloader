#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MANIFEST="$DIR/host-manifest.json"
BIN_DIR="$DIR/bin"

echo "=============================================="
echo "  Instalador do Aster Companion App (Linux/macOS)"
echo "=============================================="
echo ""

echo "[1/2] Verificando dependencias..."
mkdir -p "$BIN_DIR"

if ! command -v ffmpeg &> /dev/null; then
    echo "Aviso: FFmpeg nao foi encontrado no sistema."
    echo "O yt-dlp precisa do FFmpeg para juntar audio e video em 1080p+ e para compilar streams HLS."
    echo "Recomendamos instalar o ffmpeg via gerenciador de pacotes:"
    echo "  Ubuntu/Debian: sudo apt install ffmpeg"
    echo "  macOS: brew install ffmpeg"
else
    echo "FFmpeg ja esta instalado no sistema!"
fi

echo ""
echo "[2/2] Registrando o aplicativo no Google Chrome..."

HOST_NAME="com.aster.downloader"

if [ "$(uname)" == "Darwin" ]; then
    TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
else
    TARGET_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
fi

mkdir -p "$TARGET_DIR"

# Cria uma cópia dinâmica do manifesto para apontar para o run.sh
cp "$MANIFEST" "$TARGET_DIR/$HOST_NAME.json"
sed -i.bak "s|\"path\": \"run.bat\"|\"path\": \"$DIR/run.sh\"|g" "$TARGET_DIR/$HOST_NAME.json"
rm -f "$TARGET_DIR/$HOST_NAME.json.bak"

chmod +x "$DIR/run.sh"

echo ""
echo "=============================================="
echo "Instalacao concluida com sucesso!"
echo "=============================================="
