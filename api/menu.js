const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const products = [
  {name:'Carne',price:1000,photo:'0% 0%'},
  {name:'Frango',price:800,photo:'50% 0%'},
  {name:'Panceta',price:1200,photo:'100% 0%'},
  {name:'Linguiça',price:800,photo:'0% 100%'},
  {name:'Tulipa',price:1100,photo:'50% 100%'},
  {name:'Medalhão',price:1300,photo:'100% 100%'}
];
const money = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });
const brl = cents => money.format(cents / 100);

module.exports = function menu(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');

  const deadline = Date.parse(process.env.BRASA_ACCESS_DEADLINE ?? '');
  const released = process.env.BRASA_ACCESS_RELEASED === 'true';
  if (!released && (!Number.isFinite(deadline) || Date.now() >= deadline)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brasa da Vila</title><body style="background:#15110e;color:#fff0df;font:18px system-ui;padding:2rem"><h1>Cardápio temporariamente indisponível</h1><p>Volte mais tarde para consultar o cardápio da Brasa da Vila.</p></body></html>');
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.method === 'HEAD') return res.end();
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    return res.end(html.replace('/*__CATALOG__*/[]', JSON.stringify(products)));
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD, POST');
    return res.end();
  }

  const phone = process.env.BRASA_ORDER_PHONE ?? '';
  if (!/^55\d{10,11}$/.test(phone)) {
    res.statusCode = 503;
    return res.end('WhatsApp da loja temporariamente indisponível.');
  }

  const body = typeof req.body === 'string'
    ? Object.fromEntries(new URLSearchParams(req.body))
    : req.body ?? {};
  const clean = (value, max) => typeof value === 'string' ? value.trim().replace(/[\r\n]+/g, ' ').slice(0, max) : '';
  const name = clean(body.name, 70);
  const method = clean(body.method, 10);
  const address = clean(body.address, 200);
  const payment = clean(body.payment, 20);
  const notes = clean(body.notes, 200);
  const counts = products.map((_, index) => {
    const value = String(body['q' + index] ?? '0');
    return /^\d{1,2}$/.test(value) ? Number(value) : 0;
  });
  const total = products.reduce((sum, item, index) => sum + item.price * counts[index], 0);
  if (!name || !total || !['Retirada', 'Entrega'].includes(method)
      || (method === 'Entrega' && !address) || !['Pix','Cartão','Dinheiro'].includes(payment)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Revise os itens e os dados do pedido e tente novamente.');
  }

  const items = products.flatMap((item, index) => counts[index]
    ? [counts[index] + '× ' + item.name + ' · ' + brl(item.price * counts[index])] : []);
  const message = [
    '🔥 *Brasa da Vila | Pedido de demonstração*', '', ...items, '',
    '*Subtotal dos itens: ' + brl(total) + '*',
    'Cliente: ' + name, 'Modalidade: ' + method,
    ...(method === 'Entrega' ? ['Endereço: ' + address, 'Taxa de entrega a confirmar.'] : []),
    'Pagamento: ' + payment,
    ...(notes ? ['Observações: ' + notes] : []),
    '', 'Valores ilustrativos. Confirme o pedido com a loja.'
  ].join('\n');

  res.statusCode = 303;
  res.setHeader('Location', 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message));
  return res.end();
};
