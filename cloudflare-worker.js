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

        // تواصل مع الرابط الخاص بك على Vercel
        const response = await fetch("https://3rb.xyz/api/receive", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "MailDrop-Worker/1.0", // Bypass Vercel Bot Protection
                "X-Auth-Key": env.AUTH_KEY || "maildrop-secret-2026"
            },
            body: JSON.stringify({
                to: message.to,
                from: message.from,
                body: rawEmail
            }),
        });

        if (!response.ok) {
            console.error("Failed to forward email:", await response.text());
        }
    },
};
