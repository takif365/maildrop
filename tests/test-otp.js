const { simpleParser } = require('mailparser');

async function testExtraction() {
    const rawMail = `From: sender@example.com\nTo: recipient@test.com\nSubject: Your OTP\n\nYour code is 123456. Do not share it.`;
    const parsed = await simpleParser(rawMail);
    const body = parsed.text;
    const otpMatch = body.match(/\b\d{4,8}\b/);
    const otp = otpMatch ? otpMatch[0] : null;

    if (otp === '123456') {
        console.log('✅ OTP Extraction Test Passed');
    } else {
        console.error('❌ OTP Extraction Test Failed: Got', otp);
        process.exit(1);
    }
}

testExtraction();
