const BLOG = 'https://oaklifeisgood.tistory.com';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const urls = await fetchPostUrls();
    const htmlPages = await mapLimit(urls, 10, async (url) => {
      const response = await fetch(url);
      if (!response.ok) return null;
      return {
        url,
        html: await response.text(),
      };
    });

    const wines = htmlPages
      .filter(Boolean)
      .map(({ url, html }) => parsePost(url, html))
      .filter((wine) => wine && wine.title)
      .sort((a, b) => Number(b.id) - Number(a.id));

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({
      count: wines.length,
      sourceCount: urls.length,
      wines,
    });
  } catch (e) {
    return res.status(500).json({ error: '와인 목록 생성 실패' });
  }
}

async function fetchPostUrls() {
  const response = await fetch(`${BLOG}/sitemap.xml`);
  if (!response.ok) throw new Error('sitemap fetch failed');

  const xml = await response.text();
  const ids = [...xml.matchAll(/<loc>https:\/\/oaklifeisgood\.tistory\.com\/(\d+)<\/loc>/g)]
    .map((match) => match[1]);

  return [...new Set(ids)].map((id) => `${BLOG}/${id}`);
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

function parsePost(url, html) {
  const id = url.match(/\/(\d+)$/)?.[1] || '';
  const title = cleanTitle(decodeHtml(getMeta(html, 'og:title') || getMeta(html, 'title') || ''));
  const category = decodeHtml(
    html.match(/window\.T\.entryInfo\s*=\s*\{[^}]*categoryLabel:"([^"]+)"/)?.[1] ||
    html.match(/categoryName":"([^"]+)"/)?.[1] ||
    ''
  );

  if (category.includes('여행') || title.includes('여행')) return null;

  const articleHtml = html.match(/<div class="article_cont" id="article-view">([\s\S]*?)<div class="container_postbtn/s)?.[1] || html;
  const image = decodeHtml(getMeta(html, 'og:image') || '');
  const body = htmlToText(articleHtml);

  const regionFull = field(body, '지역');
  const country = detectCountry(`${category} ${regionFull} ${title}`);
  const region = regionFull.includes(',')
    ? regionFull.split(',').slice(-1)[0].trim()
    : regionFull.trim();

  const titleYear = title.match(/\b(?:19|20)\d{2}\b/)?.[0];
  const vintage = titleYear || field(body, '빈티지') || 'NV';
  const variety = formatVariety(field(body, '품종'));
  const abv = field(body, '도수');
  const tasting = extractTasting(body);
  const publishedAt = getMeta(html, 'article:published_time') || '';

  return {
    id,
    path: `/${id}`,
    url,
    title,
    vintage,
    region,
    regionFull,
    country,
    variety,
    abv,
    tasting,
    categories: [category].filter(Boolean),
    publishedAt,
    image,
  };
}

function getMeta(html, name) {
  const escaped = escapeRegExp(name);
  return (
    html.match(new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["']`, 'i'))?.[1] ||
    html.match(new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["']`, 'i'))?.[1] ||
    ''
  );
}

function field(text, label) {
  const match = text.match(new RegExp(`${label}\\s*[:：]\\s*([^\\n]+)`, 'i'));
  return match ? normalizeText(match[1].replace(/[*_]/g, '')) : '';
}

function extractTasting(text) {
  const match = text.match(/테이스팅\s*노트[^\n]*\n([\s\S]*?)(?=서쳐\s*가격|생산자|끝\.|$)/i);
  return match ? normalizeText(match[1].replace(/[✔▶✅]/g, '')) : '';
}

function htmlToText(html) {
  return decodeHtml(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/blockquote>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanTitle(title) {
  return title
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(text) {
  return text
    .replace(/\u200d/g, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatVariety(value) {
  const varietyRaw = value.replace(/^품종\s*[:：]\s*/i, '').trim();
  const varietyParts = varietyRaw.split(/[,\/]/).map((part) => part.trim()).filter(Boolean);

  if (varietyParts.length <= 1) {
    return varietyRaw.replace(/\d+%/g, '').replace(/\b100\b/g, '').trim();
  }

  return varietyParts.map((part) => {
    const pct = part.match(/(\d+)%/);
    const name = part.replace(/\d+%/g, '').trim().split(' ')[0];
    return pct ? `${name} ${pct[1]}%` : name;
  }).join(' / ');
}

function detectCountry(text) {
  const source = text.toLowerCase();
  if (source.includes('italy') || source.includes('🇮🇹') || source.includes('이탈리아') || source.includes('barolo') || source.includes('toscana')) return 'Italy';
  if (source.includes('usa') || source.includes('🇺🇸') || source.includes('미국') || source.includes('california') || source.includes('napa')) return 'USA';
  if (source.includes('spain') || source.includes('🇪🇸') || source.includes('스페인') || source.includes('rioja') || source.includes('priorat')) return 'Spain';
  if (source.includes('germany') || source.includes('🇩🇪') || source.includes('독일') || source.includes('mosel')) return 'Germany';
  if (source.includes('australia') || source.includes('호주')) return 'Australia';
  if (source.includes('chile') || source.includes('칠레')) return 'Chile';
  if (source.includes('france') || source.includes('🇫🇷') || source.includes('프랑스') || source.includes('bourgogne') || source.includes('bordeaux') || source.includes('champagne')) return 'France';
  return 'Other';
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
