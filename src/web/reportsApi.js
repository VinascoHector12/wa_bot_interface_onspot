import express from 'express';
import { getDailyCounts, getUserCounts } from '../db/chatRepo.js';
import { getKeywordDaily, getKeywordUsers } from '../db/keywordRepo.js';

function normDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function addDays(iso, d = 1) {
  const dt = new Date(`${iso}T00:00:00`);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0,10);
}
function toRangeTs(fromYmd, toYmdInclusive) {
  const fromTs = `${fromYmd}T00:00:00`;
  const toTs   = `${addDays(toYmdInclusive, 1)}T00:00:00`;
  return { fromTs, toTs };
}

export default function registerReportsApi(app, authMiddleware) {
  const auth = authMiddleware || ((_req,_res,next)=>next());
  const router = express.Router();

  router.get('/messages/daily', auth, async (req, res) => {
    const today = new Date();
    const to0   = normDate(req.query.to)   || today.toISOString().slice(0,10);
    const from0 = normDate(req.query.from) || new Date(today.getTime()-6*86400000).toISOString().slice(0,10);
    const { fromTs, toTs } = toRangeTs(from0, to0);
    const rows = await getDailyCounts({ fromTs, toTs, chatId: req.query.chatId || null, phone: req.query.phone || null });
    res.json(rows);
  });

  router.get('/users', auth, async (req, res) => {
    const today = new Date();
    const to0   = normDate(req.query.to)   || today.toISOString().slice(0,10);
    const from0 = normDate(req.query.from) || new Date(today.getTime()-6*86400000).toISOString().slice(0,10);
    const { fromTs, toTs } = toRangeTs(from0, to0);
    const rows = await getUserCounts({
      fromTs, toTs,
      search: req.query.search || null,
      limit:  Math.min(Number(req.query.limit || 100), 200),
      offset: Number(req.query.offset || 0),
      sort:   req.query.sort || 'total_desc'
    });
    res.json(rows);
  });

  router.get('/keywords/daily', auth, async (req, res) => {
    const today = new Date();
    const to0   = normDate(req.query.to)   || today.toISOString().slice(0,10);
    const from0 = normDate(req.query.from) || new Date(today.getTime()-6*86400000).toISOString().slice(0,10);
    const { fromTs, toTs } = toRangeTs(from0, to0);
    const rows = await getKeywordDaily({
      fromTs, toTs,
      chatId: req.query.chatId || null,
      phone:  req.query.phone  || null,
      topicsCsv: (req.query.topics || '').trim()
    });
    res.json(rows);
  });

  router.get('/keywords/users', auth, async (req, res) => {
    const today = new Date();
    const to0   = normDate(req.query.to)   || today.toISOString().slice(0,10);
    const from0 = normDate(req.query.from) || new Date(today.getTime()-6*86400000).toISOString().slice(0,10);
    const { fromTs, toTs } = toRangeTs(from0, to0);
    const rows = await getKeywordUsers({
      fromTs, toTs,
      search: req.query.search || '',
      limit:  Math.min(Number(req.query.limit || 100), 200),
      offset: Number(req.query.offset || 0),
      sort:   req.query.sort || 'total_desc',
      topicsCsv: (req.query.topics || '').trim()
    });
    res.json(rows);
  });

  app.use('/api/reports', router);
}
