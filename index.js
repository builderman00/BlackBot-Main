const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { execSync } = require('child_process');
const chalk = require('chalk');
const config = require('./config.json');
const readline = require('readline');
const { time } = require('console');

// === CLEARCONSOLE ===
function clearConsole() {
    process.stdout.write('\x1Bc');
}
clearConsole();
console.log(chalk.cyan('Starting Bot...'));

// === AUTO-INSTALL midi-player-js-fixed ===
const modulePath = path.join(__dirname, 'node_modules', 'midi-player-js-fixed');
if (!fs.existsSync(modulePath)) {
    console.log(chalk.yellow('midi-player-js-fixed missing — installing...'));
    const nm = path.join(__dirname, 'node_modules');
    if (!fs.existsSync(nm)) fs.mkdirSync(nm);
    execSync(`git clone https://github.com/LapisHusky/midi-player-js-fixed.git "${modulePath}"`, { stdio: 'inherit' });
    console.log(chalk.green('✅ Installed midi-player-js-fixed'));
}
console.log(chalk.green('✅ All dependencies loaded'));

// === TOKENS & COLORS ===
let tokens = Array.isArray(config.tokens) ? config.tokens : Array(config.tokens).fill("");
let color = {
count: 0,
color: () => {
color.count++;
if (color.count >= config.rainbow.data.length) color.count = 0;
return config.rainbow.data[color.count];
}
};

let client = { count: 0, clients: [] };
tokens.forEach((token, i) => {
const cl = new Worker('./client.js');
cl.note = msg => cl.postMessage(msg);
cl.mouse = (x, y) => cl.postMessage({ m: "mouse", x, y });
cl.connected = false;
cl.botColor = (Array.isArray(config.botColors) && config.botColors[i]) ? config.botColors[i] : config.color;
    cl.colorMode = Array.isArray(config.botColorMode) ? (config.botColorMode[i] || 'normal') : (config.botColorMode || 'normal');

cl.on('message', msg => {
    if (msg.m === "ready") cl.postMessage({ m: "connect", token });
    if (msg.m === "hi") {
        const initColor = (cl.colorMode === 'rainbow') ? color.color() : cl.botColor;
        cl.postMessage({ m: "userset", name: config.name, color: initColor });
    }
    if (msg.m === "connected") { cl.x = Math.random() * 100; cl.y = Math.random() * 100; }
});

if (i === 0) client.base = cl;
client.clients.push(cl);

});

client.client = (i) => {
if (Number.isInteger(i) && client.clients[i]) return client.clients[i];
client.count = (client.count + 1) % client.clients.length;
return client.clients[client.count];
};

// === SPEAK FUNCTION ===
let speak = { msgs: [] };
speak.say = (ms) => {
ms.match(new RegExp(`.{0,${config.length}}`, 'g')).forEach(x => x && speak.msgs.push({ m: "say", a: x }));
if (speak.interval) return;
client.base.postMessage(speak.msgs.shift());
speak.interval = setInterval(() => {
if (!speak.msgs.length) { clearInterval(speak.interval); delete speak.interval; return; }
client.base.postMessage(speak.msgs.shift());
}, config.buffer);
};

// === MIDI PLAYER & NPS ===
var nq = require('./quota.js')(config.nq, 6000);
var player = {};
// Player status tracking (used for BotStats)
var lastPlayerInfo = { playing: false, time: 0, duration: 0, file: null, startedAt: 0 };

function formatDurationMs(ms) {
    if (!ms || ms < 1000) return `${Math.round(ms || 0)}ms`;
    const totalSec = Math.floor(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds}s`;
}

function formatPlayerTime(raw) {
    if (raw == null) return '0s';
    // if value looks like seconds (small), convert to ms
    const ms = raw > 1000 ? raw : raw * 1000;
    return formatDurationMs(ms);
}
var keys = [
        'c-2', 'cs-2', 'd-2', 'ds-2', 'e-2', 'f-2', 'fs-2', 'g-2', 'gs-2', 'a-2', 'as-2', 'b-2',
        'c-1', 'cs-1', 'd-1', 'ds-1', 'e-1', 'f-1', 'fs-1', 'g-1', 'gs-1', 'a-1', 'as-1', 'b-1',
        'c0', 'cs0', 'd0', 'ds0', 'e0', 'f0', 'fs0', 'g0', 'gs0', 'a0', 'as0', 'b0',
        'c1', 'cs1', 'd1', 'ds1', 'e1', 'f1', 'fs1', 'g1', 'gs1', 'a1', 'as1', 'b1',
        'c2', 'cs2', 'd2', 'ds2', 'e2', 'f2', 'fs2', 'g2', 'gs2', 'a2', 'as2', 'b2',
        'c3', 'cs3', 'd3', 'ds3', 'e3', 'f3', 'fs3', 'g3', 'gs3', 'a3', 'as3', 'b3',
        'c4', 'cs4', 'd4', 'ds4', 'e4', 'f4', 'fs4', 'g4', 'gs4', 'a4', 'as4', 'b4',
        'c5', 'cs5', 'd5', 'ds5', 'e5', 'f5', 'fs5', 'g5', 'gs5', 'a5', 'as5', 'b5',
        'c6', 'cs6', 'd6', 'ds6', 'e6', 'f6', 'fs6', 'g6', 'gs6', 'a6', 'as6', 'b6',
        'c7', 'cs7', 'd7', 'ds7', 'e7', 'f7', 'fs7', 'g7', 'gs7', 'a7', 'as7', 'b7',
        'c8', 'cs8', 'd8', 'ds8', 'e8', 'f8', 'fs8', 'g8'
    ];
var nps = 0;
var presses = {};
keys.forEach(k => presses[k] = false);
var press = [];
if (config.cursor && config.cursor.mode === "piano") {
for (var i = 0; i < client.clients.length; i++) press.push(false);
}
var deblack = false;
var sustain = false;
var loading = 0;
var loadStart = 0;
var loadInterval = null;
var currentLoadName = null;
var loadSource = 'console'; // 'console' or 'chat'

// === PLAYER CREATION ===
function createPlayer() {
player = new Worker('./player.js');
player.on('message', m => {
    if (m.m === "midi") handleMIDI(m.a || [m.a]);

    if (m.m === "error") {
        console.log('error', 'player', m.e && m.e.message ? m.e.message : String(m.e));
        try { speak.say(`Player error: ${m.e}`); } catch (e) { /* ignore */ }
        return;
    }

    if (m.m === "load") {
        loading = 0;
        if (loadInterval) { clearInterval(loadInterval); loadInterval = null; }
        let durationMs = (typeof m.t === 'number') ? m.t : (Date.now() - loadStart);
        const name = currentLoadName ? `${currentLoadName}` : 'player';
        if (config.fastLoad) durationMs = Math.max(1, Math.floor(durationMs / 2));
        console.log('loaded', name, formatDurationMs(durationMs));
        // Send loaded message to appropriate destination
        if (loadSource === 'chat') {
            speak.say(`loaded`);
        } else {
            console.log('loaded');
        }
        // update last player info
        lastPlayerInfo.file = m.file || currentLoadName || lastPlayerInfo.file;
        if (typeof m.duration === 'number') lastPlayerInfo.duration = m.duration;
        lastPlayerInfo.time = 0;
        // load finished -> stopped until play command
        lastPlayerInfo.state = 'stopped';
        currentLoadName = null;
        loadSource = 'console'; // reset to default
        return;
    }

    if (m.m === 'loading') {
        // player reports loading progress
        lastPlayerInfo.state = 'loading';
        if (typeof m.a === 'number') lastPlayerInfo.loadingProgress = m.a;
        return;
    }

    if (m.m === 'play') {
        lastPlayerInfo.playing = true;
        lastPlayerInfo.file = m.file || lastPlayerInfo.file;
        if (typeof m.duration === 'number') lastPlayerInfo.duration = m.duration;
        // startedAt is used to compute elapsed if player doesn't return info
        lastPlayerInfo.startedAt = Date.now() - ((lastPlayerInfo.time || 0) * 1000);
        lastPlayerInfo.state = 'playing';
        return;
    }

    if (m.m === 'pause' || m.m === 'stop') {
        lastPlayerInfo.playing = false;
        lastPlayerInfo.state = (m.m === 'pause') ? 'paused' : 'stopped';
        return;
    }

    if (m.m === 'info') {
        lastPlayerInfo.playing = !!m.playing;
        if (typeof m.time === 'number') lastPlayerInfo.time = m.time;
        if (m.file) lastPlayerInfo.file = m.file;
        if (typeof m.duration === 'number') lastPlayerInfo.duration = m.duration;
        return;
    }
});

player.on('exit', (code) => { console.error('Player worker exited with code', code); setTimeout(createPlayer, 500); });
player.on('error', (err) => { console.error('Player worker error event:', err); setTimeout(createPlayer, 500); });


}

// === ULTRA-FAST CENTRAL MIDI HANDLER ===
// Precompute key mapping

const keyMap = {};


keys.forEach((k, i) => keyMap[i + 0 /* 1 octave */] = k); //ioct

// Fast noteOn/noteOff handlers
function fastNoteOn(target, key, vel) {
if (deblack && vel < (nq.points / nq.max)) return;
target.note({ m: "start", n: key, v: vel });
presses[key] = true;
nps++;
}
function fastNoteOff(target, key) {
if (sustain || !presses[key]) return;
target.note({ m: "stop", n: key });
presses[key] = false;
}

// Jump table for events
const dispatch = { noteon: fastNoteOn, noteoff: fastNoteOff };

// Batch MIDI events
function handleMIDI(events) {
if (!Array.isArray(events)) events = [events];
if (!events.length) return;


const batches = new Map();
for (const msg of events) {
    if (!msg || !msg.name) continue;
    const name = msg.name.replace(/\s+/g, '').toLowerCase();
    const fn = dispatch[name];
    if (!fn) continue;

    const key = keyMap[msg.noteNumber];
    if (!key) continue;

    const delay = msg.delay | 0;
    let arr = batches.get(delay);
    if (!arr) batches.set(delay, arr = []);
    arr.push([fn, key, msg.velocity / 127, msg.noteNumber]);
}

for (const [delay, arr] of batches) {
    setTimeout(() => {
        if (!nq.try()) return;
        for (const [fn, key, vel, noteNumber] of arr) {
            const keyIndex = noteNumber;
            
            // When playing, split notes by pitch between bots:
            // Bot 0 plays lower notes, Bot 1 plays higher notes, etc.
            let target;
            if (lastPlayerInfo.playing && client.clients && client.clients.length >= 2) {
                const notesPerBot = Math.ceil(keys.length / client.clients.length);
                const botIndex = Math.floor(keyIndex / notesPerBot);
                target = client.clients[Math.min(botIndex, client.clients.length - 1)];
            } else if (lastPlayerInfo.playing && client.clients && client.clients.length === 1) {
                target = client.clients[0];
            } else {
                // Not playing: use round-robin distribution
                const clientIndex = config.userkey
                    ? Math.floor(keyIndex / (keys.length / Math.max(1, client.clients.length)))
                    : undefined;
                target = client.client(clientIndex);
            }
            
            fn(target, key, vel);
            nq.spend(1);
        }
    }, delay);
}


}

createPlayer();

// === DYNAMIC RAINBOW LOW CPU ===
if (config.colorrainbow) {
let timer = null;
let lastInterval = 0;
setInterval(() => {
const ratio = Math.min(nps / 20, 1);
const interval = Math.round(2000 - 1950 * ratio);


    if (nps < 0.1) {
        if (timer) { clearInterval(timer); timer = null; }
        client.clients.forEach(c => {
            try {
                if (c.colorMode === 'rainbow') c.postMessage({ m: "userset", color: "#808080" });
                else c.postMessage({ m: "userset", color: c.botColor });
            } catch (e) { }
        });
    } else {
            if (!timer || Math.abs(lastInterval - interval) > 20) {
            if (timer) clearInterval(timer);
            timer = setInterval(() => {
                const nextColor = color.color();
                client.clients.forEach(c => {
                    try {
                        if (c.colorMode === 'rainbow') c.postMessage({ m: "userset", color: nextColor });
                        else c.postMessage({ m: "userset", color: c.botColor });
                    } catch (e) { }
                });
            }, interval);
            lastInterval = interval;
        }
    }
    
    // Update web dashboard stats
    try {
        updateWebStats({
            fps: fps,
            nps: nps,
            currentFile: lastPlayerInfo.file || 'none',
            state: lastPlayerInfo.state || 'stopped',
            uptime: Date.now() - startTime,
            notesPlayed: notesPlayed || 0
        });
    } catch (e) { /* ignore */ }
    
    nps *= 0.85;
}, 1000);


}
// === CPU MONITOR LOW USAGE ===
if (config.cpu) {
let startUsage = process.cpuUsage();
setInterval(() => {
const elap = process.cpuUsage(startUsage);
startUsage = process.cpuUsage();
}, config.cpu);
}

// === FAST LOADING ===
if (config.fastLoad) {
loadInterval = setInterval(() => {
    if (loading > 0) {
        const elapsed = Date.now() - loadStart;
        console.log(`Loading... ${Math.floor(elapsed / 1000)}s |FastLoad: ( Wait a second! )`);
        loading++;
    }
}, 5000);
}

// === PRIVATE COMMANDS ===
client.base.on('message', async msg => {
if (msg.m !== "a") return;
if (config.allowed && !config.allowed.includes(msg.p._id)) return;


let args = msg.a.trim().replace(/\s+/g, ' ').split(' ');
let cmd = args[0].toLowerCase();
if (!cmd.startsWith(config.prefix)) return;
args[0] = args[0].substr(config.prefix.length);

try {
    switch (args[0]) {
        case "download": {
            if (!args[1]) return speak.say(`Usage: ${config.prefix} download <MIDI URL>`);
            if (!(new URL(args[1])).pathname.endsWith('.mid')) return speak.say('Incorrect file type.');
            const axios = require('axios');
            const { DownloaderHelper } = require('node-downloader-helper');
            const dl = new DownloaderHelper(args[1], config.path);
            const size = parseInt((await axios.head(args[1])).headers['content-length']);
            if (size <= config.maxDownload * 1024 * 1024) {
                dl.on('end', f => speak.say(`Downloaded as ${f.fileName}`));
                dl.on('error', () => speak.say('Error.'));
                await dl.start();
            } else speak.say(`Reached limit of ${config.maxDownload}MB`);
            break;
        }

        case "load": {
            if (args.length === 1) return speak.say(`Usage: ${config.prefix} load <file>`);
            const filename = args.slice(1).join(" ");
            if (!fs.existsSync(path.join(config.path, filename))) return speak.say('File not found.');

            currentLoadName = filename;
            loadSource = 'chat'; // Mark that load was initiated from chat
            loadStart = Date.now();
            // mark loading state for status display
            lastPlayerInfo.state = 'loading';
            lastPlayerInfo.file = path.join(config.path, filename);
            player.postMessage({ m: "stop" });
            player.postMessage({ m: "load", a: path.join(config.path, filename), id: 0 });
            client.clients.forEach(c => {
                try {
                    if (c.colorMode === 'rainbow') c.postMessage({ m: "userset", color: color.color() });
                    else c.postMessage({ m: "userset", color: c.botColor });
                } catch (e) { }
            });
            speak.say(`Loading ${filename}...`);
            console.log(`Loading: ${filename}`);
            break;
        }

        case "play": player.postMessage({ m: "play" }); speak.say("Now Playing"); break;
        case "pause": player.postMessage({ m: "pause" }); speak.say("Paused"); break;
        case "stop": player.postMessage({ m: "stop" }); speak.say("Stopped"); break;

        case "list": {
            let num = Number(args[1]) || 0;
            const files = fs.readdirSync(config.path).filter(f => f.endsWith('.mid'));
            speak.say(
                files.slice(num, num + config.list).map(f => `\`\`\`${f}\`\`\``).join(' | ')
                + ((num === 0) ? ` | Usage: ${config.prefix} list <num>` : '')
            );
            break;
        }

        case "find": {
            if (args.length === 1) return speak.say(`Usage: ${config.prefix} find <num> <data>`);
            const n = isNaN(Number(args[1])) ? 0 : Number(args[1]);
            const s = isNaN(Number(args[1])) ? args.slice(1).join(' ') : args.slice(2).join(' ');
            const files = fs.readdirSync(config.path)
                .filter(f => f.endsWith('.mid') && f.toLowerCase().includes(s.toLowerCase()));
            speak.say(`Index:${n} | ${files.slice(n, n + config.list).map(f => `\`\`\`${f}\`\`\``).join(' -|- ')} | Total:${files.length}`);
            break;
        }

        case "deblack": deblack = !deblack; speak.say(`Deblacking: ${deblack}`); break;
        case "sustain": sustain = !sustain; speak.say(`Sustain: ${sustain}`); break;
        case "help": speak.say(`Usage: ${config.prefix} <play, pause, stop, load, download, list, find, deblack, sustain>`); break;
    }
} catch (err) { speak.say(`Error: ${err}`); }

});

// === CURSOR MODES ===
if (config.cursor?.mode === "circle1") {
let t = 0;
const speed = 0.03, radius = 14, orbitRadius = 6, centerX = 50, centerY = 50;
const cursor = () => {
if (!client.clients || client.clients.length < 2) return;
t += speed;
const x1 = centerX + Math.cos(t) * radius;
const y1 = centerY + Math.sin(t) * radius;
const x2 = x1 + Math.cos(t * -2) * orbitRadius;
const y2 = y1 + Math.sin(t * -2) * orbitRadius;

    if (client.clients[0]) { client.clients[0].x = x1; client.clients[0].y = y1; client.clients[0].mouse(x1, y1); }
    if (client.clients[1]) { client.clients[1].x = x2; client.clients[1].y = y2; client.clients[1].mouse(x2, y2); }
};
setInterval(cursor, config.cursor.interval);


}

// === RAINBOW MODES ===
let rainbowfun = null;
let colorTick = 0;
function hexToRgb(hex) {
    const h = hex.replace('#','');
    return {r: parseInt(h.substring(0,2),16), g: parseInt(h.substring(2,4),16), b: parseInt(h.substring(4,6),16)};
}
function rgbToHex(r,g,b) {
    return '#' + [r,g,b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2,'0')).join('');
}
function lerp(a,b,t) {
    return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

if (config.rainbow.mode === 'both') {
    // Select palette based on colorScheme
    let palette;
    if (config.colorScheme === 'light') {
        palette = ['#FFCCCC','#FFE5B4','#FFFFCC','#CCFFCC','#D0F0FD','#CCCCFF','#B0C4DE','#E6CCFF'];
    } else {
        // dark (default)
        palette = config.rainbow.data || ['#6B0000', '#7A3E00', '#6B6B00', '#006400', '#003366', '#3B1F6B', '#2B2B2B', '#111111'];
    }
    
    const len = palette.length;
    const paletteRgb = palette.map(hexToRgb);
    const speedFactor = Math.max(0.1, Number(config.rainbow.speed) || 1);
    const stepMs = Math.max(150, Math.floor((config.rainbow.interval || 2000) / 16));
    let phase = 0;

    const tickFn = () => {
        phase += (stepMs / ((config.rainbow.interval || 2000) * speedFactor)) * len;
        if (phase >= len) phase -= len * Math.floor(phase / len);

        client.clients.forEach((c, idx) => {
            try {
                if (c.colorMode === 'normal') {
                    c.postMessage({ m: 'userset', color: c.botColor });
                    return;
                }
                const offset = (c.colorMode === 'animated') ? idx : 0;
                const p = (phase + offset) % len;
                const i0 = Math.floor(p) % len;
                const i1 = (i0 + 1) % len;
                const t = p - Math.floor(p);
                const colRgb = lerp(paletteRgb[i0], paletteRgb[i1], t);
                const colHex = rgbToHex(colRgb.r, colRgb.g, colRgb.b);
                c.postMessage({ m: 'userset', color: colHex });
            } catch (e) { /* ignore */ }
        });
    };

    setInterval(tickFn, stepMs);
} else if (config.rainbow.mode === 'user') {
    // no global rainbow; per-user modes handled at connect
} else { throw new Error('Invalid Rainbow Mode!'); }

// === STATS ===
if (config.stats) {
setInterval(() => { client.base.postMessage({ m: "userset", name: eval(config.stats.data) }); }, config.stats.interval);
}

// === CONSOLE INPUT (readline) ===
try {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.setPrompt('> ');
    rl.prompt();
    rl.on('line', async (line) => {
        try {
            if (!line) { rl.prompt(); return; }
            line = line.trim();
            
            // If doesn't start with prefix, send to chat
            if (!line.startsWith(config.prefix)) { 
                speak.say(`(Console): ${line}`);
                rl.prompt(); 
                return; 
            }

            let args = line.replace(/\s+/g, ' ').split(' ');
            args[0] = args[0].substr(config.prefix.length);

            switch (args[0].toLowerCase()) {
                case "download": {
                    if (!args[1]) { console.log(`Usage: ${config.prefix} download <MIDI URL>`); break; }
                    if (!(new URL(args[1])).pathname.endsWith('.mid')) { console.log('Incorrect file type.'); break; }
                    const axios = require('axios');
                    const { DownloaderHelper } = require('node-downloader-helper');
                    const dl = new DownloaderHelper(args[1], config.path);
                    const size = parseInt((await axios.head(args[1])).headers['content-length']);
                    if (size <= config.maxDownload * 1024 * 1024) {
                        dl.on('end', f => console.log(`Downloaded as ${f.fileName}`));
                        dl.on('error', () => console.log('Error.'));
                        await dl.start();
                    } else console.log(`Reached limit of ${config.maxDownload}MB`);
                    break;
                }

                case "load": {
                    if (args.length === 1) { console.log(`Usage: ${config.prefix} load <file>`); break; }
                    const filename = args.slice(1).join(" ");
                    if (!fs.existsSync(path.join(config.path, filename))) { console.log('File not found.'); break; }
                    currentLoadName = filename;
                    loadStart = Date.now();
                    lastPlayerInfo.state = 'loading';
                    lastPlayerInfo.file = path.join(config.path, filename);
                    // If fastLoad enabled, prime the disk by reading the file first to speed up OS cache
                    if (config.fastLoad) {
                        try { fs.readFileSync(path.join(config.path, filename)); } catch (e) { /* ignore */ }
                    }
                    player.postMessage({ m: "stop" });
                    player.postMessage({ m: "load", a: path.join(config.path, filename), id: 0, fast: !!config.fastLoad });
                    client.clients.forEach(c => {
                        try {
                            if (c.colorMode === 'rainbow') c.postMessage({ m: "userset", color: color.color() });
                            else c.postMessage({ m: "userset", color: c.botColor });
                        } catch (e) { }
                    });
                    console.log(`Loading: ${filename}`);
                    break;
                }

                case "play": player.postMessage({ m: "play" }); console.log("Now Playing"); break;
                case "pause": player.postMessage({ m: "pause" }); console.log("Paused"); break;
                case "stop": player.postMessage({ m: "stop" }); console.log("Stopped"); break;

                case "list": {
                    let num = Number(args[1]) || 0;
                    const files = fs.readdirSync(config.path).filter(f => f.endsWith('.mid'));
                    console.log(
                        files.slice(num, num + config.list).map(f => `\`\`\`${f}\`\`\``).join(' | ')
                        + ((num === 0) ? ` | Usage: ${config.prefix} list <num>` : '')
                    );
                    break;
                }

                case "find": {
                    if (args.length === 1) { console.log(`Usage: ${config.prefix} find <num> <data>`); break; }
                    const n = isNaN(Number(args[1])) ? 0 : Number(args[1]);
                    const s = isNaN(Number(args[1])) ? args.slice(1).join(' ') : args.slice(2).join(' ');
                    const files = fs.readdirSync(config.path)
                        .filter(f => f.endsWith('.mid') && f.toLowerCase().includes(s.toLowerCase()));
                    console.log(`Index:${n} | ${files.slice(n, n + config.list).map(f => `\`\`\`${f}\`\`\``).join(' -|- ')} | Total:${files.length}`);
                    break;
                }

                case "deblack": deblack = !deblack; console.log(`Deblacking: ${deblack}`); break;
                case "sustain": sustain = !sustain; console.log(`Sustain: ${sustain}`); break;
                case "help": console.log(`Usage: ${config.prefix} <play, pause, stop, load, download, list, find, deblack, sustain>`); break;
                default: console.log(`Unknown command: ${args[0]}`); break;
            }
        } catch (err) { speak.say(`Error: ${err}`); }
        rl.prompt();
    });
} catch (e) { console.error('Readline init failed:', e); }
