(() => {
  const $ = (id) => document.getElementById(id);
  const screens = { home: $('home-screen'), challenge: $('challenge-screen'), read: $('read-clock-screen'), word: $('word-clock-screen'), feedback: $('feedback-screen') };
  const ticks = $('ticks');
  const numbers = $('numbers');
  const NS = 'http://www.w3.org/2000/svg';
  const center = { x: 160, y: 160 };
  let target = { hour: 3, minute: 0 };
  let shown = { hour: 0, minute: 0 };
  let startedAt = 0;
  let round = 0;
  let stars = 0;
  let dragging = null;
  let soundOn = true;
  let challengeMode = 1;
  let remixActive = false;
  let readTarget = null;
  let readAnswers = { hour: null, minute: null };
  let wordTarget = null;
  let wordAnswers = { hour: null, minute: null };
  let cardDrag = null;
  let cardGhost = null;
  let suppressCardClickUntil = 0;
  let audioContext = null;
  let musicTimer = null;
  let musicStep = 0;
  let lastTickAt = 0;

  for (let i = 0; i < 60; i++) {
    const a = (i * 6 - 90) * Math.PI / 180;
    const major = i % 5 === 0;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', 160 + Math.cos(a) * (major ? 117 : 121));
    line.setAttribute('y1', 160 + Math.sin(a) * (major ? 117 : 121));
    line.setAttribute('x2', 160 + Math.cos(a) * 126);
    line.setAttribute('y2', 160 + Math.sin(a) * 126);
    line.setAttribute('stroke-width', major ? '3.3' : '1.5');
    if (!major) line.setAttribute('opacity', '.55');
    ticks.appendChild(line);
  }
  for (let n = 1; n <= 12; n++) {
    const a = (n * 30 - 90) * Math.PI / 180;
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', 160 + Math.cos(a) * 101);
    text.setAttribute('y', 160 + Math.sin(a) * 101);
    text.textContent = String(n);
    numbers.appendChild(text);
  }
  for (let i = 0; i < 60; i++) {
    const a = (i * 6 - 90) * Math.PI / 180;
    const major = i % 5 === 0;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', 160 + Math.cos(a) * (major ? 117 : 121));
    line.setAttribute('y1', 160 + Math.sin(a) * (major ? 117 : 121));
    line.setAttribute('x2', 160 + Math.cos(a) * 126);
    line.setAttribute('y2', 160 + Math.sin(a) * 126);
    line.setAttribute('stroke-width', major ? '3.3' : '1.5');
    if (!major) line.setAttribute('opacity', '.55');
    $('read-ticks').appendChild(line);
  }
  for (let n = 1; n <= 12; n++) {
    const a = (n * 30 - 90) * Math.PI / 180;
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', 160 + Math.cos(a) * 101);
    text.setAttribute('y', 160 + Math.sin(a) * 101);
    text.textContent = String(n);
    $('read-numbers').appendChild(text);
  }
  function makeCards(containerId, kind, values) {
    const container = $(containerId);
    values.forEach((value) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `number-card ${kind}-card`;
      card.dataset.kind = kind;
      card.dataset.value = value;
      card.textContent = value;
      card.setAttribute('aria-label', `${value}, ${kind}`);
      card.addEventListener('pointerdown', beginCardDrag);
      card.addEventListener('pointermove', moveCardDrag);
      card.addEventListener('pointerup', endCardDrag);
      card.addEventListener('pointercancel', cancelCardDrag);
      card.addEventListener('click', () => {
        if (performance.now() >= suppressCardClickUntil) placeReadAnswer(kind, value);
      });
      container.appendChild(card);
    });
  }
  makeCards('hour-cards', 'hour', Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')));
  makeCards('minute-cards', 'minute', Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')));
  function makeWordCards(containerId, kind, values) {
    const container = $(containerId);
    values.forEach((value) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `word-card ${kind}-word-card`;
      card.dataset.kind = kind;
      card.dataset.value = value;
      card.textContent = value;
      card.setAttribute('aria-label', `${value}, ${kind}`);
      card.addEventListener('pointerdown', beginCardDrag);
      card.addEventListener('pointermove', moveCardDrag);
      card.addEventListener('pointerup', endCardDrag);
      card.addEventListener('pointercancel', cancelCardDrag);
      card.addEventListener('click', () => {
        if (performance.now() >= suppressCardClickUntil) placeWordAnswer(kind, value);
      });
      container.appendChild(card);
    });
  }
  const hourWords = ['One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve'];
  const minuteWords = { 5:'Five', 10:'Ten', 15:'A quarter', 20:'Twenty', 25:'Twenty-five', 30:'Half' };
  makeWordCards('hour-word-cards', 'hour', hourWords);
  makeWordCards('minute-word-cards', 'minute', Object.values(minuteWords));

  function show(name) {
    Object.entries(screens).forEach(([key, el]) => el.classList.toggle('hidden', key !== name));
  }
  function randTarget() {
    const hour = 1 + Math.floor(Math.random() * 12);
    const minute = Math.random() < 0.7
      ? Math.floor(Math.random() * 12) * 5
      : Math.floor(Math.random() * 60);
    return { hour: hour % 12, displayHour: hour, minute };
  }
  function formatTime(hour, minute) {
    return `${hour || 12}:${String(minute).padStart(2, '0')}`;
  }
  function drawHands() {
    const minuteAngle = shown.minute * 6;
    const hourAngle = (shown.hour % 12) * 30 + shown.minute * .5;
    $('minute-hand').setAttribute('transform', `rotate(${minuteAngle} 160 160)`);
    $('hour-hand').setAttribute('transform', `rotate(${hourAngle} 160 160)`);
    $('minute-hand').setAttribute('aria-valuenow', String(shown.minute));
    $('hour-hand').setAttribute('aria-valuenow', String(Math.round((shown.hour % 12) * 60 + shown.minute) % 720));
    $('hint-minute').setAttribute('transform', `rotate(${target.minute * 6} 160 160)`);
    $('hint-hour').setAttribute('transform', `rotate(${(target.hour % 12) * 30 + target.minute * .5} 160 160)`);
  }
  function audioReady() {
    if (!audioContext) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return false;
      audioContext = new Audio();
    }
    if (audioContext.state === 'suspended') audioContext.resume();
    return true;
  }
  function tone(frequency, duration = .16, type = 'sine', volume = .055, delay = 0) {
    if (!soundOn || !audioReady()) return;
    const start = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .018);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
  }
  function startMusic() {
    if (!soundOn || musicTimer || !audioReady()) return;
    const notes = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 783.99, 698.46];
    musicTimer = window.setInterval(() => {
      tone(notes[musicStep % notes.length], .42, 'sine', .018);
      if (musicStep % 2 === 0) tone(notes[(musicStep + 2) % notes.length] / 2, .55, 'triangle', .012);
      musicStep += 1;
    }, 560);
  }
  function stopMusic() {
    if (musicTimer) window.clearInterval(musicTimer);
    musicTimer = null;
  }
  function startChallenge() {
    remixActive = false;
    challengeMode = 1;
    round = 1;
    startRound();
  }
  function startReadChallenge() {
    remixActive = false;
    challengeMode = 2;
    round = 1;
    startReadRound();
  }
  function startWordChallenge() {
    remixActive = false;
    challengeMode = 3;
    round = 1;
    startWordRound();
  }
  function startDigitalWordChallenge() {
    remixActive = false;
    challengeMode = 4;
    round = 1;
    startWordRound();
  }
  function startRemixChallenge() {
    remixActive = true;
    round = 1;
    startRemixRound();
  }
  function startRemixRound() {
    challengeMode = 1 + Math.floor(Math.random() * 4);
    if (challengeMode === 1) startRound();
    else if (challengeMode === 2) startReadRound();
    else startWordRound();
  }
  function startRound() {
    $('help-toggle').classList.remove('hidden');
    const next = randTarget();
    target = { hour: next.hour, minute: next.minute };
    $('target-hour').textContent = String(next.displayHour);
    $('target-minute').textContent = String(next.minute).padStart(2, '0');
    $('round-number').textContent = String(round).padStart(2, '0');
    shown = { hour: 0, minute: 0 };
    drawHands();
    startedAt = performance.now();
    $('clock-hint').classList.remove('quiet');
    $('clock-hint').innerHTML = '<span>☝</span> Give the hands a little spin!';
    $('clock-face').classList.remove('help-on');
    $('help-toggle').setAttribute('aria-pressed', 'false');
    $('help-toggle').setAttribute('aria-label', 'Show clock hints');
    $('help-toggle').title = 'Show clock hints';
    $('encourage').innerHTML = 'You’ve got this, time star! <span>✦</span>';
    $('encourage').classList.remove('incorrect');
    show('challenge');
    startMusic();
  }
  function startReadRound() {
    $('help-toggle').classList.add('hidden');
    $('read-clock-area').appendChild($('read-clock-face'));
    $('read-clock-face').classList.remove('hidden');
    $('read-clock-face').setAttribute('aria-label', 'Analog clock showing a time to read.');
    const hour = 1 + Math.floor(Math.random() * 12);
    const minute = Math.floor(Math.random() * 12) * 5;
    readTarget = { hour: String(hour).padStart(2, '0'), minute: String(minute).padStart(2, '0') };
    readAnswers = { hour: null, minute: null };
    $('round-number-2').textContent = String(round).padStart(2, '0');
    document.querySelectorAll('.number-card.chosen').forEach((card) => card.classList.remove('chosen'));
    $('hour-slot').textContent = '__';
    $('minute-slot').textContent = '__';
    ['hour-slot', 'minute-slot'].forEach((id) => {
      $(id).classList.remove('filled');
      $(id).setAttribute('aria-label', `${id === 'hour-slot' ? 'Hour' : 'Minutes'}, empty`);
    });
    $('read-encourage').innerHTML = 'Find the hour, then the minutes! <span>✦</span>';
    $('read-encourage').classList.remove('incorrect');
    $('read-hour-hand').setAttribute('transform', `rotate(${(hour % 12) * 30 + minute * .5} 160 160)`);
    $('read-minute-hand').setAttribute('transform', `rotate(${minute * 6} 160 160)`);
    startedAt = performance.now();
    show('read');
    startMusic();
  }
  function startWordRound() {
    $('help-toggle').classList.add('hidden');
    const digitalMode = challengeMode === 4;
    $('word-clock-area').classList.toggle('digital-mode', digitalMode);
    if (digitalMode) {
      $('read-clock-area').appendChild($('read-clock-face'));
      $('read-clock-face').classList.add('hidden');
      $('word-digital-display').classList.remove('hidden');
      $('read-clock-face').setAttribute('aria-label', 'Analog clock');
    } else {
      $('word-clock-area').appendChild($('read-clock-face'));
      $('read-clock-face').classList.remove('hidden');
      $('word-digital-display').classList.add('hidden');
      $('read-clock-face').setAttribute('aria-label', 'Analog clock for reading the time in words.');
    }
    const hour = 1 + Math.floor(Math.random() * 12);
    const minute = Math.floor(Math.random() * 12) * 5;
    const exactHour = minute === 0;
    const isPast = minute > 0 && minute <= 30;
    const minuteValue = exactHour ? null : (isPast ? minute : 60 - minute);
    const answerHour = exactHour || isPast ? hour : (hour % 12) + 1;
    wordTarget = {
      hour: hourWords[answerHour - 1],
      minute: minuteValue === null ? null : minuteWords[minuteValue],
      displayHour: hour,
      displayMinute: minute,
      phrase: exactHour ? 'o’clock' : (isPast ? 'past' : 'to'),
    };
    $('word-digital-hour').textContent = String(hour);
    $('word-digital-minute').textContent = String(minute).padStart(2, '0');
    $('word-digital-display').setAttribute('aria-label', `Digital time ${hour}:${String(minute).padStart(2, '0')}`);
    $('word-heading').innerHTML = digitalMode ? 'Read the <span>digital time!</span>' : 'What time is <span>it?</span>';
    $('word-instructions').textContent = digitalMode ? 'Use the word cards to say this time.' : 'Use the word cards to read the clock.';
    wordAnswers = { hour: null, minute: null };
    $('round-number-3').textContent = String(round).padStart(2, '0');
    document.querySelectorAll('.word-card.chosen').forEach((card) => card.classList.remove('chosen'));
    $('word-phrase').innerHTML = exactHour
      ? '<button type="button" class="word-slot" data-kind="hour" aria-label="Hour, empty">?</button><span> o’clock</span>'
      : '<button type="button" class="word-slot" data-kind="minute" aria-label="Minutes, empty">?</button><span> ' + wordTarget.phrase + ' </span><button type="button" class="word-slot" data-kind="hour" aria-label="Hour, empty">?</button>';
    $('word-encourage').innerHTML = wordTarget.minute === null
      ? 'Find the hour for an o’clock time! <span>✦</span>'
      : 'Find the minutes, then the hour! <span>✦</span>';
    $('word-encourage').classList.remove('incorrect');
    $('read-hour-hand').setAttribute('transform', `rotate(${(hour % 12) * 30 + minute * .5} 160 160)`);
    $('read-minute-hand').setAttribute('transform', `rotate(${minute * 6} 160 160)`);
    startedAt = performance.now();
    show('word');
    startMusic();
  }
  function placeReadAnswer(kind, value) {
    readAnswers[kind] = value;
    const slot = $(kind === 'hour' ? 'hour-slot' : 'minute-slot');
    slot.textContent = value;
    slot.classList.add('filled');
    slot.setAttribute('aria-label', `${kind === 'hour' ? 'Hour' : 'Minutes'}, ${value}`);
    document.querySelectorAll(`.number-card[data-kind="${kind}"]`).forEach((card) => {
      card.classList.toggle('chosen', card.dataset.value === value);
    });
    $('read-encourage').classList.remove('incorrect');
    $('read-encourage').innerHTML = 'Find the hour, then the minutes! <span>✦</span>';
  }
  function placeWordAnswer(kind, value) {
    const slot = $('word-phrase').querySelector(`.word-slot[data-kind="${kind}"]`);
    if (!slot) {
      $('word-encourage').textContent = 'This is an o’clock time—choose an hour word!';
      $('word-encourage').classList.add('incorrect');
      return;
    }
    wordAnswers[kind] = value;
    slot.textContent = value;
    slot.classList.add('filled');
    slot.setAttribute('aria-label', `${kind === 'hour' ? 'Hour' : 'Minutes'}, ${value}`);
    document.querySelectorAll(`.word-card[data-kind="${kind}"]`).forEach((card) => {
      card.classList.toggle('chosen', card.dataset.value === value);
    });
    $('word-encourage').classList.remove('incorrect');
    $('word-encourage').innerHTML = wordTarget.minute === null
      ? 'Find the hour for an o’clock time! <span>✦</span>'
      : 'Find the minutes, then the hour! <span>✦</span>';
  }
  function beginCardDrag(evt) {
    if (evt.button !== undefined && evt.button !== 0) return;
    evt.preventDefault();
    const card = evt.currentTarget;
    const rect = card.getBoundingClientRect();
    cardDrag = { card, kind: card.dataset.kind, value: card.dataset.value, word: card.classList.contains('word-card'), x: evt.clientX, y: evt.clientY, moved: false, offsetX: evt.clientX - rect.left, offsetY: evt.clientY - rect.top };
    card.classList.add('drag-source');
    cardGhost = card.cloneNode(true);
    cardGhost.classList.add('drag-ghost');
    cardGhost.style.width = `${rect.width}px`;
    cardGhost.style.height = `${rect.height}px`;
    document.body.appendChild(cardGhost);
    moveGhost(evt.clientX, evt.clientY);
    card.setPointerCapture?.(evt.pointerId);
  }
  function moveGhost(x, y) {
    if (!cardGhost || !cardDrag) return;
    cardGhost.style.left = `${x - cardDrag.offsetX}px`;
    cardGhost.style.top = `${y - cardDrag.offsetY}px`;
  }
  function moveCardDrag(evt) {
    if (!cardDrag || cardDrag.card !== evt.currentTarget) return;
    if (Math.hypot(evt.clientX - cardDrag.x, evt.clientY - cardDrag.y) > 7) cardDrag.moved = true;
    moveGhost(evt.clientX, evt.clientY);
  }
  function endCardDrag(evt) {
    if (!cardDrag || cardDrag.card !== evt.currentTarget) return;
    const drag = cardDrag;
    const slotSelector = drag.word ? '.word-slot' : '.drop-slot';
    const slot = document.elementFromPoint(evt.clientX, evt.clientY)?.closest(slotSelector);
    if (slot) {
      if (slot.dataset.kind === drag.kind) (drag.word ? placeWordAnswer : placeReadAnswer)(drag.kind, drag.value);
      else {
        const message = drag.word ? $('word-encourage') : $('read-encourage');
        message.textContent = drag.word && wordTarget.minute === null
          ? 'This is an o’clock time—choose an hour word!'
          : 'Hours go in the last blank; minutes go in the first!';
        message.classList.add('incorrect');
        tone(330, .13, 'triangle', .04);
      }
    } else if (!drag.moved) (drag.word ? placeWordAnswer : placeReadAnswer)(drag.kind, drag.value);
    suppressCardClickUntil = performance.now() + 500;
    finishCardDrag();
  }
  function cancelCardDrag() { if (cardDrag) finishCardDrag(); }
  function finishCardDrag() {
    cardDrag?.card.classList.remove('drag-source');
    cardGhost?.remove();
    cardDrag = null;
    cardGhost = null;
  }
  function showRoundFeedback(time) {
    const seconds = Math.max(1, Math.floor((performance.now() - startedAt) / 1000));
    $('elapsed-time').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    $('feedback-time').textContent = time;
    stars += 1;
    $('stars').textContent = String(stars);
    $('reward-stars').textContent = seconds < 20 ? '⭐ ⭐ ⭐' : seconds < 45 ? '⭐ ⭐' : '⭐';
    show('feedback');
    tone(659.25, .22, 'sine', .07);
    tone(783.99, .28, 'sine', .07, .13);
    tone(1046.5, .4, 'sine', .06, .27);
  }
  function eventAngle(evt) {
    const svg = $('clock-face');
    const p = svg.createSVGPoint();
    p.x = evt.clientX; p.y = evt.clientY;
    const c = p.matrixTransform(svg.getScreenCTM().inverse());
    return (Math.atan2(c.x - center.x, center.y - c.y) * 180 / Math.PI + 360) % 360;
  }
  function nearestMinute(angle) {
    return Math.round(angle / 6) % 60;
  }
  function onPointerMove(evt) {
    if (!dragging) return;
    evt.preventDefault();
    const angle = eventAngle(evt);
    if (dragging === 'minute') {
      const next = nearestMinute(angle);
      const difference = next - shown.minute;
      if (difference < -30) shown.hour = (shown.hour + 1) % 12;
      if (difference > 30) shown.hour = (shown.hour + 11) % 12;
      shown.minute = next;
    } else {
      const minuteOfDay = Math.round(angle / 30 * 60) % 720;
      shown.hour = Math.floor(minuteOfDay / 60) % 12;
      shown.minute = Math.round(minuteOfDay % 60 / 5) * 5 % 60;
      // Keep hour-hand dragging on the selected hour; only the hour hand moves.
      shown.minute = targetMinuteWhileHourDragging;
      shown.hour = Math.round(angle / 30) % 12;
    }
    drawHands();
    const now = performance.now();
    if (now - lastTickAt > 110) { tone(dragging === 'minute' ? 740 : 520, .055, 'triangle', .025); lastTickAt = now; }
    $('clock-hint').classList.add('quiet');
  }
  let targetMinuteWhileHourDragging = 0;
  function onPointerDown(evt) {
    const el = evt.currentTarget;
    dragging = el === $('minute-hand') ? 'minute' : 'hour';
    targetMinuteWhileHourDragging = shown.minute;
    el.setPointerCapture?.(evt.pointerId);
    evt.preventDefault();
    onPointerMove(evt);
  }
  ['hour-hand', 'minute-hand'].forEach((id) => {
    const hand = $(id);
    hand.addEventListener('pointerdown', onPointerDown);
    hand.addEventListener('pointermove', onPointerMove);
    hand.addEventListener('pointerup', () => { dragging = null; });
    hand.addEventListener('pointercancel', () => { dragging = null; });
    hand.addEventListener('keydown', (evt) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(evt.key)) return;
      evt.preventDefault();
      if (id === 'minute-hand') {
        const delta = evt.key === 'ArrowLeft' || evt.key === 'ArrowDown' ? -5 : 5;
        const total = shown.hour * 60 + shown.minute + delta;
        shown.hour = (Math.floor(total / 60) + 12) % 12;
        shown.minute = (total % 60 + 60) % 60;
      } else {
        const delta = evt.key === 'ArrowLeft' || evt.key === 'ArrowDown' ? -1 : 1;
        shown.hour = (shown.hour + delta + 12) % 12;
      }
      drawHands();
    });
  });

  $('start-challenge').addEventListener('click', startChallenge);
  $('start-challenge2').addEventListener('click', startReadChallenge);
  $('start-challenge3').addEventListener('click', startWordChallenge);
  $('start-challenge4').addEventListener('click', startDigitalWordChallenge);
  $('start-remix').addEventListener('click', startRemixChallenge);
  $('back-home').addEventListener('click', () => { show('home'); remixActive = false; $('help-toggle').classList.add('hidden'); stopMusic(); });
  $('back-home-2').addEventListener('click', () => { show('home'); remixActive = false; $('help-toggle').classList.add('hidden'); stopMusic(); });
  $('back-home-3').addEventListener('click', () => { show('home'); remixActive = false; $('help-toggle').classList.add('hidden'); stopMusic(); });
  $('feedback-home').addEventListener('click', () => { show('home'); remixActive = false; $('help-toggle').classList.add('hidden'); stopMusic(); });
  $('next-question').addEventListener('click', () => {
    round += 1;
    if (remixActive) startRemixRound();
    else if (challengeMode === 2) startReadRound();
    else if (challengeMode === 3 || challengeMode === 4) startWordRound();
    else startRound();
  });
  $('help-toggle').addEventListener('click', (evt) => {
    const visible = $('clock-face').classList.toggle('help-on');
    evt.currentTarget.setAttribute('aria-pressed', String(visible));
    evt.currentTarget.setAttribute('aria-label', visible ? 'Hide clock hints' : 'Show clock hints');
    evt.currentTarget.title = visible ? 'Hide clock hints' : 'Show clock hints';
    $('clock-hint').innerHTML = visible
      ? '<span>✨</span> Match the golden minute and mint hour strips!'
      : '<span>☝</span> Give the hands a little spin!';
    $('clock-hint').classList.remove('quiet');
  });
  $('check-time').addEventListener('click', () => {
    const matches = shown.hour % 12 === target.hour && shown.minute === target.minute;
    if (!matches) {
      $('encourage').innerHTML = 'Almost there! Give the hands another try <span>♥</span>';
      $('encourage').classList.add('incorrect');
      tone(220, .22, 'triangle', .07);
      $('check-time').classList.remove('shake');
      void $('check-time').offsetWidth;
      $('check-time').classList.add('shake');
      return;
    }
    showRoundFeedback(formatTime(target.hour, target.minute));
  });
  $('check-read-time').addEventListener('click', () => {
    if (!readAnswers.hour || !readAnswers.minute) {
      $('read-encourage').textContent = 'Drag a number card into each space!';
      $('read-encourage').classList.add('incorrect');
      tone(330, .13, 'triangle', .04);
      return;
    }
    if (readAnswers.hour !== readTarget.hour || readAnswers.minute !== readTarget.minute) {
      $('read-encourage').textContent = 'Almost there! Check the hour and minutes.';
      $('read-encourage').classList.add('incorrect');
      $('check-read-time').classList.remove('shake');
      void $('check-read-time').offsetWidth;
      $('check-read-time').classList.add('shake');
      tone(220, .22, 'triangle', .07);
      return;
    }
    showRoundFeedback(`${Number(readTarget.hour)}:${readTarget.minute}`);
  });
  $('check-word-time').addEventListener('click', () => {
    const missingAnswer = !wordAnswers.hour || (wordTarget.minute !== null && !wordAnswers.minute);
    if (missingAnswer) {
      $('word-encourage').textContent = 'Choose a word card for each blank!';
      $('word-encourage').classList.add('incorrect');
      tone(330, .13, 'triangle', .04);
      return;
    }
    const matches = wordAnswers.hour === wordTarget.hour && wordAnswers.minute === wordTarget.minute;
    if (!matches) {
      $('word-encourage').textContent = 'Almost there! Check the minutes and hour.';
      $('word-encourage').classList.add('incorrect');
      $('check-word-time').classList.remove('shake');
      void $('check-word-time').offsetWidth;
      $('check-word-time').classList.add('shake');
      tone(220, .22, 'triangle', .07);
      return;
    }
    showRoundFeedback(formatTime(wordTarget.displayHour % 12, wordTarget.displayMinute));
  });
  $('sound-button').addEventListener('click', (evt) => {
    soundOn = !soundOn;
    evt.currentTarget.classList.toggle('sound-off', !soundOn);
    evt.currentTarget.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
    evt.currentTarget.setAttribute('aria-pressed', String(soundOn));
    if (soundOn && (!screens.challenge.classList.contains('hidden') || !screens.read.classList.contains('hidden') || !screens.word.classList.contains('hidden'))) startMusic();
    else stopMusic();
  });
  const idleGazes = [{ x: -2, y: -1 }, { x: 2, y: -2 }, { x: 1, y: 2 }, { x: -1, y: 1 }, { x: 0, y: 0 }];
  let lastPupilInput = performance.now();
  let idleGazeIndex = 0;
  function setPupilGaze(x, y) {
    const left = screens.challenge.classList.contains('hidden') ? 'read-pupil-left' : 'pupil-left';
    const right = screens.challenge.classList.contains('hidden') ? 'read-pupil-right' : 'pupil-right';
    $(left).setAttribute('cx', String(129 + x)); $(left).setAttribute('cy', String(149 + y));
    $(right).setAttribute('cx', String(197 + x)); $(right).setAttribute('cy', String(149 + y));
  }
  window.setInterval(() => {
    const analogClockVisible = !screens.challenge.classList.contains('hidden') || !screens.read.classList.contains('hidden') || (!screens.word.classList.contains('hidden') && challengeMode === 3);
    if (!analogClockVisible || performance.now() - lastPupilInput < 1800) return;
    const gaze = idleGazes[idleGazeIndex++ % idleGazes.length];
    setPupilGaze(gaze.x, gaze.y);
    lastPupilInput = performance.now();
  }, 2100);
  document.addEventListener('pointermove', (evt) => {
    const svg = screens.challenge.classList.contains('hidden')
      ? ((screens.read.classList.contains('hidden') && (screens.word.classList.contains('hidden') || challengeMode === 4)) ? null : $('read-clock-face'))
      : $('clock-face');
    if (!svg) return;
    lastPupilInput = performance.now();
    const rect = svg.getBoundingClientRect();
    const x = evt.clientX - (rect.left + rect.width / 2);
    const y = evt.clientY - (rect.top + rect.height * (146 / 320));
    const nx = Math.max(-5, Math.min(5, (x / (rect.width / 2)) * 5));
    const ny = Math.max(-7, Math.min(7, (y / (rect.height / 2)) * 7));
    setPupilGaze(nx, ny);
  });
})();
