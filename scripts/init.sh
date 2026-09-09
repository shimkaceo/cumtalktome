#!/bin/bash

echo "🚀 Inicializando BioLink Pro Platform..."

mkdir -p backend/src/{routes,services,middleware,utils}
mkdir -p backend/prisma
mkdir -p cloudflare-worker
mkdir -p frontend-admin/src/{components,pages,api}
mkdir -p scripts

if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado."
    exit 1
fi

echo "✅ Node.js versión: $(node --version)"

echo "📦 Configurando backend..."
cd backend
npm install
npx prisma generate

if [ ! -f .env ]; then
    cat > .env << EOF
DATABASE_URL=postgresql://user:password@localhost:5432/biolink
REDIS_URL=redis://localhost:6379
JWT_SECRET=$(openssl rand -base64 32)
PORT=3000
NODE_ENV=development
EOF
    echo "📝 Archivo .env creado"
fi

cd ..

echo "📦 Configurando frontend..."
cd frontend-admin
npm install

if [ ! -f .env ]; then
    cat > .env << EOF
VITE_API_URL=http://localhost:3000/api
EOF
    echo "📝 Archivo .env creado"
fi

cd ..

echo ""
echo "✅ Proyecto inicializado!"
echo ""
echo "Próximos pasos:"
echo "  1. Configura PostgreSQL y Redis"
echo "  2. cd backend && npx prisma migrate dev"
echo "  3. cd backend && npm run dev"
echo "  4. cd frontend-admin && npm run dev"
echo ""
