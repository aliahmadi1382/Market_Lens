export type SearchPlan = {
  product: string;
  normalizedProduct: string;
  requestedYears: number[];
  years: number[];
  requestedMin: number | null;
  requestedMax: number | null;
  minYear: number | null;
  maxYear: number | null;
  searchTerms: string[];
  key: string;
};
export function canonicalText(value: string) {
  return value.toLowerCase().replace(/\bchevy\b/g, 'chevrolet')
    .replace(/\bf[\s-]+(?=\d)/g, 'f').replace(/\bmercedes[ -]+benz\b/g, 'mercedes benz')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
// Discovery aliases identify a family, not interchangeable parts. Fitment remains
// attached to the observed listing and is kept separate in price comparisons.
const C_CLASS_CODES = ['c250','c300','c350','c350e','c400','c43','c63'];
function matchText(value:string) {
  return canonicalText(value).replace(/\bc\s+class\b|\bcclass\b/g,'c class')
    .replace(/\b([cweas]|glc|glk)\s+(\d{2,3}e?)\b/g,'$1$2');
}
function cClassQuery(value:string) { return /\bc class\b/.test(matchText(value)); }
const BRANDS = /\b(?:mercedes benz|mercedes|chevrolet|toyota|cadillac|ford|gmc|dodge|ram|honda|jeep|nissan|lexus|acura|kia|hyundai|bmw|audi|volkswagen|volvo|mazda|subaru|lincoln|buick|pontiac)\b/g;
export function discoveryTerms(input:string|SearchPlan,kind:'catalog'|'shopify'|'ebay'='catalog'):string[] {
  const plan=typeof input==='string'?planSearch(input):input;
  if(cClassQuery(plan.normalizedProduct)) {
    if(kind==='shopify')return ['Mercedes']; // Full, paginated brand search; strict local model matching.
    if(kind==='ebay')return ['Mercedes C Class','Mercedes C300','Mercedes C250','Mercedes C350','Mercedes C400','Mercedes C43','Mercedes C63','Mercedes W205','Mercedes C205'];
    return ['C300','C Class','C250','C350','C400','C43','C63','W205','C205','A205'];
  }
  const model=plan.normalizedProduct.replace(BRANDS,' ').replace(/\s+/g,' ').trim();
  if(kind==='ebay')return [plan.product];
  return [...new Set([model||plan.normalizedProduct,plan.normalizedProduct])];
}
export function matchesProduct(title:string,input:string|SearchPlan) {
  const plan=typeof input==='string'?planSearch(input):input;
  const text=matchText(title),haystack=` ${text} `;
  let tokens=matchText(plan.normalizedProduct).split(' ');
  if(tokens.includes('mercedes')) tokens=tokens.filter(t=>t!=='benz');
  if(cClassQuery(plan.normalizedProduct)) {
    const explicit=/\bc class\b/.test(text);
    // Some sellers put C300 inside a GLC-Class title; don't misclassify that SUV.
    if(!explicit&&/\b(?:glc|glk|gla|gle|gls|slk|slc)(?:\d{2,3})?\b|\b[esa] class\b/.test(text))return false;
    if(!explicit&&!C_CLASS_CODES.some(c=>haystack.includes(` ${c} `))&&!/\b[wcsa]205\b/.test(text))return false;
    tokens=tokens.filter(t=>t!=='c'&&t!=='class');
  }
  return tokens.every(token=>haystack.includes(` ${token} `));
}
export function observedCClassModel(value:string):string|null {
  const t=matchText(value);
  if(!matchesProduct(value,'Mercedes C-Class'))return null;
  const codes=C_CLASS_CODES.filter(c=>` ${t} `.includes(` ${c} `));
  const chassis=[...t.matchAll(/\b[wcsa]205\b/g)].map(m=>m[0]);
  const body=/\b(coupe|coupé|cabriolet|convertible|sedan|saloon|estate|wagon)\b/i.exec(value)?.[1].toLowerCase();
  return `mercedes c-class · ${codes.join('/')||'submodel unspecified'} · ${[...new Set(chassis)].join('/')||'chassis unspecified'} · ${body||'body unspecified'}`;
}
export function yearValues(value: string): number[] {
  const years = new Set<number>();
  const expanded = value.replace(/\b((?:19|20|21)\d{2})\s*[-–—]\s*(\d{2})\b/g,
    (_, first, last) => `${first}-${first.slice(0, 2)}${last}`);
  for (const m of expanded.matchAll(/\b((?:19|20|21)\d{2})\s*(?:-|–|—|to|through)\s*((?:19|20|21)\d{2})\b/gi)) {
    const a = Number(m[1]), b = Number(m[2]);
    if (b >= a && b - a <= 150) for (let y = a; y <= b; y++) years.add(y);
  }
  for (const m of expanded.matchAll(/\b(?:19|20|21)\d{2}\b/g)) years.add(Number(m[0]));
  return [...years].sort((a,b) => a-b);
}
export function planSearch(input: string): SearchPlan {
  const query = input.trim();
  if (query.length < 3 || query.length > 160) throw new Error('Enter a product name and optional year range (3–160 characters).');
  const expanded = query.replace(/\b((?:19|20|21)\d{2})\s*[-–—]\s*(\d{2})\b/g, (_, a, b) => `${a}-${a.slice(0,2)}${b}`);
  for (const m of expanded.matchAll(/\b((?:19|20|21)\d{2})\s*(?:-|–|—|to|through)\s*((?:19|20|21)\d{2})\b/gi)) {
    if (Number(m[2]) < Number(m[1])) throw new Error('The ending year must be at least the starting year.');
  }
  const found = yearValues(expanded);
  const requestedMin = found[0] ?? null, requestedMax = found.at(-1) ?? null;
  if (requestedMin !== null && requestedMax! - requestedMin > 100) throw new Error('Use a year range of no more than 100 years.');
  const product = expanded.replace(/\b(?:19|20|21)\d{2}\b/g,' ').replace(/\b(?:to|through)\b/gi,' ').replace(/^[\s,–—-]+|[\s,–—-]+$/g,'').replace(/\s*[-–—]\s*(?=\s|$)/g,' ').replace(/\s+/g,' ').trim();
  const normalizedProduct = canonicalText(product).split(' ').filter(w => !['for','fits','replacement','seat','seats','cover','covers','oem'].includes(w)).join(' ');
  if (normalizedProduct.length < 2) throw new Error('Include a vehicle/model or product name, not only years.');
  const minYear = requestedMin === null ? null : requestedMin - 1, maxYear = requestedMax === null ? null : requestedMax + 1;
  const years = minYear === null ? [] : Array.from({length:maxYear!-minYear+1}, (_,i)=>minYear+i);
  const requestedYears = requestedMin === null ? [] : Array.from({length:requestedMax!-requestedMin+1},(_,i)=>requestedMin+i);
  return {product, normalizedProduct, requestedYears, years, requestedMin, requestedMax, minYear, maxYear,
    searchTerms:[product, ...years.map(y=>`${product} ${y}`)], key:`${normalizedProduct}|${requestedMin??'all'}|${requestedMax??'all'}`};
}
export function matchesSearch(title: string, input: string | SearchPlan) {
  const plan = typeof input === 'string' ? planSearch(input) : input;
  if (!matchesProduct(title,plan)) return false;
  const offered = yearValues(title);
  return !plan.years.length || offered.some(y=>plan.years.includes(y));
}
export function yearCoverage(titles: string[], plan: SearchPlan) {
  const observed = new Set(titles.flatMap(yearValues));
  return plan.years.map(year=>({year,found:observed.has(year),adjacent:!plan.requestedYears.includes(year)}));
}
