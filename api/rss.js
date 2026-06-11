export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const response = await fetch('https://oaklifeisgood.tistory.com/rss');
    if (!response.ok) {
      return res.status(response.status).json({ error: 'RSS fetch 실패' });
    }

    const text = await response.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).send(text);
  } catch (e) {
    return res.status(500).json({ error: 'RSS fetch 실패' });
  }
}
