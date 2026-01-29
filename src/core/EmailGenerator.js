const { nanoid } = require('nanoid');
const domainManager = require('./DomainManager');
const sessionManager = require('./SessionManager');

class EmailGenerator {
    constructor() {
        // No DB dependency anymore
    }

    async generate() {
        let email;
        let exists = true;

        while (exists) {
            const username = nanoid(Math.floor(Math.random() * (12 - 8 + 1)) + 8).toLowerCase();
            const domain = domainManager.getNextDomain();
            email = `${username}@${domain}`;

            // Check if email was used before in Redis Set
            const isUsed = await sessionManager.redis.sismember('all_received_emails', email);
            if (!isUsed) {
                exists = false;
            }
        }

        return email;
    }
}

module.exports = EmailGenerator;
