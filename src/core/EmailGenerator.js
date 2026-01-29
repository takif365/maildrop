const { faker } = require('@faker-js/faker');
const domainManager = require('./DomainManager');
const sessionManager = require('./SessionManager');

class EmailGenerator {
    constructor() {
        // No DB dependency anymore
    }

    async generate() {
        let email;
        let exists = true;
        let retryCount = 0;

        while (exists) {
            const firstName = faker.person.firstName().toLowerCase().replace(/[^a-z0-9]/g, '');
            const lastName = faker.person.lastName().toLowerCase().replace(/[^a-z0-9]/g, '');

            const suffix = retryCount > 0 ? Math.floor(Math.random() * 1000) : '';
            const username = `${firstName}.${lastName}${suffix}`;

            const domain = await domainManager.getNextDomain(sessionManager.redis);
            email = `${username}@${domain}`;
            retryCount++;

            // Check uniqueness in Redis Set
            const isUsed = await sessionManager.redis.sismember('all_received_emails', email);
            if (!isUsed) {
                exists = false;
            }
        }

        return email;
    }
}

module.exports = EmailGenerator;
