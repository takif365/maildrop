const { nanoid } = require('nanoid');
const domainManager = require('./DomainManager');

class EmailGenerator {
    constructor(db) {
        this.db = db;
    }

    async generate() {
        let email;
        let exists = true;

        while (exists) {
            const username = nanoid(Math.floor(Math.random() * (12 - 8 + 1)) + 8).toLowerCase();
            const domain = domainManager.getNextDomain();
            email = `${username}@${domain}`;

            const row = await this.db.get('SELECT email FROM used_emails WHERE email = ?', [email]);
            if (!row) {
                exists = false;
            }
        }

        return email;
    }
}

module.exports = EmailGenerator;
