#!/bin/bash

echo "🚀 Deploying BioLink Pro to Railway..."

if ! command -v railway &> /dev/null; then
    echo "📦 Instalando Railway CLI..."
    npm install -g @railway/cli
fi

echo "🔐 Verificando sesión..."
railway whoami || railway login

if [ ! -f "backend/railway.yaml" ]; then
    echo "❌ No se encontró backend/railway.yaml"
    exit 1
fi

if [ ! -f "backend/.railway/config.json" ]; then
    echo "🆕 Inicializando proyecto..."
    cd backend
    railway init --name biolink-platform
    cd ..
fi

echo "📤 Deploying..."
cd backend
railway up

SERVICE_URL=$(railway domain)

echo ""
echo "✅ Deploy completado!"
echo "Backend: $SERVICE_URL"
echo "Health: $SERVICE_URL/health"
