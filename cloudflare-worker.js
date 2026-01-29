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

        // Connect to your Vercel endpoint
        const response = await fetch("https://3rb.xyz/api/receive", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://3rb.xyz/",
                "X-Worker-Source": "Cloudflare-MailDrop"
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
