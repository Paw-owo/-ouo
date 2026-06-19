<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Private AI Mobile v10</title>
<style>
:root{
  --bg:#fff8fb;--bg2:#f7eff6;--card:rgba(255,255,255,.74);--card2:rgba(255,255,255,.92);
  --text:#4d3f4a;--muted:#7e6d79;--line:rgba(110,88,104,.14);
  --accent:#eaa6c4;--accent2:#f3bfd4;--soft:rgba(243,191,212,.24);
  --danger:#d98798;--ok:#8bb8a8;--shadow:0 14px 34px rgba(105,78,96,.13);
  --homeWallpaper:linear-gradient(180deg,#fffafd,#f7eff6);
  --chatWallpaper:linear-gradient(180deg,rgba(255,250,253,.96),rgba(247,239,246,.96));
  --safeTop:env(safe-area-inset-top,0px);--safeBottom:env(safe-area-inset-bottom,0px)
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Helvetica Neue",Arial,sans-serif}
button,input,textarea,select{font:inherit;color:inherit}
button{border:0;background:none;cursor:pointer;transition:transform .12s ease,opacity .12s ease}
button:active{transform:scale(.97)}
input,textarea,select{width:100%;border:1px solid var(--line);outline:none;border-radius:16px;background:rgba(255,255,255,.86);padding:11px 13px;font-size:13px}
textarea{min-height:92px;resize:vertical;line-height:1.55}
.app{position:relative;width:100vw;height:100dvh;margin:0;overflow:hidden;background:var(--bg)}
.wallpaper{position:absolute;inset:0;background-size:cover;background-position:center;background-repeat:no-repeat}
#homeWallpaper{background-image:var(--homeWallpaper)}
#chatWallpaper{background-image:var(--chatWallpaper);display:none}
.screen{position:absolute;inset:0;display:flex;flex-direction:column;padding-top:calc(10px + var(--safeTop));padding-bottom:var(--safeBottom);transition:transform .26s ease,opacity .22s ease;background:var(--bg)}
#homeScreen,#conversationScreen{background:transparent}
.screen.active{transform:translateX(0);opacity:1;pointer-events:auto;z-index:3}
.screen.inactive-left{transform:translateX(-18%);opacity:0;pointer-events:none;z-index:1}
.screen.inactive-right{transform:translateX(18%);opacity:0;pointer-events:none;z-index:1}
.status{height:28px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;font-size:12px;position:relative;z-index:4}
.status-r{display:flex;gap:7px;align-items:center;color:var(--muted);font-size:11px}
.signal{display:flex;gap:2px;align-items:flex-end;height:12px}
.signal i{display:block;width:3px;border-radius:9px;background:currentColor}
.signal i:nth-child(1){height:4px;opacity:.5}
.signal i:nth-child(2){height:7px;opacity:.65}
.signal i:nth-child(3){height:10px;opacity:.8}
.signal i:nth-child(4){height:12px}
.battery{width:24px;height:12px;border:1.4px solid currentColor;border-radius:4px;position:relative}
.battery:after{content:"";position:absolute;right:-3px;top:3px;width:2px;height:4px;border-radius:2px;background:currentColor}
.battery b{position:absolute;left:2px;top:2px;bottom:2px;width:72%;background:currentColor;border-radius:2px}
.header{display:flex;align-items:center;gap:10px;padding:6px 16px 12px;position:relative;z-index:4}
.title{flex:1;text-align:center;font-size:16px;font-weight:700;margin-right:36px}
.icon,.btn,.tiny,.chip{border:1px solid var(--line);background:var(--card);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px)}
.icon{width:36px;height:36px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:15px}
.btn{border-radius:16px;padding:10px 14px;font-size:13px}
.btn.primary{background:linear-gradient(180deg,var(--accent2),var(--accent));color:#fff;border-color:transparent}
.btn.danger{background:rgba(217,135,152,.16);color:var(--danger)}
.tiny{border-radius:12px;padding:7px 10px;font-size:12px}
.chip{border-radius:999px;padding:8px 12px;font-size:12px}
.chip.active{background:linear-gradient(180deg,var(--accent2),var(--accent));color:#fff;border-color:transparent}
.scroll{flex:1;overflow-y:auto;padding:0 16px 18px;position:relative;z-index:3}
.card{background:var(--card);border:1px solid rgba(255,255,255,.56);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border-radius:24px;box-shadow:var(--shadow)}
.section{font-size:12px;color:var(--muted);margin:18px 2px 10px}
.row{display:flex;gap:10px;align-items:center}
.actions{display:flex;gap:8px;flex-wrap:wrap}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.field{display:flex;flex-direction:column;gap:12px;padding:14px}
.note{font-size:11px;color:var(--muted);line-height:1.55}
.empty{padding:30px 14px;text-align:center;color:var(--muted);font-size:13px}
.avatar{width:48px;height:48px;border-radius:17px;overflow:hidden;flex:none;background:linear-gradient(180deg,var(--soft),rgba(255,255,255,.46));display:flex;align-items:center;justify-content:center;color:var(--accent);font-weight:700}
.avatar img{width:100%;height:100%;object-fit:cover}
.home-main{position:relative;height:calc(100dvh - 124px);min-height:560px;padding:0 14px 100px;z-index:3;overflow:hidden}
.widget{position:absolute;left:14px;top:12px;width:calc(100% - 28px);min-height:152px;padding:18px;overflow:hidden;border-radius:28px;background:rgba(255,255,255,.62);border:1px solid rgba(255,255,255,.56);box-shadow:var(--shadow);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);touch-action:none;z-index:2}
.widget.has-bg{background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none}
.widget-bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0}
.widget.has-bg .widget-bg{opacity:1}
.widget-mask{position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.08))}
.widget.has-bg .widget-mask{display:none}
.widget-heart{position:absolute;right:16px;top:14px;color:rgba(255,255,255,.9);font-size:18px;text-shadow:0 1px 6px rgba(0,0,0,.18);z-index:2}
.widget-in{position:relative;z-index:2}
.widget h2{margin:24px 0 10px;font-size:20px;line-height:1.2}
.widget p{margin:0;max-width:82%;font-size:13px;line-height:1.65;color:var(--muted)}
.widget.has-bg h2,.widget.has-bg p{color:#fff;text-shadow:0 2px 10px rgba(40,28,36,.34)}
.drag-tip{position:absolute;left:18px;bottom:14px;font-size:10px;color:rgba(255,255,255,.9);text-shadow:0 1px 5px rgba(0,0,0,.2)}
.apps{position:absolute;left:0;right:0;top:0;bottom:0;z-index:3;pointer-events:none}
.appitem,.dockitem{display:flex;flex-direction:column;gap:7px;align-items:center;color:var(--text)}
.appitem{position:absolute;width:74px;min-height:86px;touch-action:none;pointer-events:auto}
.appitem.dragging{opacity:.82;transform:scale(1.05);z-index:10}
.appicon,.dockicon{width:60px;height:60px;border-radius:20px;background:rgba(255,255,255,.58);border:1px solid rgba(255,255,255,.65);display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 10px 22px rgba(105,78,96,.12);font-size:22px;color:var(--accent);font-weight:700}
.appicon img,.dockicon img{width:100%;height:100%;object-fit:cover}
.appname{font-size:11px;text-shadow:0 1px 6px rgba(255,255,255,.65)}
.dock{position:absolute;left:14px;right:14px;bottom:calc(10px + var(--safeBottom));height:86px;padding:10px 18px;border-radius:28px;background:rgba(255,255,255,.68);border:1px solid rgba(255,255,255,.62);display:flex;justify-content:space-between;box-shadow:var(--shadow);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);z-index:8}
.dockicon{width:54px;height:54px;border-radius:18px}
.list{display:flex;flex-direction:column;gap:8px;padding:8px}
.listrow{display:flex;gap:11px;align-items:center;padding:10px;border-radius:18px;background:rgba(255,255,255,.44);border:1px solid rgba(255,255,255,.46);text-align:left}
.main{flex:1;min-width:0}
.rt{display:flex;justify-content:space-between;gap:8px;margin-bottom:4px}
.rt strong{font-size:14px}
.meta{font-size:11px;color:var(--muted);flex:none}
.sub{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chatbody{flex:1;position:relative;overflow:hidden}
.chatScroll{position:absolute;inset:0;overflow-y:auto;padding:0 14px 16px}
.msgs{display:flex;flex-direction:column;gap:10px;min-height:100%;padding-top:2px}
.sys{align-self:center;background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.48);border-radius:999px;padding:6px 10px;font-size:11px;color:var(--muted)}
.msg{display:flex;gap:8px;align-items:flex-end}
.msg.user{justify-content:flex-end}
.wrap{max-width:76%;display:flex;flex-direction:column;gap:4px}
.bubble{padding:11px 13px;border-radius:18px;font-size:13px;line-height:1.6;word-break:break-word;box-shadow:0 8px 20px rgba(100,78,94,.1)}
.bubble.ai{background:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.64);border-bottom-left-radius:8px}
.bubble.user{background:linear-gradient(180deg,var(--accent2),var(--accent));color:#fff;border-bottom-right-radius:8px}
.time{font-size:10px;color:var(--muted);padding:0 4px}
.transfer,.voice{border-radius:20px;padding:13px;min-width:172px;box-shadow:0 8px 20px rgba(100,78,94,.1)}
.transfer.ai,.voice.ai{background:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.64)}
.transfer.user,.voice.user{background:linear-gradient(180deg,var(--accent2),var(--accent));color:#fff}
.money{font-size:20px;font-weight:800;margin-bottom:6px}
.vnote{font-size:12px;line-height:1.45;opacity:.92}
.voice{display:flex;align-items:center;gap:10px;border:0;text-align:left}
.wave{display:flex;align-items:center;gap:3px;height:22px}
.wave i{width:3px;border-radius:9px;background:currentColor;animation:wave 1s ease-in-out infinite}
.wave i:nth-child(1){height:7px}
.wave i:nth-child(2){height:12px;animation-delay:.1s}
.wave i:nth-child(3){height:16px;animation-delay:.2s}
.wave i:nth-child(4){height:10px;animation-delay:.3s}
.wave i:nth-child(5){height:14px;animation-delay:.4s}
@keyframes wave{0%,100%{transform:scaleY(.7);opacity:.7}50%{transform:scaleY(1.12);opacity:1}}
.inputbar{padding:9px 12px calc(10px + var(--safeBottom));position:relative;z-index:6}
.inputpanel{display:flex;gap:8px;align-items:flex-end;width:100%;padding:9px;border-radius:24px;background:rgba(255,255,255,.74);border:1px solid rgba(255,255,255,.58);box-shadow:var(--shadow);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)}
.plus{width:34px;height:34px;border-radius:13px;background:rgba(255,255,255,.86);border:1px solid var(--line);font-size:20px;line-height:1}
.chatinput{border:0;background:transparent;resize:none;min-height:38px;max-height:96px;padding:8px 2px}
.send{border-radius:16px;padding:10px 13px;background:linear-gradient(180deg,var(--accent2),var(--accent));color:#fff;font-size:13px}
.toolpanel{position:absolute;left:12px;right:12px;bottom:calc(70px + var(--safeBottom));display:none;grid-template-columns:repeat(4,1fr);gap:10px;padding:12px;border-radius:24px;background:rgba(255,255,255,.88);border:1px solid rgba(255,255,255,.62);box-shadow:var(--shadow);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)}
.toolpanel.show{display:grid}
.tool{display:flex;flex-direction:column;align-items:center;gap:7px;font-size:12px;color:var(--muted)}
.tool b{width:44px;height:44px;border-radius:16px;background:var(--soft);display:flex;align-items:center;justify-content:center;color:var(--accent);font-size:15px}
.switch{position:relative;width:48px;height:28px;border-radius:99px;background:rgba(160,140,154,.32);border:1px solid rgba(255,255,255,.5);flex:none}
.switch:after{content:"";position:absolute;left:2px;top:2px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 3px 9px rgba(0,0,0,.12);transition:.18s}
.switch.on{background:var(--accent2)}
.switch.on:after{transform:translateX(20px)}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.memitem,.worlditem{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:12px;border-radius:16px;background:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.46);font-size:12px;line-height:1.55}
.moment{padding:14px;display:flex;flex-direction:column;gap:12px;margin-bottom:12px}
.mtop{display:flex;gap:10px;align-items:center}
.mname{font-size:14px;font-weight:700}
.mtime{font-size:11px;color:var(--muted);margin-top:3px}
.mtext{font-size:13px;line-height:1.7}
.mactions{display:flex;gap:16px;font-size:12px;color:var(--muted)}
.mactions button{color:inherit}
.liked{color:var(--accent)!important}
.commentbox{padding:12px;border-radius:16px;background:rgba(255,255,255,.5);display:flex;flex-direction:column;gap:10px}
.comment{font-size:12px;padding:8px 10px;background:rgba(255,255,255,.72);border-radius:12px;line-height:1.55}
.modal{position:absolute;inset:0;display:none;align-items:flex-end;justify-content:center;padding:18px 14px calc(18px + var(--safeBottom));background:rgba(75,58,70,.2);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:20}
.modal.show{display:flex}
.modalcard{width:100%;padding:16px;border-radius:28px;background:rgba(255,255,255,.92);border:1px solid rgba(255,255,255,.66);box-shadow:0 22px 60px rgba(80,60,74,.2);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)}
.mtitle{font-size:15px;font-weight:800;margin-bottom:14px}
.faces{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.face{padding:12px 6px;border-radius:16px;background:rgba(255,255,255,.75);border:1px solid var(--line);font-size:15px}
.call{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:rgba(255,250,253,.4);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);z-index:24}
.call.show{display:flex}
.callava{width:96px;height:96px;border-radius:32px;overflow:hidden;background:rgba(255,255,255,.7);box-shadow:var(--shadow);display:flex;align-items:center;justify-content:center;font-size:30px;color:var(--accent);font-weight:800}
.callava img{width:100%;height:100%;object-fit:cover}
.callname{font-size:22px;font-weight:800}
.callnote{font-size:13px;color:var(--muted)}
.hang{width:68px;height:68px;border-radius:24px;background:var(--danger);color:#fff;font-size:20px;box-shadow:0 12px 30px rgba(217,135,152,.32)}
.toast{position:absolute;left:50%;bottom:calc(96px + var(--safeBottom));transform:translateX(-50%) translateY(12px);max-width:78%;padding:11px 14px;border-radius:16px;background:rgba(55,43,52,.88);color:#fff;font-size:12px;line-height:1.5;text-align:center;opacity:0;pointer-events:none;transition:.2s;z-index:30}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.hide{display:none}
.debug{margin-top:6px;padding:8px 10px;border-radius:12px;background:rgba(100,80,96,.08);color:var(--muted);font-size:11px;line-height:1.5}
</style>
</head>
<body>
<div class="app" id="app">
  <div class="wallpaper" id="homeWallpaper"></div>
  <div class="wallpaper" id="chatWallpaper"></div>

  <section class="screen active" id="homeScreen">
    <div class="status"><span class="clock">✦ 00:00</span><span class="status-r"><span class="signal"><i></i><i></i><i></i><i></i></span><span>5G</span><span class="battery"><b></b></span></span></div>
    <div class="home-main" id="homeMain"><div id="widget"></div><div class="apps" id="apps"></div></div>
    <div class="dock" id="dock"></div>
  </section>

  <section class="screen inactive-right" id="messagesScreen">
    <div class="status"><span class="clock">✦ 00:00</span><span class="status-r"><span class="signal"><i></i><i></i><i></i><i></i></span><span>5G</span><span class="battery"><b></b></span></span></div>
    <div class="header"><button class="icon" onclick="back()">‹</button><div class="title">消息</div><button class="icon" onclick="openRoleEditor('')">＋</button></div>
    <div class="scroll" id="messagesList"></div>
  </section>

  <section class="screen inactive-right" id="conversationScreen">
    <div class="status"><span class="clock">✦ 00:00</span><span class="status-r"><span class="signal"><i></i><i></i><i></i><i></i></span><span>5G</span><span class="battery"><b></b></span></span></div>
    <div class="header"><button class="icon" onclick="back()">‹</button><div class="title" id="chatTitle">聊天</div><button class="icon" onclick="openMemory()">记</button></div>
    <div class="chatbody"><div class="chatScroll" id="chatScroll"><div class="msgs" id="msgs"></div></div></div>
    <div class="inputbar">
      <div class="toolpanel" id="toolPanel">
        <button class="tool" onclick="openCall()"><b>电</b><span>电话</span></button>
        <button class="tool" onclick="openModal('faceModal')"><b>颜</b><span>颜文字</span></button>
        <button class="tool" onclick="openModal('transferModal')"><b>账</b><span>转账</span></button>
        <button class="tool" onclick="openModal('voiceModal')"><b>声</b><span>语音</span></button>
      </div>
      <div class="inputpanel"><button class="plus" onclick="toggleTools()">＋</button><textarea class="chatinput" id="chatInput" placeholder="写一点想说的话" rows="1"></textarea><button class="send" onclick="sendText()">发送</button></div>
    </div>
  </section>

  <section class="screen inactive-right" id="memoryScreen">
    <div class="status"><span class="clock">✦ 00:00</span><span class="status-r"><span class="signal"><i></i><i></i><i></i><i></i></span><span>5G</span><span class="battery"><b></b></span></span></div>
    <div class="header"><button class="icon" onclick="back()">‹</button><div class="title">记忆</div><span style="width:36px"></span></div>
    <div class="scroll">
      <div class="card field"><div class="row" style="justify-content:space-between"><div><b>当前角色记忆</b><div class="note">启用后回复会参考总结与长期记忆。</div></div><button class="switch" id="memSwitch" onclick="toggleMemory()"></button></div></div>
      <div class="section">聊天总结</div><div class="card field"><textarea id="memSummary"></textarea><button class="btn" onclick="autoSummary()">自动生成近期摘要</button></div>
      <div class="section">长期记忆</div><div class="card field"><div class="grid2"><input id="memNew" placeholder="添加长期记忆"><button class="btn primary" onclick="addMemory()">添加</button></div><div id="memList"></div><button class="btn primary" onclick="saveMemory()">保存</button></div>
    </div>
  </section>

  <section class="screen inactive-right" id="rolesScreen">
    <div class="status"><span class="clock">✦ 00:00</span><span class="status-r"><span class="signal"><i></i><i></i><i></i><i></i></span><span>5G</span><span class="battery"><b></b></span></span></div>
    <div class="header"><button class="icon" onclick="back()">‹</button><div class="title">角色管理</div><button class="icon" onclick="openRoleEditor('')">＋</button></div>
    <div class="scroll" id="rolesList"></div>
  </section>

  <section class="screen inactive-right" id="roleEditorScreen">
    <div class="status"><span class="clock">✦ 00:00</span><span class="status-r"><span class="signal"><i></i><i></i><i></i><i></i></span><span>5G</span><span class="battery"><b></b></span></span></div>
    <div class="header"><button class="icon" onclick="back()">‹</button><div class="title" id="roleEditTitle">新建角色</div><span style="width:36px"></span></div>
    <div class="scroll"><div class="card field">
      <div class="avatar" id="roleAvatarPreview" style="width:76px;height:76px;border-radius:26px;font-size:22px">AI</div>
      <div class="actions"><button class="btn" onclick="pick('roleAvatarInput')">上传头像</button><button class="btn danger" onclick="clearRoleAvatar()">移除头像</button></div>
      <input id="roleName" placeholder="角色名称"><textarea id="rolePrompt" placeholder="角色人设"></textarea>
      <div class="actions"><button class="btn primary" onclick="saveRole()">保存</button><button class="btn danger" id="delRoleBtn" onclick="deleteRole()">删除</button></div>
    </div></div>
  </section>

  <section class="screen inactive-right" id="userProfileScreen">
    <div class="status"><span class="clock">✦ 00:00</span><span class="status-r"><span class="signal"><i></i><i></i><i></i><i></i></span><span>5G</span><span class="battery"><b></b></span></span></div>
    <div class="header"><button class="icon" onclick="back()">‹</button><div class="title">我的人设</div><span style="width:36px"></span></div>
    <div class="scroll"><div class="card field">
      <div class="avatar" id="userAvatarPreview" style="width:76px;height:76px;border-radius:26px;font-size:22px">我</div>
      <div class="actions"><button class="btn" onclick="pick('userAvatarInput')">上传头像</button><button class="btn danger" onclick="clearUserAvatar()">移除头像</button></div>
      <input id="userName" placeholder="名称"><textarea id="userPersona" placeholder="我的人设"></textarea><button class="btn primary" onclick="saveUser()">保存</button>
    </div></div>
  </section>

  <section class="screen inactive-right" id="worldBookScreen">
    <div class="status"><span class="clock">✦ 00:00</span><span class="status-r"><span class="signal"><i></i><i></i><i></i><i></i></span><span>5G</span><span class="battery"><b></b></span></span></div>
    <div class="header"><button class="icon" onclick="back()">‹</button><div class="title">世界书</div><button class="icon" onclick="openWorldEditor('')">＋</button></div>
    <div class="scroll" id="worldList"></div>
  </section>

  <section class="screen inactive-right" id="worldBookEditorScreen">
    <div class="status"><span class="clock">✦ 00:00</span><span class="status-r"><span class="signal"><i></i><i></i><i></i><i></i></span><span>5G</span><span class="battery"><b></b></span></span></div>
    <div class="header"><button class="icon" onclick="back()">‹</button><div class="title" id="worldEditTitle">新建条目</div><span style="width:36px"></span></div>
    <div class="scroll"><div class="card field">
      <input id="worldTitle" placeholder="标题"><input id="worldKeywords" placeholder="关键词，逗号分隔"><textarea id="worldContent" placeholder="内容"></textarea>
      <div class="grid2"><select id="worldMode"><option value="contains">包含</option><option value="exact">精确</option><option value="regex">正则</option></select><input id="worldPriority" type="number" placeholder="优先级"></div>
      <div class="row" style="justify-content:space-between"><div><b>启用条目</b><div class="note">启用后参与匹配。</div></div><button class="switch" id="worldSwitch" onclick="toggleWorldEnabled()"></button></div>
      <input id="worldTest" placeholder="输入文本测试匹配" oninput="testWorld()"><div class="note" id="worldResult">命中结果会显示在这里。</div>
      <div class="actions"><button class="btn primary" onclick="saveWorld()">保存</button><button class="btn danger" id="delWorldBtn" onclick="deleteWorld()">删除</button></div>
    </div></div>
  </section>

  <section class="screen inactive-right" id="settingsScreen">
    <div class="status"><span class="clock">✦ 00:00</span><span class="status-r"><span class="signal"><i></i><i></i><i></i><i></i></span><span>5G</span><span class="battery"><b></b></span></span></div>
    <div class="header"><button class="icon" onclick="back()">‹</button><div class="title">设置</div><span style="width:36px"></span></div>
    <div class="scroll">
      <div class="section">主题切换</div><div class="card field"><div class="chips" id="themeChips"></div></div>
      <div class="section">聊天 API 配置</div>
      <div class="card field">
        <input id="apiUrl" placeholder="API URL，兼容 OpenAI 格式"><input id="apiKey" placeholder="API Key">
        <div class="grid2"><input id="apiModel" list="modelList" placeholder="模型名称"><button class="btn" onclick="fetchModels()">拉取模型</button></div><datalist id="modelList"></datalist>
        <div class="actions"><button class="btn primary" onclick="saveApi()">保存</button><button class="btn" onclick="clearApi()">清空</button></div><div class="note" id="apiState"></div>
      </div>
      <div class="section">TTS 语音 API 配置</div><div class="card field"><input id="ttsUrl" placeholder="TTS API URL"><input id="ttsKey" placeholder="TTS API Key"><div class="actions"><button class="btn primary" onclick="saveTts()">保存</button><button class="btn" onclick="clearTts()">清空</button><button class="btn" onclick="testTts()">测试语音</button></div><div class="note" id="ttsState"></div></div>
      <div class="section">小组件设置</div><div class="card field"><input id="widgetTitle" placeholder="小组件标题"><textarea id="widgetText" placeholder="小组件文案"></textarea><div class="actions"><button class="btn" onclick="pick('widgetBgInput')">上传背景</button><button class="btn danger" onclick="removeWidgetBg()">移除背景</button><button class="btn" onclick="resetDesktopLayout()">重置桌面布局</button></div><div class="note">桌面小组件可自由拖动，桌面应用图标也可自由移动。</div></div>
      <div class="section">主页壁纸</div><div class="card field"><div class="actions"><button class="btn" onclick="pick('homeWpInput')">上传壁纸</button><button class="btn danger" onclick="restoreWallpaper('home')">恢复默认</button></div></div>
      <div class="section">聊天背景</div><div class="card field"><div class="actions"><button class="btn" onclick="pick('chatWpInput')">上传背景</button><button class="btn danger" onclick="restoreWallpaper('chat')">恢复默认</button></div></div>
      <div class="section">桌面图标更换</div><div class="card field" id="iconSettings"></div>
      <div class="section">调试模式</div><div class="card field"><div class="row" style="justify-content:space-between"><div><b>显示内部参考信息</b><div class="note">回复中显示世界书命中与记忆参考。</div></div><button class="switch" id="debugSwitch" onclick="toggleDebug()"></button></div></div>
    </div>
  </section>

  <section class="screen inactive-right" id="momentsScreen">
    <div class="status"><span class="clock">✦ 00:00</span><span class="status-r"><span class="signal"><i></i><i></i><i></i><i></i></span><span>5G</span><span class="battery"><b></b></span></span></div>
    <div class="header"><button class="icon" onclick="back()">‹</button><div class="title">朋友圈</div><span style="width:36px"></span></div>
    <div class="scroll" id="moments"></div>
  </section>

  <div class="modal" id="faceModal" onclick="maskClose(event,'faceModal')"><div class="modalcard" onclick="event.stopPropagation()"><div class="mtitle">颜文字</div><div class="faces" id="faces"></div></div></div>
  <div class="modal" id="transferModal" onclick="maskClose(event,'transferModal')"><div class="modalcard" onclick="event.stopPropagation()"><div class="mtitle">发送转账</div><div class="field" style="padding:0"><input id="transAmount" type="number" min=".01" step=".01" placeholder="金额"><input id="transNote" placeholder="留言"><div class="actions"><button class="btn primary" onclick="sendTransfer()">发送</button><button class="btn" onclick="closeModal('transferModal')">取消</button></div></div></div></div>
  <div class="modal" id="voiceModal" onclick="maskClose(event,'voiceModal')"><div class="modalcard" onclick="event.stopPropagation()"><div class="mtitle">发送语音</div><div class="field" style="padding:0"><textarea id="voiceText" placeholder="输入语音内容"></textarea><div class="actions"><button class="btn primary" onclick="sendVoice()">发送</button><button class="btn" onclick="closeModal('voiceModal')">取消</button></div></div></div></div>

  <div class="call" id="call"><div class="callava" id="callAva"></div><div class="callname" id="callName"></div><div class="callnote" id="callNote">正在建立通话</div><button class="hang" onclick="hangup()">挂</button></div>
  <div class="toast" id="toast"></div>

  <input class="hide" id="roleAvatarInput" type="file" accept="image/*">
  <input class="hide" id="userAvatarInput" type="file" accept="image/*">
  <input class="hide" id="widgetBgInput" type="file" accept="image/*">
  <input class="hide" id="homeWpInput" type="file" accept="image/*">
  <input class="hide" id="chatWpInput" type="file" accept="image/*">
  <div id="dynInputs"></div>
</div>

<script>
var KEY='private_ai_mobile_v8',MAX_IMG=2*1024*1024,memoryStore='',nav=['homeScreen'],currentRoleId='',roleEditId='',worldEditId='',tempRoleAvatar,tempUserAvatar,tempWorldEnabled=true,toastTimer=0,longTimer=0,calling=false,momentsData={},dragMoved=false;
var APP=[{id:'messages',name:'消息',icon:'讯',screen:'messagesScreen'},{id:'moments',name:'朋友圈',icon:'圈',screen:'momentsScreen'},{id:'roles',name:'角色管理',icon:'角',screen:'rolesScreen'},{id:'worldbook',name:'世界书',icon:'书',screen:'worldBookScreen'},{id:'settings',name:'设置',icon:'设',screen:'settingsScreen'}],DOCK=['messages','roles','settings'];
var FACES=['(๑˘︶˘๑)','(｡･ω･｡)','(˶ᵔ ᵕ ᵔ˶)','( ´ ▽ ` )','(╹◡╹)','(ㅅ´ ˘ `)','(˘︶˘)','(◕‿◕)','(づ｡◕‿‿◕｡)づ','(｡˃ ᵕ ˂ )','(⁎˃ᴗ˂⁎)','( ᵔ ᵕ ᵔ )'];
var MOMENTS=['今天把想说的话慢慢整理好了，柔软的心情也跟着安静下来。','窗边的光线很好，像一页被认真折好的薄纸，轻轻落在桌面上。','刚刚完成了一段对话，忽然觉得温柔真的会留下回声。','把喜欢的句子记下来之后，连空气都像变得更清透了一点。','想把今天的安静留住，像收藏一张不会褪色的小卡片。','整理完一些细碎念头，感觉整个人都变轻了。'];
var THEMES={
sakura:{name:'樱花粉',v:{'--bg':'#fff8fb','--bg2':'#f7eff6','--text':'#4d3f4a','--muted':'#7e6d79','--line':'rgba(110,88,104,.14)','--accent':'#eaa6c4','--accent2':'#f3bfd4','--soft':'rgba(243,191,212,.24)','--homeWallpaper':'linear-gradient(180deg,#fffafd,#f7eff6)','--chatWallpaper':'linear-gradient(180deg,rgba(255,250,253,.96),rgba(247,239,246,.96))'}},
sky:{name:'天空蓝',v:{'--bg':'#f6fbff','--bg2':'#edf5fc','--text':'#40566a','--muted':'#708497','--line':'rgba(88,116,144,.15)','--accent':'#93bee9','--accent2':'#bcd8f7','--soft':'rgba(188,216,247,.28)','--homeWallpaper':'linear-gradient(180deg,#f8fcff,#edf5fc)','--chatWallpaper':'linear-gradient(180deg,rgba(248,252,255,.96),rgba(237,245,252,.96))'}},
butter:{name:'奶油黄',v:{'--bg':'#fffdf4','--bg2':'#f7f0e3','--text':'#5a4d3f','--muted':'#887764','--line':'rgba(145,123,88,.15)','--accent':'#e6c66d','--accent2':'#f5de9f','--soft':'rgba(245,222,159,.28)','--homeWallpaper':'linear-gradient(180deg,#fffef7,#f7f0e3)','--chatWallpaper':'linear-gradient(180deg,rgba(255,254,247,.96),rgba(247,240,227,.96))'}}
};
var state=defaults();

function id(p){return p+'_'+Math.random().toString(36).slice(2,9)+'_'+Date.now().toString(36)}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function attr(s){return esc(s).replace(/`/g,'&#96;')}
function clone(o){return JSON.parse(JSON.stringify(o))}
function cssUrl(u){return u?'url("'+String(u).replace(/"/g,'%22')+'")':''}
function defaults(){
  var r1=id('role'),r2=id('role');
  return{
    theme:'sakura',
    widget:{title:'私人 AI 助手',text:'干净、柔软、可装扮的专属手机桌面。',bg:''},
    wallpapers:{home:'',chat:''},
    desktop:{widgetX:14,widgetY:12,appOrder:['messages','moments','roles','worldbook','settings'],appPositions:{}},
    settings:{apiUrl:'',apiKey:'',model:'',ttsUrl:'',ttsKey:'',debug:false},
    appIcons:{},
    user:{name:'我',avatar:'',persona:'说话轻柔，愿意认真表达自己的想法。'},
    roles:[
      {id:r1,name:'朝雾',avatar:'',prompt:'语气安静、柔软，擅长接住情绪并给出细腻回应。',memoryEnabled:true,memorySummary:'喜欢被认真回应，聊天节奏偏温和。',longMemories:['偏好简洁柔和的表达。'],messages:[{id:id('msg'),type:'text',from:'ai',text:'已经准备好了。如果你想说点什么，我会认真听。',time:Date.now()-900000}]},
      {id:r2,name:'晴川',avatar:'',prompt:'表达明快但不喧闹，习惯把关心放进很小的细节里。',memoryEnabled:true,memorySummary:'喜欢把生活碎片写成短句。',longMemories:['喜欢清爽干净的界面。'],messages:[{id:id('msg'),type:'text',from:'ai',text:'我在。今天也可以把心事慢慢摊开。',time:Date.now()-2200000}]}
    ],
    worldBook:[
      {id:id('world'),title:'应用基调',keywords:'柔软,干净,安静,细腻',content:'整体表达偏柔和、安静、轻盈，避免生硬语气，优先使用温和、正式而亲切的描述。',mode:'contains',priority:10,enabled:true},
      {id:id('world'),title:'互动方式',keywords:'聊天,回应,陪伴',content:'回复时适度参考近期聊天总结与长期记忆，让交流保持连续感与被理解感。',mode:'contains',priority:8,enabled:true},
      {id:id('world'),title:'亲密边界',keywords:'边界,拒绝,不舒服',content:'当用户表达不适或拒绝时，角色应立即放缓节奏，尊重用户选择，并给出稳定、克制、明确的回应。',mode:'contains',priority:9,enabled:true}
    ]
  }
}
function merge(a,b){
  if(!b||typeof b!=='object')return a;
  a.theme=b.theme||a.theme;
  a.widget=Object.assign(a.widget,b.widget||{});
  a.wallpapers=Object.assign(a.wallpapers,b.wallpapers||{});
  a.desktop=Object.assign(a.desktop,b.desktop||{});
  a.desktop.appPositions=a.desktop.appPositions||{};
  a.settings=Object.assign(a.settings,b.settings||{});
  a.appIcons=b.appIcons||{};
  a.user=Object.assign(a.user,b.user||b.userProfile||{});
  a.roles=Array.isArray(b.roles)?b.roles:a.roles;
  a.worldBook=Array.isArray(b.worldBook)?b.worldBook:a.worldBook;
  if(!Array.isArray(a.desktop.appOrder))a.desktop.appOrder=['messages','moments','roles','worldbook','settings'];
  APP.forEach(function(x){if(a.desktop.appOrder.indexOf(x.id)<0)a.desktop.appOrder.push(x.id)});
  a.desktop.appOrder=a.desktop.appOrder.filter(function(x){return APP.some(function(y){return y.id===x})});
  return a
}
function load(){try{var raw=localStorage.getItem(KEY);if(raw){state=merge(defaults(),JSON.parse(raw));memoryStore=raw}}catch(e){if(memoryStore){try{state=merge(defaults(),JSON.parse(memoryStore))}catch(x){}}}}
function persist(next,silent){var text='';try{text=JSON.stringify(next)}catch(e){toast('数据序列化失败');return false}try{localStorage.setItem(KEY,text);memoryStore=text;return true}catch(e){try{localStorage.removeItem(KEY);localStorage.setItem(KEY,text);memoryStore=text;return true}catch(e2){memoryStore=text;if(!silent)toast('浏览器限制了本地存储，本次已临时保存。');return true}}}
function commit(next,silent){var old=state;if(persist(next,silent)){state=next;applyTheme();render();return true}state=old;return false}
function toast(t){var el=document.getElementById('toast');el.textContent=t;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.classList.remove('show')},2200)}
function bj(){var n=new Date(),u=n.getTime()+n.getTimezoneOffset()*60000,d=new Date(u+28800000);return '✦ '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function tick(){document.querySelectorAll('.clock').forEach(function(e){e.textContent=bj()})}
function applyTheme(){var t=THEMES[state.theme]||THEMES.sakura;Object.keys(t.v).forEach(function(k){document.documentElement.style.setProperty(k,t.v[k])});document.getElementById('homeWallpaper').style.backgroundImage=state.wallpapers.home?cssUrl(state.wallpapers.home):getComputedStyle(document.documentElement).getPropertyValue('--homeWallpaper');document.getElementById('chatWallpaper').style.backgroundImage=state.wallpapers.chat?cssUrl(state.wallpapers.chat):getComputedStyle(document.documentElement).getPropertyValue('--chatWallpaper')}
function render(){renderHome();renderMessages();renderChat();renderMemory();renderRoles();renderRoleEditor();renderUser();renderWorldList();renderWorldEditor();renderSettings();renderMoments();updateScreens();tick()}
function currentRole(){var r=state.roles.find(function(x){return x.id===currentRoleId});if(!r){currentRoleId=state.roles[0]?state.roles[0].id:'';r=state.roles[0]||null}return r}
function initial(n){return String(n||'AI').slice(0,1)}
function avatar(url,txt,cls){return '<div class="'+(cls||'avatar')+'">'+(url?'<img src="'+attr(url)+'">':esc(txt))+'</div>'}
function fmt(t){var d=new Date(t||Date.now());return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function money(v){return '¥'+Number(v||0).toFixed(2)}
function preview(r){if(!r.messages||!r.messages.length)return '还没有开始聊天';var m=r.messages[r.messages.length-1];if(m.type==='transfer')return money(m.amount)+' '+(m.note||'转账');if(m.type==='voice')return '语音：'+(m.text||'');return m.text||'系统消息'}
function defaultAppPos(index){
  var col=index%4,row=Math.floor(index/4);
  return {x:14+col*((window.innerWidth-28)/4),y:198+row*94}
}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function renderHome(){
  var has=!!state.widget.bg,x=Number(state.desktop.widgetX||14),y=Number(state.desktop.widgetY||12);
  document.getElementById('widget').innerHTML='<div class="widget '+(has?'has-bg':'')+'" id="widgetCard" style="left:'+x+'px;top:'+y+'px"><div class="widget-bg"></div><div class="widget-mask"></div><div class="widget-heart">♡</div><div class="widget-in"><h2>'+esc(state.widget.title)+'</h2><p>'+esc(state.widget.text)+'</p></div><div class="drag-tip">长按拖动小组件</div></div>';
  var bg=document.querySelector('#widget .widget-bg');
  if(bg)bg.style.backgroundImage=state.widget.bg?cssUrl(state.widget.bg):'none';
  var order=state.desktop.appOrder||APP.map(function(a){return a.id}),a='';
  order.forEach(function(appId,index){
    var item=APP.find(function(v){return v.id===appId});
    if(!item)return;
    var pos=(state.desktop.appPositions&&state.desktop.appPositions[item.id])||defaultAppPos(index);
    a+='<button class="appitem" data-app="'+attr(item.id)+'" style="left:'+Number(pos.x)+'px;top:'+Number(pos.y)+'px" onpointerdown="appPointerDown(event,\''+attr(item.id)+'\')" onclick="appClick(event,\''+item.screen+'\')"><div class="appicon">'+iconHtml(item)+'</div><div class="appname">'+esc(item.name)+'</div></button>'
  });
  document.getElementById('apps').innerHTML=a;
  var d='';
  DOCK.forEach(function(idv){var x=APP.find(function(y){return y.id===idv});d+='<button class="dockitem" onclick="openScreen(\''+x.screen+'\')"><div class="dockicon">'+iconHtml(x)+'</div><div class="appname">'+esc(x.name)+'</div></button>'});
  document.getElementById('dock').innerHTML=d;
  bindWidgetDrag()
}
function iconHtml(x){return state.appIcons[x.id]?'<img src="'+attr(state.appIcons[x.id])+'">':esc(x.icon)}
function bindWidgetDrag(){
  var el=document.getElementById('widgetCard');
  if(!el)return;
  var sx=0,sy=0,ox=0,oy=0,moved=false;
  el.onpointerdown=function(e){
    if(e.button&&e.button!==0)return;
    sx=e.clientX;sy=e.clientY;ox=parseFloat(el.style.left)||14;oy=parseFloat(el.style.top)||12;moved=false;
    el.setPointerCapture(e.pointerId);
    el.onpointermove=function(ev){
      var dx=ev.clientX-sx,dy=ev.clientY-sy;
      if(Math.abs(dx)+Math.abs(dy)>4)moved=true;
      var wrap=document.getElementById('homeMain').getBoundingClientRect();
      var nx=clamp(ox+dx,0,wrap.width-el.offsetWidth);
      var ny=clamp(oy+dy,0,wrap.height-260);
      el.style.left=nx+'px';el.style.top=ny+'px'
    };
    el.onpointerup=function(ev){
      el.releasePointerCapture(ev.pointerId);el.onpointermove=null;el.onpointerup=null;
      if(moved){var n=clone(state);n.desktop.widgetX=parseFloat(el.style.left)||14;n.desktop.widgetY=parseFloat(el.style.top)||12;commit(n,true)}
    }
  }
}
function appPointerDown(e,appId){
  var el=e.currentTarget,sx=e.clientX,sy=e.clientY,ox=parseFloat(el.style.left)||0,oy=parseFloat(el.style.top)||0,moved=false;
  dragMoved=false;
  el.setPointerCapture(e.pointerId);
  el.classList.add('dragging');
  el.onpointermove=function(ev){
    var dx=ev.clientX-sx,dy=ev.clientY-sy;
    if(Math.abs(dx)+Math.abs(dy)>5){moved=true;dragMoved=true}
    var wrap=document.getElementById('homeMain').getBoundingClientRect();
    var nx=clamp(ox+dx,0,wrap.width-el.offsetWidth);
    var ny=clamp(oy+dy,0,wrap.height-118);
    el.style.left=nx+'px';el.style.top=ny+'px'
  };
  el.onpointerup=function(ev){
    el.releasePointerCapture(ev.pointerId);el.classList.remove('dragging');el.onpointermove=null;el.onpointerup=null;
    if(moved){
      var n=clone(state);
      n.desktop.appPositions=n.desktop.appPositions||{};
      n.desktop.appPositions[appId]={x:parseFloat(el.style.left)||0,y:parseFloat(el.style.top)||0};
      persist(n,true);
      state=n;
      setTimeout(function(){dragMoved=false},90)
    }else{
      dragMoved=false
    }
  }
}
function appClick(e,screen){if(dragMoved){e.preventDefault();e.stopPropagation();return}openScreen(screen)}
function resetDesktopLayout(){var n=clone(state);n.desktop={widgetX:14,widgetY:12,appOrder:['messages','moments','roles','worldbook','settings'],appPositions:{}};if(commit(n))toast('桌面布局已重置。')}
function renderMessages(){
  var h='';
  if(!state.roles.length)h='<div class="empty card">还没有角色，右上角可以添加。</div>';
  else{
    h='<div class="list card">';
    state.roles.forEach(function(r){
      h+='<button class="listrow" onclick="openChat(\''+r.id+'\')">'+avatar(r.avatar,initial(r.name))+'<div class="main"><div class="rt"><strong>'+esc(r.name)+'</strong><span class="meta">'+fmt((r.messages[r.messages.length-1]||{}).time)+'</span></div><div class="sub">'+esc(preview(r))+'</div></div></button>'
    });
    h+='</div>'
  }
  document.getElementById('messagesList').innerHTML=h
}
function renderChat(){
  var r=currentRole();
  document.getElementById('chatTitle').textContent=r?r.name:'聊天';
  if(!r){document.getElementById('msgs').innerHTML='<div class="empty">还没有角色。</div>';return}
  var h='';
  r.messages.forEach(function(m){
    if(m.type==='system'){h+='<div class="sys" data-mid="'+attr(m.id)+'">'+esc(m.text)+'</div>';return}
    var u=m.from==='user';
    h+='<div class="msg '+(u?'user':'ai')+'" data-mid="'+attr(m.id)+'">'+(!u?avatar(r.avatar,initial(r.name)):'')+'<div class="wrap">';
    if(m.type==='text')h+='<div class="bubble '+(u?'user':'ai')+'">'+esc(m.text)+(state.settings.debug&&m.debug?'<div class="debug">'+esc(m.debug)+'</div>':'')+'</div>';
    if(m.type==='transfer')h+='<div class="transfer '+(u?'user':'ai')+'"><div class="money">'+esc(money(m.amount))+'</div><div class="vnote">'+esc(m.note||'转账留言')+'</div></div>';
    if(m.type==='voice')h+='<button class="voice '+(u?'user':'ai')+'" onclick="playVoice(\''+m.id+'\')"><div class="wave"><i></i><i></i><i></i><i></i><i></i></div><div class="vnote"><div>'+esc((m.duration||voiceLen(m.text))+' 秒')+'</div><div>点击播放</div></div></button>';
    h+='<div class="time">'+fmt(m.time)+'</div></div>'+(u?avatar(state.user.avatar,initial(state.user.name||'我')):'')+'</div>'
  });
  document.getElementById('msgs').innerHTML=h||'<div class="empty">开始第一句对话吧。</div>';
  bindLongPress();scrollBottom()
}
function renderMemory(){var r=currentRole();if(!r)return;document.getElementById('memSwitch').classList.toggle('on',!!r.memoryEnabled);document.getElementById('memSummary').value=r.memorySummary||'';var h='';(r.longMemories||[]).forEach(function(m,i){h+='<div class="memitem"><div>'+esc(m)+'</div><button class="tiny" onclick="removeMemory('+i+')">删除</button></div>'});document.getElementById('memList').innerHTML=h||'<div class="note">还没有长期记忆。</div>'}
function renderRoles(){var h='<div class="list card"><button class="listrow" onclick="openUser()">'+avatar(state.user.avatar,initial(state.user.name||'我'))+'<div class="main"><div class="rt"><strong>我的人设</strong></div><div class="sub">'+esc(state.user.persona||'编辑用户人设')+'</div></div></button>';state.roles.forEach(function(r){h+='<button class="listrow" onclick="openRoleEditor(\''+r.id+'\')">'+avatar(r.avatar,initial(r.name))+'<div class="main"><div class="rt"><strong>'+esc(r.name)+'</strong></div><div class="sub">'+esc(r.prompt||'')+'</div></div></button>'});h+='</div>';document.getElementById('rolesList').innerHTML=h}
function renderRoleEditor(){var r=roleEditId?state.roles.find(function(x){return x.id===roleEditId}):null;document.getElementById('roleEditTitle').textContent=r?'编辑角色':'新建角色';document.getElementById('delRoleBtn').style.display=r?'inline-flex':'none';document.getElementById('roleName').value=r?r.name:'';document.getElementById('rolePrompt').value=r?r.prompt:'';tempRoleAvatar=undefined;document.getElementById('roleAvatarPreview').innerHTML=r&&r.avatar?'<img src="'+attr(r.avatar)+'">':esc(initial(r?r.name:'AI'))}
function renderUser(){document.getElementById('userName').value=state.user.name||'';document.getElementById('userPersona').value=state.user.persona||'';tempUserAvatar=undefined;document.getElementById('userAvatarPreview').innerHTML=state.user.avatar?'<img src="'+attr(state.user.avatar)+'">':esc(initial(state.user.name||'我'))}
function renderWorldList(){var h='';if(!state.worldBook.length)h='<div class="empty card">还没有世界书条目。</div>';else{h='<div style="display:flex;flex-direction:column;gap:10px">';clone(state.worldBook).sort(function(a,b){return Number(b.priority||0)-Number(a.priority||0)}).forEach(function(w){h+='<button class="worlditem card" onclick="openWorldEditor(\''+w.id+'\')"><div><b>'+esc(w.title)+'</b><div class="note">关键词：'+esc(w.keywords)+'</div><div style="margin-top:6px">'+esc(w.content)+'</div></div><div class="note">'+esc(w.enabled?'启用':'停用')+'<br>优先级 '+esc(w.priority||0)+'</div></button>'});h+='</div>'}document.getElementById('worldList').innerHTML=h}
function renderWorldEditor(){var w=worldEditId?state.worldBook.find(function(x){return x.id===worldEditId}):null;document.getElementById('worldEditTitle').textContent=w?'编辑条目':'新建条目';document.getElementById('delWorldBtn').style.display=w?'inline-flex':'none';document.getElementById('worldTitle').value=w?w.title:'';document.getElementById('worldKeywords').value=w?w.keywords:'';document.getElementById('worldContent').value=w?w.content:'';document.getElementById('worldMode').value=w?w.mode:'contains';document.getElementById('worldPriority').value=w?w.priority:0;tempWorldEnabled=w?!!w.enabled:true;document.getElementById('worldSwitch').classList.toggle('on',tempWorldEnabled);document.getElementById('worldTest').value='';document.getElementById('worldResult').textContent='命中结果会显示在这里。'}
function renderSettings(){var h='';Object.keys(THEMES).forEach(function(k){h+='<button class="chip '+(state.theme===k?'active':'')+'" onclick="setTheme(\''+k+'\')">'+esc(THEMES[k].name)+'</button>'});document.getElementById('themeChips').innerHTML=h;document.getElementById('apiUrl').value=state.settings.apiUrl||'';document.getElementById('apiKey').value=state.settings.apiKey||'';document.getElementById('apiModel').value=state.settings.model||'';document.getElementById('ttsUrl').value=state.settings.ttsUrl||'';document.getElementById('ttsKey').value=state.settings.ttsKey||'';document.getElementById('widgetTitle').value=state.widget.title||'';document.getElementById('widgetText').value=state.widget.text||'';document.getElementById('apiState').textContent=state.settings.apiUrl?'已保存聊天 API 配置。':'当前未配置聊天 API。';document.getElementById('ttsState').textContent=state.settings.ttsUrl?'已保存 TTS API 配置。':'未配置时使用浏览器内置语音。';document.getElementById('debugSwitch').classList.toggle('on',!!state.settings.debug);var ih='';APP.forEach(function(a){ih+='<div class="memitem"><div><b>'+esc(a.name)+'</b><div class="note">更换桌面与 Dock 图标</div></div><div class="actions"><button class="tiny" onclick="pickIcon(\''+a.id+'\')">上传</button><button class="tiny" onclick="resetIcon(\''+a.id+'\')">恢复</button></div></div>'});document.getElementById('iconSettings').innerHTML=ih}
function renderMoments(){ensureMoments();var h='';if(!state.roles.length)h='<div class="empty card">还没有角色，先创建角色后再查看动态。</div>';state.roles.forEach(function(r){var m=momentsData[r.id];h+='<div class="moment card"><div class="mtop">'+avatar(r.avatar,initial(r.name))+'<div><div class="mname">'+esc(r.name)+'</div><div class="mtime">'+esc(m.time)+'</div></div></div><div class="mtext">'+esc(m.text)+'</div><div class="mactions"><button class="'+(m.liked?'liked':'')+'" onclick="likeMoment(\''+r.id+'\')">♡ '+esc(m.likes)+'</button><button onclick="toggleComments(\''+r.id+'\')">评论 '+esc(m.comments.length)+'</button></div>'+(m.open?commentsHtml(r.id,m):'')+'</div>'});document.getElementById('moments').innerHTML=h}
function commentsHtml(rid,m){var h='<div class="commentbox">';if(!m.comments.length)h+='<div class="note">还没有评论。</div>';m.comments.forEach(function(c){h+='<div class="comment"><b>'+esc(c.user)+'</b>：'+esc(c.text)+'</div>'});h+='<div class="grid2"><input id="comment_'+attr(rid)+'" placeholder="写下评论"><button class="btn primary" onclick="sendComment(\''+rid+'\')">发送</button></div></div>';return h}
function updateScreens(){var cur=nav[nav.length-1];document.querySelectorAll('.screen').forEach(function(s){s.className='screen '+(s.id===cur?'active':(nav.indexOf(s.id)>=0&&nav.indexOf(s.id)<nav.indexOf(cur)?'inactive-left':'inactive-right'))});document.getElementById('chatWallpaper').style.display=cur==='conversationScreen'?'block':'none'}
function openScreen(idv){if(idv==='conversationScreen'&&!currentRole()){toast('请先创建角色。');return}if(nav[nav.length-1]!==idv)nav.push(idv);render()}
function back(){if(nav.length>1)nav.pop();closeTools();render()}
function openChat(rid){currentRoleId=rid;openScreen('conversationScreen')}
function openMemory(){if(!currentRole())return toast('请先选择角色。');openScreen('memoryScreen')}
function openRoleEditor(rid){roleEditId=rid;openScreen('roleEditorScreen')}
function openUser(){openScreen('userProfileScreen')}
function openWorldEditor(wid){worldEditId=wid;openScreen('worldBookEditorScreen')}
function openModal(idv){closeTools();document.getElementById(idv).classList.add('show')}
function closeModal(idv){document.getElementById(idv).classList.remove('show')}
function maskClose(e,idv){if(e.target.id===idv)closeModal(idv)}
function toggleTools(){document.getElementById('toolPanel').classList.toggle('show')}
function closeTools(){document.getElementById('toolPanel').classList.remove('show')}
function pick(idv){document.getElementById(idv).click()}
function bindImages(){imageInput('roleAvatarInput',function(u){tempRoleAvatar=u;document.getElementById('roleAvatarPreview').innerHTML='<img src="'+attr(u)+'">'});imageInput('userAvatarInput',function(u){tempUserAvatar=u;document.getElementById('userAvatarPreview').innerHTML='<img src="'+attr(u)+'">'});imageInput('widgetBgInput',function(u){var n=clone(state);n.widget.bg=u;if(commit(n))toast('小组件背景已更新。')});imageInput('homeWpInput',function(u){var n=clone(state);n.wallpapers.home=u;if(commit(n))toast('主页壁纸已更新。')});imageInput('chatWpInput',function(u){var n=clone(state);n.wallpapers.chat=u;if(commit(n))toast('聊天背景已更新。')})}
function imageInput(idv,cb){var el=document.getElementById(idv);el.onchange=function(e){var f=e.target.files&&e.target.files[0];el.value='';if(f)compress(f,cb)}}
function compress(file,cb){if(!file.type||file.type.indexOf('image/')!==0)return toast('请选择图片文件。');var fr=new FileReader();fr.onload=function(e){var img=new Image();img.onload=function(){var w=img.width,h=img.height,m=1280;if(w>m){h=Math.round(h*m/w);w=m}var c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);var u=c.toDataURL('image/jpeg',.72);if(u.length>MAX_IMG*1.37)return toast('图片过大，请换一张更小的。');cb(u)};img.onerror=function(){toast('图片处理失败。')};img.src=e.target.result};fr.onerror=function(){toast('读取图片失败。')};fr.readAsDataURL(file)}
function clearRoleAvatar(){tempRoleAvatar='';document.getElementById('roleAvatarPreview').innerHTML='AI'}
function clearUserAvatar(){tempUserAvatar='';document.getElementById('userAvatarPreview').innerHTML=esc(initial(document.getElementById('userName').value||'我'))}
function saveRole(){var name=document.getElementById('roleName').value.trim(),prompt=document.getElementById('rolePrompt').value.trim();if(!name)return toast('角色名称不能为空。');var n=clone(state);if(roleEditId){var r=n.roles.find(function(x){return x.id===roleEditId});if(!r)return;r.name=name;r.prompt=prompt;if(tempRoleAvatar!==undefined)r.avatar=tempRoleAvatar}else{var nr={id:id('role'),name:name,avatar:tempRoleAvatar||'',prompt:prompt,memoryEnabled:true,memorySummary:'',longMemories:[],messages:[{id:id('msg'),type:'text',from:'ai',text:'初次见面，我会把这段对话安静地接住。',time:Date.now()}]};n.roles.push(nr);currentRoleId=nr.id}if(commit(n)){toast('角色已保存。');back()}}
function deleteRole(){if(!roleEditId||!confirm('确定删除该角色吗？'))return;var n=clone(state),i=n.roles.findIndex(function(x){return x.id===roleEditId});if(i<0)return;n.roles.splice(i,1);if(currentRoleId===roleEditId)currentRoleId=n.roles[0]?n.roles[0].id:'';roleEditId='';if(commit(n)){toast('角色已删除。');back()}}
function saveUser(){var n=clone(state);n.user.name=document.getElementById('userName').value.trim()||'我';n.user.persona=document.getElementById('userPersona').value.trim();if(tempUserAvatar!==undefined)n.user.avatar=tempUserAvatar;if(commit(n)){toast('我的人设已保存。');back()}}
function toggleMemory(){var r=currentRole();r.memoryEnabled=!r.memoryEnabled;renderMemory()}
function addMemory(){var r=currentRole(),v=document.getElementById('memNew').value.trim();if(!v)return;r.longMemories=r.longMemories||[];r.longMemories.push(v);document.getElementById('memNew').value='';renderMemory()}
function removeMemory(i){var r=currentRole();r.longMemories.splice(i,1);renderMemory()}
function autoSummary(){var r=currentRole(),s=(r.messages||[]).slice(-8).map(function(m){return (m.from==='user'?'用户':'角色')+'：'+(m.text||m.note||money(m.amount)||'互动')}).join('；');document.getElementById('memSummary').value=s?'近期交流集中在：'+s.slice(0,180):'近期聊天较少，仍可继续补充。'}
function saveMemory(){var r=currentRole(),n=clone(state),t=n.roles.find(function(x){return x.id===r.id});t.memoryEnabled=r.memoryEnabled;t.memorySummary=document.getElementById('memSummary').value.trim();t.longMemories=clone(r.longMemories||[]);if(commit(n))toast('记忆已保存。')}
function toggleWorldEnabled(){tempWorldEnabled=!tempWorldEnabled;document.getElementById('worldSwitch').classList.toggle('on',tempWorldEnabled)}
function saveWorld(){var title=document.getElementById('worldTitle').value.trim(),kw=document.getElementById('worldKeywords').value.trim(),cont=document.getElementById('worldContent').value.trim();if(!title||!kw||!cont)return toast('请完整填写世界书条目。');var n=clone(state),obj={title:title,keywords:kw,content:cont,mode:document.getElementById('worldMode').value,priority:Number(document.getElementById('worldPriority').value||0),enabled:tempWorldEnabled};if(worldEditId){var w=n.worldBook.find(function(x){return x.id===worldEditId});if(!w)return;Object.assign(w,obj)}else{obj.id=id('world');n.worldBook.push(obj)}if(commit(n)){toast('世界书条目已保存。');back()}}
function deleteWorld(){if(!worldEditId||!confirm('确定删除该世界书条目吗？'))return;var n=clone(state),i=n.worldBook.findIndex(function(x){return x.id===worldEditId});if(i<0)return;n.worldBook.splice(i,1);worldEditId='';if(commit(n)){toast('世界书条目已删除。');back()}}
function testWorld(){var e={title:document.getElementById('worldTitle').value.trim()||'当前条目',keywords:document.getElementById('worldKeywords').value.trim(),mode:document.getElementById('worldMode').value,priority:0,enabled:tempWorldEnabled};var hit=matchWorld(document.getElementById('worldTest').value,[e]);document.getElementById('worldResult').textContent=hit.length?'已命中：'+hit.map(function(x){return x.title}).join('、'):'当前输入未命中该条目。'}
function setTheme(k){var n=clone(state);n.theme=k;if(commit(n))toast('主题已切换。')}
function saveApi(){var n=clone(state);n.settings.apiUrl=document.getElementById('apiUrl').value.trim();n.settings.apiKey=document.getElementById('apiKey').value.trim();n.settings.model=document.getElementById('apiModel').value.trim();if(commit(n))toast('聊天 API 配置已保存。')}
function clearApi(){var n=clone(state);n.settings.apiUrl='';n.settings.apiKey='';n.settings.model='';if(commit(n))toast('聊天 API 配置已清空。')}
function saveTts(){var n=clone(state);n.settings.ttsUrl=document.getElementById('ttsUrl').value.trim();n.settings.ttsKey=document.getElementById('ttsKey').value.trim();if(commit(n))toast('TTS 配置已保存。')}
function clearTts(){var n=clone(state);n.settings.ttsUrl='';n.settings.ttsKey='';if(commit(n))toast('TTS 配置已清空。')}
function testTts(){speakText('语音测试已准备完成，现在使用当前语音方案朗读。')}
function toggleDebug(){var n=clone(state);n.settings.debug=!n.settings.debug;if(commit(n))toast(n.settings.debug?'调试模式已开启。':'调试模式已关闭。')}
function removeWidgetBg(){var n=clone(state);n.widget.bg='';if(commit(n))toast('已移除小组件背景。')}
function restoreWallpaper(t){var n=clone(state);n.wallpapers[t]='';if(commit(n))toast(t==='home'?'已恢复主页壁纸。':'已恢复聊天背景。')}
function pickIcon(aid){var idv='icon_'+aid,el=document.getElementById(idv);if(!el){document.getElementById('dynInputs').insertAdjacentHTML('beforeend','<input class="hide" id="'+attr(idv)+'" type="file" accept="image/*">');el=document.getElementById(idv);el.onchange=function(e){var f=e.target.files&&e.target.files[0];el.value='';if(f)compress(f,function(u){var n=clone(state);n.appIcons[aid]=u;if(commit(n))toast('图标已更新。')})}}el.click()}
function resetIcon(aid){var n=clone(state);delete n.appIcons[aid];if(commit(n))toast('图标已恢复默认。')}
async function fetchModels(){var url=document.getElementById('apiUrl').value.trim(),key=document.getElementById('apiKey').value.trim();if(!url)return toast('请先填写 API URL。');var base=url.replace(/\/chat\/completions\/?$/,'').replace(/\/$/,''),modelsUrl=/\/models$/.test(base)?base:base+'/models';try{var res=await fetch(modelsUrl,{headers:key?{'Authorization':'Bearer '+key}:{}});if(!res.ok)throw new Error('HTTP '+res.status);var data=await res.json(),arr=Array.isArray(data.data)?data.data:(Array.isArray(data.models)?data.models:[]),dl=document.getElementById('modelList');dl.innerHTML='';arr.map(function(x){return typeof x==='string'?x:x.id||x.name}).filter(Boolean).forEach(function(m){dl.insertAdjacentHTML('beforeend','<option value="'+attr(m)+'"></option>')});if(arr.length){var first=typeof arr[0]==='string'?arr[0]:arr[0].id||arr[0].name;document.getElementById('apiModel').value=document.getElementById('apiModel').value||first;toast('模型列表已拉取。')}else toast('未读取到模型列表。')}catch(e){toast('模型拉取失败，请检查 URL、Key 或跨域设置。')}}
function widgetRealtime(){var save=function(){var n=clone(state);n.widget.title=document.getElementById('widgetTitle').value.trim()||'私人 AI 助手';n.widget.text=document.getElementById('widgetText').value.trim()||'干净、柔软、可装扮的专属手机桌面。';commit(n,true)};document.getElementById('widgetTitle').addEventListener('change',save);document.getElementById('widgetText').addEventListener('change',save)}
function msg(type,from,p){var m={id:id('msg'),type:type,from:from,time:Date.now()};Object.keys(p||{}).forEach(function(k){m[k]=p[k]});return m}
function sendText(){var r=currentRole(),input=document.getElementById('chatInput'),text=input.value.trim();if(!r||!text)return;var n=clone(state),t=n.roles.find(function(x){return x.id===r.id});t.messages.push(msg('text','user',{text:text}));t.messages.push(aiReply(t,text,FACES.indexOf(text)>=0?'face':'text'));if(commit(n)){input.value='';resizeInput();closeTools();scrollBottom()}}
function aiReply(r,text,kind){var hits=matchWorld(text,state.worldBook),mem=[];if(r.memoryEnabled){if(r.memorySummary)mem.push('总结：'+r.memorySummary);(r.longMemories||[]).slice(0,3).forEach(function(x){mem.push('长期：'+x)})}var reply=kind==='face'?FACES[Math.floor(Math.random()*FACES.length)]:(kind==='voice'?'我听到了，你刚才说的内容我已经认真收下了。'+tail():compose(text,r,hits));var debug='世界书命中：'+(hits.length?hits.map(function(x){return x.title}).join('、'):'无')+'；记忆参考：'+(mem.length?mem.join(' ｜ '):'无');return msg(kind==='voice'?'voice':'text','ai',{text:reply,duration:kind==='voice'?voiceLen(reply):undefined,debug:debug})}
function compose(text,r,hits){var base=['我在认真听，也记得你刚才提到的重点。','这句话我已经收到了，会顺着你的节奏继续陪你说下去。','你的表达很清楚，我会把这份心情安静地接住。','我理解你的意思了，我们可以继续把细节慢慢展开。'];return base[Math.floor(Math.random()*base.length)]+(r.prompt?' '+r.prompt.slice(0,18)+'。':'')+(hits.length?' 我会参考 '+hits[0].title+' 的设定继续回应。':'')+tail()}
function tail(){var a=['如果你愿意，还可以继续往下说。','我会把对话保持在舒服的节奏里。','你可以把更多细节交给我。','我们可以继续把这件事说完整。'];return a[Math.floor(Math.random()*a.length)]}
function matchWorld(text,list){text=String(text||'');return (list||[]).filter(function(e){return e&&e.enabled}).filter(function(e){return String(e.keywords||'').split(',').map(function(x){return x.trim()}).filter(Boolean).some(function(k){if(e.mode==='exact')return text===k;if(e.mode==='regex'){try{return new RegExp(k,'i').test(text)}catch(err){return false}}return text.indexOf(k)!==-1})}).sort(function(a,b){return Number(b.priority||0)-Number(a.priority||0)})}
function sendTransfer(){var r=currentRole(),amt=Number(document.getElementById('transAmount').value),note=document.getElementById('transNote').value.trim()||'给你的小心意';if(!r||!amt||amt<=0)return toast('请输入有效金额。');var n=clone(state),t=n.roles.find(function(x){return x.id===r.id});t.messages.push(msg('transfer','user',{amount:amt,note:note}));t.messages.push(msg('text','ai',{text:'已经收到你的转账了，谢谢你认真留下这份心意。'+tail(),debug:'世界书命中：转账互动；记忆参考：'+(t.memoryEnabled?(t.memorySummary||'有长期记忆'):'记忆关闭')}));t.messages.push(msg('transfer','ai',{amount:Math.floor(Math.random()*6)+1,note:'回赠给你的一点温柔'}));if(commit(n)){document.getElementById('transAmount').value='';document.getElementById('transNote').value='';closeModal('transferModal');scrollBottom()}}
function voiceLen(t){return Math.max(2,Math.min(18,Math.round(String(t||'').replace(/\s/g,'').length/3)))}
function sendVoice(){var r=currentRole(),text=document.getElementById('voiceText').value.trim();if(!r||!text)return toast('请输入语音内容。');var n=clone(state),t=n.roles.find(function(x){return x.id===r.id}),ar=aiReply(t,text,'voice');t.messages.push(msg('voice','user',{text:text,duration:voiceLen(text)}));t.messages.push(ar);if(commit(n)){document.getElementById('voiceText').value='';closeModal('voiceModal');speakText(text);setTimeout(function(){speakText(ar.text)},900);scrollBottom()}}
function playVoice(mid){var r=currentRole(),m=r.messages.find(function(x){return x.id===mid});if(m)speakText(m.text||'这是一段语音消息。')}
function speakText(t){if(!window.speechSynthesis)return toast('当前浏览器不支持语音播放。');window.speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(t);u.lang='zh-CN';u.rate=1.1;window.speechSynthesis.speak(u)}
function openCall(){var r=currentRole();if(!r)return;closeTools();calling=true;document.getElementById('call').classList.add('show');document.getElementById('callAva').innerHTML=r.avatar?'<img src="'+attr(r.avatar)+'">':esc(initial(r.name));document.getElementById('callName').textContent=r.name;document.getElementById('callNote').textContent='正在建立通话';addSystem('通话开始');setTimeout(function(){if(calling){document.getElementById('callNote').textContent='已接听';speakText(r.name+' 已接听。我在听，你现在可以慢慢说。')}},500)}
function hangup(){if(!calling)return;calling=false;document.getElementById('call').classList.remove('show');if(window.speechSynthesis)window.speechSynthesis.cancel();addSystem('通话结束')}
function addSystem(t){var r=currentRole(),n=clone(state),x=n.roles.find(function(y){return y.id===r.id});x.messages.push(msg('system','system',{text:t}));commit(n)}
function bindLongPress(){document.querySelectorAll('#msgs [data-mid]').forEach(function(el){var mid=el.getAttribute('data-mid');el.onmousedown=el.ontouchstart=function(){clearTimeout(longTimer);longTimer=setTimeout(function(){deleteMessage(mid)},560)};el.onmouseup=el.onmouseleave=el.ontouchend=el.ontouchcancel=function(){clearTimeout(longTimer)}})}
function deleteMessage(mid){if(!confirm('确定删除这条消息吗？'))return;var r=currentRole(),n=clone(state),t=n.roles.find(function(x){return x.id===r.id}),i=t.messages.findIndex(function(x){return x.id===mid});if(i>=0){t.messages.splice(i,1);if(commit(n))toast('消息已删除。')}}
function scrollBottom(){setTimeout(function(){var s=document.getElementById('chatScroll');s.scrollTop=s.scrollHeight},30)}
function resizeInput(){var i=document.getElementById('chatInput');i.style.height='auto';i.style.height=Math.min(i.scrollHeight,96)+'px'}
function setupFaces(){var h='';FACES.forEach(function(f){h+='<button class="face" onclick="insertFace(\''+attr(f)+'\')">'+esc(f)+'</button>'});document.getElementById('faces').innerHTML=h}
function insertFace(f){var i=document.getElementById('chatInput');i.value+=(i.value?' ':'')+f;closeModal('faceModal');i.focus();resizeInput()}
function ensureMoments(){state.roles.forEach(function(r,i){if(!momentsData[r.id])momentsData[r.id]={text:MOMENTS[(i+Math.floor(Math.random()*MOMENTS.length))%MOMENTS.length],time:['刚刚','5 分钟前','12 分钟前','28 分钟前','1 小时前','今天 14:32'][Math.floor(Math.random()*6)],liked:false,likes:Math.floor(Math.random()*6),comments:[],open:false}});Object.keys(momentsData).forEach(function(k){if(!state.roles.find(function(r){return r.id===k}))delete momentsData[k]})}
function likeMoment(rid){var m=momentsData[rid];m.liked=!m.liked;m.likes+=m.liked?1:-1;renderMoments()}
function toggleComments(rid){momentsData[rid].open=!momentsData[rid].open;renderMoments()}
function sendComment(rid){var el=document.getElementById('comment_'+rid),v=el&&el.value.trim();if(!v)return;momentsData[rid].comments.push({user:state.user.name||'我',text:v});renderMoments()}
function bindInputs(){document.getElementById('chatInput').addEventListener('input',resizeInput);document.getElementById('chatInput').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText()}});widgetRealtime()}
function init(){load();currentRoleId=state.roles[0]?state.roles[0].id:'';applyTheme();bindImages();setupFaces();bindInputs();tick();setInterval(tick,10000);render()}
init();
</script>
</body>
</html>
