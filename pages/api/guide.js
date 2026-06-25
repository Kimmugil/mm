const MEM = { text: null };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const { kv } = await import('@vercel/kv');
      const text = await kv.get('mm-planner-guide');
      return res.json({ text: text ?? '' });
    } catch {
      return res.json({ text: MEM.text ?? '' });
    }
  }

  if (req.method === 'POST') {
    const { password, text } = req.body ?? {};
    const adminPw = process.env.ADMIN_PASSWORD;

    if (!adminPw) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ error: 'Vercel 대시보드에서 ADMIN_PASSWORD 환경 변수를 설정해주세요.' });
      }
    } else if (password !== adminPw) {
      return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
    }

    if (text === undefined || text === null) {
      return res.json({ ok: true, authenticated: true });
    }

    try {
      const { kv } = await import('@vercel/kv');
      await kv.set('mm-planner-guide', text);
    } catch {
      MEM.text = text;
    }

    return res.json({ ok: true });
  }

  res.status(405).end();
}
