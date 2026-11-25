<p align="center">
  <img src="assets/menu-animated.gif" alt="GM SHAH MD BOT" width="420"/>
</p>

<p align="center">
  <img src="assets/name-glow.svg" alt="GM SHAH MD" width="760"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js 20+"/>
  <img src="https://img.shields.io/badge/Baileys-WhatsApp%20MD-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Baileys WhatsApp MD"/>
  <img src="https://img.shields.io/badge/Platform-Bot--Hosting.net-blue?style=for-the-badge" alt="Bot-Hosting.net"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="MIT License"/>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/aryanvoice9-max/GM-SHAH-MD-BOT?style=social" alt="Stars"/>
  <img src="https://img.shields.io/github/forks/aryanvoice9-max/GM-SHAH-MD-BOT?style=social" alt="Forks"/>
</p>

---

## About

**GM SHAH MD BOT** is a powerful WhatsApp Multi-Device bot built with **Node.js** and **Baileys**. It comes with a rich command menu, group management tools, downloaders, AI features, search tools, fun commands and much more — all wrapped in a fast, lightweight design that runs smoothly even on free hosting panels.

The bot menu shows the official **GM SHAH MD** photo (`assets/menu.jpg`) with every menu command.

---

## Features

- **Rich command menu** with categories, live stats and the official menu photo
- **Group management** — promote, demote, kick, mute, tagall, antilink and more
- **Downloaders** — songs, videos, social media and file downloads
- **AI commands** — chat, image analysis and smart replies
- **Search tools** — web, image, lyrics, weather and country info
- **Media tools** — stickers, converters, logo maker and profile tools
- **Fun commands** — games, quotes, jokes and playful utilities
- **Auto features** — auto read, auto view, auto like, anticall, antidelete
- **Multi-language support** with per-user language settings
- **Lightweight** — tuned to run on free panels with a 200 MB heap cap

---

## Deploy on Bot-Hosting.net (Free)

1. **Fork this repository** and star it.
2. Go to [Bot-Hosting.net](https://bot-hosting.net) and create a new **Node.js** deployment.
3. Choose **GitHub** as the source and select this repository, branch `main`.
4. Make sure `index.js` and `package.json` are at the deployment root (`/home/container/index.js`).
5. Set **Node version 20** in Startup settings.
6. Set the install command:

   ```bash
   npm install --legacy-peer-deps
   ```

7. Set the start command:

   ```bash
   node --max-old-space-size=200 index.js
   ```

8. Add the environment variables listed below.
9. Start the deployment. A **pairing code** appears in the console.
10. On your phone, open **WhatsApp → Settings → Linked Devices → Link with phone number instead** and enter the pairing code.
11. When the console shows the bot is connected, send the menu command and enjoy.

> **Free plan note:** renew the free plan every 4 days (Deployment → Renew now → Renew free plan → Renew for 4 days), otherwise the deployment suspends and the bot stops.

---

## Environment Variables

| Variable | Description |
|---|---|
| `OWNER_NUMBER` | Bot owner WhatsApp number with country code, no `+` |
| `OWNER_NAME` | Owner name shown in the menu |
| `BOT_NAME` | Bot name (default: GM SHAH MD BOT) |
| `MODE` | `public` or `private` |
| `PREFIXES` | Command prefixes, comma separated |
| `SESSION` | Session string (optional, if you use session login) |
| `TZ` | Timezone, e.g. `Asia/Karachi` |
| `MENU_IMAGES` | Extra menu image URLs, comma separated (optional) |
| `ANTICALL` / `ANTIDELETE` / `ANTIEDIT` | `on` or `off` |
| `AUTO_READ` / `AUTO_VIEW` / `AUTO_LIKE` | `on` or `off` |
| `ACRCLOUD_ACCESS_KEY` / `ACRCLOUD_ACCESS_SECRET` | Optional, for music recognition |
| `GOOGLE_API_KEY` / `GOOGLE_CX` | Optional, for Google search |
| `OMDB_API_KEY` | Optional, for movie info |
| `RAGANORK_API_KEY` | Optional, for text-to-image effects |
| `TENOR_API_KEY` | Optional, for GIF search |
| `WEATHER_API_KEY` | Optional, for weather |
| `IMGBB_API_KEY` | Optional, for image uploads |

See [`.env-sample`](.env-sample) for the full list.

---

## Run Locally

```bash
git clone https://github.com/aryanvoice9-max/GM-SHAH-MD-BOT.git
cd GM-SHAH-MD-BOT
npm install --legacy-peer-deps
npm start
```

---

## Important Notes

- Use a **second WhatsApp number** for the bot, never your main personal number. WhatsApp can ban numbers used on unofficial bots.
- Never share your session or pairing code with anyone.
- Keep your API keys in environment variables, never in code.
- To change the bot number, delete the `session` folder in the panel Files, restart, and pair again.

---

## Owner

<p align="center">
  <img src="assets/menu.jpg" alt="GM Shah MD" width="220"/>
</p>

<p align="center">
  <b>GM Shah MD</b><br/>
  GitHub: <a href="https://github.com/aryanvoice9-max">aryanvoice9-max</a>
</p>

---

## License

This project is licensed under the [MIT License](LICENSE). Give proper credit to the original authors and libraries used.
