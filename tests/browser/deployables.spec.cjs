// Real local Worker and shared-simulation shot. Does not inject inventory or move the ball through a test hook.
const {test,expect}=require('@playwright/test');
const {until}=require('./support/app.cjs');
const {roomCode,openPlayer}=require('./support/rooms.cjs');

test('course powerups: a physical opening shot earns a server-owned pickup exactly once',async({browser},info)=>{
  const contexts=[];
  try{
    const code=roomCode('G1E');
    const ana=await openPlayer(browser,info,'Ana',{contexts});await ana.join(code);
    const ben=await openPlayer(browser,info,'Ben',{contexts});await ben.join(code);
    await ana.button('Start Game').click();
    for(const p of [ana,ben])await p.ui('map-select').locator('button[data-v]').first().click();
    await until(()=>ana.ready(),{label:'ready to collect the opening-route box'});
    expect(await ana.page.evaluate(()=>window.__ppApp.putt.course.q.length)).toBe(6);
    await ana.shoot(22,0.85);
    await until(()=>ana.page.evaluate(()=>{
      const a=window.__ppApp;return a.room.snapshot.gameplay.inventories[a.room.localId]?.length===1;
    }),{label:'physical shot receives a server-owned inventory item'});
    const first=await ana.page.evaluate(()=>{
      const a=window.__ppApp,g=a.room.snapshot.gameplay;
      return {id:a.room.localId,inventory:g.inventories[a.room.localId],collected:g.collected[a.room.localId],local:a.putt.player.inventory};
    });
    expect(first.collected).toEqual([0]);expect(first.local).toEqual(first.inventory);
    await until(()=>ben.page.evaluate(id=>window.__ppApp.room.snapshot.gameplay.inventories[id]?.length===1,first.id),{label:'other player sees the accepted pickup'});
    await ana.page.evaluate(()=>window.__ppApp.room.command({type:'CLAIM_POWERUP',block:0}));
    await ana.page.waitForTimeout(300);
    expect(await ana.page.evaluate(()=>{const a=window.__ppApp;return a.room.snapshot.gameplay.inventories[a.room.localId];})).toEqual(first.inventory);
    for(const p of [ana,ben])expect(p.errors).toEqual([]);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
