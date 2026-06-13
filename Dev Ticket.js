require('dotenv').config();
const {
  Client, GatewayIntentBits, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, EmbedBuilder,
  ChannelType, AttachmentBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  UserSelectMenuBuilder, RoleSelectMenuBuilder,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const CONFIG = {
  STAFF_ROLE_ID:       process.env.STAFF_ROLE_ID,
  TICKET_TEAM_ROLE_ID: process.env.TICKET_TEAM_ROLE_ID || '1514763767928459387',
  LOG_CHANNEL_ID:      process.env.LOG_CHANNEL_ID,
  BOT_COLOR:           0xe67e22,
  STORE_NAME:          process.env.STORE_NAME || 'DEV Store',
  BANNER_URL:          process.env.BANNER_URL  || null,
  TICKETS_BANNER_URL:  process.env.TICKETS_BANNER_URL || process.env.BANNER_URL || null,

  CATEGORIES: {
    buy:         process.env.CATEGORY_BUY,
    support:     process.env.CATEGORY_SUPPORT,
    inquiry:     process.env.CATEGORY_INQUIRY,
    partnership: process.env.CATEGORY_PARTNERSHIP,
  },
};

const TYPE_LABELS = {
  buy:         '🛒 شراء منتج',
  support:     '⚡ دعم فني',
  inquiry:     '❓ استفسار عام',
  partnership: '🤝 شراكة أو تعاون',
};

const TYPE_COLORS = {
  buy:         0x2ecc71,
  support:     0xe74c3c,
  inquiry:     0x3498db,
  partnership: 0x9b59b6,
};

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'tickets_data.json');

// ─── حفظ واسترجاع البيانات ───────────────────────────────────────────────────
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch {}
  return { tickets: {}, autoClose: {}, counter: 0 };
}

function saveData() {
  const autoCloseData = {};
  for (const [channelId, info] of pendingAutoClose.entries()) {
    autoCloseData[channelId] = {
      ticketOwnerId: info.ticketOwnerId,
      activatedBy:   info.activatedBy,
      closeAt:       info.closeAt,
    };
  }
  const data = {
    tickets:   Object.fromEntries(ticketMetaStore),
    autoClose: autoCloseData,
    counter:   ticketCounter,
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const savedData       = loadData();
const ticketMetaStore = new Map(Object.entries(savedData.tickets || {}));
const pendingAutoClose = new Map();

const openTickets = new Map();
const autoCloseTimers = new Map();
let ticketCounter = savedData.counter || 0;

// ─── Helper: هل العضو من Ticket Team ───────────────────────────────────────
function hasTicketTeam(member) {
  return member.roles.cache.has(CONFIG.TICKET_TEAM_ROLE_ID) ||
         member.permissions.has(PermissionFlagsBits.Administrator);
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours} ساعة و ${minutes} دقيقة`;
  return `${minutes} دقيقة`;
}

// ─── تنسيق الوقت الفعلي (بدل الـ offset) ───────────────────────────────────
function formatDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString('ar-SA', {
    year:   'numeric',
    month:  '2-digit',
    day:    '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ─── توليد صفحة HTML للـ Transcript ─────────────────────────────────────────
function generateTranscriptHTML(channelName, messages, meta) {
  const rows = messages.map(m => {
    const time = formatDateTime(m.createdAt);
    const isBot = m.author.bot;
    const avatarColor = isBot ? '#5865f2' : '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6,'0');
    const initials = m.author.username.slice(0, 2).toUpperCase();

    const embedsHTML = m.embeds.map(e => `
      <div style="border-left:4px solid ${e.color ? '#' + e.color.toString(16).padStart(6,'0') : '#5865f2'};background:#2b2d31;border-radius:0 4px 4px 0;padding:12px 14px;margin-top:6px;max-width:520px;">
        ${e.title ? `<div style="color:#fff;font-size:15px;font-weight:700;margin-bottom:8px;">${e.title}</div>` : ''}
        ${e.description ? `<div style="color:#dbdee1;font-size:13px;margin-bottom:8px;">${e.description}</div>` : ''}
        ${e.fields.length ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">${e.fields.map(f => `
          <div>
            <div style="color:#b5bac1;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;">${f.name}</div>
            <div style="color:#dbdee1;font-size:13px;">${f.value}</div>
          </div>`).join('')}</div>` : ''}
      </div>`).join('');

    const components = m.components.map(row =>
      `<div style="display:flex;gap:8px;margin-top:8px;">${row.components.map(c => {
        const colors = { 1:'#5865f2', 2:'#4e5058', 3:'#2ecc71', 4:'#da373c' };
        return `<button style="background:${colors[c.style]||'#4e5058'};color:#fff;border:none;border-radius:4px;padding:6px 14px;font-size:13px;cursor:default;">${c.emoji?.name||''} ${c.label||''}</button>`;
      }).join('')}</div>`
    ).join('');

    return `
    <div style="display:flex;gap:14px;padding:6px 16px;${isBot?'':''}">
      <div style="width:40px;height:40px;border-radius:50%;background:${avatarColor};flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">${initials}</div>
      <div style="flex:1;">
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:3px;">
          <span style="color:#fff;font-size:15px;font-weight:600;">${m.author.username}${isBot ? ' <span style="background:#5865f2;color:#fff;font-size:9px;font-weight:700;border-radius:3px;padding:1px 5px;">APP</span>' : ''}</span>
          <span style="color:#949ba4;font-size:11px;">${time}</span>
        </div>
        ${m.content ? `<div style="color:#dbdee1;font-size:14px;line-height:1.4;">${m.content}</div>` : ''}
        ${embedsHTML}
        ${components}
      </div>
    </div>`;
  }).join('');

  const openedAt  = meta.openedAt  || '—';
  const closedAt  = meta.closedAt  || '—';
  const duration  = meta.duration  || '—';
  const userName  = meta.userName  || '—';
  const ticketNum = meta.ticketNum || '—';
  const type      = meta.type      || '—';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transcript — ${channelName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #313338; font-family: 'Segoe UI', Arial, sans-serif; color: #dbdee1; direction: rtl; }
  .header { background: #1e1f22; padding: 20px 24px; border-bottom: 1px solid #1a1b1e; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .header-title { color: #fff; font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; padding: 16px 24px; background: #2b2d31; border-bottom: 1px solid #1e1f22; }
  .meta-item { background: #313338; border-radius: 6px; padding: 10px 12px; }
  .meta-label { color: #949ba4; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
  .meta-val { color: #fff; font-size: 13px; font-weight: 500; }
  .messages { padding: 16px 0; }
  .messages > div:hover { background: #2e3035; }
  .footer { text-align: center; color: #949ba4; font-size: 12px; padding: 20px; border-top: 1px solid #1e1f22; }
</style>
</head>
<body>
<div class="header">
  <div class="header-title">🎫 Transcript — #${channelName}</div>
  <div style="color:#949ba4;font-size:13px;">📋 ${messages.length} رسالة</div>
</div>
<div class="meta-grid">
  <div class="meta-item"><div class="meta-label">👤 المستخدم</div><div class="meta-val">${userName}</div></div>
  <div class="meta-item"><div class="meta-label">🔢 رقم التكت</div><div class="meta-val">#${ticketNum}</div></div>
  <div class="meta-item"><div class="meta-label">📂 النوع</div><div class="meta-val">${type}</div></div>
  <div class="meta-item"><div class="meta-label">🕐 فُتح</div><div class="meta-val">${openedAt}</div></div>
  <div class="meta-item"><div class="meta-label">🔒 أُغلق</div><div class="meta-val">${closedAt}</div></div>
  <div class="meta-item"><div class="meta-label">⏱️ المدة</div><div class="meta-val">${duration}</div></div>
</div>
<div class="messages">
  ${rows}
</div>
<div class="footer">🎫 ${CONFIG.STORE_NAME} | نظام التذاكر</div>
</body>
</html>`;
}

// ─── إرسال اللوق ─────────────────────────────────────────────────────────────
async function sendLog(guild, data) {
  if (!CONFIG.LOG_CHANNEL_ID) return;
  const logChannel = guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
  if (!logChannel) return;

  // ── تنسيق الوقت الفعلي ──
  const openedAt = data.openedAtTimestamp
    ? formatDateTime(new Date(data.openedAtTimestamp))
    : data.openedAt || '—';
  const closedAt = formatDateTime(new Date());

  const embed = new EmbedBuilder()
    .setTitle(`🔒 تذكرة مغلقة — #${String(data.ticketNum).padStart(4, '0')}`)
    .setColor(0xda373c)
    .addFields(
      { name: '👤 المستخدم',    value: `<@${data.userId}> (${data.userName})`, inline: true },
      { name: '📂 النوع',       value: data.type,                              inline: true },
      { name: '👮 أغلقها',      value: `<@${data.closedBy}>`,                 inline: true },
      { name: '🕐 فُتحت',       value: openedAt,                               inline: true },
      { name: '🔒 أُغلقت',      value: closedAt,                               inline: true },
      { name: '⏱️ المدة',       value: data.duration,                          inline: true },
      { name: '💬 عدد الرسائل', value: `${data.messageCount}`,                 inline: true },
    )
    .setTimestamp();

  // ── زر "عرض التكت" ──
  const viewRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`view_transcript_${data.channelId || 'none'}`)
      .setLabel('عرض التكت')
      .setEmoji('📄')
      .setStyle(ButtonStyle.Secondary),
  );

  await logChannel.send({ embeds: [embed], components: [viewRow] });
}

// ─── بناء رسالة التكت الرئيسية ─────────────────────────────────────────────
function buildTicketEmbed(user, type, ticketNum, staffRoleId) {
  // ── وقت الفتح الفعلي ──
  const openedAt = formatDateTime(new Date());

  const embed = new EmbedBuilder()
    .setTitle('تم إنشاء التذكرة')
    .setColor(0xda373c)
    .addFields(
      { name: '👤 مالك التكت',    value: `<@${user.id}>`,                                   inline: false },
      { name: '🛡️ مسؤول التذاكر', value: staffRoleId ? `<@&${staffRoleId}>` : '@Team',      inline: false },
      { name: '📅 تاريخ التذكرة', value: openedAt,                                           inline: false },
      { name: '🔢 رقم التذكرة',   value: `${parseInt(ticketNum, 10)}`,                       inline: false },
      { name: '📂 قسم التذاكر',   value: TYPE_LABELS[type],                                 inline: false },
    )
    .setTimestamp()
    .setFooter({ text: `${CONFIG.STORE_NAME} | نظام التذاكر` });

  if (CONFIG.BANNER_URL) embed.setImage(CONFIG.BANNER_URL);

  return embed;
}

// ─── أزرار التكت الرئيسية ───────────────────────────────────────────────────
function buildMainRow(userId, ticketNum, type) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`close_ticket_${userId}_${ticketNum}_${type}`)
      .setLabel('Close')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`options_menu_${userId}_${ticketNum}_${type}`)
      .setLabel('الخيارات')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary),
  );
}

// ─── قائمة الخيارات ─────────────────────────────────────────────────────────
function buildOptionsRow(userId, ticketNum, type) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`options_select_${userId}_${ticketNum}_${type}`)
      .setPlaceholder('اختر الإجراء...')
      .addOptions([
        {
          label: 'reminder',
          description: 'تذكير في الخاص + داخل التكت',
          value: 'reminder',
          emoji: '🔔',
        },
        {
          label: 'Close AOT',
          description: 'إغلاق تلقائي بعد 12 ساعة مع إشعار الشخص',
          value: 'close_aot',
          emoji: '⏰',
        },
        {
          label: 'claim',
          description: 'استلام التذكرة',
          value: 'claim',
          emoji: '🛡️',
        },
        {
          label: 'Add Member',
          description: 'إضافة شخص أو رتبة للتكت',
          value: 'add_member',
          emoji: '➕',
        },
        {
          label: 'Remove Member',
          description: 'إزالة شخص أو رتبة من التكت',
          value: 'remove_member',
          emoji: '➖',
        },
      ]),
  );
}

// ─── فتح التكت ──────────────────────────────────────────────────────────────
async function createTicket(interaction, type) {
  const guild = interaction.guild;
  const user  = interaction.user;

  if (openTickets.has(user.id)) {
    const existing = guild.channels.cache.get(openTickets.get(user.id));
    if (existing) {
      return interaction.reply({ content: `❌ عندك تذكرة مفتوحة: ${existing}`, ephemeral: true });
    }
    openTickets.delete(user.id);
  }

  ticketCounter++;
  const ticketNum   = String(ticketCounter).padStart(4, '0');
  const channelName = `🟢・ticket-${ticketNum}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const categoryId  = CONFIG.CATEGORIES[type] || null;

  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  if (CONFIG.STAFF_ROLE_ID) {
    permissionOverwrites.push({
      id: CONFIG.STAFF_ROLE_ID,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  if (CONFIG.TICKET_TEAM_ROLE_ID && CONFIG.TICKET_TEAM_ROLE_ID !== CONFIG.STAFF_ROLE_ID) {
    permissionOverwrites.push({
      id: CONFIG.TICKET_TEAM_ROLE_ID,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites,
  });

  openTickets.set(user.id, channel.id);

  const embed   = buildTicketEmbed(user, type, ticketNum, CONFIG.STAFF_ROLE_ID);
  const mainRow = buildMainRow(user.id, ticketNum, type);

  const staffMention = CONFIG.STAFF_ROLE_ID ? `<@&${CONFIG.STAFF_ROLE_ID}>` : '';
  await channel.send({ content: staffMention || undefined, embeds: [embed], components: [mainRow] });

  const now = Date.now();
  channel.ticketMeta = {
    ticketNum,
    userId:          user.id,
    userName:        user.tag,
    type:            TYPE_LABELS[type],
    openedAt:        formatDateTime(new Date(now)),
    openedTimestamp: now,
    baseChannelName: `ticket-${ticketNum}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
  };

  ticketMetaStore.set(channel.id, channel.ticketMeta);
  saveData();

  await interaction.reply({ content: `✅ تم فتح تذكرتك: ${channel}`, ephemeral: true });
}

// ─── إغلاق التكت ────────────────────────────────────────────────────────────
async function closeTicket(interaction, userId, ticketNum, type) {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.channel;
  const guild   = interaction.guild;

  if (autoCloseTimers.has(channel.id)) {
    clearTimeout(autoCloseTimers.get(channel.id));
    autoCloseTimers.delete(channel.id);
  }
  pendingAutoClose.delete(channel.id);

  // ── جمع الرسائل لعمل transcript ──
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted   = [...messages.values()].reverse();
  const msgCount = sorted.filter(m => !m.author.bot).length;
  const meta     = channel.ticketMeta || ticketMetaStore.get(channel.id) || {};
  const duration = formatDuration(Date.now() - (meta.openedTimestamp || Date.now()));
  const closedAt = formatDateTime(new Date());

  // ── توليد HTML وإرسال الـ Transcript ──
  const htmlContent = generateTranscriptHTML(channel.name, sorted, {
    ...meta,
    closedAt,
    duration,
  });

  const htmlBuffer     = Buffer.from(htmlContent, 'utf-8');
  const htmlAttachment = new AttachmentBuilder(htmlBuffer, {
    name: `transcript-${channel.name}.html`,
  });

  // ── إرسال اللوق مع الـ transcript ──
  if (CONFIG.LOG_CHANNEL_ID) {
    const logChannel = guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
    if (logChannel) {
      const openedAt = meta.openedTimestamp
        ? formatDateTime(new Date(meta.openedTimestamp))
        : meta.openedAt || '—';

      const embed = new EmbedBuilder()
        .setTitle(`🔒 تذكرة مغلقة — #${String(ticketNum).padStart(4, '0')}`)
        .setColor(0xda373c)
        .addFields(
          { name: '👤 المستخدم',    value: `<@${userId}> (${meta.userName || '—'})`, inline: true },
          { name: '📂 النوع',       value: meta.type || TYPE_LABELS[type] || type,   inline: true },
          { name: '👮 أغلقها',      value: `<@${interaction.user.id}>`,              inline: true },
          { name: '🕐 فُتحت',       value: openedAt,                                  inline: true },
          { name: '🔒 أُغلقت',      value: closedAt,                                  inline: true },
          { name: '⏱️ المدة',       value: duration,                                  inline: true },
          { name: '💬 عدد الرسائل', value: `${msgCount}`,                             inline: true },
        )
        .setTimestamp();

      // ── زر "عرض التكت" ──
      const viewRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`view_transcript_done`)
          .setLabel('عرض التكت')
          .setEmoji('📄')
          .setStyle(ButtonStyle.Secondary),
      );

      await logChannel.send({
        embeds:     [embed],
        components: [viewRow],
        files:      [htmlAttachment],
      });
    }
  }

  openTickets.delete(userId);
  ticketMetaStore.delete(channel.id);
  saveData();

  const closeEmbed = new EmbedBuilder()
    .setTitle('🔒 تم إغلاق التذكرة')
    .setDescription(`تم الإغلاق بواسطة <@${interaction.user.id}>\nسيتم حذف القناة بعد 5 ثواني.`)
    .setColor(0xda373c)
    .setTimestamp();

  await interaction.editReply({ content: '✅ جارٍ إغلاق التذكرة...' });
  await channel.send({ embeds: [closeEmbed] });
  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

// ─── إغلاق تلقائي بعد 12 ساعة (Close AOT) ──────────────────────────────────
function scheduleAutoClose(channel, ticketOwnerId, activatedBy, guild, closeAt = null) {
  const TWELVE_HOURS = 12 * 60 * 60 * 1000;
  const targetTime   = closeAt || (Date.now() + TWELVE_HOURS);
  const delay        = Math.max(targetTime - Date.now(), 5000);

  if (autoCloseTimers.has(channel.id)) {
    clearTimeout(autoCloseTimers.get(channel.id));
  }

  pendingAutoClose.set(channel.id, { ticketOwnerId, activatedBy, closeAt: targetTime });
  saveData();

  const timer = setTimeout(async () => {
    autoCloseTimers.delete(channel.id);
    pendingAutoClose.delete(channel.id);
    saveData();

    const liveChannel = guild.channels.cache.get(channel.id);
    if (!liveChannel) return;

    const meta     = liveChannel.ticketMeta || ticketMetaStore.get(channel.id) || {};
    const messages = await liveChannel.messages.fetch({ limit: 100 }).catch(() => new Map());
    const sorted   = messages.size ? [...messages.values()].reverse() : [];
    const msgCount = sorted.filter(m => !m.author.bot).length;
    const duration = formatDuration(Date.now() - (meta.openedTimestamp || Date.now()));
    const closedAt = formatDateTime(new Date());

    // ── توليد HTML ──
    const htmlContent = generateTranscriptHTML(liveChannel.name, sorted, {
      ...meta, closedAt, duration,
    });
    const htmlBuffer     = Buffer.from(htmlContent, 'utf-8');
    const htmlAttachment = new AttachmentBuilder(htmlBuffer, {
      name: `transcript-${liveChannel.name}.html`,
    });

    if (CONFIG.LOG_CHANNEL_ID) {
      const logChannel = guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
      if (logChannel) {
        const openedAt = meta.openedTimestamp
          ? formatDateTime(new Date(meta.openedTimestamp))
          : meta.openedAt || '—';

        const embed = new EmbedBuilder()
          .setTitle(`🔒 تذكرة مغلقة تلقائياً — #${String(meta.ticketNum || '????').padStart(4, '0')}`)
          .setColor(0xda373c)
          .addFields(
            { name: '👤 المستخدم',    value: `<@${ticketOwnerId}> (${meta.userName || '—'})`, inline: true },
            { name: '📂 النوع',       value: meta.type || '—',                                 inline: true },
            { name: '👮 أغلقها',      value: `<@${activatedBy}> (تلقائي)`,                    inline: true },
            { name: '🕐 فُتحت',       value: openedAt,                                          inline: true },
            { name: '🔒 أُغلقت',      value: closedAt,                                          inline: true },
            { name: '⏱️ المدة',       value: duration,                                          inline: true },
            { name: '💬 عدد الرسائل', value: `${msgCount}`,                                     inline: true },
          )
          .setTimestamp();

        const viewRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`view_transcript_done`)
            .setLabel('عرض التكت')
            .setEmoji('📄')
            .setStyle(ButtonStyle.Secondary),
        );

        await logChannel.send({
          embeds:     [embed],
          components: [viewRow],
          files:      [htmlAttachment],
        });
      }
    }

    openTickets.delete(ticketOwnerId);
    ticketMetaStore.delete(channel.id);
    saveData();

    const autoCloseEmbed = new EmbedBuilder()
      .setTitle('⏰ تم إغلاق التذكرة تلقائياً')
      .setDescription('تم إغلاق التذكرة تلقائياً بعد 12 ساعة.\nسيتم حذف القناة بعد 5 ثواني.')
      .setColor(0xda373c)
      .setTimestamp();

    await liveChannel.send({ embeds: [autoCloseEmbed] }).catch(() => {});
    setTimeout(() => liveChannel.delete().catch(() => {}), 5000);
  }, delay);

  autoCloseTimers.set(channel.id, timer);
}

// ─── Interactions ────────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {

  // ── فتح التكت من القائمة ──
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type') {
    return createTicket(interaction, interaction.values[0]);
  }

  // ── أزرار ──
  if (interaction.isButton()) {
    const id = interaction.customId;

    // إغلاق التكت (زر Close الرئيسي)
    if (id.startsWith('close_ticket_')) {
      const parts = id.split('_');
      return closeTicket(interaction, parts[2], parts[3], parts[4]);
    }

    // زر "عرض التكت" في اللوق — يرسل الـ transcript للشخص في الخاص
    if (id.startsWith('view_transcript_')) {
      await interaction.deferReply({ ephemeral: true });
      // الـ transcript موجود كملف مرفق في نفس الرسالة
      const attachment = interaction.message.attachments.first();
      if (attachment) {
        return interaction.editReply({
          content: '📄 هذا هو سجل التكت:',
          files: [attachment.url],
        });
      }
      return interaction.editReply({ content: '❌ لا يوجد سجل لهذا التكت.' });
    }

    // فتح قائمة الخيارات
    if (id.startsWith('options_menu_')) {
      if (!hasTicketTeam(interaction.member)) {
        return interaction.reply({
          content: '❌ ليس لديك الإذن لاستخدام هذا.',
          ephemeral: true,
        });
      }

      const parts      = id.split('_');
      const userId     = parts[2];
      const ticketNum  = parts[3];
      const type       = parts[4];
      const optionsRow = buildOptionsRow(userId, ticketNum, type);

      return interaction.reply({
        content: '⚙️ **خيارات التذكرة** — اختر الإجراء:',
        components: [optionsRow],
        ephemeral: true,
      });
    }
  }

  // ── قائمة الخيارات (Select) ──
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('options_select_')) {

    if (!hasTicketTeam(interaction.member)) {
      return interaction.reply({
        content: '❌ ليس لديك الإذن لاستخدام هذا.',
        ephemeral: true,
      });
    }

    const parts         = interaction.customId.split('_');
    const ticketOwnerId = parts[2];
    const ticketNum     = parts[3];
    const selected      = interaction.values[0];
    const channel       = interaction.channel;

    // ── reminder ──
    if (selected === 'reminder') {
      const owner = await interaction.guild.members.fetch(ticketOwnerId).catch(() => null);

      const internalEmbed = new EmbedBuilder()
        .setTitle('⚠️ تنبيه إغلاق التذكرة')
        .setDescription(
          `سيتم إغلاق التذكرة الخاصة بك **خلال 21 ساعة** وذلك لعدم استجابتك أو للتأكد من أن كل شيء على ما يرام.\nإذا قمت بالرد، سيتم إلغاء الإغلاق التلقائي.`
        )
        .setColor(0xe74c3c)
        .setTimestamp();

      await channel.send({ content: owner ? `<@${ticketOwnerId}>` : undefined, embeds: [internalEmbed] });

      if (owner) {
        const dmEmbed = new EmbedBuilder()
          .setTitle(`📢 تذكير من متجر ${CONFIG.STORE_NAME}`)
          .setDescription(
            `الرجاء من العميل <@${ticketOwnerId}>\n\n` +
            `الرجاء العودة إلى التكت والرد.\n\n` +
            `التكت: ${channel}\n\n` +
            `بالتوفيق 🤍`
          )
          .setColor(0xe74c3c)
          .setTimestamp();

        await owner.send({ embeds: [dmEmbed] }).catch(() => {});
      }

      return interaction.reply({ content: '✅ تم إرسال التذكير في الخاص وداخل التكت.', ephemeral: true });
    }

    // ── Close AOT ──
    if (selected === 'close_aot') {
      const owner = await interaction.guild.members.fetch(ticketOwnerId).catch(() => null);
      const closeTime = `<t:${Math.floor((Date.now() + 12 * 60 * 60 * 1000) / 1000)}:R>`;

      const internalEmbed = new EmbedBuilder()
        .setTitle('⏰ تم تفعيل الإغلاق التلقائي')
        .setDescription(
          `تم تفعيل الإغلاق التلقائي بواسطة <@${interaction.user.id}>\n\n` +
          `سيتم إغلاق هذه التذكرة تلقائياً ${closeTime}.`
        )
        .setColor(0xe67e22)
        .setTimestamp();

      await channel.send({ content: `<@${ticketOwnerId}>`, embeds: [internalEmbed] });

      if (owner) {
        const dmEmbed = new EmbedBuilder()
          .setTitle(`⏰ إشعار من متجر ${CONFIG.STORE_NAME}`)
          .setDescription(
            `مرحباً <@${ticketOwnerId}> 👋\n\n` +
            `تم تفعيل **الإغلاق التلقائي** على تذكرتك.\n` +
            `سيتم إغلاق التذكرة تلقائياً بعد **12 ساعة** إن لم يتم الرد.\n\n` +
            `التكت: ${channel}\n\n` +
            `إذا كنت بحاجة لمساعدة، يرجى الرد في التكت في أقرب وقت. 🤍`
          )
          .setColor(0xe67e22)
          .setTimestamp()
          .setFooter({ text: `${CONFIG.STORE_NAME} | نظام التذاكر` });

        await owner.send({ embeds: [dmEmbed] }).catch(() => {});
      }

      scheduleAutoClose(channel, ticketOwnerId, interaction.user.id, interaction.guild);

      return interaction.reply({
        content: '✅ تم تفعيل الإغلاق التلقائي بعد 12 ساعة وتم إشعار الشخص في الخاص.',
        ephemeral: true,
      });
    }

    // ── claim ──
    if (selected === 'claim') {
      const claimEmbed = new EmbedBuilder()
        .setDescription(`🛡️ تم استلام التذكرة بواسطة <@${interaction.user.id}>`)
        .setColor(0x2ecc71)
        .setTimestamp();

      await channel.send({ embeds: [claimEmbed] });

      const meta = channel.ticketMeta || {};
      const baseName = meta.baseChannelName || channel.name.replace(/^[^a-z0-9・]*[・-]?/, '');
      await channel.setName(`🟡・${baseName}`).catch(() => {});

      return interaction.reply({ content: '✅ تم استلام التذكرة.', ephemeral: true });
    }

    // ── Add Member ──
    if (selected === 'add_member') {
      const userRow = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`add_user_${channel.id}`)
          .setPlaceholder('اختر الشخص لإضافته...')
          .setMinValues(1)
          .setMaxValues(1),
      );

      return interaction.reply({
        content: '➕ اختر الشخص الذي تريد إضافته للتكت:',
        components: [userRow],
        ephemeral: true,
      });
    }

    // ── Remove Member ──
    if (selected === 'remove_member') {
      const userRow = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`remove_user_${channel.id}`)
          .setPlaceholder('اختر الشخص لإزالته...')
          .setMinValues(1)
          .setMaxValues(1),
      );

      return interaction.reply({
        content: '➖ اختر الشخص الذي تريد إزالته من التكت:',
        components: [userRow],
        ephemeral: true,
      });
    }
  }

  // ── Add User Select ──
  if (interaction.isUserSelectMenu() && interaction.customId.startsWith('add_user_')) {
    if (!hasTicketTeam(interaction.member)) {
      return interaction.reply({ content: '❌ ليس لديك الإذن لاستخدام هذا.', ephemeral: true });
    }

    const channelId = interaction.customId.replace('add_user_', '');
    const target    = interaction.guild.channels.cache.get(channelId);
    const user      = interaction.users.first();

    if (!target || !user) return interaction.reply({ content: '❌ حدث خطأ.', ephemeral: true });

    await target.permissionOverwrites.edit(user.id, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
    });

    await target.send({
      embeds: [new EmbedBuilder()
        .setDescription(`✅ تم إضافة <@${user.id}> للتذكرة بواسطة <@${interaction.user.id}>.`)
        .setColor(0x2ecc71)],
    });

    return interaction.reply({ content: `✅ تم إضافة <@${user.id}>.`, ephemeral: true });
  }

  // ── Remove User Select ──
  if (interaction.isUserSelectMenu() && interaction.customId.startsWith('remove_user_')) {
    if (!hasTicketTeam(interaction.member)) {
      return interaction.reply({ content: '❌ ليس لديك الإذن لاستخدام هذا.', ephemeral: true });
    }

    const channelId = interaction.customId.replace('remove_user_', '');
    const target    = interaction.guild.channels.cache.get(channelId);
    const user      = interaction.users.first();

    if (!target || !user) return interaction.reply({ content: '❌ حدث خطأ.', ephemeral: true });

    await target.permissionOverwrites.edit(user.id, { ViewChannel: false });

    await target.send({
      embeds: [new EmbedBuilder()
        .setDescription(`✅ تم إزالة <@${user.id}> من التذكرة بواسطة <@${interaction.user.id}>.`)
        .setColor(0xda373c)],
    });

    return interaction.reply({ content: `✅ تم إزالة <@${user.id}>.`, ephemeral: true });
  }
});

// ─── مراقبة الرسائل لإلغاء Close AOT ────────────────────────────────────────
client.on('messageCreate', async msg => {
  if (msg.author.bot) return;

  if (autoCloseTimers.has(msg.channel.id)) {
    const meta = msg.channel.ticketMeta || ticketMetaStore.get(msg.channel.id);
    if (meta && msg.author.id === meta.userId) {
      clearTimeout(autoCloseTimers.get(msg.channel.id));
      autoCloseTimers.delete(msg.channel.id);
      pendingAutoClose.delete(msg.channel.id);
      saveData();

      const cancelEmbed = new EmbedBuilder()
        .setDescription('✅ تم إلغاء الإغلاق التلقائي بسبب رد صاحب التذكرة.')
        .setColor(0x2ecc71)
        .setTimestamp();

      await msg.channel.send({ embeds: [cancelEmbed] }).catch(() => {});
    }
  }

  // ── !panel ──
  if (msg.content.toLowerCase() === '!panel') {
    if (!msg.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return msg.reply('❌ ما عندك صلاحية.');

    await msg.delete().catch(() => {});

    const mainEmbed = new EmbedBuilder()
      .setTitle(`${CONFIG.STORE_NAME} - Contact Us`)
      .setDescription(
        '**How to Open a Ticket**\n' +
        '1. **Choose topic:** Pick the matching option.\n' +
        '2. **Channel created:** A private channel is created for you.\n' +
        '3. **Support:** The support team will help you shortly.\n\n' +
        '**Work Hours**\n' +
        '```\n' +
        '► Status:    Online\n' +
        '► Shift:     24 Hours\n' +
        '► Response:  5 - 45 Minutes\n' +
        '```\n' +
        'Choose the right section from the menu:'
      )
      .setColor(CONFIG.BOT_COLOR)
      .setFooter({ text: `${CONFIG.STORE_NAME} | نظام التذاكر` });

    if (CONFIG.TICKETS_BANNER_URL) mainEmbed.setImage(CONFIG.TICKETS_BANNER_URL);

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_type')
      .setPlaceholder('Select ticket type...')
      .addOptions([
        { label: 'شراء منتج',      description: 'لشراء أي منتج من المتجر',   value: 'buy',         emoji: '🛒' },
        { label: 'دعم فني',        description: 'مشكلة في منتج اشتريته',     value: 'support',     emoji: '⚡' },
        { label: 'استفسار عام',    description: 'سؤال أو استفسار',           value: 'inquiry',     emoji: '❓' },
        { label: 'شراكة أو تعاون', description: 'عروض الشراكة والتعاون',    value: 'partnership', emoji: '🤝' },
      ]);

    const row = new ActionRowBuilder().addComponents(menu);
    await msg.channel.send({ embeds: [mainEmbed], components: [row] });
  }
});

client.once('ready', async () => {
  console.log(`✅ البوت شغّال: ${client.user.tag}`);

  const saved = loadData();
  if (saved.autoClose && Object.keys(saved.autoClose).length > 0) {
    console.log(`⏰ استعادة ${Object.keys(saved.autoClose).length} مؤقت إغلاق تلقائي...`);

    for (const [channelId, info] of Object.entries(saved.autoClose)) {
      const channel = client.channels.cache.get(channelId);
      if (!channel) continue;

      const meta = saved.tickets[channelId];
      if (meta) channel.ticketMeta = meta;

      const guild = channel.guild;
      pendingAutoClose.set(channelId, info);
      scheduleAutoClose(channel, info.ticketOwnerId, info.activatedBy, guild, info.closeAt);
      console.log(`  ↻ قناة ${channel.name} — إغلاق ${new Date(info.closeAt).toLocaleString('ar-SA')}`);
    }
  }
});

client.login(process.env.BOT_TOKEN);
