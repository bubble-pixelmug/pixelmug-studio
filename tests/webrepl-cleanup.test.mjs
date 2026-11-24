import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebSocketServer } from 'ws';
import { once } from 'node:events';
import { WebRepl } from '../src/webrepl.mjs';

for (const resetAck of [true,false]) test('cleanup verifies a separate probe before reset; reset ACK ' + (resetAck?'received':'lost with no disconnect'),{timeout:5000},async()=>{
  const server=new WebSocketServer({host:'127.0.0.1',port:0});
  await once(server,'listening');
  let connections=0,interrupts=0,resets=0;
  const executed=[];
  let resetReceived;
  const receivedReset=new Promise(resolve=>{resetReceived=resolve;});
  server.on('connection',socket=>{
    connections++;
    socket.send('Password: ');
    socket.on('message',bytes=>{
      const text=bytes.toString();
      if(text==='pixelmug\r')socket.send('WebREPL connected\r\n>>> ');
      else if(text==='\r\x03\x03\x01') {interrupts++;socket.send('raw REPL; CTRL-B to exit\r\n>');}
      else if(text==='\x02')socket.send('>>> ');
      else if(text.endsWith('\x04')) {
        executed.push(text);
        if (!text.includes('machine.reset()') || resetAck) socket.send('OK');
        const marker=/print\("([\w-]+)"\)/.exec(text)?.[1];
        if(text.includes('machine.reset()')) {
          resets++;resetReceived();if(resetAck)socket.close();
        } else if(marker)socket.send(marker+'\r\n\x04\x04>');
      }
    });
  });
  const repl=new WebRepl({timeout:1000});
  const progress=[];
  try {
    await repl.connect('127.0.0.1',server.address().port);
    await repl.start('while True: pass');
    repl.cancelOperations();
    await repl.reboot(message=>progress.push(message));
    // Production cleanup closes immediately after the command has been sent.
    repl.close();
    await receivedReset;
    assert.equal(connections,1);assert.equal(resets,1);assert.equal(interrupts,3);
    assert.equal(repl.closed,true);
    assert.match(executed.at(-2),/^print\("studio-reset-/);
    assert.doesNotMatch(executed.at(-2),/machine/);
    assert.equal(executed.at(-1),'import machine; machine.reset()\x04');
    assert.deepEqual(progress,[
      'waiting for raw REPL prompt after interrupt',
      'raw REPL prompt received after interrupt',
      'waiting for probe command acknowledgement',
      'probe command acknowledged',
      'waiting for probe output and raw REPL prompt',
      'probe marker and raw REPL prompt verified',
      'separate reboot command sent; normal-mode recovery is not yet verified',
    ]);
  } finally {repl.close();server.close();await once(server,'close');}
});

test('cancellation rejects an in-flight transfer and blocks its later writes without closing the socket',async()=>{
  const repl=new WebRepl();let writes=0;
  repl.ws={readyState:1,send(){writes++;},terminate(){}};
  const pending=repl.take(()=>undefined);
  repl.cancelOperations();
  await assert.rejects(pending,/cancelled/);
  assert.throws(()=>repl.send('old upload bytes'),/cancelled/);
  assert.equal(writes,0);assert.equal(repl.closed,false);
  repl.close();
});

test('cleanup cannot open a new connection when the original WebREPL is unavailable',async()=>{
  const repl=new WebRepl();repl.closed=true;
  await assert.rejects(repl.reboot(),/Original authenticated/);
  assert.equal(repl.ws,undefined);
});

test('cleanup distinguishes failure to interrupt from failure to acknowledge a probe command',async()=>{
  for (const promptReady of [false,true]) {
    const repl=new WebRepl({timeout:10});
    repl.ws={readyState:1,send(){},terminate(){}};
    repl.raw=async()=>{if(!promptReady)throw new Error('WebREPL operation timed out');};
    try {
      await assert.rejects(repl.reboot(),error=>{
        assert.equal(error.code,'STUDIO_WEBREPL_CLEANUP_FAILED');
        assert.match(error.message,promptReady?/waiting for probe command acknowledgement/:/waiting for raw REPL prompt after interrupt/);
        return true;
      });
      assert.equal(repl.listenerCount('output'),0);
      assert.equal(repl.listenerCount('disconnect'),0);
    } finally {repl.close();}
  }
});

test('cleanup does not send a reboot when the probe output fails verification',async()=>{
  const repl=new WebRepl({timeout:100});const sent=[];
  repl.ws={readyState:1,send(text){
    sent.push(text);
    queueMicrotask(()=>{
      repl.buffer=Buffer.from('OKwrong-marker\r\n\x04\x04>');
      repl.pump();
    });
  },terminate(){}};
  repl.raw=async()=>{};
  try {
    await assert.rejects(repl.reboot(),/probe marker did not match/);
    assert.equal(sent.length,1);
    assert.doesNotMatch(sent[0],/machine.reset/);
    assert.equal(repl.listenerCount('disconnect'),0);
  } finally {repl.close();}
});

test('cleanup still reports a local failure to send the reset command',async()=>{
  const repl=new WebRepl({timeout:100});
  repl.ws={readyState:1,send(text,callback){
    if(text.includes('machine.reset()')) {callback(new Error('Socket write failed'));return;}
    const marker=/print\("([\w-]+)"\)/.exec(text)[1];
    queueMicrotask(()=>{repl.buffer=Buffer.from('OK'+marker+'\r\n\x04\x04>');repl.pump();});
  },terminate(){}};
  repl.raw=async()=>{};
  try {
    await assert.rejects(repl.reboot(),/sending separate reboot command.*Socket write failed/);
  } finally {repl.close();}
});
