const http = require('http');
const Koa = require('koa');
const Router = require('@koa/router');
const wsEasy = require('koa-easy-ws');
const cors = require('@koa/cors');
const koaBody = require('koa-body');
const koaStatic = require('koa-static');
const fullpath = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const serv = require('./srv-functions');
const public = fullpath.join(__dirname, '/public');
const uploadFolder = fullpath.join(__dirname, '/public/upload');
// Cleaning
if (fs.existsSync(uploadFolder)) {
  fs.rmSync(uploadFolder, { recursive: true, force: true });
}
if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder);

const app = new Koa();
const router = new Router();
const websocket = wsEasy('ws', {
  wsOptions: {
    clientTracking: true,
    maxPayload: 69420
  }
});

app
  .use(cors())
  .use(koaStatic(public))
  .use(websocket)
  .use(koaBody({
    text: true,
    urlencoded: true,
    multipart: true,
    json: true,
    uploadDir: '.',
  }),
);

let storage = new Map();
let attachments = [];
let files = new Map();
let counter = 0;
let pinId = 0;
let token = null;

function getAllMessages() {
  let array = [];
  Array.from(storage).forEach( item => array.push(item));
  return array.reverse();
}
function getLastMessages(count = null) {
  let array = [];
  getAllMessages().forEach((item, idx) => {
    if (!count || idx < count) array.push(item);
  });
  return array;
}
function getMessagesSearch(string) {
  const split = string.split('|');
  console.log(split);
  const force = (split[0] === 'force' && split.length > 1) ? true : false;
  const arr = getLastMessages();
  const str = String((force) ? split[1] : string);
  let array = [];
  arr.forEach(item => {
    if (force) {
      if (JSON.stringify(item).indexOf(str) > -1) array.push(item);
    } else {
      const m = item[1];
      const a = getFiles(item[0]);
      if (m.message === str || a.name === str) array.push(item);
    }
  });
  return array;
}
function getMessagesN(start, end = null) {
  let array = [];
  getAllMessages().forEach( (item, idx) => {
    if ( idx >= (start - 1) && (!end || (end && idx <= (end - 1))) ) array.push(item);
  });
  return array;
}
function getMessage(id) {
  const msg = storage.get(Number(id));
  if (msg) return [id, msg];
  return null;
}
function getFiles(id) {
  const ff = files.get(Number(id));
  if (ff) return ff;
  return null;
}
function getAttachments(id) {
  return attachments.get(id);
}
function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
router
  .get('/ws', async (ctx, next) => {
    if (ctx.ws) {
      const ws = await ctx.ws() // retrieve socket

      ws.on('message', msg => {
        Array.from(websocket.server.clients)
        .filter(o => o.readyState === 1)
        .forEach(o => o.send(msg));
      });
    }
    next();
  })
  .get('/feed', (ctx, next) => {
    Array.from(files).forEach(item => console.log(item));
    console.log(attachments);
    const feedCount = 5;
    ctx.response.body = JSON.stringify({
      error: false,
      response: getLastMessages(feedCount),
      count: Array.from(storage).length,
    });
    ctx.response.status = 200;
    next();
  })
  .get('/feed/:string', (ctx, next) => {
    if (ctx.params.string === 'count') {
      ctx.response.body = JSON.stringify({
        count: Array.from(storage).length,
      });
      ctx.response.status = 200;
      next();
      return;
    }
    const arr = ctx.params.string.split('-');
    console.log(arr);
    const twoArgs = (arr.length > 1) ? true : false;
    const start = Number(arr[0]);
    const end = (twoArgs) ? Number(arr[1]) : null;
    if (
    (twoArgs && start > 0 && end >= start) ||
    (!twoArgs && start > 0 && start <= Array.from(storage).length)) {
      ctx.response.body = JSON.stringify({
        error: false,
        response: getMessagesN(start, end),
        count: Array.from(storage).length,
      });
      ctx.response.status = 200;
    } else {
      ctx.response.body = JSON.stringify({
        error: true,
        response: 'Invalid request of getting feed items',
      });
      ctx.response.status = 400;
    }
    next();
  })
  .get('/search/:string', (ctx, next) => {
    const string = ctx.params.string;
    if (string.length > 2) {
      ctx.response.body = JSON.stringify({
        error: false,
        response: getMessagesSearch(string),
      });
      ctx.response.status = 200;
    } else {
      ctx.response.body = JSON.stringify({
        error: true,
        response: 'Search string is very short',
      });
      ctx.response.status = 400;
    }
    next();
  })
  .get('/attachments/get/:id', (ctx, next) => {
    const array = getFiles(ctx.params.id);
    if (array) {
      let links = [];
      array.forEach(a => {
        links.push({
          id: a.id,
          type: a.type,
          name: a.name,
          size: a.size,
          url: `${a.path}/${a.filename}`,
        })
      })
      ctx.response.body = links;
      ctx.response.status = 200;
    } else {
      ctx.response.body = JSON.stringify({
        error: true,
        response: 'Invalid id number for attachment',
      });
      ctx.response.status = 400;
    }
    next();
  })
  .get('/clear', (ctx, next) => {
    storage.clear();      counter = 0;
    ctx.response.body = JSON.stringify({
      error: false,
      response: 'Clear Tree messages'
    });
    ctx.response.status = 200;
    next();
  })
  .post('/send', async (ctx, next) => {
    if (ctx.request.body.message || ctx.request.body.attachCount > 0) {
      counter += 1;
      storage.set(counter, ctx.request.body);
      token = uuidv4();
      ctx.response.body = JSON.stringify({
        error: false,
        token: token,
        response: getMessage(counter),
        count: Array.from(storage).length,
      });
      ctx.response.status = 200;
    } else {
      ctx.response.body = JSON.stringify({
        error: true,
        response: 'Message empty or incorrect!'
      });
      ctx.response.status = 400;
    }
    next();
  })
  .get('/attachments/generate-id', (ctx, next) => {
    ctx.response.body = JSON.stringify(uuidv4());
    ctx.response.status = 200;
    next();
  })
  /*  Когда отправляется сообщение в ленту, следом идет запрос
      /attachment , который проверяет что имеется в прикреплениях и
      отправляет на них ссылки и информацию из attachments
  */
  .post('/attachments/add', (ctx, next) => {
    if (ctx.request.body && ctx.request.body.token === token) {
      files.set(counter, attachments);
      let links = [];
      attachments.forEach(a => {
        links.push({
          id: a.id,
          type: a.type,
          name: a.name,
          size: a.size,
          url: `${a.path}/${a.filename}`,
        })
      })
      attachments = [];
      ctx.response.body = links;
      ctx.response.status = 200;
    } else {
      ctx.response.body = JSON.stringify({
        error: true,
        response: 'Failed attachment for message (or invalid token)'
      });
      ctx.response.status = 400;
    }
    next();
  })
  /*  Срабатывает при загрузке файлов/изображений на сервер
  */
  .post('/upload', async (ctx, next) => {
    try {
      const uploadUrl = 'upload/attachments';
      const folder = uploadFolder + `/attachments`;
      if (!fs.existsSync(folder)) fs.mkdirSync(folder);

      const {path, name, type, size} = ctx.request.files.content;
      const id = ctx.request.body.id;
      if (ctx.request.body.name) selfname = ctx.request.body.name;
      else selfname = name;
      const filename = `${Date.now()}_${name}`;
      await fs.copy(path, `${folder}/${filename}`);
      await timeout(200);
      attachments.push({
        id, type, filename,
        name: selfname,
        path: uploadUrl,
        size: size,
        created: Date.now(),
      })
      ctx.response.body = JSON.stringify({
        error: false,
        response: id,
      });
      ctx.response.status = 200;
    } catch (err) {
      ctx.response.body = JSON.stringify({
        error: true,
        response: err
      });
      ctx.response.status = 400;
    }
    next();
  })
  .post('/pin/set/:id', async (ctx, next) => {
    if (ctx.params.id) {
      pinId = Number(ctx.params.id);
      ctx.response.body = JSON.stringify({
        error: false,
        response: (pinId === 0) ? true : getMessage(pinId),
      });
      ctx.response.status = 200;
    } else {
      ctx.response.body = JSON.stringify({
        error: true,
        response: 'Invalid id'
      });
      ctx.response.status = 400;
    }
    next();
  })
  .get('/pin/get', async (ctx, next) => {
    if (pinId < 1) {
      ctx.response.body = JSON.stringify({
        error: true,
        response: 'No pinned messages',
      });
      ctx.response.status = 200;
      return;
    }
    ctx.response.body = JSON.stringify({
      error: false,
      response: getMessage(pinId),
    });
    ctx.response.status = 200;
    next();
  })
  .delete('/upload/remove/:id', (ctx, next) => {
    if (ctx.params.id) {
      let status = 400;
      for (let a, i = 0; i < attachments.length; i++) {
        a = attachments[i];
        if (ctx.params.id === attachments[i].id) {
          fs.unlink(public + '/' + a.path + '/' + a.filename, err => {
            console.log(err)
          });
          attachments.splice(i, 1);
          status = 200;
        }
      }
      ctx.response.body = JSON.stringify({
        error: (status === 200) ? false : true,
        response: null,
      });
      ctx.response.status = status;
    }
    next();
  })

app
  .use(router.routes())
  .use(router.allowedMethods())
  const port = process.env.PORT || 7070;
  const server = http.createServer(app.callback()).listen(port);
