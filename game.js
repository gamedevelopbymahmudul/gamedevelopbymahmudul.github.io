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

    // input flags
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

  new Phaser.Game(config);

  let player, items, shelterZone, infoText, phaseText, keyText;
  let keys = {};

  function preload() {
    // ---- Mina (original child-survivor vibe, not copying any specific character) ----
    // Palette encoded by digits (Phaser textures.generate uses color values via "pixelWidth"; digits map to colors internally by tinting).
    // We'll generate separate layers for cleaner look: body + face/eyes + hairclip.

    // Mina base silhouette (big head + poncho)
    this.textures.generate("minaBase", {
      data: [
        "   111111   ",
        "  11111111  ",
        " 1111111111 ",
        " 1111111111 ",
        " 1111111111 ",
        "  11111111  ",
        "   111111   ",
        "    2222    ",
        "   222222   ",
        "  22222222  ",
        " 2222222222 ",
        " 2222222222 ",
        "  22222222  ",
        "   222222   ",
        "    2222    ",
        "    3333    ",
        "    3333    ",
      ],
      pixelWidth: 4
    });

    // Mina face details (eyes)
    this.textures.generate("minaFace", {
      data: [
        "            ",
        "            ",
        "            ",
        "            ",
        "   4   4    ",
        "            ",
        "    44      ",
        "            ",
        "            ",
      ],
      pixelWidth: 4
    });

    // Hair-clip (leaf/star-like) on side
    this.textures.generate("minaClip", {
      data: [
        "   5        ",
        "  555       ",
        "   5        ",
        "            ",
      ],
      pixelWidth: 4
    });

    // Item (resource)
    this.textures.generate("it", { data: [" 666 ", "66666", " 666 "], pixelWidth: 6 });

    // Shelter icon
    this.textures.generate("sh", {
      data: ["77777","7   7","7 7 7","7   7","77777"],
      pixelWidth: 6
    });
  }

  function create() {
    // Background
    this.add.rectangle(W/2, H/2, W, H, 0x0b1020).setDepth(-10);
    this.add.rectangle(W/2, H/2, W, H, 0xffffff, 0.03).setDepth(-9);

    // Ground line
    this.add.line(0, 0, 0, H-80, W, H-80, 0xffffff, 0.08).setOrigin(0);

    // Player container (Mina composed from layers)
    const minaContainer = this.add.container(120, H-140);
    const base = this.add.sprite(0, 0, "minaBase").setOrigin(0.5, 0.65);
    const face = this.add.sprite(-2, -26, "minaFace").setOrigin(0.5, 0.5);
    const clip = this.add.sprite(-18, -46, "minaClip").setOrigin(0.5, 0.5);

    // Tint layers to create a soft palette
    // base: warm beige head + muted poncho
    base.setTint(0xE8DCC8); // head/body base tone
    // We'll fake poncho shade by adding a second overlay rectangle behind lower part
    const ponchoShade = this.add.rectangle(0, 18, 52, 58, 0x2A3A52, 0.85).setOrigin(0.5, 0.5);
    ponchoShade.setRoundedRectangle(0, 18, 52, 58, 16);

    face.setTint(0x0B1020); // dark eye dots (matches theme)
    clip.setTint(0xF2C14E); // warm leaf/star clip

    // Add glow ring behind Mina for visibility
    const glow = this.add.circle(0, 0, 46, 0x80B4FF, 0.10);
    const glow2 = this.add.circle(0, 0, 32, 0xFFFFFF, 0.06);

    minaContainer.add([glow, glow2, ponchoShade, base, face, clip]);
    minaContainer.setDepth(2);

    // Arcade physics for the container using an invisible body sprite
    player = this.physics.add.sprite(120, H-140, null);
    player.setCollideWorldBounds(true);
    player.setDrag(1200, 1200);
    player.body.setSize(44, 70, true);

    // Tiny idle “breathing” animation (clean, soft)
    this.tweens.add({
      targets: minaContainer,
      y: minaContainer.y - 3,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    // Link container to physics sprite
    this.events.on("postupdate", () => {
      minaContainer.x = player.x;
      minaContainer.y = player.y;
    });

    // Items group
    items = this.physics.add.group({ immovable: true, allowGravity: false });

    // Shelter zone
    shelterZone = this.add.rectangle(W-120, H-140, 120, 120, 0xffffff, 0.05);
    this.physics.add.existing(shelterZone, true);

    const shelterIcon = this.add.sprite(W-120, H-150, "sh").setScale(1.2);
    shelterIcon.setAlpha(0.9);

    const shelterText = this.add.text(W-120, H-92, "SHELTER", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: "12px",
      color: "rgba(255,255,255,0.65)"
    }).setOrigin(0.5, 0.5);

    // Minimal in-canvas hints
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

    // Overlaps for picking
    this.physics.add.overlap(player, items, (p, it) => {
      if (state.inventoryOpen || state.paused) return;
      if (state.pickCooldown > 0) return;
      if (!state.pickPressed) return;

      const kind = it.getData("kind");
      collect(kind);
      it.destroy();
      state.pickCooldown = 250;
      state.pickPressed = false;
    });

    // Shelter overlap -> show sleep button at night
    this.physics.add.overlap(player, shelterZone, () => {
      if (state.phase === "night") ui.btnSleep.classList.remove("hidden");
    });

    // Keyboard (your mapping)
    keys = this.input.keyboard.addKeys({
      D: Phaser.Input.Keyboard.KeyCodes.D,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      R: Phaser.Input.Keyboard.KeyCodes.R,
      F: Phaser.Input.Keyboard.KeyCodes.F,
      SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    spawnItems(this);

    // Time loop
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => tickTime(this),
    });

    updateHUD();
    updateCanvasInfo();
    hookMobileButtons();
    tutorialBubbles(this);
  }

  function tutorialBubbles(scene) {
    // short, clean hints that disappear
    toast("Hold D / ▶ MOVE to go forward");
    scene.time.delayedCall(1600, () => toast("Press S / 🖐 PICK near items"));
    scene.time.delayedCall(3200, () => toast("A / 🎒 BAG opens inventory"));
  }

  function hookMobileButtons() {
    if (!isTouch) return;

    const hold = (button, onDown, onUp) => {
      const down = (e) => { e.preventDefault(); onDown(); };
      const up = (e) => { e.preventDefault(); onUp(); };

      button.addEventListener("pointerdown", down);
      button.addEventListener("pointerup", up);
      button.addEventListener("pointercancel", up);
      button.addEventListener("pointerleave", up);
    };

    hold(ui.btnMove, () => { state.moveHeld = true; }, () => { state.moveHeld = false; });
    hold(ui.btnRun, () => { state.runHeld = true; }, () => { state.runHeld = false; });

    ui.btnPick.addEventListener("click", (e) => {
      e.preventDefault();
      state.pickPressed = true;
      toast("Pick");
    });

    ui.btnBag.addEventListener("click", (e) => {
      e.preventDefault();
      state.bagPressed = true;
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
    if (state.phase !== "night") ui.btnSleep.classList.add("hidden");

    // Keyboard -> flags
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

    // Inventory toggle
    if (state.bagPressed) {
      state.bagPressed = false;
      toggleInventory();
    }

    const frozen = state.paused || state.inventoryOpen;

    if (frozen) {
      player.setVelocity(0, 0);
      state.pickCooldown = Math.max(0, state.pickCooldown - delta);
      updateCanvasInfo();
      updateHUD();
      return;
    }

    // Forward movement only (D / MOVE)
    const baseSpeed = state.runHeld ? 260 : 160;
    if (state.moveHeld) player.setVelocityX(baseSpeed);
    else player.setVelocityX(0);

    // Keep on path band
    player.y = Phaser.Math.Clamp(player.y, H - 200, H - 110);

    // Cooldowns
    state.pickCooldown = Math.max(0, state.pickCooldown - delta);

    // Sleep
    if (state.sleepPressed) {
      state.sleepPressed = false;
      trySleep();
    }

    updateCanvasInfo();
    updateHUD();

    // one-shot press
    state.pickPressed = false;
  }

  // ------- Time / Phase system -------
  let t = 0;
  function tickTime() {
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

    state.health = clamp(state.health, 0, 100);
    state.hope = clamp(state.hope, 0, 100);

    if (state.health <= 0 || state.hope <= 0) {
      state.paused = true;
      toast("Run ended (try again)");
      openInventory();
      const tips = document.querySelector(".tips");
      if (tips) {
        tips.innerHTML = `
          <div class="tip"><b>Run Summary</b></div>
          <div class="tip">You couldn’t make it this time. Try a new run.</div>
          <div class="tip muted">Refresh the page to restart.</div>
        `;
      }
      return;
    }

    // End of day
    if (t >= 18) {
      t = 0;
      state.day++;

      if (state.day > state.maxDay) {
        state.paused = true;
        toast("Survived 7 nights!");
        openInventory();
        const tips = document.querySelector(".tips");
        if (tips) {
          tips.innerHTML = `
            <div class="tip"><b>Run Summary</b></div>
            <div class="tip">You survived 7 nights. Prototype win ✅</div>
            <div class="tip muted">Refresh the page to restart.</div>
          `;
        }
        return;
      }

      state.hope = clamp(state.hope + 6, 0, 100);
      spawnItems(window.__phaserSceneRef__, true);
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
          ? "Dusk: danger rises. Collect fast."
          : "Day: explore, collect resources, keep hope up.");

    infoText.setText(tip);
    phaseText.setText(`Phase: ${phaseName} • D / ▶ MOVE forward • S / 🖐 PICK items`);
  }

  // ------- Items / Collection -------
  function spawnItems(scene, more = false) {
    // keep a reference for tickTime spawn
    window.__phaserSceneRef__ = scene;

    if (!more) items.clear(true, true);

    const kinds = ["food", "water", "med", "wood"];
    const count = more ? 6 : 8;

    for (let i = 0; i < count; i++) {
      const x = Phaser.Math.Between(180, W - 220);
      const y = Phaser.Math.Between(H - 190, H - 120);
      const it = items.create(x, y, "it");
      it.setAlpha(0.9);
      it.setData("kind", kinds[Phaser.Math.Between(0, kinds.length - 1)]);
      it.setCircle(12);
      it.setImmovable(true);

      // Different tint per kind (clean + readable)
      const kind = it.getData("kind");
      if (kind === "food") it.setTint(0xF2C14E);
      if (kind === "water") it.setTint(0x5EC2FF);
      if (kind === "med") it.setTint(0x8BFFB0);
      if (kind === "wood") it.setTint(0xC59B6D);
    }
  }

  function collect(kind) {
    if (kind === "food") { state.inv.food++; state.health = clamp(state.health + 6, 0, 100); toast("+ Food"); }
    if (kind === "water") { state.inv.water++; state.health = clamp(state.health + 3, 0, 100); toast("+ Water"); }
    if (kind === "med") { state.inv.med++; state.health = clamp(state.health + 10, 0, 100); toast("+ Med"); }
    if (kind === "wood") { state.inv.wood++; state.hope = clamp(state.hope + 4, 0, 100); toast("+ Wood"); }
    updateHUD();
  }

  // ------- Sleep (only at night + in shelter zone) -------
  function trySleep() {
    if (state.phase !== "night") {
      toast("Not sleepy now");
      return;
    }

    const dx = Math.abs(player.x - (W - 120));
    const dy = Math.abs(player.y - (H - 140));
    const inShelter = (dx < 70 && dy < 70);

    if (!inShelter) {
      toast("Reach shelter first");
      return;
    }

    let used = false;
    if (state.inv.food > 0) { state.inv.food--; state.health = clamp(state.health + 12, 0, 100); used = true; }
    if (state.inv.water > 0) { state.inv.water--; state.health = clamp(state.health + 6, 0, 100); used = true; }

    state.hope = clamp(state.hope + (used ? 10 : 4), 0, 100);

    toast(used ? "Rested well" : "Slept hungry");
    updateHUD();

    t = 18; // end day
  }

  // Init HUD
  updateHUD();
})();
