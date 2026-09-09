#!/bin/bash

RAILWAY_URL="https://tu-app.up.railway.app"
DASHBOARD_URL="https://railway.app/dashboard"
LOCAL_ADMIN="http://localhost:5173"

echo "🌐 Abriendo Chrome..."

if [[ "$OSTYPE" == "darwin"* ]]; then
    open -a "Google Chrome" "$DASHBOARD_URL"
    sleep 1
    open -a "Google Chrome" "$RAILWAY_URL/health"
    sleep 1
    open -a "Google Chrome" "$LOCAL_ADMIN"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    google-chrome "$DASHBOARD_URL" &
    sleep 1
    google-chrome "$RAILWAY_URL/health" &
    sleep 1
    google-chrome "$LOCAL_ADMIN" &
elif [[ "$OSTYPE" == "msys" ]]; then
    start chrome "$DASHBOARD_URL"
    sleep 1
    start chrome "$RAILWAY_URL/health"
    sleep 1
    start chrome "$LOCAL_ADMIN"
fi

echo "✅ Chrome abierto"
