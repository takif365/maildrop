const { simpleParser } = require('mailparser');

async function testExtraction() {
    console.log('--- Running Smart OTP Extraction Tests ---');

    const testCases = [
        {
            name: 'Basic 6-digit priority',
            raw: `Your code is 4567. TikTok code: 123456. Session 2026.`,
            expected: '123456'
        },
        {
            name: 'Filter out year 2026',
            raw: `Year 2026. Code 9876.`,
            expected: '9876'
        },
        {
            name: 'Multiple codes, pick first 6-digit',
            raw: `Codes: 1111, 222222, 333333`,
            expected: '222222'
        }
    ];

    function extractOtp(text) {
        const candidates = text.match(/\b\d{4,8}\b/g) || [];
        const currentYear = new Date().getFullYear().toString();
        const nextYear = (new Date().getFullYear() + 1).toString();
        const filtered = candidates.filter(code => code !== currentYear && code !== nextYear);
        return filtered.find(code => code.length === 6) || filtered[0] || null;
    }

    for (const tc of testCases) {
        const result = extractOtp(tc.raw);
        if (result === tc.expected) {
            console.log(`✅ ${tc.name} Passed`);
        } else {
            console.error(`❌ ${tc.name} Failed: Got ${result}, expected ${tc.expected}`);
            process.exit(1);
        }
    }
}

testExtraction();
