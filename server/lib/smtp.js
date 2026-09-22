'use strict';

const net = require('net');
const tls = require('tls');

function crlf(s) { return String(s).replace(/\r?\n/g, '\r\n'); }

function connect(host, port, secure) {
  return new Promise((resolve, reject) => {
    const socket = secure ? tls.connect({ host, port, servername: host }) : net.connect(port, host);
    const done = (fn) => (err) => (err ? reject(err) : fn(socket));
    socket.setEncoding('utf8');
    const onReady = () => resolve(socket);
    const onErr = (e) => reject(e);
    if (secure) socket.once('secureConnect', onReady);
    else socket.once('connect', onReady);
    socket.once('error', onErr);
    socket.once('close', () => { socket.removeListener('error', onErr); });
  });
}

function talk(socket) {
  return new Promise((resolve, reject) => {
    let buf = '';
    let last;
    const t = setTimeout(() => reject(new Error('timeout')), 15000);
    socket.on('data', function data(d) {
      buf += d;
      while (buf.indexOf('\r\n') !== -1) {
        const line = buf.slice(0, buf.indexOf('\r\n') + 2);
        buf = buf.slice(buf.indexOf('\r\n') + 2);
        if (/^\d{3} /.test(line) || line.trim() === '') { last = line; continue; }
        if (/^\d{3}-/.test(line)) { last = line; continue; }
        last = line;
      }
      if (last && /^\d{3}[\s]/.test(last) && last.indexOf('-') !== 3) {
        clearTimeout(t);
        socket.removeListener('data', data);
        resolve(last.trim());
      }
    });
    socket.once('error', (e) => { clearTimeout(t); reject(e); });
  });
}

function sendCmd(socket, cmd) {
  socket.write(crlf(cmd) + '\r\n');
  return talk(socket);
}

async function send({ host, port, secure, user, pass, from, to, subject, text }) {
  let socket = await connect(host, port, secure);
  try {
    let reply = await talk(socket);
    if (!/^220/.test(reply)) throw new Error('bad greeting: ' + reply);

    reply = await sendCmd(socket, 'EHLO ' + host);
    if (!/^250/.test(reply)) throw new Error('EHLO failed');

    if (!secure && String(port) === '587') {
      reply = await sendCmd(socket, 'STARTTLS');
      if (/^220/.test(reply)) {
        const upgraded = await new Promise((resolve, reject) => {
          const u = tls.connect({ socket, servername: host });
          u.once('secureConnect', () => resolve(u));
          u.once('error', reject);
        });
        socket = upgraded;
        reply = await sendCmd(socket, 'EHLO ' + host);
        if (!/^250/.test(reply)) throw new Error('EHLO after STARTTLS failed');
      }
    }

    if (user) {
      reply = await sendCmd(socket, 'AUTH PLAIN ' + Buffer.from('\0' + user + '\0' + pass).toString('base64'));
      if (!/^235/.test(reply)) throw new Error('AUTH failed: ' + reply);
    }

    reply = await sendCmd(socket, 'MAIL FROM:<' + from + '>');
    if (!/^250/.test(reply)) throw new Error('MAIL FROM failed');
    reply = await sendCmd(socket, 'RCPT TO:<' + to + '>');
    if (!/^250/.test(reply)) throw new Error('RCPT TO failed');

    reply = await sendCmd(socket, 'DATA');
    if (!/^354/.test(reply)) throw new Error('DATA failed');
    socket.write(crlf(
      'From: ' + from + '\r\n' +
      'To: ' + to + '\r\n' +
      'Subject: ' + subject + '\r\n' +
      'MIME-Version: 1.0\r\n' +
      'Content-Type: text/plain; charset=UTF-8; format=flowed\r\n' +
      'Content-Transfer-Encoding: 8bit\r\n' +
      '\r\n' +
      text
    ) + '\r\n.\r\n');
    reply = await talk(socket);
    if (!/^250/.test(reply)) throw new Error('message not accepted: ' + reply);

    await sendCmd(socket, 'QUIT');
  } finally {
    try { socket.destroy(); } catch (e) {}
  }
  return { accepted: true };
}

module.exports = { send };