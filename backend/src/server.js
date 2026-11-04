import HyperExpress from 'hyper-express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import fs from 'fs';

// Railway termina el TLS/HTTP delante de la app: el IP del socket siempre es
// un proxy interno (100.64.0.x) y cambia entre peticiones. Sin trust_proxy,
// request.ip rompe la validacion de tokens, comparte buckets de rate-limit
// entre usuarios distintos, banea a cualquiera tras un proxy en el honeypot
// y ensucia el AccessLog. Con el, se usa el IP real del visitante que
// Railway informa en X-Forwarded-For (verificado en la fuente de
// hyper-express 6.14.12: usa la primera entrada del header).
const app = new HyperExpress.Server({ trust_proxy: true });

/**
 * El age gate, leido una sola vez al arrancar.
 *
 * Antes se copiaba de public/ a dist/ con un script aparte que no estaba en
 * el repositorio, asi que el contenedor arrancaba y moria al no encontrarlo.
 * Leerlo aqui quita esa pieza: si el fichero falta, el fallo sale una vez al
 * arrancar y se ve, en vez de en cada visita.
 */
const AGE_GATE = fs.readFileSync(new URL('../public/age-gate.html', import.meta.url), 'utf8');
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Bot detection desactivado temporalmente - solo queda JWT auth para admin

// === AGE GATE ROUTES ===

// Servir el age-gate suelto (por si se enlaza directo)
app.get('/age-gate.html', (request, response) => {
  response.header('Content-Type', 'text/html; charset=utf-8').send(AGE_GATE);
});

// Get destination para age-gate - devuelve el link original
app.get('/api/get-destination', async (request, response) => {
  const slug = request.query.slug;
  if (!slug) {
    return response.status(400).json({ error: 'Missing slug' });
  }

  const variant = await prisma.linkVariant.findUnique({
    where: { slug },
    include: { influencer: true }
  });

  if (!variant) {
    // Si no existe en la DB, no hacer redirect - dejar que la página maneje el caso
    return response.json({ destination: null });
  }

  // Enviar al destino real del influencer
  const destination = variant.influencer.urlDestino;
  response.json({ destination });
});

/**
 * El recorrido de un enlace, en dos pasos.
 *
 *   1. /{slug}         age gate. La MISMA pagina para todo el mundo.
 *   2. /{slug}?go=1    paso intermedio de ~1 s y salto al destino.
 *
 * Entre los dos pasos el age gate intenta salir del navegador interno de
 * Instagram al navegador del telefono. Eso se hace mirando el sistema
 * operativo (Android o iOS) para elegir el formato de enlace que cada uno
 * entiende, y nada mas: aqui NO se decide que se le ensena a quien. Quien
 * abra esta direccion recibe exactamente lo mismo, sea quien sea.
 *
 * El contador de clicks sube en el paso 2, no en el 1. Una precarga —la que
 * hacen las apps al compartir un enlace— se queda en el age gate y nunca
 * pulsa el boton, asi que ya no infla los numeros del panel.
 */
function paginaDeSalto(destino) {
  const dest = JSON.stringify(destino).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Un momento…</title>
<style>
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;
       background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);
       color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  .c{text-align:center}
  .p{width:34px;height:34px;margin:0 auto 14px;border:3px solid rgba(255,255,255,.25);
     border-top-color:#e94560;border-radius:50%;animation:g .8s linear infinite}
  @keyframes g{to{transform:rotate(360deg)}}
  p{font-size:15px;opacity:.8;margin:0}
  a{color:#e94560}
</style>
</head>
<body>
  <div class="c">
    <div class="p"></div>
    <p>Te estamos llevando…</p>
    <noscript><p><a href="${destino}">Continuar</a></p></noscript>
  </div>
<script>
  var destino = ${dest};
  setTimeout(function () { window.location.replace(destino); }, 1000);
</script>
</body>
</html>`;
}

app.get('/:slug', async (request, response) => {
  const slug = request.params.slug;
  if (!slug) return response.status(400).json({ error: 'Missing slug' });

  const variant = await prisma.linkVariant.findUnique({
    where: { slug },
    include: { influencer: true }
  });

  // Apagado o archivado desde el panel = no redirige. Antes solo se miraba
  // que el slug existiera, asi que un enlace retirado seguia funcionando.
  if (!variant || !variant.isActive || variant.archivedAt) {
    return response.status(404).send('Link no encontrado');
  }

  const destino = variant.influencer.urlDestino;
  if (!destino || !destino.startsWith('http')) {
    return response.status(400).json({ error: 'Invalid destination URL' });
  }

  // Paso 2: ya ha confirmado la edad y viene del navegador del telefono.
  if (request.query.go) {
    prisma.linkVariant
      .update({ where: { id: variant.id }, data: { clickCount: { increment: 1 } } })
      .catch((e) => console.error(`clickCount ${slug}: ${e.message}`));

    return response
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Cache-Control', 'no-store')
      .send(paginaDeSalto(destino));
  }

  // Paso 1: age gate.
  return response
    .header('Content-Type', 'text/html; charset=utf-8')
    .header('Cache-Control', 'no-store')
    .send(AGE_GATE);
});

// Si Redis cae, ioredis reintenta la conexion en bucle: sin listener, cada
// intento imprime el error sin control. Con el queda una linea por intento y
// el servidor sigue sirviendo enlaces.
redis.on('error', (error) => console.error(`Redis: ${error.message}`));

app.get('/health', (request, response) => {
  response.json({ status: 'ok', timestamp: new Date().toISOString(), botDetection: 'OFF' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT)
  .then(() => console.log(`✓ Servidor en puerto ${PORT} | Bot detection: OFF | Age gate: ON | JWT: ON`))
  .catch((error) => console.error('Error:', error));
