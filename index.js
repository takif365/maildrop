const fastify = require('fastify')({
    logger: true,
    disableRequestLogging: false
});
const cors = require('@fastify/cors');
const EmailGenerator = require('./src/core/EmailGenerator');
const sessionManager = require('./src/core/SessionManager');
const domainManager = require('./src/core/DomainManager');
const { nanoid } = require('nanoid');
const path = require('path');
const fastifyStatic = require('@fastify/static');

let emailGenerator;
let initialized = false;

// Setup app once per cold start
async function setupApp() {
    if (initialized) return fastify;

    try {
        // Sync domains from Redis
        await domainManager.syncWithRedis(sessionManager.redis);

        // Register CORS
        await fastify.register(cors, {
            origin: true, // Be more permissive for debugging Cloudflare Workers
            methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization']
        });

        // Register static serving for index.html and admin.html
        await fastify.register(fastifyStatic, {
            root: path.join(__dirname, 'public'),
            prefix: '/',
        });

        if (!emailGenerator) emailGenerator = new EmailGenerator();

        // Routes
        fastify.get('/', async () => {
            const keys = ['maildrop_domains', 'all_received_emails'];
            const types = {};
            for (const key of keys) {
                types[key] = await sessionManager.redis.type(key);
            }

            return {
                status: 'online',
                service: 'MailDrop API',
                domains: domainManager.domains,
                redis_diagnostics: types,
                env: {
                    hasRedis: !!process.env.REDIS_URL,
                    hasDomainsEnv: !!process.env.DOMAINS
                }
            };
        });

        fastify.get('/api/gen', async (request, reply) => {
            try {
                const email = await emailGenerator.generate();
                const token = nanoid(32);
                await sessionManager.createSession(email, token);
                return { email };
            } catch (err) {
                fastify.log.error(err);
                return reply.status(500).send({ error: 'Failed to generate email', message: err.message });
            }
        });

        fastify.get('/api/messages/:email', async (request, reply) => {
            const { email } = request.params;
            try {
                const otp = await sessionManager.redis.get(`otp_store:${email}`);
                if (!otp) {
                    return reply.status(404).send({ error: 'No messages found', email });
                }
                return { email, otp };
            } catch (err) {
                fastify.log.error(err);
                return reply.status(500).send({ error: 'Redis lookup failed', message: err.message });
            }
        });

        const handleReceive = async (request, reply) => {
            const { to, body } = request.body || request.query || {};
            if (!to || !body) return reply.status(400).send({ error: 'Missing to or body' });

            try {
                const candidates = body.match(/\b\d{4,8}\b/g) || [];
                const currentYear = new Date().getFullYear().toString();
                const filtered = candidates.filter(code => code !== currentYear);
                const otp = filtered.find(code => code.length === 6) || filtered[0] || null;

                if (otp) {
                    const timestamp = Date.now();
                    await sessionManager.redis.set(`otp_store:${to}`, otp, 'EX', 600);

                    // Robust check: Ensure all_received_emails is a SET
                    const keyType = await sessionManager.redis.type('all_received_emails');
                    if (keyType === 'string') {
                        await sessionManager.redis.del('all_received_emails');
                    }
                    await sessionManager.redis.sadd('all_received_emails', to);

                    // Add to History Log
                    const historyItem = JSON.stringify({ email: to, otp, timestamp });
                    await sessionManager.redis.zadd('maildrop_history', timestamp, historyItem);

                    const token = await sessionManager.redis.get(`email_to_token:${to}`);
                    if (token) {
                        await sessionManager.updateSession(token, { otp });
                    }
                }
                return { success: true, email: to, otp_found: !!otp };
            } catch (err) {
                fastify.log.error(err);
                return reply.status(500).send({ error: 'Failed to process email', message: err.message });
            }
        };

        fastify.post('/api/receive', handleReceive);
        fastify.get('/api/receive', handleReceive);
        fastify.post('/api/webhook', handleReceive);
        fastify.post('/receive', handleReceive);

        // Admin Auth Middleware
        const adminAuth = async (request, reply) => {
            const auth = request.headers.authorization;
            const password = process.env.ADMIN_PASSWORD || 'admin123';
            if (!auth || auth !== `Bearer ${password}`) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }
        };

        // ADMIN ROUTES
        fastify.post('/api/admin/login', async (request, reply) => {
            const { password } = request.body || {};
            if (password === (process.env.ADMIN_PASSWORD || 'admin123')) {
                return { token: password };
            }
            return reply.status(401).send({ error: 'Invalid password' });
        });

        fastify.get('/api/admin/domains', { preHandler: [adminAuth] }, async () => {
            return { domains: domainManager.domains };
        });

        fastify.post('/api/admin/domains', { preHandler: [adminAuth] }, async (request) => {
            const { domains } = request.body || {};
            if (domains) {
                const key = 'maildrop_domains';
                await sessionManager.redis.set(key, domains);
                await domainManager.syncWithRedis(sessionManager.redis);
                return { success: true, domains: domainManager.domains };
            }
            return { error: 'No domains provided' };
        });

        fastify.get('/api/admin/messages', { preHandler: [adminAuth] }, async (request) => {
            const { offset = 0, limit = 50 } = request.query;
            const start = parseInt(offset);
            const end = start + parseInt(limit) - 1;

            const raw = await sessionManager.redis.zrevrange('maildrop_history', start, end);
            const messages = raw.map(m => JSON.parse(m));
            const total = await sessionManager.redis.zcard('maildrop_history');

            return { messages, total, hasMore: total > (start + messages.length) };
        });

        fastify.delete('/api/admin/messages/:email', { preHandler: [adminAuth] }, async (request) => {
            const { email } = request.params;
            await sessionManager.redis.del(`otp_store:${email}`);

            const allItems = await sessionManager.redis.zrange('maildrop_history', 0, -1);
            for (const item of allItems) {
                if (JSON.parse(item).email === email) {
                    await sessionManager.redis.zrem('maildrop_history', item);
                }
            }
            return { success: true };
        });

        fastify.post('/generate', async (request, reply) => {
            const email = await emailGenerator.generate();
            const token = nanoid(32);
            await sessionManager.createSession(email, token);
            return { email, token };
        });

        fastify.get('/api/sync-domains', async (request, reply) => {
            const success = await domainManager.syncWithRedis(sessionManager.redis);
            return {
                success,
                domains: domainManager.domains,
                message: success ? 'Domains synced from Redis' : 'Failed to sync (key maildrop_domains might be missing or empty)'
            };
        });

        fastify.get('/otp/:token', async (request, reply) => {
            const { token } = request.params;
            const session = await sessionManager.getSession(token);
            if (!session) return reply.status(404).send({ error: 'Session not found' });
            return { otp: session.otp, email: session.email };
        });

        initialized = true;
        return fastify;
    } catch (err) {
        console.error('Fastify Init Error:', err);
        throw err;
    }
}

// Vercel Serverless Handler
module.exports = async (req, res) => {
    try {
        const app = await setupApp();
        await app.ready();
        app.server.emit('request', req, res);
    } catch (err) {
        console.error('SERVERLESS_HANDLER_ERROR:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
            error: 'Serverless Invocation Failed',
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }));
    }
};
