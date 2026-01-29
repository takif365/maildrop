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

            // Add a numeric suffix only if we are on a second or later attempt
            const suffix = retryCount > 0 ? Math.floor(Math.random() * 1000) : '';
            const username = `${firstName}.${lastName}${suffix}`;

            const domain = domainManager.getNextDomain();
            email = `${username}@${domain}`;
            retryCount++;

            // Check if email was used before in Redis Set
            const keyType = await sessionManager.redis.type('all_received_emails');
            if (keyType === 'string') {
                await sessionManager.redis.del('all_received_emails');
                exists = false;
            } else {
                const isUsed = await sessionManager.redis.sismember('all_received_emails', email);
                if (!isUsed) {
                    exists = false;
                }
            }
        }

        return email;
    }
}

module.exports = EmailGenerator;
