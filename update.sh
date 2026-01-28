#!/bin/bash
echo "🚀 Starting Update Process..."

# 1. 如果你有用 git，可以是 git pull
git pull

# 2. 安裝依賴 (如果 package.json 沒變，npm 會自動跳過，很快)
echo "📦 Installing Dependencies..."
npm install

# 3. 編譯
echo "🔨 Building Project..."
npm run build

# 4. 修正權限 (讓 Nginx 讀得到)
#echo "🔒 Fixing Permissions..."
#sudo chown -R www-data:www-data dist

echo "✅ Update Complete! Site is live at money-tracker.xyz/calc"