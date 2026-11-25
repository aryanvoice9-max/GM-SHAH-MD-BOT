import { handleAreactCommand } from '../lib/reactions.js';

export const commands = [
  {
    name: 'areact',
    aliases: ['autoreact', 'autoreaction'],
    description: 'Turn auto heart reactions on or off',
    category: 'Owner',

    execute: async ({ sock, from, msg, config, isOwner, senderNumber }) => {
      const ownerNumber = String(config?.OWNER_NUMBER || '').replace(/\D/g, '');
      const allowed = Boolean(isOwner || msg.key?.fromMe || (ownerNumber && senderNumber === ownerNumber));
      await handleAreactCommand(sock, from, msg, allowed);
    }
  }
];
