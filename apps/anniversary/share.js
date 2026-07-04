// apps/anniversary/share.js
// 纪念日分享到朋友圈的小工具。
// 我把倒计时变成一句软软的话，悄悄发到朋友圈，让大家都来一起期待。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js

import { STORES } from '../../core/storage-keys.js';
import { setDB, generateId, getNow } from '../../core/storage.js';
import { showToast } from '../../core/ui.js';
import bus from '../../core/events.js';

/**
 * 把一条纪念日倒计时分享到朋友圈。
 * 创建一条 moment 存 STORES.moments，并广播 moments:new 事件。
 * @param {{title?:string}} item 纪念日对象
 * @param {number|null|undefined} days 距今天数（0=今天，正数=未来，负数=已过，null=未知）
 */
export async function shareToMoments(item, days) {
  try {
    const title = item.title || '一个值得纪念的日子';
    let content;
    if (days === null || days === undefined) {
      content = `纪念日：${title}`;
    } else if (days === 0) {
      content = `纪念日就是今天呀：${title}`;
    } else if (days > 0) {
      content = `纪念日倒计时：还有 ${days} 天就是 ${title}`;
    } else {
      content = `纪念日已过 ${Math.abs(days)} 天啦：${title}`;
    }
    const momentId = generateId('moment');
    const moment = {
      id: momentId,
      author: '我',
      content,
      images: [],
      createdAt: getNow()
    };
    await setDB(STORES.moments, momentId, moment);
    bus.emit('moments:new', { author: '我', preview: content });
    showToast('分享到朋友圈啦', 'success', 1400);
  } catch (e) {
    console.warn('[anniversary] 分享朋友圈失败', e);
    showToast('没分享成功，再试一下嘛', 'error');
  }
}
