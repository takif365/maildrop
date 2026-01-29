const fastify = require('fastify')({
    logger: true,
    disableRequestLogging: false
});
const cors = require('@fastify/cors');
const EmailGenerator = require('../src/core/EmailGenerator');
const sessionManager = require('../src/core/SessionManager');
const { nanoid } = require('nanoid');

let emailGenerator;
let initialized = false;

// Setup app once per cold start
async function setupApp() {
    if (initialized) return fastify;

    try {
        // Register CORS
        await fastify.register(cors, {
            origin: true, // Be more permissive for debugging Cloudflare Workers
            methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization']
        });

        if (!emailGenerator) emailGenerator = new EmailGenerator();

        // Routes
        fastify.get('/', async () => {
            return {
                status: 'online',
                service: 'MailDrop API',
                env: {
                    hasRedis: !!process.env.REDIS_URL,
                    hasDomains: !!process.env.DOMAINS
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
                    await sessionManager.redis.set(`otp_store:${to}`, otp, 'EX', 600);
                    await sessionManager.redis.sadd('all_received_emails', to);

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

        fastify.post('/generate', async (request, reply) => {
            const email = await emailGenerator.generate();
            const token = nanoid(32);
            await sessionManager.createSession(email, token);
            return { email, token };
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
