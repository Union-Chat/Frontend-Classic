/* Formatting Regex */
const boldRegex = new RegExp('(?:(?!\\\\).|^)(\\*\\*(.*?)\\*\\*)', 'g');
const italicsRegex = new RegExp('(?:(?!\\\\).|^)(\\*(.*?)\\*)', 'g');
const strikethroughRegex = new RegExp('(?:(?!\\\\).|^)(\\~\\~(.*?)\\~\\~)', 'g');
const codeblockRegex = new RegExp('(?:(?!\\\\).|^)(\\`\\`\\`(.*?)\\`\\`\\`)', 'g');
const monoblockRegex = new RegExp('(?:(?!\\\\).|^)(\\`(.*?)\\`)', 'g');
const escapeRegex = /\\(\*|_|~|`)/g;

/* Other Regex */
const URLRegex = /(?:(?:https?|ftp|file):\/\/|www\.|ftp\.)(?:\([-A-Z0-9+&@#\/%=~_|$?!:,.]*\)|[-A-Z0-9+&@#\/%=~_|$?!:,.])*(?:\([-A-Z0-9+&@#\/%=~_|$?!:,.]*\)|[A-Z0-9+&@#\/%=~_|$])/igm; // eslint-disable-line
const emojiRegex = /:\w+:/g;
const imageRegex = /(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*\.(?:jpg|gif|png))(?:\?([^#]*))?(?:#(.*))?/g;
const mentionRegex = /\{(.+?)}/g;

const servers = new Map();
let currentUser = {
  id: null,
  tag: null
};
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

function load () {
  _auth = localStorage.getItem('token');

  if (null !== _auth) {
    connect();
  } else {
    document.getElementById('login').removeAttribute('style');
  }

  window.addEventListener('keydown', () => {
    const shouldFocus = !(document.activeElement && 'message-input' === document.activeElement.id);
    if (shouldFocus) {
      document.getElementById('message-input').focus();
    }
  });
}

function handleLoginShortcuts (event) {
  if (13 === event.keyCode) {
    connect();
  }
}

async function signup () {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  request('POST', '/api/create', {}, { username, password })
    .then(id => {
      alert(`Welcome to Union! Your ID for logging in: ${id}`);
    })
    .catch(err => {
      const { error } = JSON.parse(err);
      alert(error);
    });
}

function connect () {
  document.getElementById('login').style.display = 'none';
  ws = new WebSocket('wss://union.serux.pro:2096');
  //ws = new WebSocket('ws://127.0.0.1:2096'); /// dev
  ws.onopen = authenticateClient; // Stupid JS Websocket doesn't support headers REEEEEEEEE
  ws.onclose = handleWSClose;
  ws.onmessage = handleWSMessage;
}

function authenticateClient () {
  if (_auth) {
    currentUser.tag = atob(_auth).split(':')[0];
  } else {
    const [username, password] = ['username', 'password'].map(id => document.getElementById(id).value);
    _auth = btoa(`${username}:${password}`);
    currentUser.tag = username;
  }

  ws.send(`Basic ${_auth}`);
}

function handleWSClose (close) {
  console.log(`Websocket disconnected (${close.code}): ${close.reason}`);
  currentUser = { id: null, tag: null };

  const serverList = document.getElementById('servers');

  while(serverList.lastChild) {
    serverList.removeChild(serverList.lastChild);
  }

  if (4001 !== close.code) {
    setTimeout(connect, 3e3); // try to reconnect
  } else {
    _auth = null;
    localStorage.setItem('token', null);

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

function parseText (text, serverId) {
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

  while (null !== (bold = boldRegex.exec(filtered))) {
    if (0 === bold[2].length) {
      continue;
    }
    filtered = filtered.replace(bold[1], `<b>${bold[2]}</b>`);
  }

  while (null !== (italics = italicsRegex.exec(filtered))) {
    if (0 === italics[2].length) {
      continue;
    }
    filtered = filtered.replace(italics[1], `<i>${italics[2]}</i>`);
  }

  while (null !== (strikeThrough = strikethroughRegex.exec(filtered))) {
    if (0 === strikeThrough[2].length) {
      continue;
    }
    filtered = filtered.replace(strikeThrough[1], `<s>${strikeThrough[2]}</s>`);
  }

  while (null !== (codeblock = codeblockRegex.exec(filtered))) {
    if (codeblock[2].startsWith('<br>')) {
      codeblock[2] = codeblock[2].slice(4);
    }

    if (codeblock[2].endsWith('<br>')) {
      codeblock[2] = codeblock[2].slice(0, codeblock[2].length - 4);
    }

    if (0 === codeblock[2].length) {
      continue;
    }
    filtered = filtered.replace(codeblock[1], `<pre class="codeblock">${codeblock[2].trim()}</pre>`);
  }

  while (null !== (monoblock = monoblockRegex.exec(filtered))) {
    if (0 === monoblock[2].length) {
      continue;
    }
    filtered = filtered.replace(monoblock[1], `<span class="monoblock">${monoblock[2].trim()}</span>`);
  }

  for (const m of servers.get(serverId).members) {
    if (filtered.includes(`@${m.id}`)) {
      filtered = filtered.replace(new RegExp(`@${m.id}`, 'g'), `<span class="mention">@${m.id}</span>`);
    }
  }

  filtered = filtered.replace(escapeRegex, '$1'); // Hides backslash (escape character)

  return filtered;
}

function handleWSMessage (message) {
  try {
    const j = JSON.parse(message.data);
    console.log('WS message received', j);

    if (j.op === INBOUND_OPCODES.Hello) { // hello
      localStorage.setItem('token', _auth);

      if ('Notification' in window && 'default' === Notification.permission) {
        Notification.requestPermission();
      }

      const chatbox = document.getElementById('message-input');
      chatbox.addEventListener('keydown', snedMeHarder);

      j.d.forEach(addServer);

      const add = document.createElement('img');
      add.setAttribute('src', 'img/add_icon.png');
      add.setAttribute('onclick', 'toggleModalAnim("s-modal")');
      add.className = 'add-server';
      document.getElementById('servers').appendChild(add);
    }

    if (j.op === INBOUND_OPCODES.Message) { // message
      addMessage(j.d);

      if (j.d.content.toLowerCase().includes(`@${currentUser.tag.split('#')[0]}`) && 'Notification' in window && !document.hasFocus()) { // Mention
        const m = servers.get(j.d.server).members.find(m => m.id === j.d.author);

        const notif = new Notification(`${j.d.author} mentioned you!`, {
          icon: m ? m.avatarUrl : '',
          body: j.d.content.replace(mentionRegex, '@$1')
        });

        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      }

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
      servers.get(j.d.server).members.push(j.d.member);

      if (selectedServer === j.d.server) {
        const sortedMembers = servers.get(j.d.server).members.sort(reorderSort);
        displayMembers(sortedMembers);
      }
    } else if (j.op === INBOUND_OPCODES.ServerJoin) { // server join
      addServer(j.d, true);
    } else if (j.op === INBOUND_OPCODES.ServerLeave) {
      if (servers.has(j.d)) {
        servers.delete(j.d);
      }

      const s = document.getElementById(j.d);

      if (s) {
        s.remove();
      }

      if (selectedServer === j.d && 0 < servers.size) {
        switchServer([...servers.values()][0].id);
      }
    } else if (j.op === INBOUND_OPCODES.MemberLeave) {
      if (j.d.user === currentUser.id) { // TODO:
        const s = document.getElementById(j.d.server);

        if (s) {
          s.remove();
        }

        servers.delete(j.d.server);

        if (selectedServer === j.d.server && 0 < servers.size) {
          switchServer([...servers.values()][0].id);
        }
      } else {
        const serv = servers.get(j.d.server);
        const ind = serv.members.findIndex(u => u.id === j.d.user);

        serv.members.splice(ind, 1);

        const m = document.getElementById(`member-${j.d.user}`);

        if (m) {
          m.remove();
        }
      }
    }

  } catch(e) {
    console.log(e);
  }
}

function snedMeHarder (event) {
  const elemelon = document.getElementById('message-input');
  const msg = elemelon.value;

  if (13 === event.keyCode && !event.shiftKey) {
    event.preventDefault();
    if (0 < msg.trim().length) {
      request('POST', `https://union.serux.pro/api/server/${selectedServer}/messages`, {
        Authorization: `Basic ${_auth}`
      }, {
        content: msg
      });
      elemelon.value = '';
      resizeBox();
    }
  }
}

function scrollToBottom () {
  const container = document.getElementById('message-container');
  //const shouldScroll = container.scrollTop > (container.scrollHeight - container.offsetHeight); // TODO: FIND OPTIMAL VALUES

  //if (shouldScroll) {
  container.scrollTop = container.scrollHeight;
  //}
}

function switchServer (serverId) {
  const chatbox = document.getElementById('message-input');
  const serv = servers.get(serverId);

  if (selectedServer === serverId) {
    return;
  }

  selectedServer = serverId;

  markRead(serverId);

  if (serv.owner === currentUser.id) {
    document.getElementById('server-invite').style.display = 'initial';
    document.getElementById('server-delete').style.display = 'initial';
    document.getElementById('server-leave').style.display = 'none';
  } else {
    document.getElementById('server-invite').style.display = 'none';
    document.getElementById('server-delete').style.display = 'none';
    document.getElementById('server-leave').style.display = 'initial';
  }

  document.getElementById('server-title').innerText = serv.name;
  chatbox.removeAttribute('readonly');
  chatbox.setAttribute('placeholder', 'Roast your friends...');
  chatbox.style.visibility = 'visible';

  const sortedMembers = serv.members.sort(reorderSort);
  displayMembers(sortedMembers);

  const messages = document.getElementById('message-container');

  while(messages.firstChild) {
    messages.removeChild(messages.firstChild);
  }

  for (const m of serv.messages.values()) {
    addMessage(m);
  }

  scrollToBottom();
}

function addServer (server, select = false) {
  server.messages = new Map();
  servers.set(server.id, server);

  const s = document.createElement('div');
  s.setAttribute('class', 'server');
  s.setAttribute('id', server.id);
  s.setAttribute('server-name', server.name);
  s.addEventListener('click', () => switchServer(server.id));

  const icon = document.createElement('img');
  icon.setAttribute('src', server.iconUrl);
  icon.setAttribute('onerror', 'this.src = \'img/default_server.png\';');

  s.appendChild(icon);

  document.getElementById('servers').prepend(s);

  if (true === select) {
    switchServer(server.id);
  }
}

function addMessage (message) {
  servers.get(message.server).messages.set(message.id, message);

  if (message.server !== selectedServer) {
    markUnread(message.server);
    return;
  }

  const messageContent = document.createElement('pre');

  if (message.content.toLowerCase().includes(`@${currentUser.tag.split('#')[0]}`)) {
    messageContent.setAttribute('style', 'background: rgb(70, 70, 70);');
  }

  messageContent.innerHTML = parseText(message.content, message.server);

  const allMessages = document.querySelectorAll('.message');
  const lastMessage = allMessages[allMessages.length - 1];

  if (lastMessage && lastMessage.querySelector('h2').innerHTML === message.author) {
    lastMessage.getElementsByClassName('container')[0].appendChild(messageContent);
  } else {
    const m = document.createElement('div');
    m.setAttribute('class', 'message');

    const avatar = document.createElement('img');
    const user = servers.get(message.server).members.find(m => m.id === message.author) || {};

    avatar.setAttribute('src', user.avatarUrl || 'img/default_avatar.png');
    avatar.setAttribute('onerror', 'this.src = \'img/default_avatar.png\';');

    avatar.setAttribute('class', 'avatar');

    const container = document.createElement('div');
    container.setAttribute('class', 'container');

    const author = document.createElement('h2');
    author.innerText = message.author;

    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    timestamp.innerText = formatDate(new Date(message.createdAt));

    container.appendChild(author);
    container.appendChild(timestamp);
    container.appendChild(messageContent);

    m.appendChild(avatar);
    m.appendChild(container);

    document.getElementById('message-container').appendChild(m);
  }

  scrollToBottom();
}

function displayMembers (members) {
  const memberList = document.getElementById('members');

  while (null !== memberList.firstChild) {
    memberList.removeChild(memberList.firstChild);
  }

  for (const member of members) {
    const elemelon = document.createElement('div');
    const icon = document.createElement('img');
    const username = document.createElement('h2');

    elemelon.setAttribute('class', 'member');
    elemelon.setAttribute('id', `member-${member.id}`);
    icon.setAttribute('class', member.online ? 'online' : 'offline');
    icon.setAttribute('src', member.avatarUrl || 'img/default_avatar.png');
    icon.setAttribute('onerror', 'this.src = \'img/default_avatar.png\';');
    username.innerText = member.username;

    elemelon.appendChild(icon);
    elemelon.appendChild(username);

    memberList.appendChild(elemelon);
  }
}

function toggleModalAnim (modal) {
  const m = document.getElementById(modal);

  if (!m) {
    return;
  }

  if (!m.classList.contains('slideout')) {
    setTimeout(() => {
      if (m.classList.contains('slideout')) {
        m.style.display = 'none';
      }
    }, 500);
  } else {
    m.style.display = null;
  }

  setTimeout(() => m.classList.toggle('slideout'), 50);
}

function deleteServer () {
  if (!currentUser.id) {
    return console.warn('Unable to delete server; not logged in');
  }

  if (!selectedServer || !servers.get(selectedServer)) {
    return console.warn('Delete server called with an invalid server id');
  }

  if (servers.get(selectedServer).owner !== currentUser.id) {
    return alert('You cannot delete servers you don\'t own');
  }

  const proceed = confirm(`Click OK to confirm deletion of ${servers.get(selectedServer).name}`);

  if (!proceed) {
    return;
  }

  request('DELETE', `/api/server/${selectedServer}`, {
    Authorization: `Basic ${_auth}`
  });
}

function leaveServer () {
  if (!currentUser.id) {
    return console.warn('Unable to leave server; not logged in');
  }

  if (!selectedServer || !servers.get(selectedServer)) {
    return console.warn('Leave server called with an invalid server id');
  }

  if (servers.get(selectedServer).owner === currentUser.id) {
    return alert('You may not leave servers you own. Delete them instead.');
  }

  const proceed = confirm('Click OK to leave the server');

  if (!proceed) {
    return;
  }

  request('DELETE', `/api/self/server/${selectedServer}`, {
    Authorization: `Basic ${_auth}`
  });
}

function createServer () {
  const serverName = prompt('Server name?');

  if (!serverName) {
    toggleModalAnim('s-modal');
    return;
  }

  const iconUrl = prompt('Server icon (url)?', 'img/default_server.png');

  request('POST', '/api/server', {
    Authorization: `Basic ${_auth}`
  }, {
    name: serverName,
    iconUrl
  });

  toggleModalAnim('s-modal');
}

function joinServer () {
  const inviteCode = prompt('Enter invite code');

  if (!inviteCode) {
    toggleModalAnim('s-modal');
    return;
  }

  request('POST', `/api/invites/${inviteCode}`, {
    Authorization: `Basic ${_auth}`
  });

  toggleModalAnim('s-modal');
}

function resizeBox () {
  const chatbox = document.getElementById('message-input');
  chatbox.style.height = 'auto';
  chatbox.style.height = `${3 + chatbox.scrollHeight}px`;
}

function markUnread (serverId) {
  const indicator = document.querySelector(`[id="${serverId}"] .unread`);

  if (indicator) {
    return;
  }

  const unreadIndicator = document.createElement('div');
  unreadIndicator.className = 'unread';
  document.getElementById(serverId).appendChild(unreadIndicator);
}

function markRead (serverId) {
  const indicator = document.querySelector(`[id="${serverId}"] .unread`);

  if (indicator) {
    indicator.remove();
  }
}

async function generateInvite () {
  if (!currentUser.id) {
    return console.warn('Unable to generate invite; not logged in');
  }

  if (!selectedServer || !servers.get(selectedServer)) {
    return console.warn('Invite generation called with an invalid server id');
  }

  if (servers.get(selectedServer).owner !== currentUser.id) {
    return alert('You cannot generate invites for servers you don\'t own');
  }

  const invite = await request('POST', `/api/server/${selectedServer}/invite`, {
    Authorization: `Basic ${_auth}`
  })
    .catch(() => null);

  if (!invite) {
    return alert('Failed to generate invite!');
  }

  const modal = document.getElementById('i-modal');
  modal.style.display = 'initial';

  document.getElementById('invite-code').value = JSON.parse(invite).code;
}

function copyInvite () {
  const box = document.getElementById('invite-code');

  box.select();
  document.execCommand('copy');

  document.getElementById('i-modal').style.display = 'none';
  box.value = '';
}

function formatDate (d) {
  const now = new Date();

  if (now.getDate() === d.getDate()) {
    return `Today at ${forceTwoDigits(d.getHours())}:${forceTwoDigits(d.getMinutes())}`;
  } else {
    return `${forceTwoDigits(d.getDate())}/${forceTwoDigits(d.getMonth())}/${d.getFullYear()}`;
  }
}

function forceTwoDigits (number) {
  return number.toString().padStart(2, '0');
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
        if (200 === req.status) {
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
  'DeleteMessage': 8,  // message deleted
  'MemberLeave': 10    // member left server
};

const OUTBOUND_OPCODES = {
  'RequestMemberChunk': 9
};


//const voiceWS = new WebSocket('wss://union.serux.pro:2087');
//const broadcast = new WSAudioAPI.Streamer({}, voiceWS);
//const listen = new WSAudioAPI.Player({}, voiceWS);

//function startListening () {
//  listen.start();
//  const btn = document.getElementById('listenbtn');
//  btn.disabled = true;
//  btn.innerText = 'Listening...';
//}

//function startBroadcasting () {
//  broadcast.start();
//  const btn = document.getElementById('broadcastbtn');
//  btn.disabled = true;
//  btn.innerText = 'Broadcasting...';
//}
