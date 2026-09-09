# BioLink Pro - Plataforma de Gestión de Enlaces para Influencers

Sistema de bio links inteligente con clasificación de tráfico edge, mitigación de bots y deep linking optimizado.

## 🏗️ Arquitectura

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Cloudflare    │────▶│  Railway (API)   │────▶│   PostgreSQL    │
│     Worker      │     │  HyperExpress    │     │    + Redis      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │
        ▼                        ▼
   Edge Classification      Admin Panel
   (JA3/Geo/ASN)          (React)
```

## 🚀 Quick Start

### Requisitos
- Node.js 18+
- PostgreSQL 15+
- Redis 7+

### 1. Inicializar

```bash
chmod +x scripts/*.sh
./scripts/init.sh
```

### 2. Configurar PostgreSQL

```bash
# macOS
brew services start postgresql
redis-server

# Crear base de datos
createdb biolink
```

### 3. Migrar y ejecutar

```bash
cd backend
npx prisma migrate dev
npm run dev

# En otra terminal
cd frontend-admin
npm run dev
```

### 4. Crear usuario admin

```bash
curl -X POST http://localhost:3000/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### 5. Abrir panel

http://localhost:5173

## 📦 Deploy a Railway

```bash
./scripts/deploy.sh
```

## 🔧 Cloudflare Worker

```bash
cd cloudflare-worker
npx wrangler deploy
```

## 📡 API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/:slug` | Redirección inteligente |
| POST | `/api/links` | Crear influencer |
| GET | `/api/links` | Listar influencers |
| POST | `/api/admin/login` | Autenticación |

## 🛡️ Seguridad

- Rate limiting por IP
- JA3 fingerprinting
- Honeypots invisibles
- JWT authentication
- Clustering multi-core
