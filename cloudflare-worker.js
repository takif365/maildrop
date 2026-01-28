export default {
    async email(message, env, ctx) {
        const reader = message.raw.getReader();
        const decoder = new TextDecoder();
        let rawEmail = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            rawEmail += decoder.decode(value);
        }

        // تواصل مع الرابط الخاص بك على Koyeb
        const response = await fetch("https://formidable-twyla-takil-cc9a2978.koyeb.app/receive", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                to: message.to,
                from: message.from,
                body: rawEmail // نرسل المحتوى الخام ليتم معالجته، أو يمكنك استخراج النص فقط
            }),
        });

        if (!response.ok) {
            console.error("Failed to forward email:", await response.text());
        }
    },
};
