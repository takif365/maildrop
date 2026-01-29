class DomainManager {
    constructor() {
        const envDomains = process.env.DOMAINS || '';
        this.domains = envDomains.split(',').map(d => d.trim()).filter(d => d !== '');
        this.currentIndex = 0;
    }

    async syncWithRedis(redis) {
        try {
            let list = [];
            const key = 'maildrop_domains';
            const typeValue = await redis.type(key);

            if (typeValue === 'string') {
                const data = await redis.get(key);
                list = data.split(',').map(d => d.trim()).filter(d => d !== '');
            } else if (typeValue === 'set') {
                list = await redis.smembers(key);
            }

            if (list.length > 0) {
                this.domains = list;
                return true;
            }
        } catch (err) {
            console.error('Domain Sync Error:', err);
        }
        return false;
    }

    getNextDomain() {
        if (this.domains.length === 0) {
            // Last resort: common fallback if nothing is configured
            const fallbacks = ['test.com'];
            if (fallbacks.length > 0) {
                this.domains = fallbacks;
            } else {
                throw new Error('DOMAIN_POOL_EMPTY: No domains found in Redis (maildrop_domains) or DOMAINS env. Please check your Upstash database.');
            }
        }
        const domain = this.domains[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.domains.length;
        return domain;
    }

    setDomains(domains) {
        this.domains = typeof domains === 'string' ? domains.split(',').map(d => d.trim()) : domains;
        this.currentIndex = 0;
    }
}

module.exports = new DomainManager();
