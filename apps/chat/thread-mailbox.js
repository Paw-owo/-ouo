// apps/chat/thread-mailbox.js
// imports:
//   from '../../core/ai-phone-hub.js': getMailboxItems, markMailboxItemRead

import { getMailboxItems, markMailboxItemRead } from '../../core/ai-phone-hub.js';

var MAILBOX_STYLE_ID = 'chat-mailbox-style';

function injectMailboxStyle() {
  var old = document.getElementById(MAILBOX_STYLE_ID);
  if (old) old.remove();

  var style = document.createElement('style');
  style.id = MAILBOX_STYLE_ID;
  style.textContent = [
    '.tools-mailbox-wrap{display:flex;flex-direction:column;gap:12px;min-height:0;max-height:52vh;overflow:hidden}',
    '.tools-mailbox-list{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;display:flex;flex-direction:column;gap:10px;padding-bottom:8px}',
    '.tools-mailbox-card{padding:12px 14px;border-radius:var(--radius-lg);background:var(--bg-card);box-shadow:var(--shadow-sm);cursor:pointer;transition:all 0.2s ease}',
    '.tools-mailbox-card:active{transform:scale(0.98)}',
    '.tools-mailbox-card.is-read{opacity:0.75}',
    '.tools-mailbox-card.is-open{background:var(--surface-muted)}',
    '.tools-mailbox-top{display:flex;align-items:center;gap:8px}',
    '.tools-mailbox-dot{width:8px;height:8px;flex:0 0 auto;border-radius:50%;background:transparent}',
    '.tools-mailbox-dot.unread{background:var(--accent)}',
    '.tools-mailbox-title{flex:1;min-width:0;font-size:14px;font-weight:600;color:var(--text-primary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
    '.tools-mailbox-time{font-size:11px;color:var(--text-hint);white-space:nowrap}',
    '.tools-mailbox-preview{margin-top:6px;font-size:13px;color:var(--text-secondary);line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.tools-mailbox-detail{display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--surface-muted);font-size:14px;color:var(--text-primary);line-height:1.7;white-space:pre-wrap;word-break:break-word}',
    '.tools-mailbox-card.is-open .tools-mailbox-detail{display:block}',
    '.tools-empty{padding:16px 12px;border-radius:var(--radius-lg);background:var(--surface-muted);color:var(--text-hint);font-size:13px;line-height:1.6;text-align:center}',
  ].join('');
  document.head.appendChild(style);
}

export function buildMailboxDetail(state, options) {
  injectMailboxStyle();

  var wrap = document.createElement('div');
  wrap.className = 'tools-mailbox-wrap';

  var characterId = state && state.characterId ? state.characterId : '';
  var listWrap = document.createElement('div');
  listWrap.className = 'tools-mailbox-list';

  function render() {
    listWrap.innerHTML = '';

    if (!characterId) {
      listWrap.appendChild(el('div', 'tools-empty', '还没有绑定角色'));
      wrap.appendChild(listWrap);
      return;
    }

    getMailboxItems(characterId).then(function(items) {
      if (!items || !items.length) {
        listWrap.appendChild(el('div', 'tools-empty', '信箱空空的，还没有新消息~'));
        return;
      }

      items.forEach(function(mail) {
        var card = document.createElement('div');
        card.className = 'tools-mailbox-card' + (mail.readAt ? ' is-read' : '');

        var top = document.createElement('div');
        top.className = 'tools-mailbox-top';

        var dot = document.createElement('span');
        dot.className = 'tools-mailbox-dot';
        if (!mail.readAt) dot.classList.add('unread');

        var title = document.createElement('div');
        title.className = 'tools-mailbox-title';
        title.textContent = mail.title || '没有标题';

        var time = document.createElement('div');
        time.className = 'tools-mailbox-time';
        time.textContent = formatTime(mail.createdAt);

        top.append(dot, title, time);
        card.appendChild(top);

        var preview = document.createElement('div');
        preview.className = 'tools-mailbox-preview';
        var txt = mail.content || '';
        preview.textContent = txt.length > 15 ? txt.slice(0, 15) + '...' : txt;
        card.appendChild(preview);

        var detail = document.createElement('div');
        detail.className = 'tools-mailbox-detail';
        detail.textContent = txt;
        card.appendChild(detail);

        card.addEventListener('click', function() {
          if (card.classList.contains('is-open')) {
            card.classList.remove('is-open');
            return;
          }

          var openCards = listWrap.querySelectorAll('.tools-mailbox-card.is-open');
          for (var i = 0; i < openCards.length; i++) {
            openCards[i].classList.remove('is-open');
          }

          card.classList.add('is-open');

          if (!mail.readAt && mail.id) {
            markMailboxItemRead(mail.id).then(function() {
              mail.readAt = new Date().toISOString();
              dot.classList.remove('unread');
              card.classList.add('is-read');
            }).catch(function() {});
          }
        });

        listWrap.appendChild(card);
      });
    }).catch(function() {
      listWrap.appendChild(el('div', 'tools-empty', '加载失败了，再试试吧'));
    });
  }

  render();
  wrap.appendChild(listWrap);
  return wrap;
}

function formatTime(t) {
  if (!t) return '';
  try {
    var d = new Date(t);
    if (isNaN(d.getTime())) return t.slice(0, 10);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return m + '/' + day + ' ' + h + ':' + min;
  } catch (e) {
    return t.slice(0, 10);
  }
}

function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

