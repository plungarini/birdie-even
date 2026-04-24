import { Hono } from 'hono';
import { registerAnalyzeRoute } from './routes/analyze';
import { registerEnrichRoute } from './routes/enrich';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

registerAnalyzeRoute(app);
registerEnrichRoute(app);

export default app;
