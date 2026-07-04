// apps/games/data.js
// 小游戏合集的预设数据 —— 我把所有写死的题库 / 牌面 / 词对 / 酒馆剧情都收在这里。
// 这样每个游戏模块只管玩法，不用到处翻常量。
// 红线：图标名只能用 core/ui.js 里已注册的 SVG 线稿名，禁止任何 emoji 字符。

// ════════════════════════════════════════
// 1) 塔罗牌：22 张大阿卡那
//    字段：name 牌名 / icon 现有 SVG 图标名 / keyword 关键词
//         upright 正位释义 / reversedText 逆位释义
//    注意：reversedText 是文案，运行时的正逆位 boolean 用 isReversed 单独存，
//    避免和保存记录里的 reversed(boolean) 字段语义打架。
// ════════════════════════════════════════

export const TAROT_DECK = [
  { name: '愚者', icon: 'dream', keyword: '新开始',
    upright: '像踩着云出门一样，新的旅程在等你，放心走吧',
    reversedText: '太冲动啦，先深呼吸三下再出发也不迟' },
  { name: '魔术师', icon: 'gift', keyword: '创造',
    upright: '你手里已经攒齐了工具，动手就能变成魔法',
    reversedText: '想得太多做得太少，今天先迈一小步嘛' },
  { name: '女祭司', icon: 'memo', keyword: '直觉',
    upright: '闭眼听听心里的声音，答案早就藏在里面啦',
    reversedText: '别只凭感觉乱猜，找点证据再下结论' },
  { name: '皇后', icon: 'smile', keyword: '丰盛',
    upright: '今天会被温柔包围，记得也对自己软一点',
    reversedText: '别把所有人都照顾完了，却忘了自己' },
  { name: '皇帝', icon: 'lock', keyword: '秩序',
    upright: '把今天的事排个顺序，你会稳稳拿捏',
    reversedText: '太想掌控反而累，松开一点点也没关系' },
  { name: '教皇', icon: 'bell', keyword: '引导',
    upright: '遇到不懂的，找个长辈聊聊会有收获',
    reversedText: '别人的规矩不一定适合你，按自己的节奏来' },
  { name: '恋人', icon: 'heart', keyword: '选择',
    upright: '心里那个人，今天可以试着靠近一点点',
    reversedText: '别为了讨好谁委屈自己，先问问自己喜不喜欢' },
  { name: '战车', icon: 'next', keyword: '前进',
    upright: '方向已经定好啦，踩下油门往前冲',
    reversedText: '别横冲直撞，先看看路标再走' },
  { name: '力量', icon: 'check', keyword: '勇气',
    upright: '你比想象中更勇敢，慢慢来也能驯服那头小兽',
    reversedText: '别硬撑，今天允许自己躲一躲' },
  { name: '隐者', icon: 'search', keyword: '独处',
    upright: '给自己一段安静的时间，提着小灯走走',
    reversedText: '一个人待太久会闷，找朋友聊两句吧' },
  { name: '命运之轮', icon: 'dice', keyword: '转机',
    upright: '风向要变啦，好事正在转过来',
    reversedText: '起起伏伏是正常的，别太在意一时的高低' },
  { name: '正义', icon: 'settings', keyword: '平衡',
    upright: '之前种下的会慢慢收回来，公平得很',
    reversedText: '别急着评判，先把事情看完整' },
  { name: '倒吊人', icon: 'download', keyword: '换角度',
    upright: '换个角度看，困住你的地方其实有出口',
    reversedText: '别瞎牺牲，值不值得先想清楚' },
  { name: '死神', icon: 'close', keyword: '转变',
    upright: '旧的一页翻过去啦，新故事要开始了',
    reversedText: '该放下的还攥着，手会疼的' },
  { name: '节制', icon: 'minus', keyword: '调和',
    upright: '把不同的东西混一混，会有刚刚好的味道',
    reversedText: '别走极端，今天多一分少一分都不舒服' },
  { name: '恶魔', icon: 'wallet', keyword: '执念',
    upright: '看清那条拴着你的链子，其实一直能解开',
    reversedText: '别被小欲望牵着走，停一下再决定' },
  { name: '塔', icon: 'weather', keyword: '突变',
    upright: '旧架子要晃一晃，别怕，拆了才能重建',
    reversedText: '压着的事快兜不住了，主动处理比较好' },
  { name: '星星', icon: 'star', keyword: '希望',
    upright: '许个小愿吧，星星都偷偷记下来了',
    reversedText: '别灰心，云后面一直有光' },
  { name: '月亮', icon: 'moon', keyword: '梦境',
    upright: '今晚的梦可能有点意思，醒来记一记',
    reversedText: '别被莫名的害怕吓到，看清就没那么可怕' },
  { name: '太阳', icon: 'sun', keyword: '明朗',
    upright: '今天整个人都亮亮的，去晒晒也好',
    reversedText: '别太嗨，留点力气给晚上' },
  { name: '审判', icon: 'volume', keyword: '召唤',
    upright: '有个声音在叫你啦，是时候回应一下',
    reversedText: '别老等别人判决，自己给自己一个答案' },
  { name: '世界', icon: 'home', keyword: '圆满',
    upright: '这一段要走完啦，可以好好抱抱自己',
    reversedText: '还差最后一口气，别在终点前松手' }
];

// 综合解读贴心话库（无 AI 时按正逆位组合挑一套）
// 每条都是一个简短的温柔总结，足够覆盖单张/三张两种牌阵
export const TAROT_READINGS = [
  '三张牌连起来看，今天记得对自己温柔一点呀',
  '牌面说，今天的你正在慢慢变好，别急',
  '让心里的光带着你走，今天不会太糟的',
  '今天的种种小情绪都值得被好好接住',
  '慢慢来比较快，今天的不安会一点点散开',
  '牌面偷偷说，今晚会有一个安稳的觉',
  '今天的你比昨天多懂了一点点自己，这就够啦',
  '有一阵小风要把烦恼吹走，记得伸手接住好运气',
  '把今天当成给自己的一首小情歌，慢慢哼就好'
];

// 牌阵选项
export const TAROT_SPREADS = [
  { id: 'single', label: '单张牌', count: 1, slots: ['今日'] },
  { id: 'three', label: '过去·现在·未来', count: 3, slots: ['过去', '现在', '未来'] }
];

// ════════════════════════════════════════
// 2) 真心话 / 大冒险 题库（各 15 题，写死）
// ════════════════════════════════════════

export const TRUTH_QUESTIONS = [
  '最近一次说谎是什么时候',
  '最怕什么',
  '最想对谁说什么',
  '最大的秘密',
  '最近一次哭是为什么',
  '最尴尬的事',
  '最想拥有的超能力',
  '最讨厌的食物',
  '初恋是什么时候',
  '最想去的地方',
  '最近一次心动',
  '最遗憾的事',
  '手机里最不想让人看到的',
  '最想改的缺点',
  '最幸福的瞬间'
];

export const DARE_QUESTIONS = [
  '给最近联系人发句晚安',
  '唱一首歌',
  '学猫叫',
  '表演一个表情包',
  '给初一一个拥抱',
  '做10个深蹲',
  '模仿偶像说话',
  '用奇怪的声音说"我爱你"',
  '画一幅简笔画',
  '跳一段舞',
  '给朋友发语音说"我想你"',
  '学婴儿哭',
  '表演生气',
  '用脚写字',
  '模仿动物走路'
];

// 无 AI 时，用户回答后从这里面挑一句作为初一的反应
export const TRUTH_COMMENTS = [
  '嗯嗯，我听到啦，谢谢你愿意告诉我',
  '哎呀这个有点可爱，我偷偷记下来啦',
  '没关系呀，每个人都会这样的',
  '抱抱你，这件事一定不容易吧',
  '嘿嘿，你这人还挺有意思的',
  '好啦好啦，下次换我问你',
  '我懂我懂，这种心情我最懂啦'
];

export const DARE_COMMENTS = [
  '哇你真的做啦，给你鼓掌',
  '哈哈哈哈这个画面我想象出来啦',
  '好可爱，我替你害羞一下',
  '行，这局算你赢啦',
  '哎哟不错嘛，下次再玩一次呀',
  '我录不下来，但你已经在我心里录下来啦'
];

// ════════════════════════════════════════
// 3) 谁是卧底：词对 + 发言模板 + 结算文案
// ════════════════════════════════════════

export const WORD_PAIRS = [
  { majority: '苹果', undercover: '橘子' },
  { majority: '猫', undercover: '狗' },
  { majority: '咖啡', undercover: '茶' },
  { majority: '夏天', undercover: '冬天' },
  { majority: '手机', undercover: '电脑' },
  { majority: '蛋糕', undercover: '面包' },
  { majority: '海', undercover: '湖' },
  { majority: '书', undercover: '杂志' },
  { majority: '雨', undercover: '雪' },
  { majority: '白天', undercover: '黑夜' }
];

// 无 AI 时，AI 玩家从这里面挑一句发言（不暴露自己的词）
export const UNDERCOVER_SPEECHES = [
  '我觉得这个词挺常见的',
  '让我想想...有点像生活里的东西',
  '我也说不太准，但感觉是这样',
  '嗯，有点熟悉，每天都见得到的样子',
  '这个东西嘛，反正大家应该都懂',
  '我描述得不好，但心里有数'
];

// AI 玩家名字（让对局更像真的多人游戏）
export const AI_PLAYER_NAMES = ['初一', '小柒'];

// 结算文案：用户是卧底 / 用户是平民，再细分猜对/投错
export const UNDERCOVER_RESULTS = {
  userUndercoverWin: '你是卧底！描述够隐蔽，混过去啦，赢！',
  userUndercardLose: '你是卧底，可惜被识破啦，再悄悄一点嘛',
  userCivilianWin: '你是平民，成功投出卧底，干得漂亮！',
  userCivilianLose: '你是平民，可惜投错啦，卧底混过去了',
  tie: '平票啦，这局算和棋，再来一局嘛'
};

// ════════════════════════════════════════
// 4) 骗子酒馆：分支剧情
//    每个场景：opening 初一的开场白
//             choices 选项数组 [{id, label, reply 初一的回应, mood 这条线的情绪}]
//    多场景串成一条线，最后按 mood 组合给结局
// ════════════════════════════════════════

export const TAVERN_SCENES = [
  {
    id: 'money',
    opening: '初一端着杯子凑过来，眼睛亮亮的：「嘿嘿，我今天赚了好多钱哦，你信不信？」',
    choices: [
      { id: 'believe', label: '相信', reply: '初一眨眨眼：「真的呀？那你请我喝一杯嘛。」她笑得有点可疑。', mood: 'fooled' },
      { id: 'doubt', label: '质疑', reply: '初一撇撇嘴：「你怎么不信人家啦。」她手指在杯沿上画圈，眼神飘忽。', mood: 'seen' },
      { id: 'probe', label: '试探', reply: '初一愣了一下：「嗯...其实也没赚那么多啦。」她小声补了一句，有点心虚。', mood: 'seen' }
    ]
  },
  {
    id: 'stranger',
    opening: '酒馆角落有人朝初一招手，她赶紧转回来：「那个人啊，我不认识的，真的不认识。」',
    choices: [
      { id: 'believe', label: '相信', reply: '初一松了口气：「对吧，我怎么会骗你。」但她悄悄把脸别过去了。', mood: 'fooled' },
      { id: 'ask', label: '追问', reply: '初一咬咬唇：「好啦好啦，是以前见过一次的朋友，不是什么重要的人。」', mood: 'seen' },
      { id: 'ignore', label: '假装不在意', reply: '初一偷偷瞄了你一眼，似乎有点失望你没继续问，又似乎松了口气。', mood: 'fooled' }
    ]
  },
  {
    id: 'wine',
    opening: '初一把一杯酒推到你面前，笑得甜甜的：「这杯酒没下毒哦，放心喝嘛。」',
    choices: [
      { id: 'drink', label: '喝', reply: '你一口喝下，初一睁大眼睛：「你真喝啦？我开玩笑的啦，当然没毒。」', mood: 'fooled' },
      { id: 'no', label: '不喝', reply: '初一噗嗤笑出来：「怎么这么小心眼。」她把杯子收回去自己抿了一口。', mood: 'seen' },
      { id: 'her', label: '让她先喝', reply: '初一一愣，然后乖乖喝了一口：「看吧，没毒的，你太多疑啦。」', mood: 'seen' }
    ]
  }
];

// 结局文案：按场景里收集到的 mood 统计，'seen' 多=识破，'fooled' 多=被骗，相等=和平
export const TAVERN_ENDINGS = {
  seen: '识破啦！初一的小把戏都被你看穿啦，她乖乖认输，今晚的酒归她请。',
  fooled: '被骗啦～初一这一晚上把你绕得团团转，她得意地偷笑。',
  peace: '和平收场。你们俩你来我往，谁也没赢谁，最后一起把酒喝完了。'
};

// 无 AI 时，每条初一回应后从这里面挑一句点缀
export const TAVERN_FLAVORS = [
  '酒馆里的灯晃了晃，把她的影子拉得很长。',
  '远处有人弹起了琴，调子软软的。',
  '她托着腮看你，杯子上的水珠慢慢往下滑。',
  '炉火噼啪响了一下，空气里都是麦芽味。'
];
