export default async function handler(req, res) {
  try {
    const response = await fetch('https://oaklifeisgood.tistory.com/rss');
    const text = await response.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/xml');
    res.status(200).send(text);
  } catch (e) {
    res.status(500).json({ error: 'RSS fetch 실패' });
  }
}
