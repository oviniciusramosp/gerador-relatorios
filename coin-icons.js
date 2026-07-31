/* Ícones de tokens — mesma base do mexc-bot (cryptocurrency-icons + extras HD).
 * Arquivos estáticos em coin-icons/{symbol}.svg. Catálogo gerado; não editar a
 * lista à mão — re-gerar ao copiar novos SVGs.
 *
 * Export do Stories usa foreignObject: o renderer carrega o SVG e injeta inline
 * (URL externo quebra no raster).
 */
export const COIN_ICON_DIR = 'coin-icons';
export const DEFAULT_COIN_SYMBOL = 'btc';

/** Símbolos disponíveis (lowercase, filename sem .svg). */
export const COIN_SYMBOLS = Object.freeze(["$pac","0xbtc","1000rats","1000sats","1000xec","1inch","2give","aapl","aave","abt","ace","act","actn","ada","add","adx","ae","aeon","aeur","agi","agrs","aion","akt","algo","amat","amb","amd","amp","ampl","ankr","ant","ape","apex","appc","apt","arb","ardr","arg","ark","arn","ary","asml","ast","atlas","atm","atom","auction","audr","aury","auto","ava","avax","avgo","aywa","ba","bab","baba","bac","bal","band","bat","bay","bcbc","bcc","bcd","bch","bcio","bcn","bco","bcpt","bdl","bela","bix","blcn","blk","block","bluai","blz","bnb","bnt","bnty","booty","bos","bpt","bq","brd","bsd","btc","btcd","btch","btcp","btcz","btdx","btg","btm","bts","btt","btx","burst","bze","call","cat","cc","cdn","cdt","cenz","cfx","chain","chat","chips","chsb","chz","cix","clam","cloak","cmm","cmt","cnd","cnx","cny","cob","coin","colx","comp","coqui","cred","crpt","crw","cs","csco","ctr","ctxc","cvc","dai","dash","dat","data","dbc","dcn","dcr","deez","dent","dew","dgb","dgd","dlt","dnt","dock","doge","dot","drgn","drop","dta","dth","dtr","dydx","ebst","eca","edg","edo","edoge","ela","elec","elf","elix","ella","emb","emc","emc2","ena","eng","enj","ens","entrp","eon","eop","eos","eqli","equa","etc","eth","ethos","etn","etp","eur","evx","exmo","exp","fair","fartcoin","fida","fil","fjc","flo","flux","fsn","ftc","fuel","fun","futu","game","gas","gbp","gbx","gbyte","generic","gin","glxt","gmt","gno","gnt","gold","grass","grc","griffain","grin","grs","grt","gsc","gto","gup","gusd","gvt","gwei","gxs","gzr","hbar","hight","hns","hodl","hood","hot","hpb","hsr","ht","html","huc","husd","hush","ibm","icn","icp","icx","ignis","ilk","inj","ink","ion","iop","iost","iotx","iq","itc","jnj","jnt","jpy","jto","jup","kaito","kava","kcs","kin","kmd","knc","krb","ksm","lbc","ldo","lend","leo","link","lkk","loom","lpt","lrc","lrcx","lsk","ltc","lun","maid","mana","manta","matic","max","mcap","mco","mda","mds","med","meetone","mft","miota","mith","mkr","mln","mnx","mnz","moac","mod","mona","msft","msr","mstr","mth","mtl","mu","music","mzc","nano","nas","nav","ndz","near","nebl","neo","neos","neu","nexo","ngas","ngc","nio","nkn","nlc2","nlg","nmc","npxs","ntbc","nuls","nxs","nxt","oax","ok","okb","omg","omni","ondo","one","ong","ont","oot","op","orcl","ordi","ost","ox","oxt","oxy","part","pasc","pasl","pax","paxg","pay","payx","pendle","pepe","pink","pirl","pivx","plr","poa","poe","polis","poly","pot","powr","ppc","ppp","ppt","pre","prl","pungo","pura","pyth","qash","qcom","qiwi","qlc","qnt","qrl","qsp","qtum","r","rads","rap","ray","raydium","rcn","rdd","rddt","rdn","ren","rep","repv2","req","rhoc","ric","rif","rise","rlc","rpx","rub","rvn","ryo","safe","safemoon","sai","salt","san","sand","sbd","sberbank","sc","ser","shib","shift","sib","silver","sin","skl","sky","slr","sls","smart","sndk","sngls","snm","snt","snx","soc","sol","soxx","spacehbit","spank","sphtx","stak","start","steem","storj","storm","stox","stq","strat","strk","stx","sub","sui","sumo","sushi","sys","ta","taas","tau","tbx","tel","ten","tern","tgch","theta","tix","tkn","tks","tnb","tnc","tnt","tomo","tpay","trig","trtl","trx","tsla","tusd","tzc","ubq","uma","uni","unity","usd","usdc","usdt","usoil","usual","utk","velo","veri","vet","via","vib","vibe","vivo","vrc","vrsc","vtc","vtho","wabi","wan","waves","wax","wbtc","wgr","wicc","wings","wlfi","wmt","wpr","wtc","x","xas","xbc","xbp","xby","xcp","xdn","xem","xin","xlm","xmcc","xmg","xmo","xmr","xmy","xom","xp","xpa","xpm","xpr","xrp","xsg","xtz","xuc","xvc","xvg","xzc","yfi","yoyow","zcl","zec","zel","zest","zig","zil","zilla","zrx"]);

/** Ordem do picker (topo = mais usados). Demais: ordem alfabética no final. */
export const COIN_POPULAR = Object.freeze(["btc","eth","sol","bnb","xrp","ada","doge","avax","link","matic","atom","near","apt","arb","op","sui","trx","uni","aave","pepe","shib","ltc","bch","xlm","usdt","usdc","dot","fil","icp","hbar","inj","algo","jup","ondo","ena","pyth","mkr","ldo","snx","comp","wbtc","dai","xmr","etc","sand","mana","ape","1inch","sushi"]);

/** Nomes legíveis (opcional). Fallback = SYMBOL em maiúsculas. */
export const COIN_LABELS = Object.freeze({
  "btc": "Bitcoin",
  "eth": "Ethereum",
  "sol": "Solana",
  "bnb": "BNB",
  "xrp": "XRP",
  "ada": "Cardano",
  "doge": "Dogecoin",
  "avax": "Avalanche",
  "link": "Chainlink",
  "matic": "Polygon (MATIC)",
  "atom": "Cosmos",
  "near": "NEAR",
  "apt": "Aptos",
  "arb": "Arbitrum",
  "op": "Optimism",
  "sui": "Sui",
  "trx": "TRON",
  "uni": "Uniswap",
  "aave": "Aave",
  "pepe": "PEPE",
  "shib": "Shiba Inu",
  "ltc": "Litecoin",
  "bch": "Bitcoin Cash",
  "xlm": "Stellar",
  "etc": "Ethereum Classic",
  "fil": "Filecoin",
  "icp": "Internet Computer",
  "hbar": "Hedera",
  "usdt": "Tether",
  "usdc": "USD Coin",
  "dot": "Polkadot",
  "xmr": "Monero",
  "zec": "Zcash",
  "dash": "Dash",
  "mkr": "Maker",
  "crv": "Curve",
  "ldo": "Lido",
  "inj": "Injective",
  "algo": "Algorand",
  "sand": "The Sandbox",
  "mana": "Decentraland",
  "ape": "ApeCoin",
  "comp": "Compound",
  "snx": "Synthetix",
  "yfi": "yearn.finance",
  "1inch": "1inch",
  "sushi": "SushiSwap",
  "jup": "Jupiter",
  "ondo": "Ondo",
  "ena": "Ethena",
  "pyth": "Pyth",
  "weth": "Wrapped Ether",
  "wbtc": "Wrapped Bitcoin",
  "dai": "Dai"
});

const KNOWN = new Set(COIN_SYMBOLS);

export function normalizeCoinSymbol(s) {
  const t = String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return t;
}

export function isKnownCoinSymbol(s) {
  return KNOWN.has(normalizeCoinSymbol(s));
}

/** Símbolo seguro p/ disco/render — desconhecido cai no default se forceKnown. */
export function clampCoinSymbol(s, { forceKnown = true } = {}) {
  const n = normalizeCoinSymbol(s);
  if (!n) return DEFAULT_COIN_SYMBOL;
  if (!forceKnown) return n;
  return KNOWN.has(n) ? n : DEFAULT_COIN_SYMBOL;
}

export function coinIconPath(symbol) {
  const s = clampCoinSymbol(symbol);
  return `${COIN_ICON_DIR}/${s}.svg`;
}

export function coinLabel(symbol) {
  const s = normalizeCoinSymbol(symbol);
  if (!s) return '';
  return COIN_LABELS[s] || s.toUpperCase();
}

/** Lista p/ picker: populares primeiro, depois o resto A–Z (sem duplicar). */
export function listCoinIcons() {
  const seen = new Set();
  const out = [];
  for (const s of COIN_POPULAR) {
    if (!KNOWN.has(s) || seen.has(s)) continue;
    seen.add(s);
    out.push({ symbol: s, label: coinLabel(s) });
  }
  for (const s of COIN_SYMBOLS) {
    if (seen.has(s)) continue;
    seen.add(s);
    out.push({ symbol: s, label: coinLabel(s) });
  }
  return out;
}

/** Filtro simples por symbol/label (case-insensitive). */
export function filterCoinIcons(query) {
  const q = String(query ?? '').trim().toLowerCase();
  const all = listCoinIcons();
  if (!q) return all;
  return all.filter((c) => c.symbol.includes(q) || c.label.toLowerCase().includes(q));
}
