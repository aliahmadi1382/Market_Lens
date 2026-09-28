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
  const haystack = ` ${canonicalText(title)} `;
  if (!plan.normalizedProduct.split(' ').every(token=>haystack.includes(` ${token} `))) return false;
  const offered = yearValues(title);
  return !plan.years.length || offered.some(y=>plan.years.includes(y));
}
export function yearCoverage(titles: string[], plan: SearchPlan) {
  const observed = new Set(titles.flatMap(yearValues));
  return plan.years.map(year=>({year,found:observed.has(year),adjacent:!plan.requestedYears.includes(year)}));
}
