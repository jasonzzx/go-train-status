#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "▶ Pushing to GitHub..."
git push origin main
echo ""
echo "✅ Pushed! Vercel is auto-deploying from GitHub."
echo "   Check: https://vercel.com/jasonzzxs-projects/personal-go-train"
echo ""
read -p "Press Enter to close..."
