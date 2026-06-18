#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Cleaning git lock file if present..."
rm -f .git/index.lock

echo "Configuring git..."
git config user.email "jasonzzx@gmail.com"
git config user.name "Jason"

echo "Staging all files..."
git add -A

echo "Committing..."
git commit -m "fix: disable API route caching so tracker data is always live, not stale from CDN" || echo "(nothing new to commit)"

echo "Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Done! Vercel will auto-deploy from GitHub."
echo "   https://vercel.com/jasonzzxs-projects/personal-go-train"
