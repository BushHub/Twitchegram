const DEFAULT_CONFIG = {
    channel: 'kisyalev',
    fontSize: 14,
    timeSize: 10,
    maxWidth: 400,
    padding: 6,
    opacity: 100,
    showAvatars: true,
    txtStreamer: 'Стример',
    txtMod: 'Модератор',
    txtVip: 'VIP',
    pinType: 'tg',
    pinned: null,
    use7tvProxy: true,
    messageLifetime: 0, // 0 = не скрывать
    useLinkSpoiler: true,
    bubbleColor: '#182533',
    textColor: '#f5f5f5',
    theme: 'light',
    // Новые параметры v7.5.0
    fontFamily: 'system',
    pinBgColor: '#ffffff',
    pinTextColor: '#1c1c1c',
    pinOpacity: 100,
    pinFontSize: 13,
    outgoingEnabled: false,
    outgoingSync: true,
    outgoingBubbleColor: '#2b5278',
    outgoingTextColor: '#f5f5f5',
    incomingMargin: 0,
    outgoingMargin: 0
};

const FONT_MAP = {
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    inter: '"Inter", sans-serif',
    roboto: '"Roboto", sans-serif',
    montserrat: '"Montserrat", sans-serif',
    nunito: '"Nunito", sans-serif',
    play: '"Play", sans-serif'
};

const OUTGOING_DEFAULTS = {
    '#182533': { bubble: '#2b5278', text: '#f5f5f5' }, // Telegram Dark
    '#eef2f6': { bubble: '#effdde', text: '#1c1c1c' }, // Telegram Light
    '#2b5278': { bubble: '#1c3e5d', text: '#f5f5f5' }, // Telegram Classic Green
    '#2d2522': { bubble: '#443632', text: '#f5ebd6' }, // Cozy Peach
    '#e2f3eb': { bubble: '#cdeee1', text: '#1c2d24' }  // Retro Mint
};

function isLightColor(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return false;
    const luma = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
    return luma > 180;
}

let config = { ...DEFAULT_CONFIG };

let customEmoteMap = {};
let avatarCache = {};

if (localStorage.getItem('tg_twitch_config_v7')) {
    try {
        const loaded = JSON.parse(localStorage.getItem('tg_twitch_config_v7'));
        config = { ...config, ...loaded };
    } catch (e) {}
}

document.documentElement.setAttribute('data-theme', config.theme || 'dark');

// Функция проксирования 7TV ресурсов для обхода блокировок в РФ
function proxyUrl(url) {
    if (!config.use7tvProxy) return url;
    if (!url) return url;
    
    // Проксирование запросов к API 7TV, Decapi и IVR
    if ((url.includes('7tv.io') && (url.includes('/emote-sets/') || url.includes('/users/'))) || url.includes('decapi.me') || url.includes('ivr.fi')) {
        return 'https://corsproxy.io/?' + encodeURIComponent(url);
    }
    // Проксирование картинок 7TV через зеркало-оптимизатор wsrv.nl (вместо заблокированного в РФ images.weserv.nl)
    if (url.includes('7tv.app') || url.includes('7tv.io')) {
        const clean = url.replace(/^https?:\/\//, '');
        return 'https://wsrv.nl/?url=' + encodeURIComponent(clean);
    }
    return url;
}

// Синхронизация между вкладками
window.addEventListener('storage', (e) => {
    if (e.key === 'tg_twitch_config_v7' && e.newValue) {
        try {
            const oldChannel = config.channel;
            config = JSON.parse(e.newValue);
            applyConfigStyles();
            updatePinDisplay();
            if (oldChannel !== config.channel) { window.location.reload(); }
        } catch (err) {}
    }
});

// ПЕРЕКЛЮЧАТЕЛИ ОВЕРЛЕЯ (ШЕСТЕРЕНКИ)
function openAdminPanel() {
    setupAdminFields();
    document.getElementById('config-view').style.display = 'block';
}

function closeAdminPanel() {
    document.getElementById('config-view').style.display = 'none';
    document.documentElement.setAttribute('data-theme', config.theme || 'dark');
}

// Кастомный confirm (native confirm() заблокирован в OBS Browser Source)
function showConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        document.getElementById('confirm-msg-text').textContent = message;
        modal.classList.add('open');

        const okBtn = document.getElementById('confirm-btn-ok');
        const cancelBtn = document.getElementById('confirm-btn-cancel');
        const backdrop = document.getElementById('confirm-backdrop');

        function cleanup(result) {
            modal.classList.remove('open');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            backdrop.removeEventListener('click', onCancel);
            resolve(result);
        }
        function onOk() { cleanup(true); }
        function onCancel() { cleanup(false); }

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        backdrop.addEventListener('click', onCancel);
    });
}

// Toggle-группа (заменяет <select> для совместимости с OBS)
window.setToggle = function(groupId, value) {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === value);
    });
    if (groupId === 'adm-theme') {
        document.documentElement.setAttribute('data-theme', value);
    }
};

function getToggleValue(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return null;
    const active = group.querySelector('.toggle-btn.active');
    return active ? active.dataset.value : null;
}

// Синхронизация свотча с hex-инпутом
function syncColorSwatch(inputId, swatchId) {
    const input = document.getElementById(inputId);
    const swatch = document.getElementById(swatchId);
    if (!input || !swatch) return;
    const update = () => {
        const val = input.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(val)) swatch.style.background = val;
    };
    if (input._swatchListener) input.removeEventListener('input', input._swatchListener);
    input._swatchListener = update;
    input.addEventListener('input', update);
    update();
}

window.applyPreset = function(bubbleColor, textColor) {
    document.getElementById('adm-bubble-color').value = bubbleColor;
    document.getElementById('adm-text-color').value = textColor;
    syncColorSwatch('adm-bubble-color', 'swatch-bubble');
    syncColorSwatch('adm-text-color', 'swatch-text');
};

window.toggleOutgoingSection = function() {
    const enabled = document.getElementById('adm-outgoing-enabled').checked;
    document.getElementById('outgoing-sub-options').style.display = enabled ? 'block' : 'none';
    const outgoingMarginGroup = document.getElementById('group-outgoing-margin');
    if (outgoingMarginGroup) {
        outgoingMarginGroup.style.display = enabled ? 'block' : 'none';
    }
};

window.toggleOutgoingColors = function() {
    const sync = document.getElementById('adm-outgoing-sync').checked;
    document.getElementById('outgoing-color-row').style.display = sync ? 'none' : 'flex';
};

function setupAdminFields() {
    document.getElementById('adm-channel').value = config.channel;
    document.getElementById('adm-font-size').value = config.fontSize;
    document.getElementById('adm-time-size').value = config.timeSize;
    document.getElementById('adm-max-width').value = config.maxWidth;
    document.getElementById('adm-padding').value = config.padding;
    document.getElementById('adm-opacity').value = config.opacity;
    document.getElementById('adm-avatars').checked = config.showAvatars;
    document.getElementById('adm-role-broadcaster').value = config.txtStreamer;
    document.getElementById('adm-role-moderator').value = config.txtMod;
    document.getElementById('adm-role-vip').value = config.txtVip;
    setToggle('adm-pin-type', config.pinType || 'tg');
    
    // Новые поля
    document.getElementById('adm-proxy').checked = config.use7tvProxy;
    document.getElementById('adm-lifetime').value = config.messageLifetime;
    
    // Phase 4 fields
    document.getElementById('adm-spoiler').checked = config.useLinkSpoiler;
    document.getElementById('adm-bubble-color').value = config.bubbleColor || '#182533';
    document.getElementById('adm-text-color').value = config.textColor || '#f5f5f5';
    syncColorSwatch('adm-bubble-color', 'swatch-bubble');
    syncColorSwatch('adm-text-color', 'swatch-text');
    
    // Phase 5 fields
    setToggle('adm-theme', config.theme || 'light');

    // v7.5.0 новые поля закрепа
    document.getElementById('adm-pin-bg-color').value = config.pinBgColor || '#ffffff';
    document.getElementById('adm-pin-text-color').value = config.pinTextColor || '#1c1c1c';
    document.getElementById('adm-pin-opacity').value = config.pinOpacity || 100;
    document.getElementById('adm-pin-font-size').value = config.pinFontSize || 13;
    syncColorSwatch('adm-pin-bg-color', 'swatch-pin-bg');
    syncColorSwatch('adm-pin-text-color', 'swatch-pin-text');

    // v7.5.0 новые поля шрифтов
    setToggle('adm-font-family', config.fontFamily || 'system');

    // v7.5.0 новые поля сообщений стримера
    document.getElementById('adm-outgoing-enabled').checked = config.outgoingEnabled || false;
    document.getElementById('adm-outgoing-sync').checked = config.outgoingSync !== false;
    document.getElementById('adm-outgoing-bubble-color').value = config.outgoingBubbleColor || '#2b5278';
    document.getElementById('adm-outgoing-text-color').value = config.outgoingTextColor || '#f5f5f5';
    syncColorSwatch('adm-outgoing-bubble-color', 'swatch-outgoing-bubble');
    syncColorSwatch('adm-outgoing-text-color', 'swatch-outgoing-text');

    // v7.5.0 новые поля отступов входящих/исходящих
    document.getElementById('adm-incoming-margin').value = config.incomingMargin || 0;
    document.getElementById('adm-outgoing-margin').value = config.outgoingMargin || 0;

    document.getElementById('adm-max-width').oninput = function() { document.getElementById('val-max-width').innerText = this.value + 'px'; }
    document.getElementById('adm-padding').oninput = function() { document.getElementById('val-padding').innerText = this.value + 'px'; }
    document.getElementById('adm-opacity').oninput = function() { document.getElementById('val-opacity').innerText = this.value + '%'; }
    document.getElementById('adm-lifetime').oninput = function() { 
        document.getElementById('val-lifetime').innerText = this.value === '0' ? 'Отключено' : this.value + ' сек'; 
    }
    document.getElementById('adm-pin-opacity').oninput = function() { document.getElementById('val-pin-opacity').innerText = this.value + '%'; }
    document.getElementById('adm-incoming-margin').oninput = function() { document.getElementById('val-incoming-margin').innerText = this.value + 'px'; }
    document.getElementById('adm-outgoing-margin').oninput = function() { document.getElementById('val-outgoing-margin').innerText = this.value + 'px'; }
    
    document.getElementById('adm-max-width').oninput();
    document.getElementById('adm-padding').oninput();
    document.getElementById('adm-opacity').oninput();
    document.getElementById('adm-lifetime').oninput();
    document.getElementById('adm-pin-opacity').oninput();
    document.getElementById('adm-incoming-margin').oninput();
    document.getElementById('adm-outgoing-margin').oninput();

    // Скрытие/показ опций исходящих сообщений стримера
    toggleOutgoingSection();
    toggleOutgoingColors();
    
    document.documentElement.setAttribute('data-theme', config.theme || 'light');
}

function adminSave() {
    config.channel = document.getElementById('adm-channel').value.trim().toLowerCase() || 'kisyalev';
    config.fontSize = parseInt(document.getElementById('adm-font-size').value) || 14;
    config.timeSize = parseInt(document.getElementById('adm-time-size').value) || 10;
    config.maxWidth = parseInt(document.getElementById('adm-max-width').value) || 400;
    config.padding = parseInt(document.getElementById('adm-padding').value) || 6;
    config.opacity = parseInt(document.getElementById('adm-opacity').value) || 100;
    config.showAvatars = document.getElementById('adm-avatars').checked;
    config.txtStreamer = document.getElementById('adm-role-broadcaster').value.trim() || 'Стример';
    config.txtMod = document.getElementById('adm-role-moderator').value.trim() || 'Модератор';
    config.txtVip = document.getElementById('adm-role-vip').value.trim() || 'VIP';
    config.pinType = getToggleValue('adm-pin-type') || 'tg';
    
    // Новые поля
    config.use7tvProxy = document.getElementById('adm-proxy').checked;
    config.messageLifetime = parseInt(document.getElementById('adm-lifetime').value) || 0;
    
    // Phase 4 fields
    config.useLinkSpoiler = document.getElementById('adm-spoiler').checked;
    config.bubbleColor = document.getElementById('adm-bubble-color').value;
    config.textColor = document.getElementById('adm-text-color').value;
    
    // Phase 5 fields
    config.theme = getToggleValue('adm-theme') || 'light';

    // v7.5.0 новые поля закрепа
    config.pinBgColor = document.getElementById('adm-pin-bg-color').value;
    config.pinTextColor = document.getElementById('adm-pin-text-color').value;
    config.pinOpacity = parseInt(document.getElementById('adm-pin-opacity').value) || 100;
    config.pinFontSize = parseInt(document.getElementById('adm-pin-font-size').value) || 13;

    // v7.5.0 новые поля шрифтов
    config.fontFamily = getToggleValue('adm-font-family') || 'system';

    // v7.5.0 новые поля исходящих стримера
    config.outgoingEnabled = document.getElementById('adm-outgoing-enabled').checked;
    config.outgoingSync = document.getElementById('adm-outgoing-sync').checked;
    config.outgoingBubbleColor = document.getElementById('adm-outgoing-bubble-color').value;
    config.outgoingTextColor = document.getElementById('adm-outgoing-text-color').value;

    // v7.5.0 новые поля отступов
    config.incomingMargin = parseInt(document.getElementById('adm-incoming-margin').value) || 0;
    config.outgoingMargin = parseInt(document.getElementById('adm-outgoing-margin').value) || 0;

    localStorage.setItem('tg_twitch_config_v7', JSON.stringify(config));
    applyConfigStyles();
    updatePinDisplay();
    closeAdminPanel();
}

async function resetSection(section) {
    const confirmed = await showConfirm('Вы уверены, что хотите сбросить настройки этого раздела к значениям по умолчанию?');
    if (!confirmed) return;
    
    if (section === 'geometry') {
        config.maxWidth = DEFAULT_CONFIG.maxWidth;
        config.padding = DEFAULT_CONFIG.padding;
        config.incomingMargin = DEFAULT_CONFIG.incomingMargin;
        config.outgoingMargin = DEFAULT_CONFIG.outgoingMargin;
    } else if (section === 'visual') {
        config.fontSize = DEFAULT_CONFIG.fontSize;
        config.timeSize = DEFAULT_CONFIG.timeSize;
        config.opacity = DEFAULT_CONFIG.opacity;
        config.messageLifetime = DEFAULT_CONFIG.messageLifetime;
        config.bubbleColor = DEFAULT_CONFIG.bubbleColor;
        config.textColor = DEFAULT_CONFIG.textColor;
        config.showAvatars = DEFAULT_CONFIG.showAvatars;
        config.theme = DEFAULT_CONFIG.theme;
        config.fontFamily = DEFAULT_CONFIG.fontFamily;
    } else if (section === 'roles') {
        config.txtStreamer = DEFAULT_CONFIG.txtStreamer;
        config.txtMod = DEFAULT_CONFIG.txtMod;
        config.txtVip = DEFAULT_CONFIG.txtVip;
    } else if (section === 'pin') {
        config.pinType = DEFAULT_CONFIG.pinType;
        config.pinBgColor = DEFAULT_CONFIG.pinBgColor;
        config.pinTextColor = DEFAULT_CONFIG.pinTextColor;
        config.pinOpacity = DEFAULT_CONFIG.pinOpacity;
        config.pinFontSize = DEFAULT_CONFIG.pinFontSize;
    } else if (section === 'streamer-msg') {
        config.outgoingEnabled = DEFAULT_CONFIG.outgoingEnabled;
        config.outgoingSync = DEFAULT_CONFIG.outgoingSync;
        config.outgoingBubbleColor = DEFAULT_CONFIG.outgoingBubbleColor;
        config.outgoingTextColor = DEFAULT_CONFIG.outgoingTextColor;
    }
    
    setupAdminFields();
}

async function resetAllConfig() {
    const confirmed = await showConfirm('ВНИМАНИЕ! Вы уверены, что хотите сбросить ВСЕ настройки чата к первоначальным значениям по умолчанию?');
    if (!confirmed) return;
    
    config = { ...DEFAULT_CONFIG };
    setupAdminFields();
}

function hexToRgb(hex) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function applyConfigStyles() {
    document.documentElement.setAttribute('data-theme', config.theme || 'dark');
    document.documentElement.style.setProperty('--chat-font-size', config.fontSize + 'px');
    document.documentElement.style.setProperty('--time-font-size', config.timeSize + 'px');
    document.documentElement.style.setProperty('--bubble-max-width', config.maxWidth + 'px');
    document.documentElement.style.setProperty('--bubble-padding', `${config.padding}px 12px`);
    document.documentElement.style.setProperty('--bubble-opacity', config.opacity / 100);
    document.documentElement.style.setProperty('--avatar-display', config.showAvatars ? 'flex' : 'none');
    
    const rgb = hexToRgb(config.bubbleColor || '#182533') || { r: 24, g: 37, b: 51 };
    const opacityValue = config.opacity / 100;
    document.documentElement.style.setProperty('--bubble-color', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacityValue})`);
    document.documentElement.style.setProperty('--text-color', config.textColor || '#f5f5f5');

    // Применение шрифта
    const fontValue = FONT_MAP[config.fontFamily] || FONT_MAP.system;
    document.documentElement.style.setProperty('--chat-font-family', fontValue);

    // Применение стилей закрепа
    const pinBgRgb = hexToRgb(config.pinBgColor || '#ffffff') || { r: 255, g: 255, b: 255 };
    const pinTextRgb = hexToRgb(config.pinTextColor || '#1c1c1c') || { r: 28, g: 28, b: 28 };
    const pinOpacityValue = (config.pinOpacity || 100) / 100;
    document.documentElement.style.setProperty('--pin-bg-color', `rgba(${pinBgRgb.r}, ${pinBgRgb.g}, ${pinBgRgb.b}, ${pinOpacityValue})`);
    document.documentElement.style.setProperty('--pin-text-color', config.pinTextColor || '#1c1c1c');
    document.documentElement.style.setProperty('--pin-font-size', (config.pinFontSize || 13) + 'px');
    document.documentElement.style.setProperty('--pin-border-color', `rgba(${pinTextRgb.r}, ${pinTextRgb.g}, ${pinTextRgb.b}, 0.12)`);

    // Применение стилей исходящих сообщений
    let outBg = config.outgoingBubbleColor || '#2b5278';
    let outText = config.outgoingTextColor || '#f5f5f5';
    if (config.outgoingSync) {
        const matched = OUTGOING_DEFAULTS[config.bubbleColor];
        if (matched) {
            outBg = matched.bubble;
            outText = matched.text;
        } else {
            // Если нет в пресетах, рассчитываем исходя из яркости входящих
            if (isLightColor(config.bubbleColor || '#182533')) {
                outBg = '#effdde'; // Светло-зеленый (Telegram Light outgoing)
                outText = '#1c1c1c';
            } else {
                outBg = '#2b5278'; // Темно-синий (Telegram Dark outgoing)
                outText = '#f5f5f5';
            }
        }
    }
    const outBgRgb = hexToRgb(outBg) || { r: 43, g: 82, b: 120 };
    const outTextRgb = hexToRgb(outText) || { r: 245, g: 245, b: 245 };
    document.documentElement.style.setProperty('--outgoing-bubble-color', `rgba(${outBgRgb.r}, ${outBgRgb.g}, ${outBgRgb.b}, ${opacityValue})`);
    document.documentElement.style.setProperty('--outgoing-text-color', outText);
    document.documentElement.style.setProperty('--outgoing-time-color', `rgba(${outTextRgb.r}, ${outTextRgb.g}, ${outTextRgb.b}, 0.6)`);

    // Применение отступов
    document.documentElement.style.setProperty('--incoming-margin', (config.incomingMargin || 0) + 'px');
    document.documentElement.style.setProperty('--outgoing-margin', (config.outgoingMargin || 0) + 'px');
}

function updatePinDisplay() {
    const banner = document.getElementById('pin-banner');
    if (!banner) return;

    if (!config.pinned) {
        banner.classList.remove('show');
        return;
    }

    banner.classList.remove('pin-tg-style');

    if (config.pinType === 'tg') {
        banner.classList.add('pin-tg-style');
        banner.innerHTML = `
            <div class="pin-title">Закреплённое сообщение</div>
            <div class="pin-text"><b>${config.pinned.author}:</b> ${config.pinned.text}</div>
        `;
    } else {
        banner.innerHTML = `<div class="pin-text" style="white-space: normal; font-weight: 500; text-align: center;">${config.pinned.text}</div>`;
    }
    banner.classList.add('show');
}

async function loadThirdPartyEmotes(channelName) {
    const cleanChannel = channelName.replace('#', '').trim();
    let twitchId = '';
    
    // Попытка 1: Получить Twitch ID через DecAPI (проксированный)
    try {
        const idResp = await fetch(proxyUrl(`https://decapi.me/twitch/id/${cleanChannel}`));
        if (idResp.ok) {
            const txt = (await idResp.text()).trim();
            if (txt && !txt.includes("User not found") && !txt.includes("error")) {
                twitchId = txt;
            }
        }
    } catch (e) {
        console.error("Decapi ID error:", e);
    }
    
    // Попытка 2 (резервная): Получить Twitch ID через API ivr.fi
    if (!twitchId) {
        try {
            const ivrResp = await fetch(proxyUrl(`https://api.ivr.fi/v2/twitch/user?login=${cleanChannel}`));
            if (ivrResp.ok) {
                const arr = await ivrResp.json();
                if (arr && arr[0] && arr[0].id) {
                    twitchId = arr[0].id;
                }
            }
        } catch (e) {
            console.error("IVR ID error:", e);
        }
    }

    try {
        const res = await fetch('https://api.betterttv.net/3/cached/emotes/global');
        if (res.ok) { (await res.json()).forEach(e => { customEmoteMap[e.code] = `https://cdn.betterttv.net/emote/${e.id}/1x.webp`; }); }
    } catch (e) {}
    try {
        const res = await fetch(proxyUrl('https://7tv.io/v3/emote-sets/global'));
        if (res.ok) { const data = await res.json(); if (data.emotes) { data.emotes.forEach(e => { if (e.data && e.data.host) customEmoteMap[e.name] = `https:${e.data.host.url}/1x.webp`; }); } }
    } catch (e) {}
    
    if (twitchId) {
        try {
            const res = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${twitchId}`);
            if (res.ok) { const data = await res.json(); const emotes = [...(data.channelEmotes || []), ...(data.sharedEmotes || [])]; emotes.forEach(e => { customEmoteMap[e.code] = `https://cdn.betterttv.net/emote/${e.id}/1x.webp`; }); }
        } catch (e) {}
        try {
            const res = await fetch(proxyUrl(`https://7tv.io/v3/users/twitch/${twitchId}`));
            if (res.ok) { 
                const data = await res.json(); 
                if (data.emote_set && data.emote_set.emotes) { 
                    data.emote_set.emotes.forEach(e => { if (e.data && e.data.host) customEmoteMap[e.name] = `https:${e.data.host.url}/1x.webp`; }); 
                } 
            }
        } catch (e) {}
    }
}

// ИНИЦИАЛИЗАЦИЯ КЛИЕНТА TWITCH
const client = new window.tmi.Client({
    options: { secure: true },
    connection: { host: 'irc-ws.chat.twitch.tv', port: 443, secure: true, reconnect: true, timeout: 10000 },
    channels: [ config.channel ]
});

const chatContainer = document.getElementById('chat-container');

function getTelegramColorIndex(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) { hash = username.charCodeAt(i) + ((hash << 5) - hash); }
    return Math.abs(hash) % 20;
}

function parseMessageContent(text, twitchEmotes) {
    let sortedTwitchEmotes = [];
    if (twitchEmotes) {
        for (let emoteId in twitchEmotes) {
            twitchEmotes[emoteId].forEach(rangeStr => {
                let [start, end] = rangeStr.split('-').map(Number);
                sortedTwitchEmotes.push({ start, end, url: `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/1.0` });
            });
        }
    }
    sortedTwitchEmotes.sort((a, b) => a.start - b.start);

    let finalHtml = '';
    let lastIndex = 0;

    sortedTwitchEmotes.forEach(emote => {
        if (emote.start > lastIndex) { finalHtml += processThirdPartyText(text.slice(lastIndex, emote.start)); }
        finalHtml += `<img class="chat-emote" src="${emote.url}">`;
        lastIndex = emote.end + 1;
    });

    if (lastIndex < text.length) { finalHtml += processThirdPartyText(text.slice(lastIndex)); }
    return finalHtml;
}

function processThirdPartyText(rawText) {
    let escaped = rawText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let words = escaped.split(' ');
    let processedWords = words.map(word => {
        let cleanWord = word.replace(/[.,!?]$|[.,!?](?=\s)/g, '');
        
        // Проверка на 7TV / BTTV смайлики
        if (customEmoteMap[cleanWord]) { 
            return `<img class="chat-emote" src="${proxyUrl(customEmoteMap[cleanWord])}" alt="${word}">`; 
        }
        
        // Проверка на ссылки и маскировка под анимированный спойлер Telegram
        const urlRegex = /^(https?:\/\/[^\s]+)$/i;
        if (urlRegex.test(word)) {
            let displayUrl = word;
            try {
                let parsed = new URL(word);
                displayUrl = parsed.hostname + (parsed.pathname.length > 15 ? parsed.pathname.slice(0, 15) + '...' : parsed.pathname);
            } catch(e) {}
            let originalUrl = word.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            
            if (config.useLinkSpoiler) {
                return `<span class="chat-spoiler" onclick="this.classList.add('revealed')"><a href="${originalUrl}" target="_blank">${displayUrl}</a></span>`;
            } else {
                return `<a class="chat-link" href="${originalUrl}" target="_blank">${displayUrl}</a>`;
            }
        }
        
        return word;
    });
    return processedWords.join(' ');
}

client.on('message', async (channel, tags, message, self) => {
    const username = tags['display-name'] || tags['username'];
    const loginName = tags['username'];
    const colorIndex = getTelegramColorIndex(username);
    
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    const firstLetter = username.charAt(0);

    // КОМАНДЫ УПРАВЛЕНИЯ ЗАКРЕПОМ
    const isBroadcaster = tags.username === channel.replace('#', '').toLowerCase() || !!(tags.badges && tags.badges.broadcaster);
    const isMod = tags.mod || isBroadcaster || (tags.badges && (tags.badges.broadcaster || tags.badges.moderator));

    if (isMod) {
        if (message.startsWith('!закреп ') || message.startsWith('!pin ')) {
            const textToPin = message.slice(message.indexOf(' ') + 1).trim();
            config.pinned = { text: textToPin, author: username };
            localStorage.setItem('tg_twitch_config_v7', JSON.stringify(config));
            updatePinDisplay();
            return;
        }
        if (message === '!открепить' || message === '!unpin') {
            config.pinned = null;
            localStorage.setItem('tg_twitch_config_v7', JSON.stringify(config));
            updatePinDisplay();
            return;
        }
    }

    // ТЕГИ РОЛЕЙ
    let roleBadgeHtml = '';
    if (tags.badges) {
        if (tags.badges.broadcaster) { roleBadgeHtml = `<span class="tg-role-badge role-broadcaster">${config.txtStreamer}</span>`; }
        else if (tags.badges.moderator) { roleBadgeHtml = `<span class="tg-role-badge role-moderator">${config.txtMod}</span>`; }
        else if (tags.badges.vip) { roleBadgeHtml = `<span class="tg-role-badge role-vip">${config.txtVip}</span>`; }
    }

    // ОТВЕТЫ (REPLIES)
    let replyBlockHtml = '';
    if (tags['reply-parent-msg-body']) {
        const parentUser = tags['reply-parent-display-name'] || tags['reply-parent-username'];
        const parentColorIndex = getTelegramColorIndex(parentUser);
        const parentBody = tags['reply-parent-msg-body'].replace(/\\s/g, ' ');

        replyBlockHtml = `
            <div class="tg-reply-wrapper bd-color-${parentColorIndex}">
                <span class="tg-reply-author txt-color-${parentColorIndex}">${parentUser}</span>
                <span class="tg-reply-body">${parentBody}</span>
            </div>
        `;
    }

    const isOutgoing = config.outgoingEnabled && isBroadcaster;

    const row = document.createElement('div');
    row.classList.add('message-row');
    if (isOutgoing) {
        row.classList.add('outgoing');
    }

    const parsedMessage = parseMessageContent(message, tags.emotes);

    if (isOutgoing) {
        row.innerHTML = `
            <div class="tg-avatar bg-color-${colorIndex}" style="display: none;">${firstLetter}</div>
            <div class="tg-bubble">
                ${replyBlockHtml}
                <span class="user-text">${parsedMessage}</span>
                <span class="msg-time">${timeStr}</span>
            </div>
        `;
    } else {
        row.innerHTML = `
            <div class="tg-avatar bg-color-${colorIndex}">${firstLetter}</div>
            <div class="tg-bubble">
                <div class="bubble-header">
                    <span class="user-name txt-color-${colorIndex}" style="background: none;">${username}</span>
                    ${roleBadgeHtml}
                </div>
                ${replyBlockHtml}
                <span class="user-text">${parsedMessage}</span>
                <span class="msg-time">${timeStr}</span>
            </div>
        `;
    }

    chatContainer.appendChild(row);

    // Логика авто-удаления/исчезновения сообщений по таймауту
    if (config.messageLifetime > 0) {
        const lifetimeMs = config.messageLifetime * 1000;
        setTimeout(() => {
            if (row && row.parentNode) {
                // Анимация плавного скрытия высоты и прозрачности
                row.style.height = row.offsetHeight + 'px';
                row.style.transition = 'opacity 0.5s ease, height 0.5s ease, margin 0.5s ease, padding 0.5s ease';
                row.style.overflow = 'hidden';
                row.offsetHeight; // reflow
                
                row.style.opacity = '0';
                row.style.height = '0px';
                row.style.marginBottom = '0px';
                row.style.paddingTop = '0px';
                row.style.paddingBottom = '0px';
                
                setTimeout(() => {
                    if (row && row.parentNode) row.remove();
                }, 500);
            }
        }, lifetimeMs);
    }

    if (config.showAvatars) {
        const avatarDiv = row.querySelector('.tg-avatar');
        if (avatarCache[loginName]) {
            if (avatarCache[loginName] !== 'default') { avatarDiv.innerHTML = `<img src="${avatarCache[loginName]}">`; }
        } else {
            try {
                let avatarUrl = '';
                // Попытка 1: Загрузить аватар через DecAPI (проксированный)
                try {
                    const response = await fetch(proxyUrl(`https://decapi.me/twitch/avatar/${loginName}`));
                    if (response.ok) {
                        const txt = await response.text();
                        if (txt && !txt.includes('User not found') && !txt.includes('error')) {
                            avatarUrl = txt.trim();
                        }
                    }
                } catch (decErr) {}

                // Попытка 2 (резервная): Загрузить аватар через API ivr.fi (проксированный)
                if (!avatarUrl) {
                    try {
                        const ivrResponse = await fetch(proxyUrl(`https://api.ivr.fi/v2/twitch/user?login=${loginName}`));
                        if (ivrResponse.ok) {
                            const arr = await ivrResponse.json();
                            if (arr && arr[0] && arr[0].logo) {
                                avatarUrl = arr[0].logo;
                            }
                        }
                    } catch (ivrErr) {}
                }

                if (avatarUrl) {
                    avatarCache[loginName] = avatarUrl;
                    avatarDiv.innerHTML = `<img src="${avatarUrl}">`;
                } else {
                    avatarCache[loginName] = 'default';
                }
            } catch (e) { avatarCache[loginName] = 'default'; }
        }
    }

    if (chatContainer.children.length > 40) { chatContainer.removeChild(chatContainer.firstChild); }
    window.scrollTo(0, document.body.scrollHeight);
});

// Логика активности мыши для шестеренки настроек
let mouseMoveTimeout;
const gearBtn = document.getElementById('gear-toggle-btn');

if (gearBtn) {
    window.addEventListener('mousemove', () => {
        gearBtn.classList.add('mouse-active');
        clearTimeout(mouseMoveTimeout);
        mouseMoveTimeout = setTimeout(() => {
            gearBtn.classList.remove('mouse-active');
        }, 3000); // Скрывать через 3 секунды бездействия
    });

    document.addEventListener('mouseleave', () => {
        gearBtn.classList.remove('mouse-active');
    });
}

// Тестовая кнопка для симуляции сообщений при URL параметре ?test=1
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('test') === '1' || urlParams.get('test') === 'true') {
    const testBtn = document.createElement('button');
    testBtn.innerText = 'Симулировать сообщение';
    testBtn.style.position = 'fixed';
    testBtn.style.bottom = '10px';
    testBtn.style.left = '10px';
    testBtn.style.zIndex = '9999';
    testBtn.style.background = '#5288c1';
    testBtn.style.color = 'white';
    testBtn.style.border = 'none';
    testBtn.style.padding = '8px 12px';
    testBtn.style.borderRadius = '4px';
    testBtn.style.cursor = 'pointer';
    testBtn.style.fontSize = '12px';
    testBtn.style.fontWeight = 'bold';
    testBtn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
    
    testBtn.onclick = () => {
        client.emit('message', '#' + config.channel, {
            'display-name': 'ТестовыйЮзер',
            'username': 'testuser',
            emotes: null,
            badges: { broadcaster: '1' }
        }, 'Привет! Это тестовое сообщение с длинной ссылкой: https://github.com/rydve/Twitchegram/issues/1 для проверки спойлеров.', false);
    };
    document.body.appendChild(testBtn);
}

// СТАРТ ВИДЖЕТА
applyConfigStyles();
updatePinDisplay();
loadThirdPartyEmotes(config.channel).then(() => {
    client.connect().catch(console.error);
});
