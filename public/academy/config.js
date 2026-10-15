/* Public browser settings. Never put passwords, private tokens, payment secrets or AI keys here. */
window.HT_CONFIG = Object.assign({
  siteName: 'Hua Tuo Medical & Biomedical Academy',
  siteNameZh: '華佗醫藥生醫學院',
  // 'auto' lets the page detect file:// or a static host (GitHub Pages) and switch to the browser-local
  // profile mode; 'server' forces the Python backend API; 'static' forces offline mode.
  siteMode: 'static',
  apiBase: '',
  // Pricing: base plan prices in TWD. Converted client-side using live rates from /api/billing/rates
  // (server) or the bundled fallback table (static). Currency is chosen from the browser language's
  // region subtag or time zone (never GPS), and can be changed by the learner.
  pricing: { baseCurrency: 'TWD', monthlyTwd: 299, yearlyTwd: 2490, ratesUpdated: '2026-10-12', rates: {
    TWD: 1, USD: 0.03129, EUR: 0.027984, GBP: 0.02366, JPY: 4.962885, KRW: 41.750206, CNY: 0.2098, HKD: 0.245723, MOP: 0.253077, SGD: 0.0401, MYR: 0.127983, THB: 1.052449, VND: 810.794342, IDR: 560.518526, PHP: 1.96525, INR: 3.000829, AUD: 0.044948, NZD: 0.055955, CAD: 0.044661, MXN: 0.572799, BRL: 0.156178, ARS: 47.429634, CLP: 30.605636, COP: 100.174289, PEN: 0.107575, CHF: 0.026081, SEK: 0.313408, NOK: 0.299615, DKK: 0.209179, PLN: 0.122757, CZK: 0.682434, HUF: 10.230779, RON: 0.149407, TRY: 1.544998, RUB: 2.632537, UAH: 1.408971, AED: 0.114907, SAR: 0.117332, QAR: 0.11389, ILS: 0.096251, EGP: 1.64866, ZAR: 0.517978, NGN: 42.003789, KES: 4.062955, PKR: 8.670792, BDT: 3.85752, LKR: 10.362657, NPR: 4.80165, KZT: 14.133103, MNT: 112.83559, KHR: 127.00562, LAK: 695.961364, MMK: 65.73374, BGN: 0.054809, RSD: 3.286048, ISK: 3.822242, GEL: 0.081198, AMD: 11.339698, AZN: 0.053243, UZS: 371.168598, MAD: 0.304262, TND: 0.094038, GHS: 0.368696, ETB: 5.06039, TZS: 82.628892, UGX: 128.98468 } },
  // Manual transfer instructions shown on the membership page (post office account of the operator).
  // The operator confirms each transfer with portable/commerce_admin.py before access is granted.
  transfer: { bankName: '', bankCode: '', branchNo: '', accountNo: '', accountName: '', note: '請先由站長設定並核對收款資訊；未設定時請勿轉帳。' },
  // Optional external resources opened only when the learner clicks them.
  links: { ziziTcm: 'https://www.youtube.com/results?search_query=%E5%AD%90%E5%AD%90%E4%B8%AD%E9%86%AB', smartAction: 'https://kuonanhong.github.io/SmartAction/', actionIntelligent: 'https://kuonanhong.github.io/ActionIntelligent-AI-/' },
  // Optional Iconify online layer (department-level accents only). Off by default: all icons are original offline SVG.
  iconifyOnline: false,
}, window.HT_CONFIG || {});
