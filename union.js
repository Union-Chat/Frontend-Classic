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
    ws = new WebSocket(`ws://127.0.0.1:443`); // ws://${username}:${password}@union.serux.pro:2082
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
    } catch(e) {
        console.log(e);
    }
}
