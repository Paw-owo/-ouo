// apps/chat/thread-mailbox.js
// imports:
//   from '../../core/ai-phone-hub.js': getMailboxItems, markMailboxItemRead, getUnreadMailboxCount
//   from '../../core/ui.js': showToast

import { getMailboxItems, markMailboxItemRead, getUnreadMailboxCount } from '../../core/ai-phone-hub.js';
import { showToast } from '../../core/ui.js';

// ═══════════════════════════════════════
// 【信箱详情页】导出给 thread-tools.js
// ═══════════════════════════════════════

export function buildMailboxDetail(state, options) {
  var wrap = document.createElement('div');
  wrap.className = 'tools-mailbox-wrap';

  var characterId = state?.characterId || '';

  // 列表容器
  var listWrap = document.createElement('div');
  listWrap.className = 'tools-mailbox-list';

  function renderList() {
    listWrap.innerHTML = '';
    if (!characterId) {
      listWrap.appendChild(createEmptyTip('还没有绑定角色'));
      return;
    }

    getMailboxItems(characterId).then(function(items) {
      if (!items || !items.length) {
        listWrap.appendChild(createEmptyTip('信箱空空的，还没有新消息~'));
        return;
      }

      items.forEach(function(mail) {
        var card = document.createElement('div');
        card.className = 'tools-mailbox-card' + (mail.readAt ? ' is-read' : '');

        var topRow = document.createElement('div');
        topRow.className = 'tools-mailbox-top';

        var dot = document.createElement('span');
        dot.className = 'tools-mailbox-dot';
        if (!mail.readAt) dot.classList.add('unread');

        var title = document.createElement('div');
        title.className = 'tools-mailbox-title';
        title.textContent = mail.title || '没有标题';

        var time = document.createElement('div');
        time.className = 'tools-mailbox-time';
        time.textContent = formatMailTime(mail.createdAt || '');

        topRow.append(dot, title, time);
        card.appendChild(topRow);

        var preview = document.createElement('div');
        preview.className = 'tools-mailbox-preview';
        var contentText = mail.content || '';
        preview.textContent = contentText.length > 15 ? contentText.slice(0, 15) + '...' : contentText;
        card.appendChild(preview);

        // 展开区
        var detailEl = document.createElement('div');
        detailEl.className = 'tools-mailbox-detail';
        detailEl.textContent = contentText;
        card.appendChild(detailEl);

        card.addEventListener('click', async function() {
          var isOpen = card.classList.contains('is-open');
          if (isOpen) {
            card.classList.remove('is-open');
            return;
          }

          listWrap.querySelectorAll('.tools-mailbox-card.is-open').forEach(function(el) {
            el.classList.remove('is-open');
          });

          card.classList.add('is-open');

          // 标记已读
          if (!mail.readAt && mail.id) {
            try {
              await markMailboxItemRead(mail.id);
              mail.readAt = new Date().toISOString();
              dot.classList.remove('unread');
              card.classList.add('is-read');
            } catch (e) {
              // 标记失败不影响展示
            }
          }
        });

        listWrap.appendChild(card);
      });
    }).catch(function() {
      listWrap.appendChild(createEmptyTip('加载失败，试试重新打开~'));
    });
  }

  renderList();
  wrap.appendChild(listWrap);
  return wrap;
}

// ═══════════════════════════════════════
// 【辅助】
// ═══════════════════════════════════════

function formatMailTime(timeStr) {
  if (!timeStr) return '';
  try {
    var d = new Date(timeStr);
    if (isNaN(d.getTime())) return timeStr.slice(0, 10) || '';
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var hour = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return month + '/' + day + ' ' + hour + ':' + min;
  } catch (e) {
    return timeStr.slice(0, 10) || '';
  }
}

function createEmptyTip(text) {
  var el = document.createElement('div');
  el.className = 'tools-empty';
  el.textContent = text || '';
  return el;
}

