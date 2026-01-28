const { simpleParser } = require('mailparser');
const sessionManager = require('../core/SessionManager');
const { setupDb } = require('../core/db');

async function processMail() {
    const rawMail = await getStdin();
    const parsed = await simpleParser(rawMail);

    const recipient = parsed.to.text; // Basic recipient extraction
    const body = parsed.text || parsed.html;

    // Extract OTP (e.g., 4-8 digits)
    const otpMatch = body.match(/\b\d{4,8}\b/);
    const otp = otpMatch ? otpMatch[0] : null;

    if (otp) {
        // Find session by email
        // We need an efficient way to find token by email. 
        // For now, we'll iterate or use a secondary index in Redis.
        // Better: Use a Redis set/hash to map email -> token.

        // Let's assume we have a mapping email:TOKEN in Redis.
        const token = await sessionManager.redis.get(`email_to_token:${recipient}`);

        if (token) {
            await sessionManager.updateSession(token, { otp });

            // Permanent storage
            const db = await setupDb();
            await db.run('INSERT OR IGNORE INTO used_emails (email) VALUES (?)', [recipient]);

            // Cleanup: Destroy session immediately (per rules)
            // But wait, the client needs to FETCH the OTP first.
            // Rule: "Destroy session immediately" after success.
            // This implies the client should be polling or waiting.
            // Let's keep it for a short time or delete after first fetch.
        }
    }
}

function getStdin() {
    return new Promise((resolve) => {
        let data = '';
        process.stdin.on('data', (chunk) => { data += chunk; });
        process.stdin.on('end', () => { resolve(data); });
    });
}

processMail().catch(console.error);
