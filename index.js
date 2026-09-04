// index.js — Bot Nông Trại có lưu dữ liệu vĩnh viễn (file JSON)
require('dotenv').config();
const fs = require('fs');
const { Bot, InlineKeyboard } = require('grammy');

const bot = new Bot(process.env.BOT_TOKEN);

// ====== Lưu dữ liệu vào file farms.json thay vì chỉ lưu RAM ======
const DATA_FILE = './farms.json';

// Đọc dữ liệu từ file lúc bot khởi động (nếu file chưa có, dùng object rỗng)
let farms = {};
if (fs.existsSync(DATA_FILE)) {
  try {
    farms = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    console.log('✅ Đã tải dữ liệu cũ từ farms.json');
  } catch (e) {
    console.log('⚠️ File farms.json bị lỗi, tạo dữ liệu mới');
    farms = {};
  }
}

// Hàm lưu dữ liệu xuống file — gọi mỗi khi có thay đổi
function saveFarms() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(farms, null, 2), 'utf-8');
}

function getFarm(userId) {
  if (!farms[userId]) {
    farms[userId] = {
      money: 100,
      plots: [
        { crop: null, plantedAt: null },
        { crop: null, plantedAt: null },
        { crop: null, plantedAt: null },
      ],
    };
    saveFarms(); // lưu ngay khi tạo người chơi mới
  }
  return farms[userId];
}

// Loại cây: thời gian trồng (giây) và giá bán
const CROPS = {
  carrot: { name: '🥕 Cà rốt', growTime: 30, sellPrice: 15, cost: 5 },
  wheat: { name: '🌾 Lúa mì', growTime: 60, sellPrice: 35, cost: 10 },
};

// ====== Hàm vẽ giao diện nông trại bằng text ======
function renderFarm(userId) {
  const farm = getFarm(userId);
  let text = `🌱 *Nông trại của bạn*\n💰 Tiền: ${farm.money}\n\n`;

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

  keyboard.text('🔄 Làm mới', 'refresh');
  return { text, keyboard };
}

// ====== Lệnh /start ======
bot.command('start', async (ctx) => {
  const { text, keyboard } = renderFarm(ctx.from.id);
  await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
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
  saveFarms(); // 💾 lưu ngay sau khi trồng

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
  saveFarms(); // 💾 lưu ngay sau khi thu hoạch

  const { text, keyboard } = renderFarm(ctx.from.id);
  await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
  await ctx.answerCallbackQuery({ text: `+${cropInfo.sellPrice} tiền!` });
});

// ====== Khởi động bot ======
bot.start();
console.log('🌾 Bot nông trại đang chạy... (dữ liệu lưu vào farms.json)');