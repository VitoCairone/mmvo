const ELEMENTS = ['AIR', 'BLADE', 'ENERGY', 'FIRE', 'ICE', 'LIGHTNING', 'MASS', 'WATER'];
const COMMON_ELEMENTS = ['BLADE', 'ENERGY', 'MASS'];
const RARE_ELEMENTS = ['AIR', 'FIRE', 'ICE', 'LIGHTNING', 'WATER'];

function coinflip() { return Math.random() > 0.5; }
function pickRand(arr) { return arr[Math.floor(arr.length * Math.random())]; }
function shuffleInPlace(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = arr[j];
    arr[j] = arr[i];
    arr[i] = temp;
  }
  return arr;
}
function sum(arr) { return arr.reduce((partial, x) => partial + x, 0); }
function pickN(arr, n) { return shuffleInPlace(arr.concat([])).slice(0, n); }

const RUN_VERBOSE = false;

const nTrials = RUN_VERBOSE ? 5 : 10000; // 64000 per iteration for real results in 1 cycle
function report(str) { if (RUN_VERBOSE) console.log(str); }

class Character {
  constructor(idx = null) {
    this.idx = idx;
    this.element = pickRand(ELEMENTS);
    this.weaknesses = pickWeaknesses(this.element);
    this.toughMax = 300;
    this.hpMax = 3000;
    this.size = 1;
    this.shell = 'MECH';
    this.pilot = 'REPLOID';
    this.baseStats = {
      'DEF': 100,
      'POW': 100,
      'SPD': 100
    };
    this.boosts = [];
    this.impairs = [];
  }
}

const ALL_CHARACTERS = [];
[0, 1, 2, 3, 4, 5, 6, 7].forEach(n => { ALL_CHARACTERS.push(new Character(n)); });

const teamZero = {
  fis: [ALL_CHARACTERS[0], ALL_CHARACTERS[2], ALL_CHARACTERS[4], ALL_CHARACTERS[6]],
  skp: 4
};
const teamOne = {
  fis: [ALL_CHARACTERS[1], ALL_CHARACTERS[3], ALL_CHARACTERS[5], ALL_CHARACTERS[7]],
  skp: 4
};

function pickWeaknesses(fiElem) {
  if (RARE_ELEMENTS.includes(fiElem)) {
    if (coinflip()) return pickN(RARE_ELEMENTS, 3);
    return [pickRand(COMMON_ELEMENTS), pickRand(RARE_ELEMENTS)];
  }
  if (coinflip()) return pickN(COMMON_ELEMENTS, 2);
  return [pickRand(COMMON_ELEMENTS)].concat(pickN(RARE_ELEMENTS, 2));
}

function resetAll() {
  ALL_CHARACTERS.forEach((fi, idx) => {
    fi.teamNo = idx % 2;
    fi.hp = fi.hpMax;
    fi.energy = 0;
    fi.tough = fi.toughMax;
    fi.element = pickRand(ELEMENTS);
    fi.weaknesses = pickWeaknesses(fi.element);
    fi.turn = 0;
    fi.boosts.length = 0;
    fi.impairs.length = 0;
  });
}

function statToMod(fi, statName) {
  var stat = fi.baseStats[statName];
  stat += sum(fi.boosts.filter(s => s.aspect === statName).map(s => s.x));
  stat -= sum(fi.impairs.filter(s => s.aspect === statName).map(s => s.x));

  const mod = stat * 0.01;
  return mod >= 1.0 ? mod : 1.0 / (2.0 - mod);
}

function enemyTeam(fi) { return fi.teamNo ? teamZero : teamOne; }

function teamOf(fi) { return fi.teamNo ? teamOne : teamZero; }

function isBattleOver() {
  return !![teamZero, teamOne].find(team => team.fis.every(fi => fi.hp <= 0));
}

function validTargetsOf(fi) { return enemyTeam(fi).fis.filter(tFi => tFi.hp > 0); }

function pickTarget(fi) { 
  const valids = validTargetsOf(fi);
  if (!valids.length) { console.log("ERROR: no valid targets"); }
  if (valids.length === 1) return valids[0];
  const weakTargs = valids.filter(targ => isWeaknessHit(fi, targ));
  if (weakTargs.length === 1) return weakTargs[0];

  const list = weakTargs.length ? weakTargs : valids;
  const threats = list.filter(targ => isWeaknessHit(targ, fi));
  return threats.length ? pickRand(threats) : pickRand(list);
}

function nameOf(fi) {
  return ['Blues', 'Guts Man', 'Rock', 'Fire Man', 'Roll', 'Ice Man', 'Eddie', 'Cut Man'][fi.idx];
}

function shouldUseSkill(fi) {
  return teamOf(fi).skp > 1 || (teamOf(fi).skp === 1 && coinflip());
}

function calcBasicDamage(fi, target) { return 10 * damageMod(fi, target); }

function calcSkillDamage(fi, target) { return 25 * damageMod(fi, target); }

function calcUltDamage(fi, target) { return 75 * damageMod(fi, target); }

function isWeaknessHit(fi, target) { return target.weaknesses.includes(fi.element); }

function addStatus(isBoost, target, aspect, x, duration, name) {
  const status = {
    aspect: aspect,
    x: x,
    duration: duration,
    setOnTurn: target.turn,
    expireAfterTurn: target.turn + duration,
    name: name
  };
  const list = isBoost ? target.boosts : target.impairs;
  list.push(status);
}
function boost(target, aspect, x, duration, name = 'BOOST') {
  addStatus(true, target, aspect, x, duration, name);
}
function impair(target, aspect, x, duration, name = 'IMPAIR') {
  addStatus(false, target, aspect, x, duration, name);
}

function expireStatuses(fi) {
  const expireBoosts = fi.boosts.filter(s => s.expireAfterTurn <= fi.turn);
  const expireImpairs = fi.impairs.filter(s => s.expireAfterTurn <= fi.turn);

  expireImpairs.filter(s => s.aspect === 'DmgOnExp').forEach(s => {
    fi.hp -= s.x;
    // TODO: check for KO here?
  });
  expireBoosts.concat(expireImpairs).forEach(s => {
    report("   " + nameOf(fi) + "'s " + s.name + " wore off.");
  });

  if (expireBoosts.length) fi.boosts = fi.boosts.filter(s => s.expireAfterTurn > s.turn);
  if (expireImpairs.length) fi.impairs = fi.impairs.filter(s => s.expireAfterTurn > s.turn);
}

function applyWeaknessBreak(fi, target) {
  // AIR: delay & SPD- (2 Rounds)
  // BLADE: damage & DEF- (2 Rounds)
  // ENERGY: damage
  // FIRE: damage & DoT (2 Rounds)
  // ICE: damage & turn lost
  // LIGHTNING: damage & delayed damage (after 2 Turns)
  // MASS: damage & delay
  // WATER: damage & POW- (for 2 Rounds)

  var damage = 99; //balanceRecordFor['element=ENERGY'].X;
  // can't do delays or SPD- yet, so AIR and MASS are also just full initial damage for now
  if (fi.element !== 'ENERGY') damage = 50;
  if (fi.element === 'LIGHTNING') damage = balanceRecordFor['element=LIGHTNING'].X;
  else if (fi.element === 'ICE') damage = balanceRecordFor['element=ICE'].X;
  else if (fi.element === 'MASS') damage = 90;
  else if (fi.element === 'AIR') damage = 90 * 30 / 42;

  target.hp -= damage;
  report("   " + nameOf(target) + " takes " + damage + " " + fi.element + " weakness break damage.");

  switch (fi.element) {
    case 'BLADE':
      impair(target, 'DEF', balanceRecordFor['element=BLADE'].X, 2, 'BLEED');
      break;
    case 'FIRE':
      impair(target, 'DoT', balanceRecordFor['element=FIRE'].X, 2, 'BURN');
      break;
    case 'ICE':
      // FREEZE is the invariant that fixes balance values for all other weakness break Xs
      // balanced value of X = twice the value of losing one action due to FREEZE
      impair(target, 'NoAct', 1, 2, 'FREEZE');
      break;
    case 'LIGHTNING':
      // SHOCK damage is fixed to == one impart of Burn; initial damage is auto-balanced instead
      impair(target, 'DmgOnExp', balanceRecordFor['element=FIRE'].X * 0.5, 2, 'SHOCK')
      break;
    case 'WATER':
      impair(target, 'POW', balanceRecordFor['element=WATER'].X, 2, 'FLOOD');
      break;
    default:
      if (!['AIR', 'ENERGY', 'MASS'].includes(fi.element)) {
        console.log("ERROR: Fighter has invalid element");
      }
  }
}

class BalanceRecord {
  yesMatches = 0;
  noMatches = 0;
  yesWins = 0;
  noWins = 0;
  X = 10;

  reset() {
    this.yesMatches = 0;
    this.noMatches = 0;
    this.yesWins = 0;
    this.noWins = 0;l
  }

  winRate() {
    return this.yesWins / this.yesMatches;
  }

  toString() {
    return "X=" + Math.round(this.X, 2) + " winRate = " + 100 * this.winRate();
  }
}

const balanceRecordFor = {
  'element=AIR': new BalanceRecord(),
  'element=BLADE': new BalanceRecord(),
  'element=ENERGY': new BalanceRecord(),
  'element=FIRE': new BalanceRecord(),
  'element=ICE': new BalanceRecord(),
  'element=LIGHTNING': new BalanceRecord(),
  'element=MASS': new BalanceRecord(),
  'element=WATER': new BalanceRecord()
}

function didWin(fi) {
  return !teamOf(fi).fis.every(fi => fi.hp <= 0);
}

function autoBalanceCycle() {
  // 64,000 trials with no variance should be be within +/= 0.5 of 50
  for (var trial = 0; trial < nTrials; trial++) {
    report("Trial t=" + trial);
    autoBattle(trial % 8);
    if (ALL_CHARACTERS.some(fi => !fi.hp && fi.hp !== 0)) {
      console.log("ERROR: characters ended with invalid HP");
    }
    ALL_CHARACTERS.forEach(fi => {
      ELEMENTS.forEach(el => {
        var record = balanceRecordFor['element=' + el]
        if (el === fi.element) {
          record.yesMatches++;
          if (didWin(fi)) record.yesWins++;
        } else {
          record.noMatches++;
          if (didWin(fi)) record.noWins++;
        }
      });
    });
  }

  const IMPLEMENTED_ELEMENTS = ['BLADE', 'ENERGY', 'FIRE', 'ICE', 'LIGHTNING', 'WATER'];
  IMPLEMENTED_ELEMENTS.forEach(el => console.log(el.padEnd(9) + ': ' + balanceRecordFor['element=' + el].toString()));
}

function autoBalanceRunner() {
  var factor = 0.5;

  balanceRecordFor['element=BLADE'].X = 60;
  balanceRecordFor['element=ENERGY'].X = 99;
  balanceRecordFor['element=FIRE'].X = 23;
  balanceRecordFor['element=ICE'].X = 33;
  balanceRecordFor['element=LIGHTNING'].X = 87;
  balanceRecordFor['element=WATER'].X = 20;

  const nCycles = RUN_VERBOSE ? 1 : 1000;
  for (var cycle = 0; cycle < nCycles; cycle++) {
    console.log("========== CYCLE " + cycle + " ==========================");
    autoBalanceCycle();
    ELEMENTS.forEach(el => {
      const record = balanceRecordFor['element=' + el];
      const w = record.winRate();
      if (w > 0.502 && record.X > 1.5) {
        record.X /= (1.0 + factor);
      // } else if (w < 0.497) {
      //   if (w < 0.49 && factor < 0.01) factor = 0.01;
      //   record.X *= (1.0 + factor);
      // }
      } else if (w < 0.5 && balanceRecordFor['element=ENERGY'].winRate() > 0.5) {
        // because non-implemented (AIR and MASS)
        // should always be last, implemented should all be >= 50%
        record.X *= (1.0 + factor * 200 * (balanceRecordFor['element=ENERGY'].winRate() - 0.5));
      }
    });

    if(balanceRecordFor['element=ENERGY'].winRate() < 0.5005) return;

    // const lightning = balanceRecordFor['element=LIGHTNING'];
    // const energy = balanceRecordFor['element=ENERGY'];
    // const ice = balanceRecordFor['element=ICE'];
    // const fire = balanceRecordFor['element=']
    // if (lightning.X > energy.X) {
    //   const avgX = (lightning.X + energy.X) * 0.5;
    //   lightning.X = avgX;
    //   energy.X = avgX;
    // }
    // if (ice.X > energy.X) {
    //   const avgX = (ice.X + energy.X) * 0.5;
    //   ice.X = avgX;
    //   energy.X = avgX;
    // }
    if (factor * 0.955 >= 0.01) factor *= 0.955;
  }
}

function useUltimate(fi) {
  var target = pickTarget(fi);
  var damage = calcUltDamage(fi, target);
  target.hp -= damage;
  if (isWeaknessHit(fi, target) && target.hp > 0) {
    target.tough -= 100;
    if (target.tough <= 0) {
      target.weaknessBreakRem = 2;
      applyWeaknessBreak(fi, target);
    }
  }
  target.energy += 20;
  fi.energy = 0;
  report("!! " + nameOf(fi) + " uses their Ultimate on " + nameOf(target) + " for " + damage + " damage.");
}

function damageMod(fi, target) {
  return statToMod(fi, 'POW') / statToMod(target, 'DEF');
};

function canUltimate(fi) {
  return fi.hp > 0 && fi.energy >= 100 && !fi.impairs.some(s => s.aspect === 'NoAct');
}

function autoBattle(starterOffset = 0) {
  resetAll();
  var enacIdx = -1 + starterOffset;
  report("autobattle started")
  while (!isBattleOver()) {
    enacIdx = (enacIdx + 1 ) % 8;
    while (ALL_CHARACTERS[enacIdx].hp <= 0) enacIdx = (enacIdx + 1) % 8;
    var fi = ALL_CHARACTERS[enacIdx];

    // pre-action
    fi.turn++;
    
    fi.impairs.filter(s => s.aspect === 'DoT').forEach(s => {
      const damage = s.x / s.duration;
      fi.hp -= damage;
      report(nameOf(fi) + " takes " + damage + " " + s.name + " damage.");
    });

    if (validTargetsOf(fi).length === 0) break;    

    // in pre-action phase, any teammate who can Ult should Ult
    const fisWithUlt = teamOf(fi).fis.filter(tFi => canUltimate(tFi));
    fisWithUlt.forEach(tFi => {
      if (validTargetsOf(fi).length > 0) useUltimate(tFi);
    });

    if (validTargetsOf(fi).length === 0) break;

    const noActStatuses = fi.impairs.filter(s => s.aspect === 'NoAct' && s.x > 0);
    if (noActStatuses.length) {
      noActStatuses.forEach(s => { 
        if (s.x > 1) { console.log("ERROR: x > 1 on NoAct impair"); }
        s.x -= 1;
      });
      report(nameOf(fi) + " can't act because of " + noActStatuses.map(s => s.name).join(" & "))
      expireStatuses(fi);
      continue;
    }

    // action
    var target = pickTarget(fi);
    var doesUseSkill = shouldUseSkill(fi);
    var damage;
    var team = teamOf(fi);
    if (doesUseSkill) {
      damage = calcSkillDamage(fi, target);
      team.skp--;
    } else {
      damage = calcBasicDamage(fi, target);
      team.skp++;
      if (team.skp > 5) team.skp = 5;
    }

    report(nameOf(fi) + " attacks " + nameOf(target) + " for " + damage + " HP.");
    target.hp -= damage;

    if (target.hp <= 0) {
      report("   " + nameOf(target) + " is KOed.");
      fi.energy += 10;
    } else {
      if (isWeaknessHit(fi, target) && !target.weaknessBreakRem) {
        target.tough -= doesUseSkill ? 45 : 20;
        if (target.tough <= 0) {
          report("   " + nameOf(target) + " is weakness broken!")
          target.weaknessBreakRem = 2;
          applyWeaknessBreak(fi, target);
        }
      }
      target.energy += doesUseSkill ? 10 : 5;
    }

    // post-action
    fi.energy += doesUseSkill ? 20 : 10;
    expireStatuses(fi);
    if (fi.weaknessBreakRem) {
      fi.weaknessBreakRem--;
      if (fi.weaknessBreakRem == 0) {
        report("   " + nameOf(fi) + " recovers from weakness break.");
        fi.tough = fi.toughMax;
      }
    }
  }

  var fi = ALL_CHARACTERS[enacIdx];
  report("AutoBattle ended on turn " + fi.turn)
}

// autoBattle();
autoBalanceRunner();
