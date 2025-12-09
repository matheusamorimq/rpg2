// script.js — versão estável com colisão, dano % por tier, hearts drop (cura 2%), game over
window.addEventListener("load", () => {
  // ---------- UI Elements ----------
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const xpBarElem = document.getElementById("xpBar");
  const upgradeMenu = document.getElementById("upgradeMenu");

  // ---------- Image path ----------
  const IMG_PATH = "assets/";

  // ---------- Sprites ----------
  const playerSpritesByTier = {
    1: IMG_PATH + "COURO.png",
    2: IMG_PATH + "PRATA.png",
    3: IMG_PATH + "OURO.png",
    4: IMG_PATH + "DIAMANTE.png",
    5: IMG_PATH + "LENDARIO.png"
  };

  const monsterSpritesByTier = {
    1: IMG_PATH + "JELLY.png",
    2: IMG_PATH + "ROXINHO.png",
    3: IMG_PATH + "AZULAO.png",
    4: IMG_PATH + "TIGRAO.png",
    5: IMG_PATH + "FINALBOSS.png"
  };

  const mapImg = new Image(); mapImg.src = IMG_PATH + "MAP.png";
  const gameOverImg = new Image(); gameOverImg.src = IMG_PATH + "GAMEOVER.png";
  const coracaoImg = new Image(); coracaoImg.src = IMG_PATH + "CORACAO.png";

  // ---------- Configs ----------
  const PLAYER_BASE = { maxHp: 350, atk: 14, def: 6, speed: 2.2 };
  const MONSTER_BASE_SPEED = 0.28;
  const PLAYER_ATTACK_RANGE = 72;
  const PLAYER_ATTACK_COOLDOWN = 220;
  const HEART_DROP_CHANCE = 0.18; // chance do monstro dropar coração ao morrer
  const HEART_HEAL_PERCENT = 0.02; // 2% do maxHp

  // Dano percentual e cooldown por tier
  const MONSTER_SCALING = {
    1: { dmgPercent: 0.03, cd: 2000 },
    2: { dmgPercent: 0.06, cd: 1900 },
    3: { dmgPercent: 0.09, cd: 1700 },
    4: { dmgPercent: 0.12, cd: 1500 },
    5: { dmgPercent: 0.35, cd: 3000 }
  };

  // ---------- Player ----------
  const player = {
    x: 380, y: 280, w: 48, h: 48,
    maxHp: PLAYER_BASE.maxHp,
    hp: PLAYER_BASE.maxHp,
    atk: PLAYER_BASE.atk,
    def: PLAYER_BASE.def,
    speed: PLAYER_BASE.speed,
    level: 1,
    xp: 0,
    xpToNext: 50,
    xpMultiplier: 1.0,
    sprite: new Image()
  };
  player.sprite.src = playerSpritesByTier[1];

  // ---------- Game state ----------
  let monsters = [];
  let hearts = []; // {x,y,w,h,ttl}
  let pendingUpgrade = false;
  let isGameOver = false;

  // ---------- Utilities ----------
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rectOverlap(a,b){
    return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
  }

  // ---------- Spawning ----------
  function calculateMaxMonsters(){ return Math.min(7, 2 + Math.floor(player.level/8)); }

  function createMonsterForTier(tier){
    const m = {
      x: 40 + Math.random() * (canvas.width - 100),
      y: 80 + Math.random() * (canvas.height - 150),
      w: 54, h: 54,
      tier,
      maxHp: 60 + tier*50,
      hp: 60 + tier*50,
      speed: MONSTER_BASE_SPEED + tier*0.06,
      lastHitAt: 0,
      sprite: new Image()
    };
    m.sprite.src = monsterSpritesByTier[tier] || monsterSpritesByTier[1];
    // avoid spawning exactly on the player
    if (Math.hypot(m.x - player.x, m.y - player.y) < 80){
      m.x = clamp(m.x + 120, 0, canvas.width - m.w);
      m.y = clamp(m.y + 80, 0, canvas.height - m.h);
    }
    return m;
  }

  function spawnWave(){
    monsters = [];
    hearts = [];
    const count = calculateMaxMonsters();
    let baseTier = 1;
    if (player.level >= 39) baseTier = 5;
    else if (player.level >= 30) baseTier = 4;
    else if (player.level >= 20) baseTier = 3;
    else if (player.level >= 10) baseTier = 2;

    for (let i=0;i<count;i++){
      const varTier = Math.max(1, Math.min(5, baseTier + (Math.random() < 0.12 ? -1 : (Math.random() > 0.88 ? 1 : 0))));
      monsters.push(createMonsterForTier(varTier));
    }
  }

  // ---------- Upgrades (keeps exp button) ----------
  (function ensureExpButton(){
    if (!upgradeMenu) return;
    if (!upgradeMenu.querySelector("[data-exp-btn]")){
      const btn = document.createElement("button");
      btn.textContent = "Aumentar EXP (+25%)";
      btn.setAttribute("data-exp-btn","1");
      btn.style.display = "block";
      btn.style.marginTop = "10px";
      btn.onclick = ()=> applyUpgrade("exp");
      upgradeMenu.appendChild(btn);
    }
  })();

  window.applyUpgrade = function(type){
    if (!pendingUpgrade) return;
    if (type === "atk") player.atk += 4;
    else if (type === "hp"){ player.maxHp += 45; player.hp = player.maxHp; }
    else if (type === "def") player.def += 2;
    else if (type === "spd") player.speed = Math.min(6, player.speed + 0.35);
    else if (type === "exp") player.xpMultiplier = +(player.xpMultiplier * 1.25).toFixed(2);

    player.xpToNext = Math.max(10, Math.floor(player.xpToNext * 1.32));
    pendingUpgrade = false;
    if (upgradeMenu) upgradeMenu.style.display = "none";
    spawnWave();
    updateUI();
  };

  function showUpgradeMenu(){ pendingUpgrade = true; if (upgradeMenu) upgradeMenu.style.display = "block"; }

  // ---------- XP ----------
  function giveXP(raw){
    if (player.level >= 40) return;
    const gained = Math.max(1, Math.floor(raw * player.xpMultiplier));
    player.xp += gained;
    while (player.xp >= player.xpToNext && player.level < 40){
      player.xp -= player.xpToNext;
      player.level++;
      showUpgradeMenu();
      updatePlayerSprite();
      break;
    }
    updateUI();
  }

  function updatePlayerSprite(){
    let tier = 1;
    if (player.level >= 40) tier = 5;
    else if (player.level >= 30) tier = 4;
    else if (player.level >= 20) tier = 3;
    else if (player.level >= 10) tier = 2;
    player.sprite.src = playerSpritesByTier[tier];
  }

  // ---------- Controls ----------
  const keys = {};
  window.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
  window.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);
  window.addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    if (k === "k") playerAttack();
    if (isGameOver && k === "r") restartGame();
  });
  canvas.addEventListener("click", ()=> playerAttack());

  // ---------- Player attack ----------
  let lastPlayerHit = 0;
  function playerAttack(){
    if (isGameOver || pendingUpgrade) return;
    const now = Date.now();
    if (now - lastPlayerHit < PLAYER_ATTACK_COOLDOWN) return;
    lastPlayerHit = now;

    for (let i = monsters.length - 1; i >= 0; i--){
      const m = monsters[i];
      const dx = (player.x + player.w/2) - (m.x + m.w/2);
      const dy = (player.y + player.h/2) - (m.y + m.h/2);
      const d = Math.hypot(dx, dy);
      if (d <= PLAYER_ATTACK_RANGE){
        const dmg = Math.max(2, player.atk - Math.floor((m.tier || 1) * 0.3));
        m.hp -= dmg;
        if (m.hp <= 0){
          // drop heart with chance
          if (Math.random() < HEART_DROP_CHANCE){
            hearts.push({ x: m.x + 8, y: m.y + 8, w: 28, h: 28, ttl: 12000 });
          }
          monsters.splice(i,1);
          giveXP(18 * (m.tier || 1));
        }
      }
    }

    if (monsters.length === 0) spawnWave();
  }

  // ---------- Monster AI, collision & damage (percent + per-tier cooldown) ----------
function monstersAIandDamage(){
  if (isGameOver) return;
  const now = Date.now();

  for (let m of monsters){

    // mover em direção ao player
    const dx = (player.x + player.w/2) - (m.x + m.w/2);
    const dy = (player.y + player.h/2) - (m.y + m.h/2);
    const dist = Math.hypot(dx, dy);

    // movimentação normal
    if (dist > 2){
      m.x += (dx / dist) * m.speed;
      m.y += (dy / dist) * m.speed;
    }

    // ----------- COLISÃO REAL COM O PLAYER -----------
    const overlapX = (m.x < player.x + player.w) && (m.x + m.w > player.x);
    const overlapY = (m.y < player.y + player.h) && (m.y + m.h > player.y);
    
    if (overlapX && overlapY){
      // empurrar o monstro para fora
      const pushAngle = Math.atan2(m.y - player.y, m.x - player.x);
      const pushForce = 1.4; // quanto o monstro "descola"

      m.x += Math.cos(pushAngle) * pushForce;
      m.y += Math.sin(pushAngle) * pushForce;
    }
    // --------------------------------------------------

 // ----------- DANO POR COLISÃO REAL -----------
if (overlapX && overlapY) {
  const tier = m.tier || 1;
  const cfg = MONSTER_SCALING[tier] || MONSTER_SCALING[1];

  if (now - (m.lastHitAt || 0) >= cfg.cd) {
    m.lastHitAt = now;

    const dmg = Math.floor(player.maxHp * cfg.dmgPercent);
    player.hp -= dmg;

    if (player.hp <= 0) triggerGameOver();
  }
}

    // --------------------------------------------------
  }

  // separação dos monstros entre si (evita empilhar)
  for (let i=0; i<monsters.length; i++){
    for (let j=i+1; j<monsters.length; j++){
      const a = monsters[i], b = monsters[j];
      const dx = (a.x + a.w/2) - (b.x + b.w/2);
      const dy = (a.y + a.h/2) - (b.y + b.h/2);
      const d = Math.hypot(dx, dy) || 1;
      const minDist = 48;
      if (d < minDist){
        const overlap = (minDist - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.x += nx * overlap; a.y += ny * overlap;
        b.x -= nx * overlap; b.y -= ny * overlap;
      }
    }
  }
}


  // ---------- Hearts handling ----------
  function handleHearts(){
    for (let i = hearts.length - 1; i >= 0; i--){
      const h = hearts[i];
      h.ttl -= 16;
      if (rectOverlap(player, h)){
        const heal = Math.max(1, Math.floor(player.maxHp * HEART_HEAL_PERCENT));
        player.hp = Math.min(player.maxHp, player.hp + heal);
        hearts.splice(i,1);
        updateUI();
        continue;
      }
      if (h.ttl <= 0) hearts.splice(i,1);
    }
  }

  // ---------- Movement ----------
  function movePlayer(){
    if (pendingUpgrade || isGameOver) return;
    if (keys["w"] || keys["arrowup"]) player.y -= player.speed;
    if (keys["s"] || keys["arrowdown"]) player.y += player.speed;
    if (keys["a"] || keys["arrowleft"]) player.x -= player.speed;
    if (keys["d"] || keys["arrowright"]) player.x += player.speed;
    player.x = clamp(player.x, 0, canvas.width - player.w);
    player.y = clamp(player.y, 0, canvas.height - player.h);
  }

  // ---------- UI ----------
  function updateUI(){
    if (xpBarElem){
      const ratio = player.xpToNext > 0 ? (player.xp / player.xpToNext) : 1;
      xpBarElem.style.width = Math.floor(clamp(ratio,0,1) * 100) + "%";
    }
  }

  // ---------- Draw ----------
  function drawHUD(){
    ctx.fillStyle = "white";
    ctx.font = "15px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`HP: ${Math.max(0,player.hp)} / ${player.maxHp}`, 12, 22);
    ctx.fillText(`ATK: ${player.atk}`, 12, 44);
    ctx.fillText(`DEF: ${player.def}`, 12, 66);
    ctx.fillText(`VEL: ${player.speed.toFixed(1)}`, 12, 88);
    ctx.fillText(`Lv: ${player.level}`, 12, 110);
    ctx.fillText(`XP Mult: ${player.xpMultiplier.toFixed(2)}x`, 12, 132);
  }

  function draw(){
    // background
    if (mapImg && mapImg.complete && mapImg.naturalWidth > 0){
      ctx.drawImage(mapImg, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#7ec850";
      ctx.fillRect(0,0,canvas.width,canvas.height);
    }

    // hearts
    for (let h of hearts){
      if (coracaoImg && coracaoImg.complete && coracaoImg.naturalWidth > 0){
        ctx.drawImage(coracaoImg, h.x, h.y, h.w, h.h);
      } else {
        ctx.fillStyle = "pink";
        ctx.fillRect(h.x, h.y, h.w, h.h);
      }
    }

    // monsters
    for (let m of monsters){
      if (m.sprite && m.sprite.complete && m.sprite.naturalWidth > 0){
        ctx.drawImage(m.sprite, m.x, m.y, m.w, m.h);
      } else {
        ctx.fillStyle = "maroon";
        ctx.fillRect(m.x, m.y, m.w, m.h);
      }
      // monster hp bar
      ctx.fillStyle = "black";
      ctx.fillRect(m.x, m.y - 10, m.w, 6);
      ctx.fillStyle = "lime";
      ctx.fillRect(m.x, m.y - 10, Math.max(0, m.w * (m.hp / m.maxHp)), 6);
    }

    // player
    if (player.sprite && player.sprite.complete && player.sprite.naturalWidth > 0){
      ctx.drawImage(player.sprite, player.x, player.y, player.w, player.h);
    } else {
      ctx.fillStyle = "blue";
      ctx.fillRect(player.x, player.y, player.w, player.h);
    }
    // player hp above
    ctx.fillStyle = "black";
    ctx.fillRect(player.x, player.y - 12, player.w, 6);
    ctx.fillStyle = "red";
    ctx.fillRect(player.x, player.y - 12, Math.max(0, player.w * (player.hp / player.maxHp)), 6);

    drawHUD();

    // game over overlay
    if (isGameOver){
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      if (gameOverImg && gameOverImg.complete && gameOverImg.naturalWidth > 0){
        const iw = Math.min(canvas.width * 0.8, gameOverImg.naturalWidth);
        const ih = (gameOverImg.naturalHeight / gameOverImg.naturalWidth) * iw;
        ctx.drawImage(gameOverImg, (canvas.width-iw)/2, (canvas.height-ih)/2 - 40, iw, ih);
      } else {
        ctx.fillStyle = "white";
        ctx.font = "40px Arial";
        ctx.textAlign = "center";
        ctx.fillText("GAME OVER", canvas.width/2, canvas.height/2 - 20);
      }
      ctx.font = "18px Arial"; ctx.fillStyle = "white";
      ctx.fillText("Pressione R para reiniciar", canvas.width/2, canvas.height/2 + 80);
    }
  }

  // ---------- Game over & restart ----------
  function triggerGameOver(){
    isGameOver = true;
    pendingUpgrade = false;
    if (upgradeMenu) upgradeMenu.style.display = "none";
  }

  function restartGame(){
    // reset player
    player.level = 1;
    player.xp = 0;
    player.xpToNext = 50;
    player.xpMultiplier = 1.0;
    player.maxHp = PLAYER_BASE.maxHp;
    player.hp = player.maxHp;
    player.atk = PLAYER_BASE.atk;
    player.def = PLAYER_BASE.def;
    player.speed = PLAYER_BASE.speed;
    player.sprite.src = playerSpritesByTier[1];

    monsters = [];
    hearts = [];
    isGameOver = false;
    pendingUpgrade = false;

    spawnWave();
    updateUI();
  }

  // ---------- Main loop ----------
  function mainLoop(){
    if (!isGameOver){
      movePlayer();
      monstersAIandDamage();
      handleHearts();
      updateUI();
    }
    draw();
    requestAnimationFrame(mainLoop);
  }

  // init
  spawnWave();
  updateUI();
  mainLoop();

}); // end load
