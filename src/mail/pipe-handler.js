const { simpleParser } = require('mailparser');
const sessionManager = require('../core/SessionManager');

async function processMail() {
    const rawMail = await getStdin();
    const parsed = await simpleParser(rawMail);

    const recipient = parsed.to?.text;
    if (!recipient) return;

    const body = parsed.text || parsed.html || '';

    // Smart OTP Extraction logic
    function extractOtp(text) {
        // Find all candidates (4 to 8 digits)
        const candidates = text.match(/\b\d{4,8}\b/g) || [];

        // Filter out years (like 2026) and common time patterns (HHMM)
        const currentYear = new Date().getFullYear().toString();
        const nextYear = (new Date().getFullYear() + 1).toString();

        const filtered = candidates.filter(code => {
            if (code === currentYear || code === nextYear) return false;
            // Additional filtering for common false positives can be added here
            return true;
        });

        // Priority 1: 6-digit codes
        const sixDigits = filtered.find(code => code.length === 6);
        if (sixDigits) return sixDigits;

        // Priority 2: Any other code
        return filtered[0] || null;
    }

    const otp = extractOtp(body);

    if (otp) {
        // Store OTP in Redis keyed by email for the new API
        // TTL 10 minutes (600 seconds)
        await sessionManager.redis.set(`otp_store:${recipient}`, otp, 'EX', 600);
        await sessionManager.redis.sadd('all_received_emails', recipient);

        // Keep legacy session support if token exists
        const token = await sessionManager.redis.get(`email_to_token:${recipient}`);
        if (token) {
            await sessionManager.updateSession(token, { otp });
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
