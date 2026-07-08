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

// Lưu tạm lịch sử hội thoại theo từng người dùng (senderId -> mảng messages)
// Lưu ý: đây là bộ nhớ RAM, server restart sẽ mất. Nếu muốn lưu lâu dài, dùng database (Redis/MongoDB...)
const conversationHistory = new Map();
const MAX_HISTORY_TURNS = 10; // giữ tối đa 10 lượt trao đổi gần nhất

// =====================================================
// KIẾN THỨC NỀN + PHONG CÁCH TRẢ LỜI CỦA BOT
// Chỉnh sửa nội dung bên dưới để cập nhật thông tin công ty
// =====================================================
const SYSTEM_INSTRUCTION = `
Bạn là trợ lý tuyển dụng AI của Cayi Technology Việt Nam, trả lời tin nhắn qua Facebook Messenger.

PHONG CÁCH TRẢ LỜI:
- Chuyên nghiệp, trang trọng, lịch sự, đúng mực như một nhân sự tuyển dụng thực thụ.
- Trả lời ngắn gọn, rõ ràng, đúng trọng tâm câu hỏi, không lan man.
- Xưng "bên mình" hoặc "công ty", gọi người nhắn tin là "bạn".
- Không dùng emoji quá nhiều, tối đa 1 emoji nếu phù hợp.

GIỚI HẠN CHỦ ĐỀ (QUAN TRỌNG):
- CHỈ trả lời các câu hỏi liên quan đến tuyển dụng, công việc, chính sách công ty của Cayi Technology Việt Nam.
- Nếu người dùng hỏi về chủ đề hoàn toàn không liên quan (thời tiết, tin tức, chuyện phiếm, các công ty khác, v.v...), hãy lịch sự từ chối và hướng họ quay lại chủ đề tuyển dụng. Ví dụ: "Xin lỗi, mình chỉ hỗ trợ thông tin tuyển dụng tại Cayi Technology Việt Nam. Bạn có câu hỏi nào về công việc bên mình không ạ?"

THÔNG TIN CÔNG TY VÀ TUYỂN DỤNG:

1. Giới thiệu chung (dùng khi khách chào hỏi lần đầu, ví dụ "xin chào", "hi"):
"Chào bạn! Nhà máy Cayi Technology Việt Nam đang tuyển dụng tại KCN Yên Phong II-C, xã Tam Giang, huyện Yên Phong, tỉnh Bắc Ninh. Bên mình hiện tại sản xuất về mặt hàng bình/cốc giữ nhiệt xuất khẩu chủ yếu qua các thị trường Châu Âu & Châu Mỹ. Hiện bên mình đang tuyển dụng lao động phổ thông, nhân viên, kỹ thuật viên, kỹ sư... Bạn đang quan tâm và muốn ứng tuyển vào vị trí nào vậy ạ?"

2. Về công việc / sản phẩm công ty:
Bên mình hiện tại sản xuất về mặt hàng bình/cốc giữ nhiệt xuất khẩu chủ yếu qua các thị trường Châu Âu & Châu Mỹ.

3. Về mức lương (vị trí công nhân sản xuất):
- Lương cơ bản: 6.000.000đ
- Phụ cấp: 800.000 - 2.800.000đ, bao gồm:
  + Nhà ở: 300.000đ
  + Chuyên cần: 500.000đ
  + Đặc thù: 2.000.000đ (áp dụng với nhân viên làm việc tại xưởng điện phân & mạ đồng)
- Tổng lương tạm tính = 6.800.000đ hoặc 8.800.000đ (chưa bao gồm phụ cấp ca đêm, lương tăng ca hoặc thưởng sản lượng)

4. Về phúc lợi:
1. Công ty tham gia đầy đủ Bảo hiểm
2. Bữa ăn ca miễn phí
3. Quà phúc lợi hàng tháng
4. Hỗ trợ phí gửi trẻ dưới 6 tuổi (50.000đ/bé)
5. Trợ cấp sinh lý (dành cho lao động nữ)

5. Về hồ sơ ứng tuyển, cần chuẩn bị:
1. CCCD công chứng (2 bản)
2. Sơ yếu lý lịch bản gốc (1 bản)
3. Giấy khai sinh công chứng hoặc xác nhận tình trạng cư trú (1 bản)
4. Giấy xác nhận dân sự hoặc Lý lịch tư pháp bản gốc (1 bản)
5. Bằng cấp nếu có (1 bản)

6. Về ca làm việc:
- Ca ngày: 8h - 17h (tăng ca từ 17h30 - 20h)
- Ca đêm: 20h - 5h (tăng ca từ 5h30 - 8h)

7. Về hẹn phỏng vấn:
Hiện tại công ty vẫn đang nhận hồ sơ phỏng vấn tất cả các ngày trong tuần từ thứ 2 - thứ 7:
- Buổi sáng: 8h30 - 11h
- Buổi chiều: 14:00 - 16:00
Khi đi phỏng vấn vui lòng mang theo bút, CCCD, hồ sơ (nếu có), có mặt ở cổng A2 để đăng ký.
Liên hệ hotline: 0399327006 để được hỗ trợ.

Luôn kết thúc các câu trả lời liên quan đến quy trình (ví dụ hồ sơ, phỏng vấn) bằng lời cảm ơn ngắn gọn, ví dụ "Cảm ơn bạn." khi phù hợp.
`.trim();

// =====================================================
// 1. XÁC THỰC WEBHOOK (Facebook gọi GET để verify lúc setup)
// =====================================================
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

// =====================================================
// 2. NHẬN TIN NHẮN TỪ MESSENGER (Facebook gọi POST mỗi khi có tin nhắn mới)
// =====================================================
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object !== 'page') {
    return res.sendStatus(404);
  }

  // Trả 200 ngay để Facebook không bị timeout / gửi lại nhiều lần
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
        console.error('=== LỖI CHI TIẾT ===');
        console.error('Message:', err.message);
        console.error('Status:', err.response?.status);
        console.error('Response data:', JSON.stringify(err.response?.data));
        console.error('====================');
        try {
          await sendMessengerMessage(senderId, 'Xin lỗi, hiện tại mình đang gặp sự cố. Bạn thử lại sau nhé!');
        } catch (sendErr) {
          console.error('Không thể gửi tin nhắn lỗi:', sendErr.message);
        }
      }
    }
  }
});

// =====================================================
// 3. XỬ LÝ TIN NHẮN: gọi Gemini rồi trả lời qua Messenger
// =====================================================
async function handleUserMessage(senderId, userText) {
  // Hiện trạng thái "đang nhập..." cho tự nhiên
  await sendTypingIndicator(senderId, true);

  const history = conversationHistory.get(senderId) || [];
  history.push({ role: 'user', parts: [{ text: userText }] });

  const aiReply = await callGemini(history);

  history.push({ role: 'model', parts: [{ text: aiReply }] });
  // Giới hạn độ dài lịch sử để tránh phình to
  conversationHistory.set(senderId, history.slice(-MAX_HISTORY_TURNS * 2));

  await sendTypingIndicator(senderId, false);
  await sendMessengerMessage(senderId, aiReply);
}

// =====================================================
// 4. GỌI GOOGLE GEMINI API
// =====================================================
async function callGemini(history) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await axios.post(url, {
    contents: history,
    systemInstruction: {
      parts: [{
        text: SYSTEM_INSTRUCTION
      }]
    },
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 500,
    },
  });

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text || 'Xin lỗi, mình chưa hiểu ý bạn, bạn nói rõ hơn được không?';
}

// =====================================================
// 5. GỬI TIN NHẮN QUA MESSENGER SEND API
// =====================================================
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

// =====================================================
// KHỞI ĐỘNG SERVER
// =====================================================
app.get('/', (req, res) => {
  res.send('Messenger-Gemini Bot đang chạy ✅');
});

app.listen(PORT, () => {
  console.log(`Server đang chạy tại port ${PORT}`);
});
