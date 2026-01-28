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

    fastify.register(fastifyStatic, {
        root: path.join(__dirname, '../public'),
        prefix: '/',
    });

    // We can keep the / as health check or let it serve index.html
    // If index.html exists in /public, it will be served at / by default.

    fastify.get('/health', async (request, reply) => {
        return { status: 'healthy', service: 'MailDrop' };
    });

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
