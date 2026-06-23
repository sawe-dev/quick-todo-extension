(function () {
  if (window.__quickTodoLoaded) return;
  window.__quickTodoLoaded = true;

  let todos = [];
  let isOpen = false;
  let filter = 'all';
  let sortMode = '新しい順';
  let searchQuery = '';

  // キーバインド設定（将来的にユーザーがカスタマイズできるようにする土台）
  const DEFAULT_KEYBIND = { key: 'F24', ctrl: false, shift: false, alt: false };
  let toggleKey = { ...DEFAULT_KEYBIND };

  function matchesKeybind(e, bind) {
    return e.key === bind.key
      && e.ctrlKey === bind.ctrl
      && e.shiftKey === bind.shift
      && e.altKey === bind.alt;
  }

  // ---- STORAGE (sync = Googleアカウントで同期) ----
  function loadTodos(cb) {
    chrome.storage.sync.get(['qt_todos'], result => {
      todos = result.qt_todos || [];
      cb && cb();
    });
  }
  function saveTodos() {
    chrome.storage.sync.set({ qt_todos: todos });
  }

  loadTodos(renderTodos);

  // ---- BUILD DOM ----
  function buildDOM() {
    const overlay = document.createElement('div');
    overlay.id = 'qt-overlay';
    document.body.appendChild(overlay);

    const panel = document.createElement('div');
    panel.id = 'qt-panel';
    panel.innerHTML = `
      <div id="qt-inner">
        <div id="qt-header">
          <div id="qt-header-left">
            <div id="qt-header-title"><span class="leaf">🌱</span> My TODO</div>
            <div id="qt-date"></div>
          </div>
          <button id="qt-refresh-btn" title="リフレッシュ">🌊</button>
        </div>
        <div id="qt-stats">
          <div class="qt-stat all active" data-filter="all">
            <span class="qt-stat-icon">🌿</span>
            <span class="qt-stat-num" id="s-all">0</span>
            <span class="qt-stat-label">すべて</span>
          </div>
          <div class="qt-stat soon" data-filter="soon">
            <span class="qt-stat-icon">⏰</span>
            <span class="qt-stat-num" id="s-soon">0</span>
            <span class="qt-stat-label">期限間近</span>
          </div>
          <div class="qt-stat done" data-filter="done">
            <span class="qt-stat-icon">🌸</span>
            <span class="qt-stat-num" id="s-done">0</span>
            <span class="qt-stat-label">完了</span>
          </div>
        </div>
        <div id="qt-add-area">
          <div id="qt-add-row1">
            <span class="qt-add-emoji">✏️</span>
            <input id="qt-add-input" type="text" placeholder="やることを追加..." maxlength="200" autocomplete="off"/>
            <button id="qt-add-btn">+</button>
          </div>
          <div id="qt-add-row2">
            <input id="qt-add-date" class="qt-meta-input" type="date" title="期限"/>
            <input id="qt-add-url" class="qt-meta-input" type="url" placeholder="🔗 URL（任意）"/>
          </div>
        </div>
        <div id="qt-filter-bar">
          <input id="qt-search" type="text" placeholder="🔍 検索..."/>
          <button id="qt-sort-btn">新しい順</button>
        </div>
        <div id="qt-list"></div>
        <div id="qt-footer">
          <p>🌱 F24 で開閉</p>
          <button id="qt-clear-done">完了済みを削除</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // パネル内のどの要素にフォーカスがあってもF24を捕まえる
    panel.addEventListener('keydown', e => {
      if (matchesKeybind(e, toggleKey)) { e.preventDefault(); e.stopPropagation(); togglePanel(); }
    }, true);

    updateDate();
    bindEvents(overlay);
    renderTodos();
  }

  function updateDate() {
    const el = document.getElementById('qt-date');
    if (!el) return;
    const now = new Date();
    const days = ['日','月','火','水','木','金','土'];
    el.innerHTML = `📅 ${now.getMonth()+1}月${now.getDate()}日 <span>(${days[now.getDay()]})</span>`;
  }

  function togglePanel() {
    const panel = document.getElementById('qt-panel');
    const overlay = document.getElementById('qt-overlay');
    if (!panel) return;
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    overlay.classList.toggle('open', isOpen);
    if (isOpen) {
      updateDate(); renderTodos();
      setTimeout(() => { const i = document.getElementById('qt-add-input'); if (i) i.focus(); }, 360);
    }
  }

  function isSoon(todo) {
    if (!todo.deadline || todo.done) return false;
    const today = new Date(); today.setHours(0,0,0,0);
    const diff = (new Date(todo.deadline) - today) / 86400000;
    return diff >= 0 && diff <= 3;
  }

  function getFiltered() {
    let list = [...todos];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t =>
        t.text.toLowerCase().includes(q) ||
        (t.memo && t.memo.toLowerCase().includes(q)) ||
        (t.url && t.url.toLowerCase().includes(q))
      );
    }
    if (filter === 'soon') list = list.filter(t => isSoon(t));
    if (filter === 'done') list = list.filter(t => t.done);
    if (sortMode === '新しい順') list.sort((a,b) => b.id - a.id);
    if (sortMode === '古い順')   list.sort((a,b) => a.id - b.id);
    if (sortMode === '期限順')   list.sort((a,b) => {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1; if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });
    return list;
  }

  function renderTodos() {
    const list = document.getElementById('qt-list');
    if (!list) return;

    document.getElementById('s-all').textContent  = todos.length;
    document.getElementById('s-soon').textContent = todos.filter(t => isSoon(t)).length;
    document.getElementById('s-done').textContent = todos.filter(t => t.done).length;

    document.querySelectorAll('.qt-stat').forEach(el =>
      el.classList.toggle('active', el.dataset.filter === filter)
    );

    const filtered = getFiltered();
    if (filtered.length === 0) {
      list.innerHTML = `<div id="qt-empty"><div class="e-icon">🌱</div><p>タスクがありません</p></div>`;
      return;
    }

    list.innerHTML = '';
    filtered.forEach(todo => {
      const soon = isSoon(todo);
      const item = document.createElement('div');
      item.className = 'qt-item' + (todo.done ? ' done-item' : '');
      item.dataset.id = todo.id;

      const deadlineTag = todo.deadline
        ? `<span class="qt-tag-date${soon ? ' qt-tag-soon' : ''}">📅 ${formatDate(todo.deadline)}${soon ? ' · 期限間近' : ''}</span>` : '';
      const urlTag = todo.url
        ? `<a class="qt-tag-url" href="${escHtml(todo.url)}" target="_blank">🔗 ${domainOf(todo.url)}</a>` : '';

      item.innerHTML = `
        <div class="qt-item-main">
          <span class="qt-drag-handle">⠿</span>
          <div class="qt-check" data-id="${todo.id}">
            <svg class="qt-check-icon" viewBox="0 0 10 10"><polyline points="1.5,5 4,8 8.5,2"/></svg>
          </div>
          <div class="qt-body">
            <div class="qt-text" contenteditable="true" data-id="${todo.id}">${escHtml(todo.text)}</div>
            ${deadlineTag || urlTag ? `<div class="qt-meta-row">${deadlineTag}${urlTag}</div>` : ''}
          </div>
          <div class="qt-item-actions">
            <button class="qt-action-btn memo-btn" data-id="${todo.id}" title="メモ">
              <svg viewBox="0 0 14 14" stroke="currentColor"><path d="M2 2h10v8H7l-5 3V2z"/></svg>
            </button>
            <button class="qt-action-btn del" data-id="${todo.id}" title="削除">
              <svg viewBox="0 0 14 14" stroke="currentColor"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg>
            </button>
          </div>
        </div>
        <div class="qt-memo-row${todo.memo ? ' open' : ''}" data-id="${todo.id}">
          <textarea class="qt-memo" placeholder="🌿 メモ..." data-id="${todo.id}">${escHtml(todo.memo || '')}</textarea>
        </div>
      `;
      list.appendChild(item);
    });

    // inline edit
    list.querySelectorAll('.qt-text').forEach(el => {
      el.addEventListener('blur', e => {
        const id = parseInt(e.target.dataset.id);
        const idx = todos.findIndex(t => t.id === id);
        if (idx < 0) return;
        const txt = e.target.textContent.trim();
        if (!txt) deleteTodo(id); else { todos[idx].text = txt; saveTodos(); }
      });
      el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    });

    // memo
    list.querySelectorAll('.qt-memo').forEach(el => {
      el.style.height = el.scrollHeight + 'px';
      el.addEventListener('input', e => {
        const id = parseInt(e.target.dataset.id);
        const idx = todos.findIndex(t => t.id === id);
        if (idx < 0) return;
        todos[idx].memo = e.target.value; saveTodos();
        el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px';
      });
    });


    // add-input の Enter を直接登録（毎回クリーンに）
    const addInp = document.getElementById('qt-add-input');
    if (addInp) {
      addInp.onkeydown = e => {
        if (matchesKeybind(e, toggleKey)) { e.preventDefault(); togglePanel(); return; }
        if (e.key === 'Enter') {
          e.stopPropagation();
          const inp  = document.getElementById('qt-add-input');
          const date = document.getElementById('qt-add-date');
          const url  = document.getElementById('qt-add-url');
          if (!inp || !inp.value.trim()) return;
          todos.unshift({ id: Date.now(), text: inp.value.trim(), done: false, deadline: date ? date.value : '', url: url ? url.value : '', memo: '' });
          saveTodos();
          inp.value = ''; if (date) date.value = ''; if (url) url.value = '';
          renderTodos();
          setTimeout(() => { const i = document.getElementById('qt-add-input'); if (i) i.focus(); }, 10);
        }
        if (e.key === 'Escape') togglePanel();
      };
    }

    // drag handles
    list.querySelectorAll('.qt-drag-handle').forEach(handle => {
      handle.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        startDrag(e, handle.closest('.qt-item'));
      });
    });
  }

  // ---- DRAG & DROP ----
  let dragId   = null;
  let ghost    = null;
  let dragOriginY = 0;
  let ghostTop    = 0;

  function startDrag(e, srcItem) {
    dragId = parseInt(srcItem.dataset.id);
    const rect = srcItem.getBoundingClientRect();
    dragOriginY = e.clientY;
    ghostTop    = rect.top;

    ghost = srcItem.cloneNode(true);
    ghost.id = 'qt-ghost';
    ghost.style.cssText = [
      'position:fixed',
      'left:' + rect.left + 'px',
      'top:' + rect.top + 'px',
      'width:' + rect.width + 'px',
      'z-index:2147483650',
      'pointer-events:none',
      'border-radius:14px',
      'background:#fff',
      'border:2px solid #6ab830',
      'box-shadow:0 8px 24px rgba(80,140,20,0.25)',
      'transform:rotate(1deg) scale(1.02)',
      'opacity:0.9'
    ].join(';');

    document.body.appendChild(ghost);
    srcItem.style.opacity = '0.3';

    window.addEventListener('mousemove', onMove, { capture: true });
    window.addEventListener('mouseup',   onUp,   { capture: true });
  }

  function onMove(e) {
    if (!ghost) return;
    ghost.style.top = (ghostTop + e.clientY - dragOriginY) + 'px';

    const list = document.getElementById('qt-list');
    if (!list) return;
    list.querySelectorAll('.qt-item').forEach(el =>
      el.classList.remove('drag-over-top', 'drag-over-bottom')
    );
    const target = getTargetItem(e.clientY);
    if (target && parseInt(target.dataset.id) !== dragId) {
      const r = target.getBoundingClientRect();
      target.classList.add(e.clientY < r.top + r.height / 2 ? 'drag-over-top' : 'drag-over-bottom');
    }
  }

  function onUp(e) {
    window.removeEventListener('mousemove', onMove, { capture: true });
    window.removeEventListener('mouseup',   onUp,   { capture: true });

    // ゴースト消去
    if (ghost) { ghost.remove(); ghost = null; }
    document.querySelectorAll('#qt-ghost').forEach(el => el.remove());

    // ドラッグ元を戻す
    const srcEl = document.querySelector('.qt-item[data-id="' + dragId + '"]');
    if (srcEl) srcEl.style.opacity = '';

    const list = document.getElementById('qt-list');
    if (list) {
      const target = getTargetItem(e.clientY);
      list.querySelectorAll('.qt-item').forEach(el =>
        el.classList.remove('drag-over-top', 'drag-over-bottom')
      );

      if (target && parseInt(target.dataset.id) !== dragId) {
        const targetId    = parseInt(target.dataset.id);
        const r           = target.getBoundingClientRect();
        const insertBefore = e.clientY < r.top + r.height / 2;
        const srcIdx      = todos.findIndex(t => t.id === dragId);
        const tgtIdx      = todos.findIndex(t => t.id === targetId);
        if (srcIdx >= 0 && tgtIdx >= 0) {
          const [moved] = todos.splice(srcIdx, 1);
          const newTgt  = todos.findIndex(t => t.id === targetId);
          todos.splice(insertBefore ? newTgt : newTgt + 1, 0, moved);
          saveTodos();
        }
      }
    }

    dragId = null;
    renderTodos();
  }

  function getTargetItem(clientY) {
    const list = document.getElementById('qt-list');
    if (!list) return null;
    return [...list.querySelectorAll('.qt-item')].find(el => {
      if (parseInt(el.dataset.id) === dragId) return false;
      const r = el.getBoundingClientRect();
      return clientY >= r.top && clientY <= r.bottom;
    }) || null;
  }

  // ---- HELPERS ----
  function formatDate(d) { const dt = new Date(d); return `${dt.getMonth()+1}/${dt.getDate()}`; }
  function domainOf(url) { try { return new URL(url).hostname.replace('www.',''); } catch { return url.slice(0,20); } }
  function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function addTodo(text, deadline, url) {
    if (!text.trim()) return;
    todos.unshift({ id: Date.now(), text: text.trim(), done: false, deadline: deadline||'', url: url||'', memo: '' });
    saveTodos(); renderTodos();
  }
  function toggleTodo(id) {
    const idx = todos.findIndex(t => t.id === id);
    if (idx < 0) return;
    todos[idx].done = !todos[idx].done; saveTodos(); renderTodos();
  }
  function deleteTodo(id) {
    todos = todos.filter(t => t.id !== id); saveTodos(); renderTodos();
  }

  // ---- EVENTS ----
  function bindEvents(overlay) {
    overlay.addEventListener('click', togglePanel);

    document.getElementById('qt-add-btn').addEventListener('click', doAdd);
    document.getElementById('qt-add-input').addEventListener('keydown', e => {
      if (matchesKeybind(e, toggleKey)) { e.preventDefault(); togglePanel(); return; }
      if (e.key === 'Enter') doAdd();
      if (e.key === 'Escape') togglePanel();
    });

    function doAdd() {
      const inp  = document.getElementById('qt-add-input');
      const date = document.getElementById('qt-add-date');
      const url  = document.getElementById('qt-add-url');
      addTodo(inp.value, date.value, url.value);
      inp.value = ''; date.value = ''; url.value = '';
      inp.focus();
    }

    document.getElementById('qt-stats').addEventListener('click', e => {
      const s = e.target.closest('.qt-stat');
      if (!s) return; filter = s.dataset.filter; renderTodos();
    });

    document.getElementById('qt-search').addEventListener('input', e => {
      searchQuery = e.target.value; renderTodos();
    });

    const sorts = ['新しい順','古い順','期限順'];
    document.getElementById('qt-sort-btn').addEventListener('click', e => {
      sortMode = sorts[(sorts.indexOf(sortMode) + 1) % sorts.length];
      e.target.textContent = sortMode; renderTodos();
    });

    document.getElementById('qt-refresh-btn').addEventListener('click', () => {
      const btn = document.getElementById('qt-refresh-btn');
      btn.classList.add('spinning');
      loadTodos(() => { renderTodos(); setTimeout(() => btn.classList.remove('spinning'), 700); });
    });

    document.getElementById('qt-clear-done').addEventListener('click', () => {
      todos = todos.filter(t => !t.done); saveTodos(); renderTodos();
    });

    document.getElementById('qt-list').addEventListener('click', e => {
      if (dragId) return;
      const checkEl = e.target.closest('.qt-check');
      const delEl   = e.target.closest('.qt-action-btn.del');
      const memoEl  = e.target.closest('.qt-action-btn.memo-btn');
      const urlEl   = e.target.closest('.qt-tag-url');
      if (checkEl) toggleTodo(parseInt(checkEl.dataset.id));
      if (delEl)   deleteTodo(parseInt(delEl.dataset.id));
      if (memoEl) {
        const row = document.querySelector(`.qt-memo-row[data-id="${memoEl.dataset.id}"]`);
        if (row) row.classList.toggle('open');
      }
      if (urlEl) { e.preventDefault(); window.open(urlEl.href, '_blank'); }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && isOpen) togglePanel();
    });
  }

  function onToggleKey(e) {
    if (matchesKeybind(e, toggleKey)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      togglePanel();
    }
  }
  window.addEventListener('keydown', onToggleKey, true);

  if (document.body) buildDOM();
  else document.addEventListener('DOMContentLoaded', buildDOM);
})();
