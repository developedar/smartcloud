const numberFormat = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1, useGrouping: false });
export const fa = value => Number.isFinite(value) ? numberFormat.format(value).replace('٫','.') : '—';
export function cleanDateLabel(value) {
  return value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'')
    .replace(/[0-9]/g,digit=>'۰۱۲۳۴۵۶۷۸۹'[Number(digit)])
    .replace(/[٠-٩]/g,digit=>'۰۱۲۳۴۵۶۷۸۹'[digit.charCodeAt(0)-0x660])
    .replace(/\s+/g,' ').trim();
}
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function productionDataSource(source, config, pageUrl) {
  const page=new URL(pageUrl);
  if (!config.github_raw || !page.hostname.endsWith('.github.io') || /^https?:/i.test(source)) return source;
  const owner=page.hostname.slice(0,-'.github.io'.length);
  const repository=page.pathname.split('/').filter(Boolean)[0] || `${owner}.github.io`;
  // Standard project Pages: /repository/ or /repository/index.html.
  const repo=repository==='index.html'?`${owner}.github.io`:repository;
  const path=source.replace(/^\.\//,'').replace(/^\//,'');
  return `https://raw.githubusercontent.com/${owner}/${repo}/${config.github_branch || 'main'}/${path}`;
}
export function normalizeSource(input) {
  const url = new URL(input, globalThis.location?.href || 'https://example.com/');
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('آدرس فایل معتبر نیست.');
  if (url.username || url.password) throw new Error('آدرس فایل نباید شامل اطلاعات ورود باشد.');
  if (url.hostname === 'github.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 5 && parts[2] === 'blob') {
      url.hostname = 'raw.githubusercontent.com';
      parts.splice(2, 1);
      url.pathname = '/' + parts.join('/');
    }
  }
  return url.href;
}
export function dateLabel(record) {
  if (typeof record.date === 'string' && record.date.trim()) return cleanDateLabel(record.date);
  if (typeof record.date_fa === 'string' && record.date_fa.trim()) return cleanDateLabel(record.date_fa);
  if (typeof record.measured_at === 'string' && Number.isFinite(Date.parse(record.measured_at))) {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {timeZone:'Asia/Tehran',day:'numeric',month:'long',year:'numeric'}).format(new Date(record.measured_at));
  }
  throw new Error('هر رکورد باید تاریخ نمایشی یا تاریخ استاندارد معتبر داشته باشد.');
}
export function buildModel(data, now = new Date()) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.measurements)) throw new Error('ساختار JSON معتبر نیست؛ آرایه measurements لازم است.');
  let records = data.measurements.map(record => {
    if (!record || typeof record.height_cm !== 'number' || !Number.isFinite(record.height_cm) || record.height_cm <= 0 || record.height_cm > 200) {
      throw new Error('مقدار height_cm باید عددی بین صفر و ۲۰۰ باشد.');
    }
    return { ...record, label: dateLabel(record) };
  });
  // The v2 contract is already newest-first. Never sort Persian display strings.
  // Read legacy v1 firmware histories by their machine timestamps.
  if (data.schema_version === 1) records.sort((a,b) => Date.parse(b.measured_at)-Date.parse(a.measured_at));
  const target = data.next_target || {};
  for (const key of ['father_height_cm','height_cm','remaining_to_father_cm','remaining_cm','baseline_height_cm','progress_percent']) {
    if (target[key] != null && (typeof target[key] !== 'number' || !Number.isFinite(target[key]))) throw new Error('مقادیر next_target باید عدد باشند.');
  }
  const latest = records[0] || null;
  const previous = records[1] || null;
  const first = records.at(-1) || null;
  const father = target.father_height_cm ?? 178;
  const goal = target.height_cm ?? 125;
  const baseline = target.baseline_height_cm ?? first?.height_cm ?? 0;
  if (goal <= 0 || goal > 200 || father <= 0 || father > 200) throw new Error('قد هدف و قد بابا باید بین صفر و ۲۰۰ باشند.');
  const progress = !latest ? 0 : clamp(target.progress_percent ?? (goal > baseline ? (latest.height_cm-baseline)/(goal-baseline)*100 : (latest.height_cm >= goal ? 100 : 0)),0,100);
  let recency = latest?.label || '—';
  if (latest?.measured_at && Number.isFinite(Date.parse(latest.measured_at))) {
    const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'});
    if (day.format(now) === day.format(new Date(latest.measured_at))) recency = 'امروز';
  }
  return { records, latest, previous, first, father, goal, baseline, progress, recency,
    previousGrowth: latest && previous ? latest.height_cm-previous.height_cm : null,
    totalGrowth: latest && first ? latest.height_cm-first.height_cm : null,
    fatherGap: latest ? target.remaining_to_father_cm ?? Math.max(0,father-latest.height_cm) : null,
    remaining: latest ? target.remaining_cm ?? Math.max(0,goal-latest.height_cm) : null
  };
}
