const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const EmailGenerator = require('../src/core/EmailGenerator');
const sessionManager = require('../src/core/SessionManager');
const { nanoid } = require('nanoid');
const path = require('path');
const fastifyStatic = require('@fastify/static');

let emailGenerator;

// Initialize dependencies
async function init() {
    if (!emailGenerator) emailGenerator = new EmailGenerator();
}

const start = async () => {
    await init();

    // CORS configuration for Cloudflare Workers
    await fastify.register(cors, {
        origin: [/cloudflare-workers\.com$/, /pages\.dev$/, /workers\.dev$/],
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    });

    // API Routes
    fastify.get('/api/gen', async (request, reply) => {
        const email = await emailGenerator.generate();
        const token = nanoid(32);
        await sessionManager.createSession(email, token);
        return { email };
    });

    fastify.get('/api/messages/:email', async (request, reply) => {
        const { email } = request.params;
        const otp = await sessionManager.redis.get(`otp_store:${email}`);

        if (!otp) {
            return reply.status(404).send({
                error: 'No messages found for this email',
                email
            });
        }

        return { email, otp };
    });

    const handleReceive = async (request, reply) => {
        const { to, body } = request.body || request.query || {};
        if (!to || !body) {
            return reply.status(400).send({ error: 'Missing to or body' });
        }

        // Smart OTP Extraction
        const candidates = body.match(/\b\d{4,8}\b/g) || [];
        const currentYear = new Date().getFullYear().toString();
        const filtered = candidates.filter(code => code !== currentYear);
        const otp = filtered.find(code => code.length === 6) || filtered[0] || null;

        if (otp) {
            await sessionManager.redis.set(`otp_store:${to}`, otp, 'EX', 600);
            // New Requirement: all_received_emails
            await sessionManager.redis.sadd('all_received_emails', to);

            const token = await sessionManager.redis.get(`email_to_token:${to}`);
            if (token) {
                await sessionManager.updateSession(token, { otp });
            }
        }

        return { success: true, email: to, otp_found: !!otp };
    };

    fastify.post('/api/receive', handleReceive);
    fastify.get('/api/receive', handleReceive);
    fastify.post('/api/webhook', handleReceive); // Added per request

    // Legacy support
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

    // Static files (only if needed on Vercel, usually handled by Vercel directly but kept for compatibility)
    fastify.register(fastifyStatic, {
        root: path.join(__dirname, '../public'),
        prefix: '/public/',
    });

    return fastify;
};

// Export for Vercel
module.exports = async (req, res) => {
    const app = await start();
    await app.ready();
    app.server.emit('request', req, res);
};
