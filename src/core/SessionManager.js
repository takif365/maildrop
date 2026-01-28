const Redis = require('ioredis');

class SessionManager {
    constructor() {
        this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
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
