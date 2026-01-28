class DomainManager {
    constructor() {
        const envDomains = process.env.DOMAINS || '';
        this.domains = envDomains.split(',').map(d => d.trim()).filter(d => d !== '');
        this.currentIndex = 0;
    }

    getNextDomain() {
        if (this.domains.length === 0) {
            throw new Error('No domains available in the pool');
        }
        const domain = this.domains[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.domains.length;
        return domain;
    }

    setDomains(domains) {
        this.domains = domains;
        this.currentIndex = 0;
    }
}

module.exports = new DomainManager();
