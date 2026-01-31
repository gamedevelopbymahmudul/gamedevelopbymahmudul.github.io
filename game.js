(() => {
  // ------- DOM helpers -------
  const el = (id) => document.getElementById(id);

  const ui = {
    healthFill: el("healthFill"),
    hopeFill: el("hopeFill"),
    foodNum: el("foodNum"),
    waterNum: el("waterNum"),
    dayNum: el("dayNum"),
    overlay: el("overlay"),
    closeOverlay: el("closeOverlay"),
    invFood: el("invFood"),
    invWater: el("invWater"),
    invMed: el("invMed"),
    invWood: el("invWood"),
    toast: el("toast"),
    touchHud: el("touchHud"),
    btnMove: el("btnMove"),
    btnPick: el("btnPick"),
    btnBag: el("btnBag"),
    btnRun: el("btnRun"),
    btnPause: el("btnPause"),
    btnSleep: el("btnSleep"),
  };

  // ------- Mobile detection for HUD -------
  const isTouch =
    ("ontouchstart" in window) ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

  if (isTouch) {
    ui.touchHud.classList.remove("hidden");
    ui.touchHud.setAttribute("aria-hidden", "false");
  }

  // ------- Simple toast -------
  let toastTimer = null;
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.add("hidden"), 1200);
  }

  // ------- Game State -------
  const state = {
    day: 1,
    maxDay: 7,
    phase: "day", // day | dusk | night
    paused: false,
    inventoryOpen: false,

    health: 100,
    hope: 70,

    inv: { food: 0, water: 0, med: 0, wood: 0 },

    // input flags (desktop & mobile share these)
    moveHeld: false,
    runHeld: false,
    pickPressed: false,
    sleepPressed: false,
    pausePressed: false,
    bagPressed: false,

    // pick cooldown
    pickCooldown: 0,
  };

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function updateHUD() {
    ui.healthFill.style.width = `${clamp(state.health, 0, 100)}%`;
    ui.hopeFill.style.width = `${clamp(state.hope, 0, 100)}%`;

    ui.foodNum.textContent = String(state.inv.food);
    ui.waterNum.textContent = String(state.inv.water);
    ui.dayNum.textContent = String(state.day);

    ui.invFood.textContent = String(state.inv.food);
    ui.invWater.textContent = String(state.inv.water);
    ui.invMed.textContent = String(state.inv.med);
    ui.invWood.textContent = String(state.inv.wood);
  }

  function openInventory() {
    state.inventoryOpen = true;
    ui.overlay.classList.remove("hidden");
    toast("Inventory opened");
    updateHUD();
  }

  function closeInventory() {
    state.inventoryOpen = false;
    ui.overlay.classList.add("hidden");
  }

  function toggleInventory() {
    if (state.inventoryOpen) closeInventory();
    else openInventory();
  }

  ui.closeOverlay.addEventListener("click", closeInventory);
  ui.overlay.addEventListener("click", (e) => {
    // click outside card closes
    if (e.target === ui.overlay) closeInventory();
  });

  // ------- Phaser game -------
  const W = 960;
  const H = 540;

  const config = {
    type: Phaser.AUTO,
    parent: "game",
    width: W,
    height: H,
    backgroundColor: "#0b1020",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: "arcade",
      arcade: {
        gravity: { y: 0 },
        debug: false,
      },
    },
    scene: { preload, create, update },
  };

  const game = new Phaser.Game(config);

  let player, items, shelterZone, infoText, phaseText, keyText;
  let keys = {};

  function preload() {
    // Using simple generated textures (no external assets).
    // Player
    this.textures.generate("p", { data: [" 333 ", "33333", "33333", " 333 "], pixelWidth: 6 });
    // Item
    this.textures.generate("it", { data: [" 666 ", "66666", " 666 "], pixelWidth: 6 });
    // Shelter
    this.textures.generate("sh", { data: ["77777","7   7","7 7 7","7   7","77777"], pixelWidth: 6 });
  }

  function create() {
    // World
    const bg = this.add.rectangle(W/2, H/2, W, H, 0x0b1020).setDepth(-10);
    const haze = this.add.rectangle(W/2, H/2, W, H, 0xffffff, 0.03).setDepth(-9);

    // Ground line
    this.add.line(0, 0, 0, H-80, W, H-80, 0xffffff, 0.08).setOrigin(0);

    // Player
    player = this.physics.add.sprite(120, H-140, "p");
    player.setCollideWorldBounds(true);
    player.setDrag(1200, 1200);

    // Items group
    items = this.physics.add.group({ immovable: true, allowGravity: false });

    // Shelter zone (end of path)
    shelterZone = this.add.rectangle(W-120, H-140, 120, 120, 0xffffff, 0.04);
    this.physics.add.existing(shelterZone, true);
    const shelterIcon = this.add.sprite(W-120, H-140, "sh").setScale(1.2);
    shelterIcon.setAlpha(0.85);

    // UI texts inside canvas (minimal)
    infoText = this.add.text(16, 14, "", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: "14px",
      color: "rgba(255,255,255,0.85)",
    });

    phaseText = this.add.text(16, 38, "", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: "13px",
      color: "rgba(255,255,255,0.65)",
    });

    keyText = this.add.text(16, 60, "D Move • A Bag • S Pick • R Run • F Pause • Space Sleep", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: "12px",
      color: "rgba(255,255,255,0.45)",
    });

    // Collisions / overlaps
    this.physics.add.overlap(player, items, (p, it) => {
      // pick requires pressing S / touch PICK
      if (state.inventoryOpen || state.paused) return;
      if (state.pickCooldown > 0) return;
      if (!state.pickPressed) return;

      const kind = it.getData("kind");
      collect(kind);
      it.destroy();
      state.pickCooldown = 250; // ms
      state.pickPressed = false;
    });

    this.physics.add.overlap(player, shelterZone, () => {
      // Show sleep button only at night + inside shelter
      if (state.phase === "night") ui.btnSleep.classList.remove("hidden");
    });

    // Keyboard
    keys = this.input.keyboard.addKeys({
      D: Phaser.Input.Keyboard.KeyCodes.D,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      R: Phaser.Input.Keyboard.KeyCodes.R,
      F: Phaser.Input.Keyboard.KeyCodes.F,
      SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    // Spawn initial items
    spawnItems(this);

    // Phase timer: day -> dusk -> night cycle
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => tickTime(this),
    });

    updateHUD();
    updateCanvasInfo();
    hookMobileButtons();
  }

  function hookMobileButtons() {
    if (!isTouch) return;

    // Helper for hold buttons
    const hold = (button, onDown, onUp) => {
      const down = (e) => { e.preventDefault(); onDown(); };
      const up = (e) => { e.preventDefault(); onUp(); };

      button.addEventListener("pointerdown", down);
      button.addEventListener("pointerup", up);
      button.addEventListener("pointercancel", up);
      button.addEventListener("pointerleave", up);
    };

    hold(ui.btnMove,
      () => { state.moveHeld = true; },
      () => { state.moveHeld = false; }
    );

    hold(ui.btnRun,
      () => { state.runHeld = true; },
      () => { state.runHeld = false; }
    );

    ui.btnPick.addEventListener("click", (e) => {
      e.preventDefault();
      state.pickPressed = true;
      // will be consumed by overlap logic if near item
      toast("Pick");
    });

    ui.btnBag.addEventListener("click", (e) => {
      e.preventDefault();
      state.bagPressed = true;
      // handled in update loop
    });

    ui.btnPause.addEventListener("click", (e) => {
      e.preventDefault();
      state.pausePressed = true;
    });

    ui.btnSleep.addEventListener("click", (e) => {
      e.preventDefault();
      state.sleepPressed = true;
    });
  }

  function update(time, delta) {
    // reset contextual sleep button if not in shelter/night
    if (state.phase !== "night") ui.btnSleep.classList.add("hidden");

    // Handle keyboard -> state flags
    if (keys.D?.isDown) state.moveHeld = true;
    else if (!isTouch) state.moveHeld = false;

    if (keys.R?.isDown) state.runHeld = true;
    else if (!isTouch) state.runHeld = false;

    if (Phaser.Input.Keyboard.JustDown(keys.S)) state.pickPressed = true;

    if (Phaser.Input.Keyboard.JustDown(keys.A)) state.bagPressed = true;

    if (Phaser.Input.Keyboard.JustDown(keys.F)) state.pausePressed = true;

    if (Phaser.Input.Keyboard.JustDown(keys.SPACE)) state.sleepPressed = true;

    // Pause toggle
    if (state.pausePressed) {
      state.pausePressed = false;
      state.paused = !state.paused;
      toast(state.paused ? "Paused" : "Resumed");
    }

    // Inventory toggle (A)
    if (state.bagPressed) {
      state.bagPressed = false;
      toggleInventory();
    }

    // If paused OR inventory open -> freeze player movement
    const frozen = state.paused || state.inventoryOpen;

    if (frozen) {
      player.setVelocity(0, 0);
      // still reduce cooldown timers
      state.pickCooldown = Math.max(0, state.pickCooldown - delta);
      updateCanvasInfo();
      updateHUD();
      return;
    }

    // Move logic (only forward)
    const baseSpeed = state.runHeld ? 240 : 150;
    if (state.moveHeld) {
      player.setVelocityX(baseSpeed);
    } else {
      player.setVelocityX(0);
    }

    // Keep player on "path band"
    player.y = Phaser.Math.Clamp(player.y, H-200, H-110);

    // Pick cooldown
    state.pickCooldown = Math.max(0, state.pickCooldown - delta);

    // Night sleep
    if (state.sleepPressed) {
      state.sleepPressed = false;
      trySleep(this);
    }

    updateCanvasInfo();
    updateHUD();

    // consume one-shot press flags
    state.pickPressed = false;
  }

  // ------- Time / Phase system -------
  // Every "day" lasts 18 seconds (12 day, 3 dusk, 3 night)
  // This is just prototype pacing.
  let t = 0; // seconds in current day
  function tickTime(scene) {
    if (state.paused || state.inventoryOpen) return;
    t++;

    if (t <= 12) state.phase = "day";
    else if (t <= 15) state.phase = "dusk";
    else state.phase = "night";

    // survival drain
    if (state.phase === "day") {
      state.health -= 0.6;
      state.hope -= 0.25;
    } else if (state.phase === "dusk") {
      state.health -= 0.9;
      state.hope -= 0.45;
    } else {
      state.health -= 0.5;
      state.hope -= 0.35;
    }

    // soft fail states (keep it non-graphic)
    state.health = clamp(state.health, 0, 100);
    state.hope = clamp(state.hope, 0, 100);

    if (state.health <= 0 || state.hope <= 0) {
      state.paused = true;
      toast("Run ended (try again)");
      showEndCard(scene, "You couldn’t make it this time. Try a new run.");
      return;
    }

    // End of day auto-advance (after night finishes)
    if (t >= 18) {
      t = 0;
      state.day++;

      if (state.day > state.maxDay) {
        state.paused = true;
        toast("Survived 7 nights!");
        showEndCard(scene, "You survived 7 nights. Prototype win ✅");
        return;
      }

      // new day: spawn more items, small hope boost
      state.hope = clamp(state.hope + 6, 0, 100);
      spawnItems(scene, true);
      toast(`Day ${state.day}`);
      updateHUD();
    }
  }

  function updateCanvasInfo() {
    const phaseName = state.phase.toUpperCase();
    const tip =
      state.phase === "night"
        ? "Night: reach shelter (right) and press Space / 🌙 Sleep."
        : (state.phase === "dusk"
          ? "Dusk: danger rises. Keep moving, collect fast."
          : "Day: explore, collect resources, keep hope up.");

    infoText.setText(tip);
    phaseText.setText(`Phase: ${phaseName} • Hold MOVE ▶ (mobile) or D (PC).`);
  }

  // ------- Items / Collection -------
  function spawnItems(scene, more = false) {
    // clear old items sometimes for cleanliness
    if (!more) items.clear(true, true);

    const kinds = ["food", "water", "med", "wood"];
    const count = more ? 6 : 8;

    for (let i = 0; i < count; i++) {
      const x = Phaser.Math.Between(180, W - 220);
      const y = Phaser.Math.Between(H - 190, H - 120);
      const it = items.create(x, y, "it");
      it.setAlpha(0.85);
      it.setData("kind", kinds[Phaser.Math.Between(0, kinds.length - 1)]);
      it.setCircle(12);
      it.setImmovable(true);
    }
  }

  function collect(kind) {
    // simple inventory + small stat effects
    if (kind === "food") { state.inv.food++; state.health = clamp(state.health + 6, 0, 100); toast("+ Food"); }
    if (kind === "water") { state.inv.water++; state.health = clamp(state.health + 3, 0, 100); toast("+ Water"); }
    if (kind === "med") { state.inv.med++; state.health = clamp(state.health + 10, 0, 100); toast("+ Med"); }
    if (kind === "wood") { state.inv.wood++; state.hope = clamp(state.hope + 4, 0, 100); toast("+ Wood"); }
    updateHUD();
  }

  // ------- Sleep (only at night + in shelter zone) -------
  function trySleep(scene) {
    if (state.phase !== "night") {
      toast("Not sleepy now");
      return;
    }
    // must be inside shelter zone bounds
    const dx = Math.abs(player.x - (W - 120));
    const dy = Math.abs(player.y - (H - 140));
    const inShelter = (dx < 70 && dy < 70);

    if (!inShelter) {
      toast("Reach shelter first");
      return;
    }

    // consume resources to recover
    let used = false;
    if (state.inv.food > 0) { state.inv.food--; state.health = clamp(state.health + 12, 0, 100); used = true; }
    if (state.inv.water > 0) { state.inv.water--; state.health = clamp(state.health + 6, 0, 100); used = true; }

    // morale
    state.hope = clamp(state.hope + (used ? 10 : 4), 0, 100);

    toast(used ? "Rested well" : "Slept hungry");
    updateHUD();

    // fast-forward to end of day
    t = 18;
  }

  // ------- End card (simple overlay using DOM inventory card) -------
  function showEndCard(scene, message) {
    openInventory();
    // replace tips text temporarily
    const tips = document.querySelector(".tips");
    if (tips) {
      tips.innerHTML = `
        <div class="tip"><b>Run Summary</b></div>
        <div class="tip">${message}</div>
        <div class="tip muted">Refresh the page to restart.</div>
      `;
    }
  }

  // ------- Keep HUD synced initially -------
  updateHUD();
})();
