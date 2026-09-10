// Deteccion de bots por User-Agent compartida por la ruta del slug
// (server.js), la ruta de diagnostico (/test-bot) y el middleware de
// blacklist (security.js): todos los componentes deben clasificar igual.
//
// El UA se pasa a minusculas y se compara por substring contra la lista,
// lo que equivale a una regex insensible a mayusculas. Incluye:
//   - Tokens genericos ('bot', 'spider', 'crawl'...) que cubren a la vez
//     los crawlers clasicos y los de IA (GPTBot, ClaudeBot, CCBot,
//     PerplexityBot, Bytespider, Amazonbot...).
//   - Crawlers cuyo nombre no contiene ningun token generico
//     (meta-externalagent, facebookexternalhit, whatsapp, openai...).
//   - Clientes HTTP y herramientas de scraping que no se anuncian como bots.
//
// Ningun navegador humano contiene estos terminos en su UA (verificado
// contra Chrome/Safari/Firefox moviles y el webview de Instagram, cuyo UA
// es "...Instagram 2xx... Mobile Safari").
export const botUserAgents = [
  // Tokens genericos
  'bot', 'spider', 'crawler', 'crawl', 'slurp', 'headless', 'scrapy',
  // Meta / redes sociales / previews (nombres sin token generico)
  'facebookexternalhit', 'facebot', 'meta-externalagent', 'meta-externalhit',
  'whatsapp', 'telegrambot', 'embedly', 'quora link preview', 'reddit',
  // Rastreadores de IA y SEO (nombres sin token generico)
  'openai', 'chatgpt', 'claude', 'anthropic', 'perplexity', 'cohere-ai',
  'semrush', 'ahrefs', 'mj12', 'majestic',
  // Clientes HTTP / herramientas
  'curl', 'wget', 'python-requests', 'python-urllib', 'go-http-client',
  'okhttp', 'java/', 'libwww-perl', 'httpclient', 'axios', 'postman',
  'insomnia', 'httrack', 'node-fetch'
];

export function isBot(userAgent) {
  // Sin User-Agent no hay navegador detras: los navegadores reales siempre
  // envian uno, y muchos scrapers lo omiten. Se tratan como bots.
  if (!userAgent) return true;
  const ua = userAgent.toLowerCase();
  return botUserAgents.some((bot) => ua.includes(bot));
}
