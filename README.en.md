# 🌍 GeoGAYZZER

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E=18.0-brightgreen)](https://nodejs.org/)
[![Multiplayer](https://img.shields.io/badge/multiplayer-supported-blue)](#features)
[![Mapillary](https://img.shields.io/badge/panorama-Mapillary-blueviolet)](https://www.mapillary.com/)

> Multiplayer street view guessing game. Look at a Mapillary panorama — guess where you are. The closest wins!

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎯 **Solo Game** | 5 rounds with random panoramas |
| 👥 **Multiplayer** | Up to 10 players per room (LAN or VPN) |
| 🗡️ **Point Steal** | Guess closer within 50 km — steal 20% of opponent's points |
| 📊 **ELO Rating** | Chess-style ELO: win to gain, lose to drop |
| 🎖️ **30 Achievements** | For accuracy, steals, wins, XP, and more |
| ⭐ **Levels & XP** | Earn XP per round/match, level up |
| 💎 **Prestige** | Every 55 levels — new prestige tier `[N💎]` |
| 👤 **Profiles** | Records, achievements, last game history |
| 🗺️ **Mapillary** | Real street panoramas worldwide |
| 🔭 **Preload** | Cache of 100+ working panoramas |

---

## 🚀 Quick Start

### Requirements
- **Node.js** v18+
- **npm** (comes with Node.js)
- Modern browser (Chrome, Firefox, Edge)

### Install & Run
```sh
# 1. Go to project folder
cd E:/Gits/GeoGAYZZER

# 2. Install dependencies
npm install

# 3. Start the server
node server/index.js
```

Open **http://localhost:3000** in your browser.

---

## 🎮 How to Play

### Solo Game
1. Register or log in
2. Click **Solo Game**
3. Explore the panorama (move, zoom)
4. Click on the mini-map where you think you are
5. Click **GUESS**
6. See your distance and score
7. 5 rounds → total score

**Max: 25,000 points** (5,000 × 5 rounds)

### Multiplayer
- **Host:** Create a room, pick a color, share the code, start when ready
- **Player:** Join with code, wait for host to start

All players see the same panorama and guess at the same time. After each round — results table and all guesses on the map.

---

## 🗡️ Steal Mechanic
If two players guess within **50 km**, the closer one steals **20%** of the other's points. Shown in results with a red icon.

---

## 📊 Rating System

### XP & Levels
| Event | XP |
|-------|----|
| Points per round | points ÷ 8 |
| 1st place (round) | +200 |
| 2nd place (round) | +100 |
| 3rd place (round) | +60 |
| Accuracy 90%+ | +50 |
| Accuracy 99%+ | +100 |
| Guessed <1 km | +75 |
| Guessed <100 m | +200 |
| Steal | +30 |
| 1st place (match) | +600 |
| Match played | +50 |
| Flawless match (all rounds 90%+) | +200 |

Level formula: **level N requires ⌊200 × N^1.5⌋ XP**

### ELO
ELO is calculated chess-style (K=32) in multiplayer only. Start: **1000**. Minimum: **100**.

---

## 📁 Project Structure

```
GeoGAYZZER/
├── config/
│   ├── api.js              ← Mapillary token (gitignored)
│   └── api.example.js      ← template
├── server/
│   ├── index.js            ← Express + Socket.IO server
│   ├── game.js             ← room/round logic
│   ├── profiles.js         ← XP, levels, ELO, achievements
│   ├── accounts.json       ← accounts (gitignored)
│   └── profiles.json       ← player profiles (gitignored)
├── public/
│   ├── login.html          ← login/register
│   ├── menu.html           ← main menu
│   ├── lobby.html          ← lobby
│   ├── game.html           ← game screen
│   ├── profile.html        ← player profile
│   ├── css/
│   │   ├── variables.css   ← dark theme, variables
│   │   ├── base.css        ← reset & typography
│   │   ├── layout.css      ← layout
│   │   ├── components.css  ← buttons, modals, swatches
│   │   ├── animations.css  ← animations
│   │   └── profile.css     ← profile page styles
│   └── js/
│       ├── config.js       ← API key loader
│       ├── state.js        ← global game state
│       ├── scoring.js      ← Haversine + scoring formula
│       ├── player.js       ← localStorage: nick, color, token
│       ├── network.js      ← Socket.IO client
│       ├── ui.js           ← DOM/screens
│       ├── app-menu.js     ← menu logic
│       ├── app-lobby.js    ← lobby logic
│       ├── app-game.js     ← game logic
│       └── app-profile.js  ← profile logic
├── .gitignore
├── package.json
├── README.md
├── README.en.md
└── LICENSE
```

---

## 🔧 Commands
```sh
# Start
node server/index.js

# Dev mode (auto-restart)
npm run dev

# Install dependencies
npm install
```

---

## 🎯 Scoring Formula
```
score = 5000 × exp(−distance_km / 2000)
```

| Distance | Points |
|----------|--------|
| 0 m      | 5,000  |
| 1 km     | 4,998  |
| 100 km   | 4,881  |
| 500 km   | 4,394  |
| 1,000 km | 3,894  |
| 5,000 km | 1,429  |
| 10,000 km| 82     |

---

## 🐛 Troubleshooting

**`EADDRINUSE: address already in use :3000`**
```sh
killall node
node server/index.js
```

**`Cannot find module 'express'`**
```sh
npm install
```

**Panorama not loading**
- Check your internet connection
- Make sure Mapillary token is valid in `config/api.js`
- Use preload (menu → "Preload panoramas") to fill the cache

**Multiplayer not working**
- All players must be in the same Radmin VPN
- Check IP in server output (Radmin VPN section)
- Default port: `3000`

---

## 📜 License

MIT — do whatever you want.

---

[🇷🇺 Читать на русском](README.md)

<div align="right">
  <a href="README.md">🇷🇺 Читать на русском</a>
</div>
