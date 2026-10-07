#!/usr/bin/env sh
# Builds index.html (a complete page for GitHub Pages or any static host) from src/app.html.
# The hosted page is installable on phones (manifest + service worker); the artifact preview is not.
set -e
cd "$(dirname "$0")"
{
  printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="theme-color" content="#0A0C13">\n'
  printf '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icons/icon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="icons/icon-192.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n'
  printf '</head>\n<body>\n'
  cat src/app.html
  printf '\n<script>if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));</script>\n'
  printf '</body>\n</html>\n'
} > index.html
echo "Built index.html"
