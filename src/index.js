import { app } from './app.js';
import { PORT, IAM_CLIENT_SECRET, IAM_INTROSPECT_URL } from './config.js';

if (!IAM_INTROSPECT_URL || !IAM_CLIENT_SECRET) {
  console.warn(JSON.stringify({ event: 'iam_introspection_not_configured', message: 'Authenticated Sitemaster management endpoints will reject requests until IAM credentials are configured' }));
}

const server = app.listen(PORT, () => console.log(`Sitemaster service listening on http://localhost:${PORT}`));
function shutdown(signal) {
  console.log(JSON.stringify({ event: 'shutdown_started', signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
