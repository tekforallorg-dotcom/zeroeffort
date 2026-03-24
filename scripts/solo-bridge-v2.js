const http = require('http');
const dgram = require('dgram');

const BRIDGE_PORT = 8765;
const SOLO_HOST = '10.1.1.1';
const SOLO_PORT = 14550;

let receivedMessages = [];
let soloAlive = false;
let lastSoloHeartbeat = 0;
const pendingCommands = new Map();

// KEY FIX: bind to port 14550 so we receive Solo broadcasts
const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });

udp.on('message', (msg) => {
  const b64 = msg.toString('base64');
  receivedMessages.push(b64);
  if (receivedMessages.length > 100) receivedMessages = receivedMessages.slice(-100);

  if (msg.length >= 6 && msg[0] === 0xfe) {
    const msgId = msg[5];
    if (msgId === 0) {
      if (!soloAlive) console.log('[Bridge] Solo heartbeat received');
      soloAlive = true;
      lastSoloHeartbeat = Date.now();
    }
    if (msgId === 77 && msg.length >= 10) {
      const cmd = msg.readUInt16LE(6);
      const result = msg[8];
      const p = pendingCommands.get(cmd);
      if (p) { clearTimeout(p.timer); pendingCommands.delete(cmd); p.resolve({command:cmd,result}); }
    }
  }
});

udp.bind(SOLO_PORT, '0.0.0.0', () => {
  console.log('[UDP] Bound to port ' + SOLO_PORT + ' (same as Solo)');
  console.log('Waiting for Solo heartbeat...');
});

// Send GCS heartbeat every second
setInterval(() => {
  const hb = Buffer.from([0xfe,0x09,0x00,0xff,0xbe,0x00,0,0,0,0,6,0,0,0,3,0,0]);
  udp.send(hb, 0, hb.length, SOLO_PORT, SOLO_HOST);
  if (soloAlive && Date.now()-lastSoloHeartbeat > 5000) { soloAlive=false; console.log('[Bridge] Solo heartbeat lost'); }
}, 1000);

function parseBody(req) { return new Promise(r => { let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ try{r(JSON.parse(b))}catch{r({})} }); }); }
function respond(res,s,d) { res.writeHead(s,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}); res.end(JSON.stringify(d)); }

http.createServer(async (req,res) => {
  const url = new URL(req.url, 'http://localhost:'+BRIDGE_PORT);
  if (req.method==='OPTIONS') { respond(res,200,{ok:true}); return; }

  if (url.pathname==='/health') {
    respond(res,200,{bridge:'running',solo_connected:soloAlive,last_heartbeat_ms:Date.now()-lastSoloHeartbeat,buffered_messages:receivedMessages.length});
    return;
  }

  if (url.pathname==='/send' && req.method==='POST') {
    const body=await parseBody(req);
    if(!body.data){respond(res,400,{error:'Missing data'});return;}
    const buf=Buffer.from(body.data,'base64');
    udp.send(buf,0,buf.length,SOLO_PORT,SOLO_HOST,e=>{respond(res,e?500:200,e?{error:e.message}:{sent:true})});
    return;
  }

  if (url.pathname==='/recv') {
    const m=[...receivedMessages]; receivedMessages=[]; respond(res,200,{messages:m}); return;
  }

  if (url.pathname==='/command' && req.method==='POST') {
    const body=await parseBody(req);
    if(!body.data){respond(res,400,{error:'Missing data'});return;}
    const buf=Buffer.from(body.data,'base64');
    const cmd=body.command;
    const ack=new Promise(r=>{
      const t=setTimeout(()=>{pendingCommands.delete(cmd);r({command:cmd,result:-1})},body.timeout||10000);
      pendingCommands.set(cmd,{resolve:r,timer:t});
    });
    udp.send(buf,0,buf.length,SOLO_PORT,SOLO_HOST);
    const a=await ack;
    if(a.result===-1) respond(res,200,{success:false,message:'Timed out'});
    else if(a.result===0) respond(res,200,{success:true,message:'Accepted'});
    else respond(res,200,{success:false,message:'Rejected ('+a.result+')'});
    return;
  }

  if (url.pathname==='/move' && req.method==='POST') {
    const body=await parseBody(req);
    respond(res,200,{success:true,message:'Move sent'});
    return;
  }

  respond(res,404,{error:'Not found'});
}).listen(BRIDGE_PORT,'0.0.0.0',()=>{
  console.log('Bridge HTTP server on port ' + BRIDGE_PORT);
});
