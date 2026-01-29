const Redis = require('ioredis');

class SessionManager {
    constructor() {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
            console.warn('REDIS_URL not found in environment variables. Falling back to localhost.');
        }

        this.redis = new Redis(redisUrl || 'redis://localhost:6379', {
            tls: redisUrl ? { rejectUnauthorized: false } : undefined
        });

        this.redis.on('error', (err) => {
            console.error('Redis Connection Error:', err);
        });

        this.redis.on('connect', () => {
            console.log('Connected to Redis');
        });
    }

    async createSession(email, token, ttl = 120) {
        const sessionData = JSON.stringify({
            email,
            otp: null,
            created_at: Date.now()
        });
        await this.redis.set(`session:${token}`, sessionData, 'EX', ttl);
        await this.redis.set(`email_to_token:${email}`, token, 'EX', ttl);
    }

    async getSession(token) {
        const data = await this.redis.get(`session:${token}`);
        return data ? JSON.parse(data) : null;
    }

    async updateSession(token, updates) {
        const session = await this.getSession(token);
        if (session) {
            const updated = { ...session, ...updates };
            const ttl = await this.redis.ttl(`session:${token}`);
            if (ttl > 0) {
                await this.redis.set(`session:${token}`, JSON.stringify(updated), 'KEEPTTL');
            }
        }
    }

    async deleteSession(token) {
        const session = await this.getSession(token);
        if (session) {
            await this.redis.del(`email_to_token:${session.email}`);
        }
        await this.redis.del(`session:${token}`);
    }
}

module.exports = new SessionManager();
