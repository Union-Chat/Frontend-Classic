const boldRegex = /(\*\*).+(\*\*)/g;
const URLRegex = /(?:(?:https?|ftp|file):\/\/|www\.|ftp\.)(?:\([-A-Z0-9+&@#\/%=~_|$?!:,.]*\)|[-A-Z0-9+&@#\/%=~_|$?!:,.])*(?:\([-A-Z0-9+&@#\/%=~_|$?!:,.]*\)|[A-Z0-9+&@#\/%=~_|$])/igm; // eslint-disable-line
const emojiRegex = /:\w+:/g;
const imageRegex = /(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*\.(?:jpg|gif|png))(?:\?([^#]*))?(?:#(.*))?/g;

const validEmojis = (() => {
    const request = new XMLHttpRequest();
    request.open('GET', '/emojis.json', false);
    request.send();

    if (request.status !== 200) {
        return; // todo: report err
    }

    return JSON.parse(request.responseText);
})//();

let _auth = null;
let currentUser = null;
let ws = null;
let selectedServer = null;
const servers = new Map();

window.onload = requestUsername;

function requestUsername() {
    const username = prompt('Please enter your Union username');

    if (!username) {
        return;
    }

    if (username.length === 0) {
        return requestUsername();
    } else {
        requestPassword(username);
    }
}

function requestPassword(username) {
    const password = prompt('Please enter your Union password');

    if (!password) {
        return;
    }

    if (password.length === 0) {
        return requestPassword(username);
    } else {
        connect(`${username}:${password}`);
    }
}

function connect(auth) {
    ws = new WebSocket('wss://union.serux.pro:2096');
    ws.onopen = () => authenticateClient(auth); // Stupid JS Websocket doesn't support headers REEEEEEEEE
    ws.onclose = handleWSClose;
    ws.onmessage = handleWSMessage;
}

function authenticateClient(auth) {
    _auth = auth;
    const b64 = btoa(auth); // Encode to base64
    ws.send(`Basic ${b64}`);
    currentUser = auth.split(':')[0];
}

function handleWSClose(close) {
    if (close.code !== 4001) {
        setTimeout(() => connect(_auth), 3e3); // try to reconnect
    } else {
        // Show login modal
    }
    //alert(`Disconnected from Union (${close.code}): ${close.reason}`);
}

function parseText (text) {
    let filtered = text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace('\r\n', '<br>').replace(/\n/g, '<br>');

    const emojisInText = filtered.match(emojiRegex);
    if (emojisInText) {
        for (const emoji of emojisInText) {
            const image = validEmojis.find(e => e.toLowerCase().split('.').shift() === emoji.toLowerCase().slice(1, -1));
            if (!image) {
                continue;
            }

            filtered = filtered.replace(emoji, `<span data-tooltip="${emoji.toLowerCase().replace(/:/g, '\u200b:')}"><img src="./emoji/${image}"></span>`);
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

                const icon = document.createElement('img');
                icon.setAttribute('src', server.iconUrl);

                icon.addEventListener('click', () => switchServer(s));

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
    const mentions = message.content.includes(`@${currentUser}`);

    if (mentions) {
        messageContent.setAttribute('style', 'background: rgb(70, 70, 70);');
    }

    messageContent.innerHTML = parseText(message.content);

    const allMessages = document.querySelectorAll('.message');
    const lastMessage = allMessages[allMessages.length - 1];

    if (lastMessage && lastMessage.querySelector('h2').innerHTML === message.author) {
        lastMessage.appendChild(messageContent);
    } else {
        const m = document.createElement('div');
        m.setAttribute('class', 'message');

        const author = document.createElement('h2');
        author.innerText = message.author;

        m.appendChild(author);
        m.appendChild(messageContent);

        document.getElementById('message-container').appendChild(m);
    }
}
