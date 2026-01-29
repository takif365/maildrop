const fastify = require('fastify')({ logger: true });
const { setupDb } = require('./core/db');
const EmailGenerator = require('./core/EmailGenerator');
const sessionManager = require('./core/SessionManager');
const { nanoid } = require('nanoid');
const path = require('path');
const fastifyStatic = require('@fastify/static');

let db;
let emailGenerator;

async function start() {
    db = await setupDb();
    emailGenerator = new EmailGenerator(db);

    // --- New API Endpoints ---

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

    // --- End New API Endpoints ---

    fastify.register(fastifyStatic, {
        root: path.join(__dirname, '../public'),
        prefix: '/',
    });

    const handleReceive = async (request, reply) => {
        const { to, body } = request.body || request.query || {};
        if (!to || !body) {
            return reply.status(400).send({ error: 'Missing to or body' });
        }

        // Extract OTP (4-8 digits) using the smart logic (duplicated here for now or extract to helper)
        const candidates = body.match(/\b\d{4,8}\b/g) || [];
        const currentYear = new Date().getFullYear().toString();
        const filtered = candidates.filter(code => code !== currentYear);
        const otp = filtered.find(code => code.length === 6) || filtered[0] || null;

        if (otp) {
            await sessionManager.redis.set(`otp_store:${to}`, otp, 'EX', 600);
            await sessionManager.redis.sadd('generated_emails_list', to);
            const token = await sessionManager.redis.get(`email_to_token:${to}`);
            if (token) {
                await sessionManager.updateSession(token, { otp });
            }
            await db.run('INSERT OR IGNORE INTO used_emails (email) VALUES (?)', [to]);
        }

        return { success: true, email: to, otp_found: !!otp };
    };

    fastify.post('/receive', handleReceive);
    fastify.post('/api/receive', handleReceive); // New API alias
    fastify.get('/api/receive', handleReceive);  // For quick testing if needed

    fastify.post('/generate', async (request, reply) => {
        const email = await emailGenerator.generate();
        const token = nanoid(32);

        await sessionManager.createSession(email, token);

        return { email, token };
    });


    fastify.get('/otp/:token', async (request, reply) => {
        const { token } = request.params;
        const session = await sessionManager.getSession(token);

        if (!session) {
            return reply.status(404).send({ error: 'Session not found or expired' });
        }

        return { otp: session.otp, email: session.email };
    });

    fastify.delete('/session/:token', async (request, reply) => {
        const { token } = request.params;
        await sessionManager.deleteSession(token);
        return { success: true };
    });

    const port = process.env.PORT || 3000;
    try {
        await fastify.listen({ port, host: '0.0.0.0' });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

start();
