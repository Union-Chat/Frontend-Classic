/* Formatting Regex */
const boldRegex = new RegExp('(?<!\\\\)\\*\\*(.*?)\\*\\*', 'g');
const italicsRegex = new RegExp('(?<!\\\\)\\*(.*?)\\*', 'g');
const strikethroughRegex = new RegExp('(?<!\\\\)\\~\\~(.*?)\\~\\~', 'g');
const codeblockRegex = new RegExp('(?<!\\\\)\\`\\`\\`(.*?)\\`\\`\\`', 'g');
const escapeRegex = /\\(\*|_|~|`)/g;

/* Other Regex */
const URLRegex = /(?:(?:https?|ftp|file):\/\/|www\.|ftp\.)(?:\([-A-Z0-9+&@#\/%=~_|$?!:,.]*\)|[-A-Z0-9+&@#\/%=~_|$?!:,.])*(?:\([-A-Z0-9+&@#\/%=~_|$?!:,.]*\)|[A-Z0-9+&@#\/%=~_|$])/igm; // eslint-disable-line
const emojiRegex = /:\w+:/g;
const imageRegex = /(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*\.(?:jpg|gif|png))(?:\?([^#]*))?(?:#(.*))?/g;
const mentionRegex = /\{(.+?)}/g;

const servers = new Map();
let currentUser = null;
let _auth = null;
let ws = null;
let selectedServer = null;


function reorderSort (a, b) {
  if (!a.online && b.online) {
    return 1;
  }
  if (a.online && !b.online) {
    return -1;
  }

  const aUpper = a.id.toUpperCase();
  const bUpper = b.id.toUpperCase();

  if (aUpper < bUpper) {
    return -1;
  }

  if (aUpper > bUpper) {
    return 1;
  }

  return 0;
}

function handleLoginShortcuts (event) {
  if (event.keyCode === 13) {
    connect();
  }
}

async function signup () {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const req = await request('POST', '/api/create', {}, { username, password });
  alert(req);
}

function connect () {
  document.getElementById('login').style.display = 'none';
  ws = new WebSocket('wss://union.serux.pro:2096');
  ws.onopen = authenticateClient; // Stupid JS Websocket doesn't support headers REEEEEEEEE
  ws.onclose = handleWSClose;
  ws.onmessage = handleWSMessage;
}

function authenticateClient () {
  if (_auth !== null) {
    currentUser = atob(_auth).split(':')[0];
  } else {
    const [username, password] = ['username', 'password'].map(id => document.getElementById(id).value);
    _auth = btoa(`${username}:${password}`);
    currentUser = username;
  }

  ws.send(`Basic ${_auth}`);
}

function handleWSClose (close) {
  console.log(`Websocket disconnected (${close.code}): ${close.reason}`);
  currentUser = null;

  const serverList = document.getElementById('servers');

  while(serverList.lastChild) {
    serverList.removeChild(serverList.lastChild);
  }

  if (close.code !== 4001) {
    setTimeout(connect, 3e3); // try to reconnect
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

function parseText (text) {
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

  const urlsInText = filtered.match(URLRegex);
  if (urlsInText) {
    for (const URL of urlsInText) {
      filtered = filtered.replace(URL, `<a target="_blank" href="${URL}">${URL}</a>`);

      const imageMatch = URL.match(imageRegex);
      if (imageMatch) {
        filtered += `<br><img src="${imageMatch[0]}" class="embed" onload="scrollToBottom()">`;
      }
    }
  }

  while ((bold = boldRegex.exec(filtered)) !== null) {
    if (bold[1].length === 0) {
      continue;
    }
    filtered = filtered.replace(bold[0], `<b>${bold[1]}</b>`);
  }

  while ((italics = italicsRegex.exec(filtered)) !== null) {
    if (italics[1].length === 0) {
      continue;
    }
    filtered = filtered.replace(italics[0], `<i>${italics[1]}</i>`);
  }

  while ((strikeThrough = strikethroughRegex.exec(filtered)) !== null) {
    if (strikeThrough[1].length === 0) {
      continue;
    }
    filtered = filtered.replace(strikeThrough[0], `<s>${strikeThrough[1]}</s>`);
  }

  while ((codeblock = codeblockRegex.exec(filtered)) !== null) {
    if (codeblock[1].startsWith('<br>')) {
      codeblock[1] = codeblock[1].slice(4);
    }

    if (codeblock[1].endsWith('<br>')) {
      codeblock[1] = codeblock[1].slice(0, codeblock[1].length - 4);
    }

    if (codeblock[1].length === 0) {
      continue;
    }
    filtered = filtered.replace(codeblock[0], `<pre class="codeblock">${codeblock[1].trim()}</pre>`);
  }

  while ((mention = mentionRegex.exec(filtered)) !== null) {
    servers.forEach(server => {
      if (server.members.some(m => m.id.toLowerCase() === mention[1].toLowerCase())) {
        filtered = filtered.replace(mention[0], `<span class="mention">@${mention[1]}</span>`);
      }
    });
  }

  filtered = filtered.replace(escapeRegex, '$1'); // Hides backslash (escape character)

  return filtered;
}

function handleWSMessage (message) {
  try {
    const j = JSON.parse(message.data);
    console.log('WS message received', j);

    if (j.op === INBOUND_OPCODES.Hello) { // hello
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }

      const chatbox = document.getElementById('whatthefuckdidyoujustsayaboutme');
      chatbox.addEventListener('keydown', snedMeHarder);

      j.d.forEach(addServer);

      const add = document.createElement('img');
      add.setAttribute('src', 'add_icon.png');
      add.setAttribute('onclick', 'showServerModal()');
      add.className = 'add-server';
      document.getElementById('servers').appendChild(add);
    }

    if (j.op === INBOUND_OPCODES.Message) { // message
      if (j.d.server !== selectedServer) {
        return;
      }

      addMessage(j.d);

      if (j.d.content.toLowerCase().includes(`{${currentUser.toLowerCase()}}`) && 'Notification' in window && !document.hasFocus()) { // Mention
        const notif = new Notification(`${j.d.author} mentioned you!`, {
          body: j.d.content.replace(mentionRegex, '@$1')
        });
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      }

      scrollToBottom();

    } else if (j.op === INBOUND_OPCODES.PresenceUpdate) { // presence update
      servers.forEach(server => {
        const member = server.members.find(m => m.id === j.d.id);
        if (member) {
          member.online = j.d.status;
        }
      });

      if (selectedServer) {
        const sortedMembers = servers.get(selectedServer).members.sort(reorderSort);
        displayMembers(sortedMembers);
      }

    } else if (j.op === INBOUND_OPCODES.MemberAdd) { // member add
      // This isn't dispatched by the server yet
    } else if (j.op === INBOUND_OPCODES.ServerJoin) { // server join
      addServer(j.d);
    } else if (j.op === INBOUND_OPCODES.ServerLeave) {
      if (servers.has(j.d)) {
        servers.delete(j.d);
      }

      const s = document.getElementById(j.d);

      if (s) {
        s.parentElement.removeChild(s);
      }
    }


  } catch(e) {
    console.log(e);
  }
}

function snedMeHarder (event) {
  const elemelon = document.getElementById('whatthefuckdidyoujustsayaboutme');
  const msg = elemelon.value;

  if (event.keyCode === 13 && !event.shiftKey) {
    event.preventDefault();
    if (msg.trim().length > 0) {
      request('POST', `/api/server/${selectedServer}/messages`, {
        Authorization: `Basic ${_auth}`
      }, {
        content: msg
      });
      elemelon.value = '';
    }
  }
}

function scrollToBottom() {
  const container = document.getElementById('message-container');
  const shouldScroll = container.scrollTop > (container.scrollHeight - container.offsetHeight) - 100;

  if (shouldScroll) {
    container.scrollTop = container.scrollHeight;
  }
}

function switchServer (server) {
  const chatbox = document.getElementById('whatthefuckdidyoujustsayaboutme');
  const id = Number(server.id);
  const name = server.getAttribute('server-name');

  if (selectedServer === id) {
    return;
  }

  selectedServer = id;

  chatbox.removeAttribute('readonly');
  chatbox.setAttribute('placeholder', `Message ${name}...`);

  const sortedMembers = servers.get(selectedServer).members.sort(reorderSort);
  displayMembers(sortedMembers);

  const messages = document.getElementById('message-container');

  while(messages.firstChild) {
    messages.removeChild(messages.firstChild);
  }

  for (const m of servers.get(id).messages.values()) {
    addMessage(m);
  }

  scrollToBottom();
}

function addServer (server) {
  server.messages = new Map();
  servers.set(server.id, server);

  const s = document.createElement('div');
  s.setAttribute('class', 'server');
  s.setAttribute('id', server.id);
  s.setAttribute('server-name', server.name);
  s.addEventListener('click', () => switchServer(s));

  const icon = document.createElement('img');
  icon.setAttribute('src', server.iconUrl);
  icon.setAttribute('onerror', 'this.src = \'default_avatar.png\';');

  s.appendChild(icon);

  document.getElementById('servers').prepend(s);
}

function addMessage (message) { // This will come in handy later when we implement caching
  servers.get(message.server).messages.set(message.id, message);

  const messageContent = document.createElement('pre');

  if (message.content.toLowerCase().includes(`{${currentUser.toLowerCase()}}`)) {
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

function displayMembers (members) {
  const memberList = document.getElementById('members');

  while (memberList.firstChild !== null) {
    memberList.removeChild(memberList.firstChild);
  }

  for (const member of members) {
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

    memberList.appendChild(elemelon);
  }
}

function showServerModal () {
  const modal = document.getElementById('s-modal');

  if (modal.style.visibility === 'visible') {
    modal.style.visibility = 'hidden';
  } else {
    modal.style.visibility = 'visible';
  }
}

function createServer () {
  const modal = document.getElementById('s-modal');
  const serverName = prompt('Server name?');

  if (!serverName) {
    modal.style.visibility = 'hidden';
    return;
  }

  const iconUrl = prompt('Server icon (url)?', 'default_avatar.png');

  request('POST', '/api/server', {
    Authorization: `Basic ${_auth}`
  }, {
    name: serverName,
    iconUrl
  });

  modal.style.visibility = 'hidden';
}

function request (method, path, headers = {}, body = {}) {
  console.log(`Sending request\n\tMethod: ${method}\n\tRoute: ${path}\n\tHeaders: ${headers}\n\tBody: ${body}`);

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


const INBOUND_OPCODES = {
  'Hello': 1,          // initial connection
  'MemberAdd': 2,      // member joined server
  'Message': 3,        // received message
  'PresenceUpdate': 4, // member presence update
  'ServerJoin': 5,     // self joined server
  'ServerLeave': 6,    // self left server
  'MemberChunk': 7,    // received chunk of server members
  'DeleteMessage': 8   // message deleted
};

const OUTBOUND_OPCODES = {
  'RequestMemberChunk': 9,
  'SendMessage': 10,
  'JoinServer': 11 // Should this be REST?
};
