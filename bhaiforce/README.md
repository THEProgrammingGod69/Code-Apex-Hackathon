# BHAIFORCE · भाईफोर्स

**Ek bhai. Sau goonde. Zero chill.**

An Indian take on the Broforce formula: a destructible-terrain run-and-gun where every bhai is a desi archetype with a ridiculous special move. Four missions across India, four bosses, ten playable heroes. It plays on phones (touch controls, landscape) and on desktop (keyboard or gamepad).

The whole game is one self-contained HTML file. Every sprite, tile, background, sound effect and song is generated in code, with no image or audio assets.

## Play

- **Live:** see the deployment link in the repository's main README.
- **Locally:** open `dist/index.html` in any modern browser. Or run `npm run build`, then serve `dist/`.
- **Phone tip:** add it to your home screen for a fullscreen landscape experience. The page ships a web-app manifest.

## The Bhais

| Bhai | Weapon | Special (3 per life) |
|---|---|---|
| **Inspector Mooch** | Service revolver, pierces two goons | **Hero Slow-Mo**: time crawls, he fires twice as fast |
| **Mummy Ji** | Homing chappal that always comes back | **Chappal Barrage**: 8 golden chappals hunt everyone |
| **Auto Anna** | Meter-down shotgun | **Auto Ram**: a driverless auto bulldozes a tunnel, then explodes |
| **Kadak Chai Bhai** | Scalding chai stream, sets goons panicking | **Kettle Bomb**: a lake of burning chai |
| **Sixer Bhai** | Cricket balls that ricochet 3 times | **Helicopter Shot**: invulnerable spin that reflects bullets |
| **Sharma Ji Ka Beta** | Homing paper planes | **Topper's Report Card**: 100/100. Every goon on screen cries |
| **WhatsApp Uncle** | Piercing "Good Morning" roses | **Fake News Forward**: goons turn on each other |
| **Disco Dada** | Vinyl discs that slice walls | **Disco Ball**: hovering mirror ball lasers goons |
| **Jugaad Bhai** | Nail gun | **Patakha Salvo**: six homing Diwali rockets, Holi-colour blasts |
| **Pehelwan Pappu** | Golden gada smash | **Dhobi Pachhad**: sky-high body slam shockwave |

Every bhai can also **THAPPAD** (slap): an instant takedown that also bats bullets back.

## Missions

1. **Bambai Bawaal** (Mumbai, monsoon dusk): Don Dhoka hijacked the city's vada pav supply. Boss: *Bunty Bouncer*.
2. **Registan Rumble** (Jaisalmer): onions cost ₹500/kg. Boss: the *HORN OK PLEASE* truck.
3. **Dilli Diwali Dhamaka** (Chandni Chowk, Diwali night): the kaju katli is stolen and everyone got soan papdi. Boss: *Kabaad-Bot 3000*.
4. **Pahadi Panga** (Ladakh): Don Dhoka plans to cut the World Cup final telecast. Boss: *Don Dhoka's Dhoka-Copter*.

## How it plays

- **Broforce rules:** walls climb (push into a wall and hold JUMP), everything breaks, and red LPG cylinders rocket off and explode.
- **Lives are bhais:** free caged prisoners for +1 life, and you instantly become the rescued bhai.
- **Checkpoints:** raise the Tiranga. Your next bhai parachutes in there.
- **Combos:** Zabardast → Khatarnaak → Bawaal → Jhakaas → Paisa Vasool.
- Goons die in Holi-colour bursts and stain the terrain. They shout Hinglish barks, burn, sob, and fall for fake news.
- Optional Hindi text-to-speech voice lines, haptics on Android, and three difficulty levels (Chill, Bhai, Khatarnaak).

### Controls

| | Phone | Keyboard | Gamepad |
|---|---|---|---|
| Move / ladders | Left-thumb floating stick | A D W S / arrows | Stick / d-pad |
| Jump (hold on a wall to climb) | JUMP | Space | A |
| Fire | FIRE (hold) | J / X | X / RT |
| Special | ★ | L / C | B / LT |
| Thappad | THAPPAD | F / V | Y |
| Pause | ❚❚ | Esc / P | Start |

## Tech

- Vanilla JS on HTML5 canvas, with no framework and no build dependencies. `build.mjs` concatenates `src/` into `dist/index.html`.
- 16 small modules in `src/js`: core, audio, input, graphics, world, particles, entities, bhais, player, enemies, bosses, levels, background, game, ui, main.
- **Rendering:** a pixel-art low-res world canvas plus a crisp high-DPI UI canvas for text. Destructible tiles render in cached 16×16-tile chunks that redraw only when something breaks. A world-sized decal layer holds Holi stains and scorch marks. Night lighting uses a darkness mask with light holes.
- **Audio:** WebAudio synthesis. Karplus-Strong sitar/tanpura plucks with jawari buzz, a shehnai-style reed, dhol and tabla voices, and songs written in sargam notation (raag Bhairav, Yaman, Bhairavi) on a look-ahead sequencer.
- **Levels:** seeded procedural assembly of hand-tuned segments (chawls, havelis, forts, towers, bunkers, caves, bridges), so every mission is identical on every run.

### Scripts

```bash
npm run build   # → dist/index.html
npm test        # build + headless Chromium smoke test + level-traversal bot (needs Playwright)
npm run shots   # mid-combat screenshots of every special and boss
```
