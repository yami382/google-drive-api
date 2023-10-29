const chalk = require('chalk');
const inquirer = require('inquirer');
const fs = require('fs');
const puppeteer = require('puppeteer');

const generateUrlProfile = (username) => {
    const baseUrl = `https://www.tiktok.com/${username.startsWith('@') ? username : `@${username}`}`;
    return baseUrl;
};

const downloadMedia = async (list) => {
    const folder = 'downloads/';
    for (const item of list) {
        const fileName = `${item.id}.mp4`;
        const downloadFile = await fetch(item.url);
        const file = fs.createWriteStream(`${folder}${fileName}`);

        console.log(chalk.green(`[+] Downloading ${fileName}`));

        downloadFile.body.pipe(file);
        await new Promise((resolve) => {
            file.on('finish', resolve);
        });
    }
};

const getIdVideo = (url) => {
    if (!url.includes('/video/')) {
        console.log(chalk.red('[X] Error: Invalid URL'));
        exit(1);
    }
    const idVideo = url.split('/video/')[1].split('?')[0];
    return idVideo;
};

const getChoice = () =>
    inquirer.prompt([
        {
            type: 'list',
            name: 'choice',
            message: 'Choose an option',
            choices: ['Mass Download (Username)', 'Mass Download (URL)', 'Single Download (URL)']
        },
        {
            type: 'list',
            name: 'type',
            message: 'Choose an option',
            choices: ['With Watermark', 'Without Watermark']
        }
    ]);

const getInput = (message) =>
    inquirer.prompt([
        {
            type: 'input',
            name: 'input',
            message
        }
    ]);

const getListVideoByUsername = async (username) => {
    const baseUrl = generateUrlProfile(username);
    const browser = await puppeteer.launch({
        headless: true
    });
    const page = await browser.newPage();
    page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4182.0 Safari/537.36'
    );
    await page.goto(baseUrl);

    let listVideo = [];
    console.log(chalk.green(`[*] Getting list video from: ${username}`));

    let loop = true;
    while (loop) {
        listVideo = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('.tiktok-yz6ijl-DivWrapper > a'));
            return links.map((link) => link.href);
        });

        console.log(chalk.green(`[*] ${listVideo.length} videos found`));

        const previousHeight = await page.evaluate('document.body.scrollHeight');
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');

        try {
            await page.waitForFunction(`document.body.scrollHeight > ${previousHeight}`, { timeout: 10000 });
        } catch (error) {
            console.log(chalk.red('[X] No more videos found'));
            console.log(chalk.green(`[*] Total videos found: ${listVideo.length}`));
            loop = false;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    await browser.close();
    return listVideo;
};

(async () => {
    const choice = await getChoice();
    const listVideo = [];
    const listMedia = [];

    if (choice.choice === 'Mass Download (Username)') {
        const usernameInput = await getInput('Enter the username with @ (e.g. @username) : ');
        const username = usernameInput.input;
        listVideo.push(...(await getListVideoByUsername(username)));
        if (listVideo.length === 0) {
            console.log(chalk.yellow('[!] Error: No videos found'));
            exit(1);
        }
    } else if (choice.choice === 'Mass Download (URL)') {
        const countInput = await getInput('Enter the number of URLs: ');
        const count = parseInt(countInput.input);
        for (let i = 0; i < count; i++) {
            const urlInput = await getInput(`Enter URL #${i + 1}: `);
            const url = await getRedirectUrl(urlInput.input);
            const idVideo = getIdVideo(url);
            listVideo.push(idVideo);
        }
    } else {
        const urlInput = await getInput('Enter the URL: ');
        const url = await getRedirectUrl(urlInput.input);
        listVideo.push(getIdVideo(url));
    }

    console.log(chalk.green(`[!] Found ${listVideo.length} videos`));

    for (const video of listVideo) {
        const data = choice.type === 'With Watermark' ? await getVideoWM(video) : await getVideoNoWM(video);
        listMedia.push(data);
    }

    downloadMedia(listMedia)
        .then(() => {
            console.log(chalk.green('[+] Downloaded successfully'));
        })
        .catch((err) => {
            console.log(chalk.red('[X] Error: ' + err));
        });
})();
