const axios = require('axios');
const Config = require('../../config');

// Cache for spam protection
const userCooldowns = new Map();
const COOLDOWN_TIME = 30000; // 30 seconds

module.exports = {
    aiCommandHandler: async function (rustplus, client, command) {
        const prefix = rustplus.generalSettings.prefix;
        const aiCommand = `${prefix}ai`;

        if (!command.startsWith(aiCommand)) {
            return false;
        }

        const question = command.substring(aiCommand.length).trim();
        if (!question) {
            rustplus.sendInGameMessage('Please ask a question after the !ai command');
            return true;
        }

        // Spam check
        const now = Date.now();
        const lastRequest = userCooldowns.get(client.steamId) || 0;
        if (now - lastRequest < COOLDOWN_TIME) {
            const remainingTime = Math.ceil((COOLDOWN_TIME - (now - lastRequest)) / 1000);
            rustplus.sendInGameMessage(`Please wait ${remainingTime} seconds before sending another request.`);
            return true;
        }

        // Question length check
        if (question.length > 500) {
            rustplus.sendInGameMessage('Your question is too long. Maximum length is 500 characters.');
            return true;
        }

        try {
            const response = await axios.post('https://api.deepseek.com/chat/completions', {
                model: 'deepseek/deepseek-chat',
                messages: [{
                    role: 'user',
                    content: question
                }],
                temperature: 0.7,
                max_tokens: 2000
            }, {
                headers: {
                    'Authorization': `Bearer ${Config.general.openRouterApiKey}`,
                    'HTTP-Referer': 'https://github.com/alexemanuelol/rustplusplus',
                    'X-Title': 'RustPlusPlus',
                    'Content-Type': 'application/json'
                }
            });

            const answer = response.data.choices[0].message.content;

            // Split long answer into parts
            if (answer.length > 200) {
                const chunks = answer.match(/.{1,200}(?:\s|$)/g);
                for (const chunk of chunks) {
                    rustplus.sendInGameMessage(chunk.trim());
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Delay between messages
                }
            } else {
                rustplus.sendInGameMessage(answer);
            }

            // Update last request time
            userCooldowns.set(client.steamId, now);
        } catch (error) {
            console.error('AI Command Error:', error.response?.data || error.message);
            let errorMessage = 'Error processing request.';

            if (error.code === 'ENOTFOUND') {
                errorMessage = 'Connection error. Check your internet connection.';
            } else if (error.response?.status === 401) {
                errorMessage = 'API authorization error. Please check the API key in the configuration.';
            } else if (error.response?.status === 404) {
                errorMessage = 'API endpoint not found.';
            } else if (error.response?.status === 429) {
                errorMessage = 'Too many requests. Please wait.';
            } else if (error.response?.data?.error?.code === 'unsupported_country_region_territory') {
                errorMessage = 'Your region is not supported. Please use a VPN.';
            }

            rustplus.sendInGameMessage(errorMessage);
        }

        return true;
    }
};
