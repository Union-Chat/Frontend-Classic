const boldRegex = /(\*\*).+(\*\*)/g;
const URLRegex = /(?:(?:https?|ftp|file):\/\/|www\.|ftp\.)(?:\([-A-Z0-9+&@#\/%=~_|$?!:,.]*\)|[-A-Z0-9+&@#\/%=~_|$?!:,.])*(?:\([-A-Z0-9+&@#\/%=~_|$?!:,.]*\)|[A-Z0-9+&@#\/%=~_|$])/igm; // eslint-disable-line
const emojiRegex = /:\w+:/g;
const imageRegex = /(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*\.(?:jpg|gif|png))(?:\?([^#]*))?(?:#(.*))?/g;

const validEmojis = (() => {
    try {
        const request = new XMLHttpRequest();
        request.open('GET', '/emojis.json', false);
        request.send();

        if (request.status !== 200) {
            return []; // todo: report err
        }

        return JSON.parse(request.responseText);
    } catch (_) {
        return [];
    }
})();

const servers = new Map();
let currentUser = null;
let _auth = null;
let ws = null;
let selectedServer = null;


function handleLoginShortcuts(event) {
    if (event.keyCode === 13) {
        connect();
    }
}

function signup() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const req = new XMLHttpRequest();
    req.open('POST', '/create', true);
    req.setRequestHeader('Content-Type', 'application/json');
    req.onload = () => {
        if (req.readyState === 4) {
            alert(req.responseText);
        }
    };
    req.onerror = () => alert(req.responseText);
    req.send(JSON.stringify({ username, password }));
}

function connect() {
    document.getElementById('login').style.display = 'none';
    ws = new WebSocket('wss://union.serux.pro:2096');
    ws.onopen = authenticateClient; // Stupid JS Websocket doesn't support headers REEEEEEEEE
    ws.onclose = handleWSClose;
    ws.onmessage = handleWSMessage;
}

function authenticateClient() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    _auth = `${username}:${password}`;
    currentUser = username;

    const b64 = btoa(_auth); // Encode to base64
    ws.send(`Basic ${b64}`);
}

function handleWSClose(close) {
    console.log(`Websocket disconnected (${close.code}): ${close.reason}`);

    const servers = document.getElementById('servers');

    while(servers.firstChild) {
        servers.removeChild(servers.firstChild);
    }

    if (close.code !== 4001) {
        setTimeout(() => connect(_auth), 3e3); // try to reconnect
    } else {
        const messages = document.getElementById('message-container');

        while(messages.firstChild) {
            messages.removeChild(messages.firstChild);
        }

        document.getElementById('login').style.display = 'block';
    }
}

function parseText(text) {
    let filtered = text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace('\r\n', '<br>').replace(/\n/g, '<br>');

    const emojisInText = filtered.match(emojiRegex);
    if (emojisInText) {
        for (const emoji of emojisInText) {
            const image = validEmojis.find(e => e.toLowerCase().split('.').shift() === emoji.toLowerCase().slice(1, -1));
            if (!image) {
                continue;
            }

            filtered = filtered.replace(emoji, `<img class="emoji" src="./emoji/${image}">`); //<span data-tooltip="${emoji.toLowerCase().replace(/:/g, '\u200b:')}"></span>`);
        }
    }

    const URLsInText = filtered.match(URLRegex);
    if (URLsInText) {
        for (const URL of URLsInText) {
            filtered = filtered.replace(URL, `<a target="_blank" href="${URL}">${URL}</a>`);

            const imageMatch = URL.match(imageRegex);
            if (imageMatch) {
                filtered += `<br><img src="${imageMatch[0]}" class="embed">`;
            }
        }
    }

    return filtered;
}

function handleWSMessage(message) {
    try {
        const j = JSON.parse(message.data);

        if (j.op === 1) {
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }

            const chatbox = document.getElementById('whatthefuckdidyoujustsayaboutme');
            chatbox.addEventListener('keydown', snedMeHarder);

            j.d.forEach(server => {
                servers.set(server.id, server);
                const s = document.createElement('div');
                s.setAttribute('class', 'server');
                s.setAttribute('server-id', server.id);
                s.setAttribute('server-name', server.name);
                s.addEventListener('click', () => switchServer(s));

                const icon = document.createElement('img');
                icon.setAttribute('src', server.iconUrl);

                s.appendChild(icon);

                document.getElementById('servers').appendChild(s);
            });
        }

        if (j.op === 3) {
            if (j.d.server !== selectedServer) {
                return;
            }

            addMessage(j.d);

            if (j.d.content.includes(`@${currentUser}`) && 'Notification' in window && !document.hasFocus()) { // Mention
                const notif = new Notification(`${j.d.author} mentioned you!`, {
                    body: j.d.content
                });
                notif.onclick = () => {
                    window.focus();
                    notif.close();
                };
            }

            const container = document.getElementById('message-container');
            container.scrollTop = container.scrollHeight;
        }
    } catch(e) {
        console.log(e);
    }
}

function snedMeHarder(event) {
    const elemelon = document.getElementById('whatthefuckdidyoujustsayaboutme');
    const msg = elemelon.value.trim();

    if (event.keyCode === 13 && !event.shiftKey) {
        event.preventDefault();
        if (ws !== null && ws.readyState === WebSocket.OPEN && msg.length > 0) {
            ws.send(JSON.stringify({
                op: 8,
                d: {
                    server: 1,
                    content: msg
                }
            }));
            elemelon.value = '';
        }
    }
}

function switchServer(server) {
    const chatbox = document.getElementById('whatthefuckdidyoujustsayaboutme');
    const id = server.getAttribute('server-id');
    const name = server.getAttribute('server-name');
    selectedServer = Number(id);

    chatbox.removeAttribute('readonly');
    chatbox.setAttribute('placeholder', `Message ${name}...`);
}

function addMessage(message) { // This will come in handy later when we implement caching
    const messageContent = document.createElement('div');

    if (message.content.includes(`@${currentUser}`)) {
        messageContent.setAttribute('style', 'background: rgb(70, 70, 70);');
    }

    messageContent.innerHTML = parseText(message.content);

    const allMessages = document.querySelectorAll('.message');
    const lastMessage = allMessages[allMessages.length - 1];

    if (lastMessage && lastMessage.querySelector('h2').innerHTML === message.author) {
        lastMessage.getElementsByClassName('container')[0].appendChild(messageContent);
    } else {
        const m = document.createElement('div');
        m.setAttribute('class', 'message');

        const avatar = document.createElement('img');
        const user = servers.get(message.server).members.find(m => m.id === message.author);

        if (user && user.avatarUrl) {
            avatar.setAttribute('src', user.avatarUrl);
        } else {
            avatar.setAttribute('src', '/default_avatar.png');
        }
        
        avatar.setAttribute('class', 'avatar');

        const container = document.createElement('div');
        container.setAttribute('class', 'container');

        const author = document.createElement('h2');
        author.innerText = message.author;

        container.appendChild(author);
        container.appendChild(messageContent);

        m.appendChild(avatar);
        m.appendChild(container);

        document.getElementById('message-container').appendChild(m);
    }
}
