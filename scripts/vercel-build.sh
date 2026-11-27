#!/usr/bin/env sh
# Vercel build: rebuild index.html, then copy only the public files into public/ (Vercel serves that folder;
# the API in api/ is deployed separately as a function).
set -e
cd "$(dirname "$0")/.."
sh build.sh
rm -rf public && mkdir -p public
cp -r index.html config.js sw.js manifest.webmanifest icons assets sample-data public/
echo "Copied app files to public/"
