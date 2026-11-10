/* Wearday web account: email sign-in, Noha Money wallet and history, Premium with Noha Money, UPI top-ups. */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';

// Public client settings (safe to publish; the database protects every row by account).
const SUPABASE_URL = 'https://fkhxgkscnkxtwnvecoyv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kJghZQlNmpuy-NAGfUm4Dg_EHybViX9';
// Same sign-in as asanoha.co.in: one Asanoha account, kept in cookies on .asanoha.co.in so both sites share it.
function sharedStorage() {
  if (!/(^|\.)asanoha\.co\.in$/.test(location.hostname)) return undefined;
  const CHUNK = 3500, YEAR = 31536000;
  const read = (n) => { const m = document.cookie.match('(?:^|; )' + n.replace(/\./g, '\\.') + '=([^;]*)'); return m ? m[1] : null; };
  const write = (n, v, age) => { document.cookie = n + '=' + v + '; Domain=.asanoha.co.in; Path=/; Max-Age=' + age + '; SameSite=Lax; Secure'; };
  return {
    getItem(k) {
      const n = Number(read(k + '.n') || 0); if (!n) return null;
      let s = ''; for (let i = 0; i < n; i++) { const p = read(k + '.' + i); if (p == null) return null; s += p; }
      try { return decodeURIComponent(s); } catch (e) { return null; }
    },
    setItem(k, v) {
      const enc = encodeURIComponent(v), old = Number(read(k + '.n') || 0), parts = [];
      for (let i = 0; i < enc.length; i += CHUNK) parts.push(enc.slice(i, i + CHUNK));
      parts.forEach((p, i) => write(k + '.' + i, p, YEAR));
      write(k + '.n', String(parts.length), YEAR);
      for (let i = parts.length; i < old; i++) write(k + '.' + i, '', 0);
    },
    removeItem(k) {
      const old = Number(read(k + '.n') || 0);
      for (let i = 0; i < old; i++) write(k + '.' + i, '', 0);
      write(k + '.n', '', 0);
    },
  };
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: 'pkce', persistSession: true, storageKey: 'asanoha-auth', storage: sharedStorage(), detectSessionInUrl: true },
});

const $ = (id) => document.getElementById(id);
const inr = (p) => '₹' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const APP = { asanoha: 'Asanoha', wearday: 'Wearday' };
let email = '';

function show(signedIn) {
  $('signed-in').hidden = !signedIn;
  $('signed-out').hidden = signedIn;
  $('acc-title').textContent = signedIn ? 'your account.' : 'sign in.';
  $('acc-sub').hidden = signedIn;
}

$('email-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  email = $('email').value.trim();
  $('auth-msg').textContent = 'Sending…';
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/account.html' } });
  if (error) return ($('auth-msg').textContent = /rate|many/i.test(error.message) ? 'Too many tries. Wait a minute and try again.' : error.message);
  $('auth-msg').textContent = '';
  $('code-hint').innerHTML = 'We emailed <b>' + esc(email) + '</b>. Type the 6-digit code, or tap the button in the email.';
  $('email-form').hidden = true;
  $('code-form').hidden = false;
  $('code').focus();
});
$('code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('auth-msg').textContent = 'Checking…';
  const { error } = await sb.auth.verifyOtp({ email, token: $('code').value.trim(), type: 'email' });
  $('auth-msg').textContent = error ? 'That code is wrong or has expired. Request a new one.' : '';
});
$('restart').addEventListener('click', () => { $('email-form').hidden = false; $('code-form').hidden = true; $('auth-msg').textContent = ''; });
$('signout').addEventListener('click', () => sb.auth.signOut());
$('google').addEventListener('click', async () => {
  $('auth-msg').textContent = '';
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/account.html', queryParams: { prompt: 'select_account' } } });
  if (error) $('auth-msg').textContent = /not enabled|provider/i.test(error.message) ? 'Google sign-in opens soon. Use your email for now.' : error.message;
});

let amount = 250;
$('amounts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-amt]');
  if (!b) return;
  amount = Number(b.dataset.amt);
  document.querySelectorAll('#amounts .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
  $('topup').textContent = 'Add ' + inr(amount * 100) + ' by UPI';
});
$('topup').addEventListener('click', async () => {
  $('topup').disabled = true;
  $('topup-msg').textContent = 'Opening the payment page…';
  try {
    const { data, error } = await sb.functions.invoke('noha-pay/topup', { body: { amount, app: 'wearday', returnUrl: location.origin + '/account.html?paid=1' } });
    if (error) {
      const body = await error.context?.json?.().catch(() => null);
      throw new Error(body?.error || 'Adding money isn’t available yet. It opens soon.');
    }
    location.href = data.checkoutUrl;
  } catch (e) {
    $('topup-msg').textContent = e.message;
  } finally {
    $('topup').disabled = false;
  }
});

async function load(session) {
  $('who').textContent = session.user.email ? 'Signed in as ' + session.user.email : '';
  const [bal, tx, prem, prods] = await Promise.all([
    sb.rpc('noha_balance'),
    sb.from('noha_transactions').select('app,type,amount_paise,description,created_at').order('created_at', { ascending: false }).limit(30),
    sb.rpc('my_premium'),
    sb.from('noha_products').select('id,name,price_paise,max_bonus_pct').eq('app', 'wearday').order('price_paise'),
  ]);
  // Before the wallet is set up on the server, show a calm placeholder instead of errors.
  const ready = !bal.error && !tx.error;
  for (const id of ['buy', 'topup', 'amounts']) $(id).hidden = !ready;
  if (!ready) {
    $('balance').textContent = '₹0';
    $('balance-note').textContent = 'Noha Money opens soon. Your balance and cashback will show here.';
    $('history').innerHTML = '<p class="muted">No activity yet.</p>';
    $('premium-status').textContent = 'Unlimited AI fits, full sync, advanced stats, unlimited trips. Get it in the Wearday app.';
    $('topup-msg').textContent = 'Adding money opens with Noha Money.';
    return;
  }
  const b = bal.data?.[0] ?? { total_paise: 0, bonus_paise: 0, cash_paise: 0, next_expiry: null };
  $('balance').textContent = inr(b.total_paise);
  $('balance-note').textContent = (b.bonus_paise ? inr(b.bonus_paise) + ' cashback · ' + inr(b.cash_paise) + ' added' : 'Cashback and money you add show up here.') +
    (b.next_expiry ? ' · next expiry ' + new Date(b.next_expiry).toLocaleDateString('en-IN') : '');

  const rows = tx.data ?? [];
  $('history').innerHTML = rows.length
    ? rows.map((t) => '<div class="txn"><span>' + esc(t.description) + '<br><span class="muted" style="font-size:14px">' + (APP[t.app] || esc(t.app)) + ' · ' +
        new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + '</span></span><b style="color:' +
        (t.amount_paise > 0 ? 'var(--accent)' : 'var(--text)') + '">' + (t.amount_paise > 0 ? '+' : '−') + inr(Math.abs(t.amount_paise)) + '</b></div>').join('')
    : '<p class="muted">No activity yet. Cashback from Asanoha orders and Premium purchases will show here.</p>';

  const until = prem.data?.noha_until;
  $('premium-status').textContent = prem.data?.premium
    ? 'You’re Premium' + (until ? ' until ' + new Date(until).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '') + '. Buying more adds time.'
    : 'Unlimited AI fits, full sync, advanced stats, unlimited trips.';
  $('buy').innerHTML = '';
  (prods.data ?? []).forEach((p) => {
    const btn = document.createElement('button');
    btn.className = 'btn' + (p.id.endsWith('yearly') ? '' : ' ghost');
    btn.textContent = p.name.replace('Wearday Premium · ', '') + ' · ' + inr(p.price_paise);
    btn.addEventListener('click', () => buy(p, btn));
    $('buy').appendChild(btn);
  });
}

async function buy(p, btn) {
  if (!confirm('Pay ' + inr(p.price_paise) + ' from Noha Money for ' + p.name + '?')) return;
  btn.disabled = true;
  const key = crypto.randomUUID();
  const { error } = await sb.rpc('noha_buy', { p_product_id: p.id, p_idempotency_key: key });
  btn.disabled = false;
  if (error) return alert(/not enough/i.test(error.message) ? 'Not enough Noha Money for this plan. Add money below.' : error.message);
  const { data } = await sb.auth.getSession();
  if (data.session) load(data.session);
}

sb.auth.onAuthStateChange((_event, session) => {
  show(!!session);
  if (session) setTimeout(() => load(session).catch((e) => console.error(e)), 0);
  // Back from Google sign-in: drop the one-time code from the address bar.
  if (session && /[?&]code=/.test(location.search)) history.replaceState(null, '', location.pathname);
});
if (new URLSearchParams(location.search).get('paid')) $('topup-msg').textContent = 'Thanks! Your money appears here as soon as the payment is confirmed (usually under a minute).';
