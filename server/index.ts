import { Hono } from 'hono';
import { registerAnalyzeRoute } from './routes/analyze';
import { registerBirdDetailRoute } from './routes/bird-detail';
import { registerEnrichRoute } from './routes/enrich';
import { xcProxy } from './routes/xc-proxy';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

registerAnalyzeRoute(app);
registerEnrichRoute(app);
registerBirdDetailRoute(app);
app.route('/xc', xcProxy);

export default app;
