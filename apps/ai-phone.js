// apps/ai-phone.js
// imports:
//   from '../core/ai-phone-hub.js':
//     getAIPhoneBinding,
//     setAIPhoneBinding,
//     getAIPhonePermissions,
//     enableAIPhoneForCharacter,
//     getDiaries,
//     getDiaryLock,
//     getAIVisits,
//     getChatArchive,
//     getAIMemos,
//     addAIMemo,
//     editAIMemo,
//     deleteAIMemo,
//     getAIDreams
//   from '../core/ui.js':
//     showBottomSheet,
//     hideBottomSheet

import {
  getAIPhoneBinding,
  setAIPhoneBinding,
  getAIPhonePermissions,
  enableAIPhoneForCharacter,
  getDiaries,
  getDiaryLock,
  getAIVisits,
  getChatArchive,
  getAIMemos,
  addAIMemo,
  editAIMemo,
  deleteAIMemo,
  getAIDreams
} from '../core/ai-phone-hub.js';

import {
  showBottomSheet,
  hideBottomSheet
} from '../core/ui.js';

const APP_STYLE_ID = 'ai-phone-style';
const APP_ID = 'ai-phone';
const ARCHIVE_RENDER_LIMIT = 300;
const TABS = [
  { id: 'diary', label: '日记本' },
  { id: 'visits', label: '浏览记录' },
  { id: 'archives', label: '聊天存档' },
  { id: 'memos', label: '备忘录' },
  { id: 'dreams', label: '梦境' }
];

let rootEl = null;
let contextRef = null;
let pageEl = null;
let mounted = false;
let state = null;
let loadToken = 0;

export async function mount(containerEl, context) {
  rootEl = containerEl;
  contextRef = context || {};
  mounted = true;
  state = createInitialState();

  injectStyle();

  const boundCharacterId = safeText(readBindingId());
  const characters = await loadCharacters();
  const initialCharacterId = findAvailableCharacterId(boundCharacterId, characters);

  state.characters = characters;
  state.boundCharacterId = boundCharacterId;
  state.activeCharacterId = initialCharacterId;
  state.viewMode = initialCharacterId ? 'phone' : 'picker';
  state.activeTab = 'diary';
  state.loading = false;
  state.errorText = '';

  if (initialCharacterId) {
    await loadCharacterData(initialCharacterId);
  }

  renderApp();
}

export function unmount() {
  mounted = false;
  loadToken += 1;
  hideBottomSheet();

  if (rootEl) {
    rootEl.replaceChildren();
  }

  rootEl = null;
  contextRef = null;
  pageEl = null;
  state = null;
}

function createInitialState() {
  return {
    characters: [],
    boundCharacterId: '',
    activeCharacterId: '',
    activeTab: 'diary',
    viewMode: 'picker',
    loading: false,
    savingMemo: false,
    errorText: '',
    permissions: createDefaultPermissions(''),
    relationText: '',
    diaryLock: null,
    diaries: [],
    visits: [],
    archives: [],
    memos: [],
    dreams: []
  };
}

function createDefaultPermissions(characterId) {
  return {
    characterId: safeText(characterId),
    enabled: false,
    bound: false,
    relationText: '',
    powers: {
      diaryWrite: false,
      memoWrite: false,
      mailboxSend: false,
      mailboxRead: false,
      lockApp: false,
      unlockApp: false,
      readOtherChats: false,
      sendAsMe: false,
      proactiveMessage: false,
      makeCall: false,
      dreamAccess: false,
      chatArchiveAccess: false,
      actionLogAccess: false,
      visitLogAccess: false
    }
  };
}

function readBindingId() {
  try {
    const binding = getAIPhoneBinding();
    return binding && typeof binding === 'object' ? binding.characterId : '';
  } catch {
    return '';
  }
}

async function loadCharacters() {
  try {
    const list = await contextRef?.getAllDB?.('characters');
    return Array.isArray(list) ? list.filter((item) => safeText(item?.id)) : [];
  } catch {
    return [];
  }
}

function findAvailableCharacterId(preferredId, characters) {
  const preferred = safeText(preferredId);
  if (preferred && characters.some((item) => safeText(item?.id) === preferred)) {
    return preferred;
  }
  return safeText(characters[0]?.id);
}

async function loadCharacterData(characterId) {
  const safeId = safeText(characterId);
  if (!safeId) {
    state.permissions = createDefaultPermissions('');
    state.relationText = '';
    state.diaryLock = null;
    state.diaries = [];
    state.visits = [];
    state.archives = [];
    state.memos = [];
    state.dreams = [];
    return;
  }

  const currentToken = ++loadToken;
  state.loading = true;
  renderApp();

  try {
    const permissions = safePermissions(readPermissions(safeId));
    const [
      diaries,
      visits,
      archives,
      memos,
      dreams
    ] = await Promise.all([
      safeAsyncList(() => getDiaries(safeId)),
      safeAsyncList(() => getAIVisits(safeId)),
      safeAsyncList(() => getChatArchive(safeId, ARCHIVE_RENDER_LIMIT)),
      safeAsyncList(() => getAIMemos(safeId)),
      safeAsyncList(() => getAIDreams(safeId))
    ]);

    if (!mounted || currentToken !== loadToken) return;

    state.permissions = permissions;
    state.relationText = safeText(permissions.relationText);
    state.diaryLock = safeDiaryLock(safeId);
    state.diaries = diaries;
    state.visits = normalizeVisitList(visits);
    state.archives = normalizeArchiveList(archives);
    state.memos = memos;
    state.dreams = dreams;
    state.errorText = '';
  } catch {
    if (!mounted || currentToken !== loadToken) return;
    state.errorText = '这部小手机刚醒，还没把内容整理好';
  } finally {
    if (!mounted || currentToken !== loadToken) return;
    state.loading = false;
    renderApp();
  }
}

function normalizeVisitList(list) {
  return (Array.isArray(list) ? list : []).map((item) => ({
    ...safeObject(item),
    targetText: safeText(item?.target || item?.appName || item?.appId || '某个地方'),
    actionText: safeText(item?.actionType || 'visit'),
    timeText: formatTime(item?.createdAt),
    summaryText: safeText(item?.summary || item?.status || item?.detail || '留下一点点小痕迹')
  }));
}

function normalizeArchiveList(list) {
  return sortByTimeDesc(Array.isArray(list) ? list : []).slice(0, ARCHIVE_RENDER_LIMIT);
}

function sortByTimeDesc(list) {
  return list.slice().sort((a, b) => {
    const left = safeText(a?.createdAt || a?.updatedAt);
    const right = safeText(b?.createdAt || b?.updatedAt);
    return right.localeCompare(left);
  });
}

function renderApp() {
  if (!mounted || !rootEl || !state) return;

  const activeCharacter = getActiveCharacter();
  pageEl = document.createElement('section');
  pageEl.className = 'ai-phone-page';
  pageEl.dataset.imageKey = `app_bg_${APP_ID}`;

  const topbar = buildTopbar(activeCharacter);
  const body = document.createElement('div');
  body.className = 'ai-phone-body';

  if (state.viewMode === 'picker' || !activeCharacter) {
    body.appendChild(buildPickerView());
  } else {
    body.appendChild(buildPhoneView(activeCharacter));
  }

  pageEl.append(topbar, body);
  rootEl.replaceChildren(pageEl);

  applyBackground();
}

function buildTopbar(activeCharacter) {
  const topbar = document.createElement('header');
  topbar.className = 'ai-phone-topbar';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'ai-phone-icon-btn';
  backBtn.setAttribute('aria-label', '返回');
  backBtn.appendChild(createIconNode('back', 20));
  backBtn.addEventListener('click', () => {
    if (state.viewMode === 'phone' && state.characters.length) {
      state.viewMode = 'picker';
      renderApp();
      return;
    }
    contextRef?.closeApp?.();
  });

  const titleWrap = document.createElement('div');
  titleWrap.className = 'ai-phone-title-wrap';

  const title = document.createElement('div');
  title.className = 'ai-phone-title';
  title.textContent = 'AI个人手机';

  const subtitle = document.createElement('div');
  subtitle.className = 'ai-phone-subtitle';
  subtitle.textContent = activeCharacter
    ? getTopbarSubtitle(activeCharacter)
    : '先选一个当前人设';

  titleWrap.append(title, subtitle);

  const pickerBtn = document.createElement('button');
  pickerBtn.type = 'button';
  pickerBtn.className = 'ai-phone-icon-btn';
  pickerBtn.setAttribute('aria-label', '选择人设');
  pickerBtn.appendChild(createIconNode('smile', 20));
  pickerBtn.addEventListener('click', () => {
    state.viewMode = 'picker';
    renderApp();
  });

  topbar.append(backBtn, titleWrap, pickerBtn);
  return topbar;
}

function getTopbarSubtitle(activeCharacter) {
  const characterId = safeText(activeCharacter?.id);
  if (!characterId) return '先选一个当前人设';
  if (characterId === state.boundCharacterId) {
    return `当前查看 · ${getCharacterName(activeCharacter)} · 已绑定`;
  }
  return `当前查看 · ${getCharacterName(activeCharacter)} · 临时查看`;
}

function buildPickerView() {
  const wrap = document.createElement('div');
  wrap.className = 'ai-phone-picker';

  const hero = document.createElement('section');
  hero.className = 'ai-phone-hero-card';

  const heroTitle = document.createElement('h2');
  heroTitle.className = 'ai-phone-card-title';
  heroTitle.textContent = '挑一个AI看看它的小手机';

  const heroText = document.createElement('p');
  heroText.className = 'ai-phone-card-text';
  heroText.textContent = state.boundCharacterId
    ? '已绑定的人设会优先进入，也可以先看看别的'
    : '还没有绑定人设，可以先临时查看，也可以直接设为绑定';

  hero.append(heroTitle, heroText);

  const list = document.createElement('div');
  list.className = 'ai-phone-character-list';

  if (!state.characters.length) {
    list.appendChild(buildEmptyCard('还没有可用人设', '先去角色页准备一个人设，再回来看看'));
  } else {
    state.characters.forEach((character) => {
      list.appendChild(buildCharacterCard(character));
    });
  }

  wrap.append(hero, list);
  return wrap;
}

function buildCharacterCard(character) {
  const card = document.createElement('section');
  card.className = 'ai-phone-character-card';

  const top = document.createElement('div');
  top.className = 'ai-phone-character-top';

  const avatar = buildAvatar(character);
  const info = document.createElement('div');
  info.className = 'ai-phone-character-info';

  const name = document.createElement('div');
  name.className = 'ai-phone-character-name';
  name.textContent = getCharacterName(character);

  const meta = document.createElement('div');
  meta.className = 'ai-phone-character-meta';
  meta.textContent = getCharacterShortText(character);

  info.append(name, meta);
  top.append(avatar, info);

  const flagTexts = [];

  if (safeText(character?.id) === state.boundCharacterId) {
    flagTexts.push('已绑定');
  }

  if (safeText(character?.id) === state.activeCharacterId && state.viewMode === 'phone') {
    flagTexts.push('当前查看');
  }

  if (safeText(character?.id) === state.activeCharacterId && safeText(character?.id) !== state.boundCharacterId) {
    flagTexts.push('临时查看');
  }

  const actions = document.createElement('div');
  actions.className = 'ai-phone-card-actions';

  const previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.className = 'ai-phone-ghost-btn';
  previewBtn.textContent = '仅查看';
  previewBtn.addEventListener('click', async () => {
    state.activeCharacterId = safeText(character?.id);
    state.viewMode = 'phone';
    await loadCharacterData(state.activeCharacterId);
  });

  const bindBtn = document.createElement('button');
  bindBtn.type = 'button';
  bindBtn.className = 'ai-phone-primary-btn';
  bindBtn.textContent = safeText(character?.id) === state.boundCharacterId ? '更换绑定' : '设为绑定';
  bindBtn.addEventListener('click', async () => {
    await handleBindCharacter(safeText(character?.id));
  });

  actions.append(previewBtn, bindBtn);
  card.append(top);

  if (flagTexts.length) {
    const flags = document.createElement('div');
    flags.className = 'ai-phone-character-flags';
    flagTexts.forEach((text) => {
      flags.appendChild(buildTag(text));
    });
    card.appendChild(flags);
  }

  card.appendChild(actions);
  return card;
}

function buildPhoneView(activeCharacter) {
  const wrap = document.createElement('div');
  wrap.className = 'ai-phone-phone';

  wrap.appendChild(buildHeaderCard(activeCharacter));
  wrap.appendChild(buildTabs());
  wrap.appendChild(buildContentArea());

  return wrap;
}

function buildHeaderCard(activeCharacter) {
  const card = document.createElement('section');
  card.className = 'ai-phone-header-card';

  const top = document.createElement('div');
  top.className = 'ai-phone-header-top';

  const left = document.createElement('div');
  left.className = 'ai-phone-header-left';

  const avatar = buildAvatar(activeCharacter);
  const textWrap = document.createElement('div');
  textWrap.className = 'ai-phone-header-texts';

  const name = document.createElement('div');
  name.className = 'ai-phone-header-name';
  name.textContent = getCharacterName(activeCharacter);

  const bindText = document.createElement('div');
  bindText.className = 'ai-phone-header-meta';
  bindText.textContent = safeText(activeCharacter?.id) === state.boundCharacterId
    ? '当前查看的是已绑定的人设'
    : '当前查看的是临时的人设';

  textWrap.append(name, bindText);
  left.append(avatar, textWrap);

  const actionWrap = document.createElement('div');
  actionWrap.className = 'ai-phone-header-actions';

  const switchBtn = document.createElement('button');
  switchBtn.type = 'button';
  switchBtn.className = 'ai-phone-ghost-btn ai-phone-small-btn';
  switchBtn.textContent = '选人设';
  switchBtn.addEventListener('click', () => {
    state.viewMode = 'picker';
    renderApp();
  });

  const bindBtn = document.createElement('button');
  bindBtn.type = 'button';
  bindBtn.className = 'ai-phone-primary-btn ai-phone-small-btn';
  bindBtn.textContent = state.boundCharacterId === safeText(activeCharacter?.id) ? '更换绑定' : '绑定/更换';
  bindBtn.addEventListener('click', async () => {
    await handleBindCharacter(safeText(activeCharacter?.id));
  });

  actionWrap.append(switchBtn, bindBtn);
  top.append(left, actionWrap);

  const relation = document.createElement('div');
  relation.className = 'ai-phone-relation-text';
  relation.textContent = state.relationText || '这里先安静一下';

  const permissionRow = document.createElement('div');
  permissionRow.className = 'ai-phone-permission-row';
  permissionRow.append(
    buildStatusPill(state.permissions.enabled ? '已启用' : '未启用', state.permissions.enabled ? 'accent' : 'soft'),
    buildStatusPill(state.permissions.bound ? '已绑定' : '未绑定', state.permissions.bound ? 'accent' : 'soft')
  );

  card.append(top, relation, permissionRow);
  return card;
}

function buildTabs() {
  const tabWrap = document.createElement('nav');
  tabWrap.className = 'ai-phone-tabs';
  tabWrap.setAttribute('aria-label', '页面切换');

  TABS.forEach((tab) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ai-phone-tab-btn${state.activeTab === tab.id ? ' is-active' : ''}`;
    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      state.activeTab = tab.id;
      renderApp();
    });
    tabWrap.appendChild(btn);
  });

  return tabWrap;
}

function buildContentArea() {
  const area = document.createElement('section');
  area.className = 'ai-phone-content';

  if (state.loading) {
    area.appendChild(buildLoadingCard());
    return area;
  }

  if (state.errorText) {
    area.appendChild(buildEmptyCard('内容整理失败', state.errorText));
    return area;
  }

  if (state.activeTab === 'diary') {
    area.appendChild(buildDiaryPage());
  } else if (state.activeTab === 'visits') {
    area.appendChild(buildVisitsPage());
  } else if (state.activeTab === 'archives') {
    area.appendChild(buildArchivesPage());
  } else if (state.activeTab === 'memos') {
    area.appendChild(buildMemosPage());
  } else if (state.activeTab === 'dreams') {
    area.appendChild(buildDreamsPage());
  }

  return area;
}

function buildDiaryPage() {
  const page = document.createElement('div');
  page.className = 'ai-phone-scroll-page';

  if (!canReadDiary()) {
    page.appendChild(buildEmptyCard('日记本还没打开', '这里先安静一点'));
    return page;
  }

  const lockCard = document.createElement('section');
  lockCard.className = 'ai-phone-info-card';

  const lockTitle = document.createElement('div');
  lockTitle.className = 'ai-phone-section-title';
  lockTitle.textContent = '锁状态';

  const lockText = document.createElement('div');
  lockText.className = 'ai-phone-section-desc';
  lockText.textContent = state.diaryLock?.locked
    ? `已上锁${state.diaryLock?.passwordHint ? ` · 提示：${safeText(state.diaryLock.passwordHint)}` : ''}`
    : '未上锁';

  lockCard.append(lockTitle, lockText);
  page.appendChild(lockCard);

  if (!state.diaries.length) {
    page.appendChild(buildEmptyCard('还没有日记', '等这位AI慢慢写下新内容，这里就会出现时间轴'));
    return page;
  }

  const timeline = document.createElement('div');
  timeline.className = 'ai-phone-timeline';

  state.diaries.forEach((item) => {
    const details = document.createElement('details');
    details.className = 'ai-phone-timeline-card';

    const summary = document.createElement('summary');
    summary.className = 'ai-phone-timeline-summary';

    const top = document.createElement('div');
    top.className = 'ai-phone-timeline-top';

    const title = document.createElement('div');
    title.className = 'ai-phone-timeline-title';
    title.textContent = safeText(item?.title) || '一篇没起名的日记';

    const date = document.createElement('div');
    date.className = 'ai-phone-timeline-date';
    date.textContent = formatTime(item?.createdAt);

    top.append(title, date);

    const meta = document.createElement('div');
    meta.className = 'ai-phone-entry-meta';
    meta.textContent = '点开看看';

    summary.append(top, meta);

    const body = document.createElement('div');
    body.className = 'ai-phone-timeline-body';

    const content = document.createElement('div');
    content.className = 'ai-phone-long-text';
    content.textContent = safeText(item?.content) || '这页日记还是空空的';

    body.appendChild(content);
    details.append(summary, body);
    timeline.appendChild(details);
  });

  page.appendChild(timeline);
  return page;
}

function buildVisitsPage() {
  const page = document.createElement('div');
  page.className = 'ai-phone-scroll-page';

  if (!canReadVisits()) {
    page.appendChild(buildEmptyCard('浏览记录还没开放', '这里先安静一点'));
    return page;
  }

  if (!state.visits.length) {
    page.appendChild(buildEmptyCard('还没有浏览记录', '等它去别的地方逛逛，这里就会慢慢有痕迹'));
    return page;
  }

  const list = document.createElement('div');
  list.className = 'ai-phone-list';

  state.visits.forEach((item) => {
    const card = document.createElement('section');
    card.className = 'ai-phone-list-card';

    const top = document.createElement('div');
    top.className = 'ai-phone-list-top';

    const target = document.createElement('div');
    target.className = 'ai-phone-list-title';
    target.textContent = item.targetText;

    const time = document.createElement('div');
    time.className = 'ai-phone-list-time';
    time.textContent = item.timeText;

    const desc = document.createElement('div');
    desc.className = 'ai-phone-list-desc';
    desc.textContent = `${item.actionText} · ${item.summaryText}`;

    top.append(target, time);
    card.append(top, desc);
    list.appendChild(card);
  });

  page.appendChild(list);
  return page;
}

function buildArchivesPage() {
  const page = document.createElement('div');
  page.className = 'ai-phone-scroll-page';

  if (!canReadArchives()) {
    page.appendChild(buildEmptyCard('聊天存档还没开放', '这里先安静一点'));
    return page;
  }

  page.appendChild(buildInfoCard('最近存档', '这里会显示较新的聊天痕迹'));

  if (!state.archives.length) {
    page.appendChild(buildEmptyCard('还没有聊天存档', '最近1000条私聊存档还没有内容呢'));
    return page;
  }

  const list = document.createElement('div');
  list.className = 'ai-phone-list';

  state.archives.forEach((item) => {
    const card = document.createElement('section');
    card.className = 'ai-phone-list-card';

    const top = document.createElement('div');
    top.className = 'ai-phone-list-top';

    const role = document.createElement('div');
    role.className = 'ai-phone-list-title';
    role.textContent = item?.role === 'user' ? '用户' : 'AI';

    const time = document.createElement('div');
    time.className = 'ai-phone-list-time';
    time.textContent = formatTime(item?.createdAt);

    const content = document.createElement('div');
    content.className = 'ai-phone-long-text';
    content.textContent = safeText(item?.content) || '这一条存档是空的';

    top.append(role, time);
    card.append(top, content);
    list.appendChild(card);
  });

  page.appendChild(list);
  return page;
}

function buildMemosPage() {
  const page = document.createElement('div');
  page.className = 'ai-phone-scroll-page';

  if (!canWriteMemos()) {
    page.appendChild(buildEmptyCard('备忘录还没开放', '这里先安静一点'));
    return page;
  }

  const editorCard = document.createElement('section');
  editorCard.className = 'ai-phone-info-card';

  const title = document.createElement('div');
  title.className = 'ai-phone-section-title';
  title.textContent = '备忘录';

  const desc = document.createElement('div');
  desc.className = 'ai-phone-section-desc';
  desc.textContent = '想写新便签时，再轻点一下新增入口就好';

  const actions = document.createElement('div');
  actions.className = 'ai-phone-card-actions';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'ai-phone-primary-btn';
  addBtn.textContent = '新增便签';
  addBtn.disabled = state.savingMemo;
  addBtn.addEventListener('click', async () => {
    await openMemoEditorSheet({
      title: '新增便签',
      placeholder: '写一张小便签吧',
      confirmText: '收好啦',
      initialValue: '',
      onConfirm: async (content) => {
        return await handleAddMemo(content);
      }
    });
  });

  actions.appendChild(addBtn);
  editorCard.append(title, desc, actions);
  page.appendChild(editorCard);

  if (!state.memos.length) {
    page.appendChild(buildEmptyCard('还没有便签', '写下第一张小便签，它就会乖乖出现在这里'));
    return page;
  }

  const list = document.createElement('div');
  list.className = 'ai-phone-list';

  state.memos.forEach((item) => {
    const card = document.createElement('section');
    card.className = 'ai-phone-list-card';

    const time = document.createElement('div');
    time.className = 'ai-phone-list-time';
    time.textContent = formatTime(item?.updatedAt || item?.createdAt);

    const text = document.createElement('div');
    text.className = 'ai-phone-long-text';
    text.textContent = safeText(item?.content) || '这张便签没有写字';

    const actionsRow = document.createElement('div');
    actionsRow.className = 'ai-phone-card-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'ai-phone-ghost-btn';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', async () => {
      await openMemoEditorSheet({
        title: '编辑便签',
        placeholder: '改改这张便签吧',
        confirmText: '改好啦',
        initialValue: safeText(item?.content),
        onConfirm: async (content) => {
          return await handleEditMemo(safeText(item?.id), content);
        }
      });
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'ai-phone-ghost-btn';
    deleteBtn.textContent = '删除';
    deleteBtn.addEventListener('click', async () => {
      await handleDeleteMemo(safeText(item?.id));
    });

    actionsRow.append(editBtn, deleteBtn);
    card.append(time, text, actionsRow);
    list.appendChild(card);
  });

  page.appendChild(list);
  return page;
}

function buildDreamsPage() {
  const page = document.createElement('div');
  page.className = 'ai-phone-scroll-page';

  if (!canReadDreams()) {
    page.appendChild(buildEmptyCard('梦境页还没打开', '这里先安静一点'));
    return page;
  }

  if (!state.dreams.length) {
    page.appendChild(buildEmptyCard('还没有梦境记录', '等它做了新的梦，这里会沿着时间轴慢慢长出来'));
    return page;
  }

  const timeline = document.createElement('div');
  timeline.className = 'ai-phone-timeline';

  state.dreams.forEach((item) => {
    const card = document.createElement('section');
    card.className = 'ai-phone-timeline-card';

    const top = document.createElement('div');
    top.className = 'ai-phone-timeline-top';

    const title = document.createElement('div');
    title.className = 'ai-phone-timeline-title';
    title.textContent = safeText(item?.summary) || '一段轻轻的梦';

    const time = document.createElement('div');
    time.className = 'ai-phone-timeline-date';
    time.textContent = formatTime(item?.createdAt);

    top.append(title, time);

    const moodRow = document.createElement('div');
    moodRow.className = 'ai-phone-tag-row';
    moodRow.appendChild(buildTag(safeText(item?.mood) || '未标记'));

    const text = document.createElement('div');
    text.className = 'ai-phone-long-text';
    text.textContent = safeText(item?.content) || '这段梦还没留下具体内容';

    card.append(top, moodRow, text);
    timeline.appendChild(card);
  });

  page.appendChild(timeline);
  return page;
}

function buildLoadingCard() {
  const card = document.createElement('section');
  card.className = 'ai-phone-empty-card';

  const title = document.createElement('div');
  title.className = 'ai-phone-empty-title';
  title.textContent = '小手机正在整理内容';

  const desc = document.createElement('div');
  desc.className = 'ai-phone-empty-desc';
  desc.textContent = '马上就好，再等一下下';

  card.append(title, desc);
  return card;
}

function buildEmptyCard(titleText, descText) {
  const card = document.createElement('section');
  card.className = 'ai-phone-empty-card';

  const title = document.createElement('div');
  title.className = 'ai-phone-empty-title';
  title.textContent = titleText;

  const desc = document.createElement('div');
  desc.className = 'ai-phone-empty-desc';
  desc.textContent = descText;

  card.append(title, desc);
  return card;
}

function buildInfoCard(titleText, descText) {
  const card = document.createElement('section');
  card.className = 'ai-phone-info-card';

  const title = document.createElement('div');
  title.className = 'ai-phone-section-title';
  title.textContent = titleText;

  const desc = document.createElement('div');
  desc.className = 'ai-phone-section-desc';
  desc.textContent = descText;

  card.append(title, desc);
  return card;
}

function buildAvatar(character) {
  const avatar = document.createElement('div');
  avatar.className = 'ai-phone-avatar';

  const image = safeText(character?.avatar || character?.characterAvatar);
  if (image) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = image;
    img.addEventListener('error', () => {
      avatar.replaceChildren(createIconNode('smile', 18));
    });
    avatar.appendChild(img);
  } else {
    avatar.appendChild(createIconNode('smile', 18));
  }

  return avatar;
}

function buildTag(text) {
  const tag = document.createElement('span');
  tag.className = 'ai-phone-tag';
  tag.textContent = text;
  return tag;
}

function buildStatusPill(text, mode) {
  const pill = document.createElement('span');
  pill.className = `ai-phone-status-pill${mode === 'accent' ? ' is-accent' : ''}`;
  pill.textContent = text;
  return pill;
}

async function handleBindCharacter(characterId) {
  const safeId = safeText(characterId);
  if (!safeId) return false;

  const bindingResult = safeCall(() => setAIPhoneBinding(safeId));
  const bindingCharacterId = safeText(bindingResult?.characterId);
  if (!bindingCharacterId || bindingCharacterId !== safeId) {
    toast('绑定失败');
    return false;
  }

  const enableResult = safeCall(() => enableAIPhoneForCharacter(safeId, {
    relationText: '这是当前绑定的人设。'
  }));
  if (!enableResult || enableResult.enabled !== true || safeText(enableResult.characterId) !== safeId) {
    toast('启用失败');
    return false;
  }

  state.boundCharacterId = safeId;
  state.activeCharacterId = safeId;
  state.viewMode = 'phone';

  notifyBindingChanged();
  await loadCharacterData(safeId);
  await applyBackground();
  toast('已绑定');
  return true;
}

async function handleAddMemo(content) {
  const characterId = safeText(state.activeCharacterId);
  if (!characterId) return false;

  state.savingMemo = true;
  renderApp();

  try {
    const saved = await addAIMemo(characterId, {
      content: safeText(content),
      tags: []
    });

    if (!saved) {
      toast('便签没存好');
      return false;
    }

    await refreshMemosOnly(characterId);
    toast('已保存');
    return true;
  } catch {
    toast('便签没存好');
    return false;
  } finally {
    state.savingMemo = false;
    renderApp();
  }
}

async function handleEditMemo(memoId, content) {
  if (!safeText(memoId)) return false;

  try {
    const saved = await editAIMemo(memoId, {
      content: safeText(content)
    });

    if (!saved) {
      toast('修改失败');
      return false;
    }

    await refreshMemosOnly(state.activeCharacterId);
    toast('已修改');
    return true;
  } catch {
    toast('修改失败');
    return false;
  }
}

async function handleDeleteMemo(memoId) {
  if (!safeText(memoId)) return false;

  try {
    const deleted = await deleteAIMemo(memoId);
    if (!deleted) {
      toast('删除失败');
      return false;
    }

    await refreshMemosOnly(state.activeCharacterId);
    toast('已删除');
    return true;
  } catch {
    toast('删除失败');
    return false;
  }
}

async function refreshMemosOnly(characterId) {
  state.memos = await safeAsyncList(() => getAIMemos(characterId));
  renderApp();
}

async function openMemoEditorSheet(options = {}) {
  hideBottomSheet();

  const sheet = document.createElement('div');
  sheet.className = 'ai-phone-sheet';

  const title = document.createElement('div');
  title.className = 'ai-phone-sheet-title';
  title.textContent = safeText(options.title) || '编辑便签';

  const textarea = document.createElement('textarea');
  textarea.className = 'ai-phone-textarea ai-phone-sheet-textarea';
  textarea.placeholder = safeText(options.placeholder) || '写点什么吧';
  textarea.value = safeText(options.initialValue);
  textarea.rows = 6;

  const actions = document.createElement('div');
  actions.className = 'ai-phone-card-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'ai-phone-ghost-btn';
  cancelBtn.textContent = '先不改';
  cancelBtn.addEventListener('click', () => {
    hideBottomSheet();
  });

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'ai-phone-primary-btn';
  saveBtn.textContent = safeText(options.confirmText) || '保存';
  saveBtn.addEventListener('click', async () => {
    const content = safeText(textarea.value);
    if (!content) {
      toast('便签内容还空着');
      return;
    }

    let ok = false;
    if (typeof options.onConfirm === 'function') {
      ok = await Promise.resolve(options.onConfirm(content));
    }

    if (ok === true) {
      hideBottomSheet();
      return;
    }
  });

  actions.append(cancelBtn, saveBtn);
  sheet.append(title, textarea, actions);
  showBottomSheet(sheet);

  requestAnimationFrame(() => {
    textarea.focus({ preventScroll: true });
  });
}

function notifyBindingChanged() {
  try {
    contextRef?.refreshBadges?.();
  } catch {}

  try {
    contextRef?.emit?.('app-refresh-desktop');
  } catch {}
}

function getActiveCharacter() {
  return state.characters.find((item) => safeText(item?.id) === safeText(state.activeCharacterId)) || null;
}

function getCharacterName(character) {
  return safeText(character?.name || character?.nickname || '未命名');
}

function safePermissions(value) {
  const base = createDefaultPermissions(value?.characterId);
  const powers = safeObject(value?.powers);
  return {
    ...base,
    ...safeObject(value),
    relationText: safeText(value?.relationText),
    powers: {
      ...base.powers,
      ...powers
    }
  };
}

function readPermissions(characterId) {
  try {
    return getAIPhonePermissions(characterId);
  } catch {
    return createDefaultPermissions(characterId);
  }
}

function safeDiaryLock(characterId) {
  try {
    return safeObject(getDiaryLock(characterId));
  } catch {
    return null;
  }
}

function canReadDiary() {
  return Boolean(state.permissions.bound && state.permissions.enabled);
}

function canReadVisits() {
  return Boolean(state.permissions.visitLogAccess);
}

function canReadArchives() {
  return Boolean(state.permissions.chatArchiveAccess);
}

function canWriteMemos() {
  return Boolean(state.permissions.bound && state.permissions.enabled && state.permissions.memoWrite);
}

function canReadDreams() {
  return Boolean(state.permissions.dreamAccess);
}

function getCharacterShortText(character) {
  const text = safeText(character?.description || character?.persona || character?.style || '');
  if (!text) return '点开看看这位AI的小手机';
  return shortenText(text, 18);
}

async function safeAsyncList(factory) {
  try {
    const list = await factory();
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeText(value) {
  return String(value || '').trim();
}

function shortenText(text, max = 18) {
  const clean = safeText(text);
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function formatTime(value) {
  const text = safeText(value);
  if (!text) return '时间还没记下来';

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  try {
    return date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return text;
  }
}

function createIconNode(name, size) {
  if (typeof contextRef?.createIcon === 'function') {
    return contextRef.createIcon(name, size);
  }
  const fallback = document.createElement('span');
  fallback.className = 'ai-phone-icon-fallback';
  fallback.textContent = '';
  return fallback;
}

function toast(text) {
  try {
    contextRef?.showToast?.(text);
  } catch {}
}

async function applyBackground() {
  if (!pageEl?.dataset) return;
  if (!contextRef?.images?.applyImageToElement) return;
  try {
    await contextRef.images.applyImageToElement(pageEl, `app_bg_${APP_ID}`, { opacity: false });
  } catch {}
}

function safeCall(factory) {
  try {
    return factory();
  } catch {
    return null;
  }
}

function injectStyle() {
  const oldStyle = document.getElementById(APP_STYLE_ID);
  if (oldStyle) oldStyle.remove();

  const style = document.createElement('style');
  style.id = APP_STYLE_ID;
  style.textContent = `
    .ai-phone-page {
      position: fixed;
      inset: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
      font-size: var(--font-size-base);
      line-height: 1.6;
      border: none;
      outline: none;
      box-shadow: none;
    }

    .ai-phone-topbar {
      flex: 0 0 auto;
      min-height: calc(58px + env(safe-area-inset-top));
      display: flex;
      align-items: flex-end;
      gap: 12px;
      padding: env(safe-area-inset-top) 16px 12px;
      background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: none;
      outline: none;
      box-shadow: none;
    }

    .ai-phone-title-wrap {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      text-align: center;
    }

    .ai-phone-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.3;
    }

    .ai-phone-subtitle {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ai-phone-body {
      flex: 1;
      min-height: 0;
      padding: 0 14px calc(16px + env(safe-area-inset-bottom));
      overflow: hidden;
      border: none;
      outline: none;
      box-shadow: none;
    }

    .ai-phone-picker,
    .ai-phone-phone {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 10px;
    }

    .ai-phone-phone {
      overflow: hidden;
    }

    .ai-phone-hero-card,
    .ai-phone-header-card,
    .ai-phone-info-card,
    .ai-phone-empty-card,
    .ai-phone-character-card,
    .ai-phone-list-card,
    .ai-phone-timeline-card {
      border: none;
      outline: none;
      border-radius: var(--radius-lg);
      background: color-mix(in srgb, var(--bg-card) 90%, transparent);
      box-shadow: var(--shadow-sm);
    }

    .ai-phone-hero-card,
    .ai-phone-header-card,
    .ai-phone-info-card,
    .ai-phone-empty-card,
    .ai-phone-character-card,
    .ai-phone-list-card,
    .ai-phone-timeline-card {
      padding: 14px;
    }

    .ai-phone-card-title,
    .ai-phone-section-title,
    .ai-phone-header-name,
    .ai-phone-character-name,
    .ai-phone-list-title,
    .ai-phone-timeline-title,
    .ai-phone-empty-title {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.4;
    }

    .ai-phone-card-text,
    .ai-phone-section-desc,
    .ai-phone-relation-text,
    .ai-phone-header-meta,
    .ai-phone-character-meta,
    .ai-phone-list-desc,
    .ai-phone-empty-desc,
    .ai-phone-entry-meta,
    .ai-phone-list-time,
    .ai-phone-timeline-date {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .ai-phone-character-list,
    .ai-phone-list,
    .ai-phone-timeline {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .ai-phone-picker {
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 8px;
    }

    .ai-phone-header-card {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .ai-phone-header-top,
    .ai-phone-character-top,
    .ai-phone-list-top,
    .ai-phone-timeline-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .ai-phone-header-left,
    .ai-phone-character-info,
    .ai-phone-header-texts {
      min-width: 0;
      display: flex;
      gap: 10px;
    }

    .ai-phone-header-left {
      align-items: center;
      flex: 1;
    }

    .ai-phone-header-texts,
    .ai-phone-character-info {
      flex: 1;
      flex-direction: column;
      gap: 3px;
    }

    .ai-phone-header-actions,
    .ai-phone-card-actions,
    .ai-phone-tag-row,
    .ai-phone-permission-row,
    .ai-phone-character-flags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .ai-phone-tabs {
      flex: 0 0 auto;
      display: flex;
      gap: 8px;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 2px 0 2px;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .ai-phone-tabs::-webkit-scrollbar {
      display: none;
    }

    .ai-phone-content {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .ai-phone-scroll-page {
      height: 100%;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-bottom: 6px;
    }

    .ai-phone-avatar {
      width: 48px;
      height: 48px;
      flex: 0 0 48px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-md);
      background: var(--accent-light);
      color: var(--accent);
      box-shadow: var(--shadow-sm);
    }

    .ai-phone-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .ai-phone-icon-btn,
    .ai-phone-primary-btn,
    .ai-phone-ghost-btn,
    .ai-phone-tab-btn {
      border: none;
      outline: none;
      appearance: none;
      -webkit-appearance: none;
      transition: all 200ms ease;
      font-family: inherit;
    }

    .ai-phone-icon-btn:active,
    .ai-phone-primary-btn:active,
    .ai-phone-ghost-btn:active,
    .ai-phone-tab-btn:active {
      transform: scale(0.96);
    }

    .ai-phone-icon-btn {
      width: 38px;
      height: 38px;
      flex: 0 0 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-md);
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .ai-phone-primary-btn,
    .ai-phone-ghost-btn,
    .ai-phone-tab-btn {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 14px;
      border-radius: var(--radius-full);
      font-size: var(--font-size-small);
      line-height: 1.4;
      white-space: nowrap;
    }

    .ai-phone-primary-btn {
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-sm);
    }

    .ai-phone-primary-btn:disabled {
      opacity: 0.56;
    }

    .ai-phone-ghost-btn,
    .ai-phone-tab-btn {
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .ai-phone-tab-btn.is-active {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .ai-phone-small-btn {
      min-height: 36px;
      padding: 0 12px;
    }

    .ai-phone-textarea {
      width: 100%;
      min-height: 108px;
      resize: vertical;
      border: none;
      outline: none;
      border-radius: var(--radius-md);
      background: var(--bg-surface);
      color: var(--text-primary);
      box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--bg-surface) 88%, transparent);
      padding: 12px 13px;
      font-family: inherit;
      font-size: 16px;
      line-height: 1.6;
    }

    .ai-phone-textarea::placeholder {
      color: var(--text-hint);
    }

    .ai-phone-status-pill,
    .ai-phone-tag {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 28px;
      padding: 0 10px;
      border-radius: var(--radius-full);
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.4;
      box-shadow: var(--shadow-sm);
    }

    .ai-phone-status-pill.is-accent {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .ai-phone-long-text {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .ai-phone-timeline-card summary {
      list-style: none;
      cursor: pointer;
    }

    .ai-phone-timeline-card summary::-webkit-details-marker {
      display: none;
    }

    .ai-phone-timeline-summary {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .ai-phone-timeline-body {
      margin-top: 10px;
      padding-top: 10px;
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--surface-muted) 86%, transparent);
    }

    .ai-phone-empty-card {
      min-height: 180px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 6px;
    }

    .ai-phone-sheet {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-bottom: 4px;
    }

    .ai-phone-sheet-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.4;
    }

    .ai-phone-sheet-textarea {
      min-height: 160px;
    }

    .ai-phone-icon-fallback {
      display: inline-block;
      width: 1px;
      height: 1px;
    }
  `;
  document.head.appendChild(style);
}
