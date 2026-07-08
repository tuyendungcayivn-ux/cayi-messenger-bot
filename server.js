require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const {
  VERIFY_TOKEN,
  PAGE_ACCESS_TOKEN,
  GEMINI_API_KEY,
  GEMINI_MODEL = 'gemini-1.5-flash',
  PORT = 3000,
} = process.env;

const conversationHistory = new Map();
const MAX_HISTORY_TURNS = 10;

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified thành công!');
    res.status(200).send(challenge);
  } else {
    console.log('Webhook verify thất bại. Token nhận được:', token);
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object !== 'page') {
    return res.sendStatus(404);
  }

  res.status(200).send('EVENT_RECEIVED');

  for (const entry of body.entry || []) {
    const webhookEvent = entry.messaging?.[0];
    if (!webhookEvent) continue;

    const senderId = webhookEvent.sender?.id;
    const messageText = webhookEvent.message?.text;

    if (senderId && messageText) {
      try {
        await handleUserMessage(senderId, messageText);
      } catch (err) {
        console.error('Lỗi khi xử lý tin nhắn:', err.message);
        await sendMessengerMessage(senderId, 'Xin lỗi, hiện tại mình đang gặp sự cố. Bạn thử lại sau nhé!');
      }
    }
  }
});

async function handleUserMessage(senderId, userText) {
  await sendTypingIndicator(senderId, true);

  const history = conversationHistory.get(senderId) || [];
  history.push({ role: 'user', parts: [{ text: userText }] });

  const aiReply = await callGemini(history);

  history.push({ role: 'model', parts: [{ text: aiReply }] });
  conversationHistory.set(senderId, history.slice(-MAX_HISTORY_TURNS * 2));

  await sendTypingIndicator(senderId, false);
  await sendMessengerMessage(senderId, aiReply);
}

async function callGemini(history) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await axios.post(url, {
    contents: history,
    systemInstruction: {
      parts: [{
        text: 'Bạn là trợ lý AI thân thiện, trả lời ngắn gọn, dễ hiểu bằng tiếng Việt, phù hợp để hiển thị trong khung chat Messenger.'
      }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 500,
    },
  });

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text || 'Xin lỗi, mình chưa hiểu ý bạn, bạn nói rõ hơn được không?';
}

async function sendMessengerMessage(recipientId, text) {
  const url = `https://graph.facebook.com/v20.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;

  await axios.post(url, {
    recipient: { id: recipientId },
    message: { text },
  });
}

async function sendTypingIndicator(recipientId, isTyping) {
  const url = `https://graph.facebook.com/v20.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
  try {
    await axios.post(url, {
      recipient: { id: recipientId },
      sender_action: isTyping ? 'typing_on' : 'typing_off',
    });
  } catch (err) {
    // Không quan trọng nếu lỗi, bỏ qua
  }
}

app.get('/', (req, res) => {
  res.send('Messenger-Gemini Bot đang chạy ✅');
});

app.listen(PORT, () => {
  console.log(`Server đang chạy tại port ${PORT}`);
});
