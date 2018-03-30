let ws = null;

window.onload = requestUsername;

function requestUsername() {
    const username = prompt('Please enter your Union username');

    if (username.length === 0) {
        return requestUsername();
    } else {
        requestPassword(username);
    }
}

function requestPassword(username) {
    const password = prompt('Please enter your Union password');

    if (password.length === 0) {
        return requestPassword(username);
    } else {
        connect(username, password);
    }
}

function connect(username, password) {
    ws = new WebSocket(`ws://union.serux.pro:2082`);
    ws.onopen = () => authenticateClient(username, password); // Stupid JS Websocket doesn't support headers REEEEEEEEE
    ws.onclose = handleWSClose;
    ws.onmessage = handleWSMessage;
}

function authenticateClient(username, password) {
    const b64 = btoa(`${username}:${password}`); // Encode to base64
    ws.send(`Basic ${b64}`);
}

function handleWSClose(close) {
    alert(`Disconnected from Union (${close.code}): ${close.reason}`);
}

function handleWSMessage(message) {
    try {
        const j = JSON.parse(message.data);

        if (j.op === 1) {
            alert('Hey bitch, you logged in');
        }

        if (j.op === 3) {
            const m = document.createElement('div');
            m.setAttribute('class', 'message');

            const author = document.createElement('h2');
            author.innerText = j.d.author;

            const content = document.createElement('div');
            let filtered = j.d.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');

            for (let emoji of emojis) {
                while (filtered.includes(emoji[0])) {
                    const img = `<img src="${emoji[1]}">`; // this website employs a lot of bad practices atm
                    filtered = filtered.replace(emoji[0], img);
                }
            }
            content.innerHTML = filtered;

            m.appendChild(author);
            m.appendChild(content);

            const container = document.getElementById('message-container');
            container.appendChild(m);
            container.scrollTop = container.scrollHeight;
        }
    } catch(e) {
        console.log(e);
    }
}

const emojis = new Map([
    [':thinkMan:', 'https://cdn.discordapp.com/emojis/427561917989650444.png?v=1']
]);
