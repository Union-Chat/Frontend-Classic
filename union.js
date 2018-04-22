const boldRegex = /(\*\*).+(\*\*)/g;
const URLRegex = /(?:(?:https?|ftp|file):\/\/|www\.|ftp\.)(?:\([-A-Z0-9+&@#\/%=~_|$?!:,.]*\)|[-A-Z0-9+&@#\/%=~_|$?!:,.])*(?:\([-A-Z0-9+&@#\/%=~_|$?!:,.]*\)|[A-Z0-9+&@#\/%=~_|$])/igm; // eslint-disable-line
const emojiRegex = /:\w+:/g;
const imageRegex = /(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*\.(?:jpg|gif|png))(?:\?([^#]*))?(?:#(.*))?/g;

const validEmojis = (async () => {
    try {
        const req = await request('GET', '/emojis.json')
            .catch(() => ([]));

        return JSON.parse(req);
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

async function signup() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const req = await request('POST', '/api/create', {}, { username, password });
    alert(req);
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

    const serverList = document.getElementById('servers');

    while(serverList.firstChild) {
        serverList.removeChild(serverList.firstChild);
    }

    if (close.code !== 4001) {
        setTimeout(() => connect(_auth), 3e3); // try to reconnect
    } else {
        const messages = document.getElementById('message-container');

        while(messages.firstChild) {
            messages.removeChild(messages.firstChild);
        }

        const members = document.getElementById('members');

        while(members.firstChild) {
            members.removeChild(members.firstChild);
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
        console.log('Got WS message', j);

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
        } else if (j.op === 4) {
            servers.forEach(server => {
                const member = server.members.find(m => m.id === j.d.id);
                if (member) {
                    member.online = j.d.status;
                }
            });

            const element = document.getElementById(`member-${j.d.id}`);

            if (element) {
                element.getElementsByTagName('img')[0].setAttribute('class', j.d.status ? 'online' : 'offline');
            }

        }
    } catch(e) {
        console.log(e);
    }
}

function snedMeHarder(event) {
    const elemelon = document.getElementById('whatthefuckdidyoujustsayaboutme');
    const msg = elemelon.value;

    if (event.keyCode === 13 && !event.shiftKey) {
        event.preventDefault();
        if (msg.length > 0) {
            request('POST', '/api/message', {
                Authorization: `Basic ${btoa(_auth)}`
            }, {
                server: selectedServer,
                content: msg
            });
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

    const members = document.getElementById('members');

    while(members.firstChild) {
        members.removeChild(members.firstChild);
    }

    const sortedMembers = servers.get(selectedServer).members.sort((a, b) => {
        const aLower = a.id.toUpperCase();
        const bLower = b.id.toUpperCase();

        if (aLower < bLower) {
            return -1;
        }

        if (aLower > bLower) {
            return 1;
        }

        return 0;
    });

    for (const member of sortedMembers) {
        const elemelon = document.createElement('div');
        const icon = document.createElement('img');
        const username = document.createElement('h2');

        elemelon.setAttribute('class', 'member');
        elemelon.setAttribute('id', `member-${member.id}`);
        icon.setAttribute('class', member.online ? 'online' : 'offline');
        icon.setAttribute('src', member.avatarUrl || 'default_avatar.png');
        icon.setAttribute('onerror', 'this.src = \'default_avatar.png\';');
        username.innerText = member.id;

        elemelon.appendChild(icon);
        elemelon.appendChild(username);

        members.appendChild(elemelon);
    }
}

function addMessage(message) { // This will come in handy later when we implement caching
    const messageContent = document.createElement('pre');

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
        const user = servers.get(message.server).members.find(m => m.id === message.author) || {};

        avatar.setAttribute('src', user.avatarUrl || 'default_avatar.png');
        avatar.setAttribute('onerror', 'this.src = \'default_avatar.png\';');

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

function request(method, path, headers = {}, body = {}) {
    return new Promise((resolve, reject) => {
        const req = new XMLHttpRequest();
        req.open(method, path, true);
        req.setRequestHeader('Content-Type', 'application/json');

        for (const header in headers) {
            req.setRequestHeader(header, headers[header]);
        }

        req.onload = () => {
            if (req.readyState === XMLHttpRequest.DONE) {
                if (req.status === 200) {
                    resolve(req.responseText);
                } else {
                    reject(req.responseText);
                }
            }
        };

        req.onerror = () => reject(req.responseText);
        req.send(JSON.stringify(body));
    });
}
