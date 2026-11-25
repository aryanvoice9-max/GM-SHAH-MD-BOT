import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GM SHAH MD BOT AUTO-REACT: har message par ek random dil lagta hai.
const commandEmojis = ['💝', '💖', '💗', '❤️‍🩹', '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍'];

const USER_GROUP_DATA = path.join(__dirname, '../data/userGroupData.json');

function loadAutoReactionState() {
  try {
    if (fs.existsSync(USER_GROUP_DATA)) {
      const data = JSON.parse(fs.readFileSync(USER_GROUP_DATA, 'utf8'));
      return data.autoReaction !== undefined ? data.autoReaction : true;
    }
  } catch (error) {
    console.error('Error loading auto-reaction state:', error);
  }
  return true;
}

function saveAutoReactionState(state) {
  try {
    fs.mkdirSync(path.dirname(USER_GROUP_DATA), { recursive: true });
    let data = { groups: [], chatbot: {} };
    if (fs.existsSync(USER_GROUP_DATA)) {
      try {
        data = JSON.parse(fs.readFileSync(USER_GROUP_DATA, 'utf8'));
      } catch (_) {}
    }

    data.autoReaction = state;
    fs.writeFileSync(USER_GROUP_DATA, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving auto-reaction state:', error);
  }
}

let isAutoReactionEnabled = loadAutoReactionState();

function getRandomEmoji() {
  return commandEmojis[Math.floor(Math.random() * commandEmojis.length)];
}

function getMessageBody(message) {
  return message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    message?.message?.imageMessage?.caption ||
    message?.message?.videoMessage?.caption ||
    '';
}

export function getAutoReactionState() {
  return isAutoReactionEnabled;
}

export async function addCommandReaction(sock, message) {
  try {
    if (!isAutoReactionEnabled || !message?.key?.id) return;

    const msgContent = message?.message;
    if (!msgContent) return;
    if (msgContent.reactionMessage || msgContent.protocolMessage) return;
    if (message.key?.remoteJid === 'status@broadcast') return;

    // Auto-react sirf doosron ke messages par lagega, apne messages par nahi.
    if (message.key?.fromMe) return;
    const botJid = sock?.user?.id ? String(sock.user.id).split(':')[0] : '';
    const senderJid = message.key?.participant || message.key?.remoteJid || '';
    if (botJid && senderJid && String(senderJid).split(':')[0] === botJid) return;

    const emoji = getRandomEmoji();
    await sock.sendMessage(message.key.remoteJid, {
      react: {
        text: emoji,
        key: message.key
      }
    });
  } catch (error) {
    console.error('Error adding command reaction:', error);
  }
}

export async function handleAreactCommand(sock, chatId, message, isOwner) {
  try {
    if (!isOwner) {
      await sock.sendMessage(chatId, {
        text: '❌ This command is only available for the owner!'
      }, { quoted: message });
      return;
    }

    const args = getMessageBody(message).trim().split(/\s+/);
    const action = args[1]?.toLowerCase();

    if (action === 'on') {
      isAutoReactionEnabled = true;
      saveAutoReactionState(true);
      await sock.sendMessage(chatId, {
        text: '✅ Auto-reactions (hearts ❤️) have been enabled globally'
      }, { quoted: message });
    } else if (action === 'off') {
      isAutoReactionEnabled = false;
      saveAutoReactionState(false);
      await sock.sendMessage(chatId, {
        text: '✅ Auto-reactions have been disabled globally'
      }, { quoted: message });
    } else {
      const currentState = isAutoReactionEnabled ? 'enabled' : 'disabled';
      await sock.sendMessage(chatId, {
        text: `Auto-reactions (hearts ❤️) are currently ${currentState} globally.\n\nUse:\n.areact on - Enable auto-reactions\n.areact off - Disable auto-reactions`
      }, { quoted: message });
    }
  } catch (error) {
    console.error('Error handling areact command:', error);
    await sock.sendMessage(chatId, {
      text: '❌ Error controlling auto-reactions'
    }, { quoted: message });
  }
}
