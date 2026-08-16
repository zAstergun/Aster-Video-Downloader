#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ "$(uname)" == "Darwin" ]; then
    "$DIR/dist/aster-companion-app-macos"
else
    "$DIR/dist/aster-companion-app-linux"
fi

