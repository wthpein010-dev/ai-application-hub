#!/bin/sh
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$DIR/.." || exit 1
npm install
npm run pack:mac-arm64
