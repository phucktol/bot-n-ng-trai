// index.js — Bot Nông Trại có Volume + hệ thống mời bạn bè (referral)
require('dotenv').config();
const fsSync = require('fs');
const { Bot, InlineKeyboard } = require('grammy');

const bot = new Bot(process.env.BOT_TOKEN);

// ====== Lưu dữ liệu vào file farms.json ======
const DATA_DIR = fsSync.existsSync('/app') ? '/app/data' : '.';
if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });
const DATA_FILE = `${DATA_DIR}/farms.json`;

let farms = {};
if (fsSync.existsSync(DATA_FILE)) {
  try {
    farms = JSON.parse(fsSync.readFileSync(DATA_FILE, 'utf-8'));
    console.log('✅ Đã tải dữ liệu cũ từ farms.json');
  } catch (e) {
    console.log('⚠️ File farms.json bị lỗi, tạo dữ liệu mới');
    farms = {};
  }
}

function saveFarms() {
  fsSync.writeFileSync(DATA_FILE, JSON.stringify(farms, null, 2), 'utf-8');
}

// Phần thưởng referral
const REFERRAL_BONUS_NEW_USER = 50;   // người được mời nhận thêm
const REFERRAL_BONUS_REFERRER = 30;   // người mời nhận

// userId truyền vào dạng string vì key object trong JS luôn là string
function getFarm(userId, referredBy = null) {
  const key = String(userId);
  if (!farms[key]) {
    const startMoney = referredBy ? 100 + REFERRAL_BONUS_NEW_USER : 100;
    farms[key] = {
      money: startMoney,
      plots: [
        { crop: null, plantedAt: null },
        { crop: null, plantedAt: null },
        { crop: null, plantedAt: null },
      ],
      referredBy: referredBy,   // ai đã mời người này
      referralCount: 0,          // người này đã mời được bao nhiêu người
    };

    // Nếu có người mời hợp lệ, thưởng cho người mời
    if (referredBy && farms[String(referredBy)] && String(referredBy) !== key) {
      farms[String(referredBy)].money += REFERRAL_BONUS_REFERRER;
      farms[String(referredBy)].referralCount += 1;
    }

    saveFarms();
  }
  return farms[key];
}

// Loại cây: thời gian trồng (giây) và giá bán
const CROPS = {
  carrot: { name: '🥕 Cà rốt', growTime: 30, sellPrice: 15, cost: 5 },
  wheat: { name: '🌾 Lúa mì', growTime: 60, sellPrice: 35, cost: 10 },
};

// ====== Hàm vẽ giao diện nông trại bằng text ======
function renderFarm(userId) {
  const farm = getFarm(userId);
  let text = `🌱 *Nông trại của bạn*\n💰 Tiền: ${farm.money}\n👥 Đã mời: ${farm.referralCount} người\n\n`;

  const keyboard = new InlineKeyboard();

  farm.plots.forEach((plot, i) => {
    if (!plot.crop) {
      text += `Ô ${i + 1}: [Trống]\n`;
      keyboard.text(`🌱 Trồng ở ô ${i + 1}`, `plant_${i}`).row();
    } else {
      const cropInfo = CROPS[plot.crop];
      const elapsed = (Date.now() - plot.plantedAt) / 1000;
      const remaining = Math.max(0, cropInfo.growTime - elapsed);

      if (remaining <= 0) {
        text += `Ô ${i + 1}: ${cropInfo.name} — ✅ Sẵn sàng thu hoạch!\n`;
        keyboard.text(`🌾 Thu hoạch ô ${i + 1}`, `harvest_${i}`).row();
      } else {
        text += `Ô ${i + 1}: ${cropInfo.name} — ⏳ còn ${Math.ceil(remaining)}s\n`;
      }
    }
  });

  keyboard.text('👥 Mời bạn bè', 'invite').row();
  keyboard.text('🔄 Làm mới', 'refresh');
  return { text, keyboard };
}

// ====== Lệnh /start (có xử lý link mời bạn) ======
bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  const key = String(userId);
  const payload = ctx.match; // phần sau ?start= trong link, vd: "123456789"

  const isNewUser = !farms[key];
  const referredBy = payload && /^\d+$/.test(payload) ? payload : null;

  const farm = getFarm(userId, referredBy);

  if (isNewUser && referredBy && String(referredBy) !== key) {
    await ctx.reply(`🎉 Bạn được tặng thêm ${REFERRAL_BONUS_NEW_USER} tiền vì được mời vào nông trại!`);
  }

  const { text, keyboard } = renderFarm(userId);
  await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
});

// ====== Bấm nút "Mời bạn bè" ======
bot.callbackQuery('invite', async (ctx) => {
  const botUsername = ctx.me.username;
  const link = `https://t.me/${botUsername}?start=${ctx.from.id}`;
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `👥 *Mời bạn bè vào nông trại*\n\n` +
    `Gửi link này cho bạn bè. Mỗi người tham gia qua link của bạn:\n` +
    `• Bạn nhận +${REFERRAL_BONUS_REFERRER} tiền\n` +
    `• Bạn của bạn nhận +${REFERRAL_BONUS_NEW_USER} tiền\n\n` +
    `🔗 \`${link}\``,
    { parse_mode: 'Markdown' }
  );
});

// ====== Bấm nút "Làm mới" ======
bot.callbackQuery('refresh', async (ctx) => {
  const { text, keyboard } = renderFarm(ctx.from.id);
  await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
  await ctx.answerCallbackQuery();
});

// ====== Bấm nút "Trồng cây" — cho chọn loại cây ======
bot.callbackQuery(/plant_(\d+)/, async (ctx) => {
  const plotIndex = Number(ctx.match[1]);
  const keyboard = new InlineKeyboard();
  Object.entries(CROPS).forEach(([key, crop]) => {
    keyboard.text(`${crop.name} (${crop.cost} tiền)`, `confirm_${plotIndex}_${key}`).row();
  });
  keyboard.text('⬅️ Quay lại', 'refresh');
  await ctx.editMessageText('Chọn cây muốn trồng:', { reply_markup: keyboard });
  await ctx.answerCallbackQuery();
});

// ====== Xác nhận trồng cây ======
bot.callbackQuery(/confirm_(\d+)_(\w+)/, async (ctx) => {
  const plotIndex = Number(ctx.match[1]);
  const cropKey = ctx.match[2];
  const farm = getFarm(ctx.from.id);
  const cropInfo = CROPS[cropKey];

  if (farm.money < cropInfo.cost) {
    await ctx.answerCallbackQuery({ text: 'Không đủ tiền!', show_alert: true });
    return;
  }

  farm.money -= cropInfo.cost;
  farm.plots[plotIndex] = { crop: cropKey, plantedAt: Date.now() };
  saveFarms();

  const { text, keyboard } = renderFarm(ctx.from.id);
  await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
  await ctx.answerCallbackQuery({ text: `Đã trồng ${cropInfo.name}!` });
});

// ====== Thu hoạch ======
bot.callbackQuery(/harvest_(\d+)/, async (ctx) => {
  const plotIndex = Number(ctx.match[1]);
  const farm = getFarm(ctx.from.id);
  const plot = farm.plots[plotIndex];

  if (!plot.crop) {
    await ctx.answerCallbackQuery();
    return;
  }

  const cropInfo = CROPS[plot.crop];
  const elapsed = (Date.now() - plot.plantedAt) / 1000;

  if (elapsed < cropInfo.growTime) {
    await ctx.answerCallbackQuery({ text: 'Cây chưa chín!', show_alert: true });
    return;
  }

  farm.money += cropInfo.sellPrice;
  farm.plots[plotIndex] = { crop: null, plantedAt: null };
  saveFarms();

  const { text, keyboard } = renderFarm(ctx.from.id);
  await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
  await ctx.answerCallbackQuery({ text: `+${cropInfo.sellPrice} tiền!` });
});

// ====== Khởi động bot ======
bot.start();
console.log('🌾 Bot nông trại đang chạy... (có hệ thống mời bạn bè)');