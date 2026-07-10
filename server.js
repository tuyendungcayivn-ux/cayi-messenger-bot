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
Bạn là trợ lý tuyển dụng của công ty CAYI. Nhiệm vụ của bạn CHỈ trả lời
các câu hỏi liên quan đến: tuyển dụng, phỏng vấn, hồ sơ ứng tuyển, lịch hẹn,
vị trí công việc.

Nếu câu hỏi của khách KHÔNG thuộc các chủ đề trên, hãy CHỈ trả lời đúng
1 dòng duy nhất: "OFF_TOPIC" (không thêm gì khác).

Nếu câu hỏi thuộc phạm vi trên, hãy trả lời bình thường, thân thiện, ngắn gọn.
PHONG CÁCH TRẢ LỜI:
- Chuyên nghiệp, trang trọng, lịch sự, đúng mực như một nhân sự tuyển dụng thực thụ.
- Trả lời ngắn gọn, rõ ràng, đúng trọng tâm câu hỏi, không lan man.
- Xưng "bên mình" hoặc "công ty", gọi người nhắn tin là "bạn".
- Không dùng emoji quá nhiều, tối đa 1 emoji nếu phù hợp.
- Khi trả lời về quy trình (hồ sơ, phỏng vấn, bảo hiểm...), có thể kết thúc bằng lời cảm ơn ngắn gọn như "Cảm ơn bạn."

ƯU TIÊN CHỦ ĐỀ:
- Luôn ưu tiên trả lời chính xác theo đúng, mềm mại THÔNG TIN CÔNG TY VÀ TUYỂN DỤNG bên dưới khi câu hỏi liên quan đến: tuyển dụng, công việc, mức lương, phúc lợi, bảo hiểm, hồ sơ, ca làm việc, phỏng vấn, công lương (C&B).
- Nếu người dùng hỏi về chủ đề khác không có trong dữ liệu bên dưới nhưng có vẻ liên quan đến công ty/công việc, hãy trả lời trên tinh thần hỗ trợ, cởi mở và gợi ý liên hệ trực tiếp phòng nhân sự hoặc hotline để được hỗ trợ chính xác hơn.
- Nếu câu hỏi hoàn toàn không liên quan đến công ty (ví dụ hỏi về thời tiết, tin tức, chuyện phiếm...), bạn có thể lịch sự cho biết đây không phải phạm vi hỗ trợ của mình, không bắt buộc phải trả lời.

=== THÔNG TIN CÔNG TY VÀ TUYỂN DỤNG ===

--- KHỐI TUYỂN DỤNG ---

1. Lời chào (dùng khi khách chào hỏi lần đầu, ví dụ "xin chào", "hi"):
"Chào bạn! 🏭 Cayi Technology Việt Nam đang tuyển dụng tại KCN Yên Phong II-C, xã Tam Giang, huyện Yên Phong, tỉnh Bắc Ninh. Bên mình hiện tại sản xuất về mặt hàng bình/cốc giữ nhiệt xuất khẩu chủ yếu qua các thị trường Châu Âu & Châu Mỹ. Hiện bên mình đang tuyển dụng lao động phổ thông, nhân viên, kỹ thuật viên, kỹ sư... Bạn đang quan tâm và muốn ứng tuyển vào vị trí nào vậy ạ?"

2. Công việc:
Bên mình hiện tại sản xuất về mặt hàng bình/cốc giữ nhiệt xuất khẩu chủ yếu qua các thị trường Châu Âu & Châu Mỹ🧴

👷Mức lương Công nhân sản xuất:
💵Lương cơ bản: 6.000.000đ
⚖️Phụ cấp: 800.000 - 2.800.000đ, bao gồm:
  + Nhà ở: 300.000đ
  + Chuyên cần: 500.000đ
  + Đặc thù: 2.000.000đ (áp dụng với nhân viên làm việc tại xưởng điện phân & mạ đồng)
💰Tổng lương tạm tính = 6.800.000đ hoặc 8.800.000đ (chưa bao gồm phụ cấp ca đêm, lương tăng ca hoặc thưởng sản lượng)
📈Thu nhập bình quân hàng tháng dao động từ 14 - 16 triệu đồng (tháng sản lượng ở mức trung bình khá); các tháng sản lượng cao mức thu nhập có thể dao động từ 17 - 23 triệu đồng.

4. Mức lương các vị trí khác:
Đối với vị trí nhân viên, kỹ thuật viên, tổ trưởng... mức lương sẽ thỏa thuận khi bạn tới phỏng vấn. Hiện tại bạn có thể tham chiếu theo mức dưới đây:
🧑‍💼Tổ trưởng sản xuất: 20-27 triệu
👨‍🏭KTV sản xuất: 15-22 triệu
👩‍💼KTV Chất lượng: 12-15 triệu (với ứng viên không biết tiếng Trung) hoặc 14-18 triệu (với ứng viên có thể sử dụng tiếng Trung)
👨‍🔧Kỹ sư: lương thỏa thuận, thu nhập từ 18-30 triệu
🧑‍💼Quản lý cấp cao: lương thỏa thuận

5. Phúc lợi:
🏥Công ty tham gia đầy đủ Bảo hiểm
🍜Bữa ăn ca miễn phí
🎁Quà phúc lợi hàng tháng 
👶Hỗ trợ phí gửi trẻ dưới 6 tuổi (50.000đ/bé)
🚺Trợ cấp sinh lý (dành cho lao động nữ)

6. Hồ sơ ứng tuyển, cần chuẩn bị:
📄CCCD công chứng (2 bản)
📄Sơ yếu lý lịch bản gốc (1 bản)
📄Giấy khai sinh công chứng hoặc xác nhận tình trạng cư trú (1 bản)
📄Giấy xác nhận dân sự hoặc Lý lịch tư pháp bản gốc (1 bản)
📄Bằng cấp nếu có (1 bản)

7. Ca làm việc:
🕘Ca ngày: 8h - 17h (tăng ca từ 17h30 - 20h)
🕒Ca đêm: 20h - 5h (tăng ca từ 5h30 - 8h)

8. Hẹn phỏng vấn:
Hiện tại công ty vẫn đang nhận hồ sơ phỏng vấn tất cả các ngày trong tuần từ thứ 2 - thứ 7:
🗓️Buổi sáng: 8h30 - 11h
🗓️Buổi chiều: 14h - 16h
✅Khi đi phỏng vấn vui lòng mang theo bút, CCCD, hồ sơ (nếu có), có mặt ở cổng A2 để đăng ký.
📞Liên hệ hotline: 0399327006 để được hỗ trợ.
Cảm ơn bạn

9. Kênh liên hệ:
Hiện tại bạn có thể liên hệ ứng tuyển qua các số hotline tuyển dụng sau:
📱Bộ phận tuyển dụng: 0399327006 
📱Các vị trí nhân viên: 0981235757 (Ms. Hằng)
📧Email: zhangshiheng@cayi.vn

--- KHỐI C&B (CÔNG LƯƠNG - BẢO HIỂM, dành cho nhân viên hiện tại) ---

10. Thắc mắc công lương:
"💵Chào bạn, đối với trường hợp bạn có phát sinh các vấn đề liên quan đến công, lương trong tháng vui lòng liên hệ nhân viên thống kê của bộ phận đang làm việc hoặc qua trực tiếp phòng nhân sự gặp các bạn phụ trách công lương trong giờ hành chính để được hỗ trợ kịp thời nhé."

11. Địa chỉ nhà máy (định vị):
"Cayi Technology Việt Nam, KCN Yên Phong II-C, xã Tam Giang, huyện Yên Phong, tỉnh Bắc Ninh. Google maps:https://maps.app.goo.gl/e5U555PUDpUN2CZf6"

12. Yêu cầu công việc:
"Công nhân sản xuất bên mình đang tuyển dụng độ tuổi từ 18 - 45, không phân biệt nam/nữ, không yêu cầu bằng cấp, có sức khỏe tốt & biết đọc/viết tối thiểu."

13. Ký túc xá, xe đưa đón:
"Hiện tại bên mình chưa có KTX cho nhân viên lưu trú, tuy nhiên đối với nhân viên bên mình đang có xe đưa đón từ khu vực Hà Nội & TP. Bắc Ninh tới công ty làm việc."

12. Thời gian trả bảo hiểm (khi nghỉ việc):
"📋Chào bạn, sau 1 tháng kể từ thời điểm bạn nghỉ việc theo quy định, vào chiều thứ 5 hàng tuần lúc 15 giờ, Công ty sẽ tiến hành trả tờ rời quá trình tham gia bảo hiểm tại công ty (hoặc Sổ BHXH đối với nhân viên đóng lần đầu). Khi đi vui lòng mang theo Căn cước công dân (VNeID), giấy ủy quyền nếu được ủy quyền nhận thay, có mặt tại Cổng A1 nhé."
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
        const statusCode = err.response?.status;
        console.error('=== LỖI CHI TIẾT ===');
        console.error('Message:', err.message);
        console.error('Status:', statusCode);
        console.error('Response data:', JSON.stringify(err.response?.data));
        console.error('====================');

        if (statusCode === 429) {
          // Hết quota Gemini API: KHÔNG gửi tin nhắn báo lỗi cho khách,
          // để im lặng và nhân viên thật sẽ vào trả lời trực tiếp trên Messenger.
          console.error('=> Đã hết quota Gemini (429). Bỏ qua, không phản hồi tự động để nhân viên xử lý thủ công.');
        } else {
          // Các lỗi khác (lỗi kỹ thuật, mất kết nối...): vẫn báo cho khách biết để tránh im lặng hoàn toàn
          try {
            await sendMessengerMessage(senderId, 'Xin lỗi, hiện tại mình đang gặp sự cố. Bạn thử lại sau nhé!');
          } catch (sendErr) {
            console.error('Không thể gửi tin nhắn lỗi:', sendErr.message);
          }
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
  const isFirstMessage = history.length === 0; // chưa có tin nhắn nào trước đó -> đây là lượt đầu tiên
  history.push({ role: 'user', parts: [{ text: userText }] });

  let aiReply;
  try {
    aiReply = await callGemini(history, isFirstMessage);
  } catch (err) {
    // Tắt trạng thái "đang nhập..." trước khi ném lỗi lên cho nơi gọi xử lý (webhook handler)
    await sendTypingIndicator(senderId, false);
    throw err;
  }

  history.push({ role: 'model', parts: [{ text: aiReply }] });
  // Giới hạn độ dài lịch sử để tránh phình to
  conversationHistory.set(senderId, history.slice(-MAX_HISTORY_TURNS * 2));

  await sendTypingIndicator(senderId, false);
  await sendMessengerMessage(senderId, aiReply);
}

// =====================================================
// 4. GỌI GOOGLE GEMINI API
// =====================================================
async function callGemini(history, isFirstMessage) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  // Ghi chú động: chỉ cho phép chào "Chào bạn" ở tin nhắn đầu tiên,
  // các lượt sau nhắc bot đi thẳng vào nội dung, không lặp lại lời chào
  const greetingNote = isFirstMessage
    ? '\n\nLƯU Ý: Đây là tin nhắn ĐẦU TIÊN của khách trong cuộc trò chuyện này, được phép mở đầu bằng lời chào phù hợp (ví dụ "Chào bạn") nếu cần.'
    : '\n\nLƯU Ý: Đây KHÔNG PHẢI tin nhắn đầu tiên, khách đã trò chuyện trước đó rồi. TUYỆT ĐỐI KHÔNG mở đầu câu trả lời bằng "Chào bạn" hoặc bất kỳ lời chào nào tương tự nữa — hãy đi thẳng vào nội dung trả lời.';

  const response = await axios.post(url, {
    contents: history,
    systemInstruction: {
      parts: [{
        text: SYSTEM_INSTRUCTION + greetingNote
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
