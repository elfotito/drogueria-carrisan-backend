const API = 'https://drogueria-carrisan-backend.onrender.com';
const r = await fetch(API + '/staff/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'qa.vendedor@carrisan.test', password: 'QA.Vendedor.2026' }) });
const { token } = await r.json();
const p = await fetch(API + '/staff/precios/38147', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ precio_usd: 8.65 }) });
console.log(p.status, await p.text());
